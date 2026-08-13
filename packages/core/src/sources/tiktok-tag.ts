import { execFile } from "node:child_process";
import { promisify } from "node:util";
import puppeteer, { type Browser } from "puppeteer-core";
import {
  TagUnavailableError,
  type TagStatsSource,
  type TagVideoSource,
} from "../contracts/ports.ts";
import { tagReadingSchema, type TagReading } from "../contracts/types.ts";
import { postedAtFrom, type TagVideo, type VideoCounts } from "../trends/videos.ts";

/**
 * How big a hashtag is, read from the page that knows.
 *
 * The size is not in the page source. The page asks its own endpoint for it, and that endpoint
 * signs every request from script that runs in the browser, so a plain fetch of the same address
 * answers with an empty body. The only way in is to let the page ask, and to read the answer.
 *
 * Two numbers come back and they are exact, not rounded to four figures the way a view count on a
 * post is. That is what makes the difference between two readings mean something.
 */
const runChrome = promisify(execFile);

const DETAIL = /\/api\/challenge\/detail/;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

export interface TikTokTagOptions {
  /** Where Chrome is. There is no default, because a wrong guess fails far from here. */
  executablePath: string;
  clock?: () => number;
  navigationTimeoutMs?: number;
  settleMs?: number;
}

interface Sizes {
  videoCount: number;
  viewCount: number;
}

export class BrowserTikTokTagSource implements TagStatsSource, TagVideoSource {
  readonly platform = "tiktok" as const;
  readonly #options: TikTokTagOptions;
  #browser: Browser | undefined;

  constructor(options: TikTokTagOptions) {
    this.#options = options;
  }

  async readingFor(hashtag: string): Promise<TagReading> {
    const name = hashtag.replace(/^#/, "").trim();
    if (name.length === 0) throw new TagUnavailableError(this.platform, hashtag, "it has no name");

    const sizes = await this.#sizesFor(name);
    const parsed = tagReadingSchema.safeParse({
      hashtag: name.toLowerCase(),
      platform: this.platform,
      observedAt: (this.#options.clock ?? Date.now)(),
      videoCount: sizes.videoCount,
      viewCount: sizes.viewCount,
    });
    if (!parsed.success) {
      throw new TagUnavailableError(this.platform, name, parsed.error.issues[0]?.message ?? "");
    }
    return parsed.data;
  }

  /**
   * A context of its own per hashtag, rather than one session walking through a list.
   *
   * A single session asking for twelve hashtag pages in a row was shown a puzzle, and the size
   * request then answered with status 200 and an empty body. Separate contexts were not.
   */
  /**
   * Renders a page by running Chrome once and reading what it drew.
   *
   * Driving the same browser through the automation protocol is refused: at the moment a
   * subprocess returned thirty cards, a driven session was shown a puzzle instead and drew none.
   * A session carries the marks of being driven, and a subprocess does not, so the cheap path is
   * also the one that works.
   *
   * The size of a hashtag still needs the driven browser, because that number never reaches the
   * page and has to be read from the answer the page received.
   */
  async #dumpDom(url: string): Promise<string> {
    const { stdout } = await runChrome(
      this.#options.executablePath,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        `--virtual-time-budget=${this.#options.settleMs ?? 25_000}`,
        "--dump-dom",
        url,
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: this.#options.navigationTimeoutMs ?? 120_000 },
    );
    return stdout;
  }

  async #sizesFor(hashtag: string): Promise<Sizes> {
    const browser = await this.#open();
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      let sizes: Sizes | undefined;
      page.on("response", async (response) => {
        if (!DETAIL.test(response.url()) || sizes) return;
        sizes = sizesIn(await bodyOf(response));
      });
      await page.goto(`https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`, {
        waitUntil: "networkidle2",
        timeout: this.#options.navigationTimeoutMs ?? 90_000,
      });
      await new Promise((resolve) => setTimeout(resolve, this.#options.settleMs ?? 3_000));
      if (!sizes) {
        throw new TagUnavailableError(
          this.platform,
          hashtag,
          "the page never reported a size, which is what a refusal looks like",
        );
      }
      return sizes;
    } finally {
      await context.close();
    }
  }

  async #open(): Promise<Browser> {
    this.#browser ??= await puppeteer.launch({
      executablePath: this.#options.executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu"],
    });
    return this.#browser;
  }

  /** One render for the whole page. The counts are not on it, so this is the cheap half. */
  async videosFor(hashtag: string): Promise<TagVideo[]> {
    const name = hashtag.replace(/^#/, "").trim();
    const html = await this.#dumpDom(`https://www.tiktok.com/tag/${encodeURIComponent(name)}`);
    const videos = videosIn(html, name.toLowerCase());
    if (videos.length === 0) {
      throw new TagUnavailableError(
        this.platform,
        name,
        "the page drew no videos, which is what a refusal looks like",
      );
    }
    return videos;
  }

  /** A plain request. The counts are in the page source, so no browser is needed for this half. */
  async countsFor(video: TagVideo): Promise<VideoCounts | undefined> {
    const response = await fetch(video.url, {
      headers: { "user-agent": BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(this.#options.navigationTimeoutMs ?? 40_000),
    });
    if (!response.ok) return undefined;
    return countsIn(await response.text());
  }

  async close(): Promise<void> {
    await this.#browser?.close();
    this.#browser = undefined;
  }
}

async function bodyOf(response: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * `statsV2` carries the real numbers as strings. The older `stats` field reports a video count of
 * nought for the same hashtag, so reading that one gives a topic that looks empty.
 */
export function sizesIn(body: unknown): Sizes | undefined {
  const info = (body as { challengeInfo?: Record<string, unknown> } | undefined)?.challengeInfo;
  if (!info) return undefined;
  const v2 = info["statsV2"] as { videoCount?: string; viewCount?: string } | undefined;
  const v1 = info["stats"] as { videoCount?: number; viewCount?: number } | undefined;
  const videoCount = whole(v2?.videoCount) ?? whole(v1?.videoCount);
  const viewCount = whole(v2?.viewCount) ?? whole(v1?.viewCount);
  if (videoCount === undefined || viewCount === undefined) return undefined;
  return { videoCount, viewCount };
}

function whole(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed);
}

const CARD = 'data-e2e="challenge-item"';
const LINK = /href="https:\/\/www\.tiktok\.com\/@([A-Za-z0-9._]+)\/video\/(\d+)"/;
const CAPTION = /data-e2e="challenge-item-desc"[^>]*>([\s\S]*?)<\/div>/;
const REHYDRATION = /__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/;

/** The videos a rendered hashtag page drew. No counts: the page does not carry them. */
export function videosIn(html: string, hashtag: string): TagVideo[] {
  const videos: TagVideo[] = [];
  for (const block of html.split(CARD).slice(1)) {
    const link = block.match(LINK);
    if (!link?.[1] || !link[2]) continue;
    videos.push({
      hashtag,
      handle: link[1].toLowerCase(),
      videoId: link[2],
      url: `https://www.tiktok.com/@${link[1]}/video/${link[2]}`,
      caption: plainText(block.match(CAPTION)?.[1] ?? ""),
      postedAt: postedAtFrom(link[2]),
    });
  }
  return videos;
}

/**
 * The counts a video page carries.
 *
 * `statsV2` holds them as strings. Views and likes arrive rounded to about four figures, the same
 * as everywhere else, but comments do not, so a comment count moves where a view count is frozen.
 */
export function countsIn(html: string): VideoCounts | undefined {
  const match = html.match(REHYDRATION);
  if (!match?.[1]) return undefined;
  let item: Record<string, any> | undefined;
  try {
    item = JSON.parse(match[1])?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.itemInfo
      ?.itemStruct;
  } catch {
    return undefined;
  }
  const stats = item?.["statsV2"] ?? item?.["stats"];
  if (!stats) return undefined;
  const views = whole(stats.playCount);
  const likes = whole(stats.diggCount);
  const comments = whole(stats.commentCount);
  if (views === undefined || likes === undefined || comments === undefined) return undefined;
  return { views, likes, comments };
}

function plainText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

import puppeteer, { type Browser } from "puppeteer-core";
import { TagUnavailableError, type TagStatsSource } from "../contracts/ports.ts";
import { tagReadingSchema, type TagReading } from "../contracts/types.ts";

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
const DETAIL = /\/api\/challenge\/detail/;

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

export class BrowserTikTokTagSource implements TagStatsSource {
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

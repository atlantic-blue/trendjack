import {
  loadPanel,
  panelPathFromEnvironment,
  PanelInvalidError,
  PanelNotFoundError,
} from "@trendjack/core/panel/load.ts";
import { renderReport, reportOn } from "@trendjack/core/panel/report.ts";
import type { Platform } from "@trendjack/core/contracts/types.ts";
import type { TrendSource } from "@trendjack/core/contracts/ports.ts";
import { YtDlpTikTokSource } from "@trendjack/core/sources/tiktok.ts";
import { ytDlpRunner } from "@trendjack/core/sources/ytdlp.ts";
import { runOnce } from "./run-once.ts";
import { normaliseHandle } from "@trendjack/core/panel/normalise.ts";
import { storeFor } from "./store-for.ts";
import { qualifyCreator, type Verdict } from "@trendjack/core/discover/qualify.ts";
import { renderQualify } from "@trendjack/core/discover/report.ts";
import { BrowserTikTokTagSource } from "@trendjack/core/sources/tiktok-tag.ts";
import { recordTagReadings } from "@trendjack/core/trends/record.ts";
import { bestVideosFor } from "@trendjack/core/trends/best-videos.ts";
import { renderBestVideos } from "@trendjack/core/trends/best-videos-report.ts";
import { MIN_AGE_HOURS } from "@trendjack/core/trends/videos.ts";
import { renderRecord } from "@trendjack/core/trends/report.ts";

export interface CliResult {
  exitCode: number;
  output: string;
}

const POSTS_PER_CREATOR = 30;
const WINDOW_HOURS = 72;
const CANDIDATES = 10;
/** A gap between creators, so a round does not arrive as a burst of requests. */
const PACE_MS = 2_000;

const USAGE = [
  "trendjack <command>",
  "",
  "  panel    show what is being watched, and what is wrong with it",
  "  run      poll the panel once and print the digest",
  "  qualify  check creators against the panel criteria, then print entries to paste",
  "  tags     record how big each hashtag is, and say what changed since last time",
  "  videos   rank the videos on one hashtag page by views an hour",
  "",
  "  trendjack qualify handle1 handle2",
  "  trendjack tags storytime grwm",
  "  trendjack videos buildinpublic",
  "",
  "The panel itself lives outside this repository. Point TRENDJACK_PANEL at it.",
].join("\n");

export async function runCli(argv: string[], environment: NodeJS.ProcessEnv): Promise<CliResult> {
  const [command] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    return { exitCode: command === undefined ? 1 : 0, output: USAGE };
  }
  if (command === "panel") return panelCommand(environment);
  if (command === "run") return runCommand(environment);
  if (command === "qualify") return qualifyCommand(argv.slice(1));
  if (command === "tags") return tagsCommand(argv.slice(1), environment);
  if (command === "videos") return videosCommand(argv.slice(1), environment);
  return { exitCode: 1, output: `Unknown command "${command}".\n\n${USAGE}` };
}

function panelCommand(environment: NodeJS.ProcessEnv): CliResult {
  const panelPath = panelPathFromEnvironment(environment);
  try {
    const report = reportOn(loadPanel(panelPath));
    const hasProblems = report.tooFewCreators || report.duplicatesDropped.length > 0;
    return { exitCode: hasProblems ? 2 : 0, output: renderReport(report) };
  } catch (error) {
    if (error instanceof PanelNotFoundError || error instanceof PanelInvalidError) {
      return { exitCode: 1, output: error.message };
    }
    throw error;
  }
}

/**
 * A single round with nothing kept between runs. Until the store is deployed this cannot show a
 * rate, because a rate needs two readings taken apart in time, so everything will be held back
 * and the digest will say so.
 */
async function runCommand(environment: NodeJS.ProcessEnv): Promise<CliResult> {
  const panelPath = panelPathFromEnvironment(environment);
  try {
    const panel = loadPanel(panelPath).entries;
    const sources = new Map<Platform, TrendSource>([
      ["tiktok", new YtDlpTikTokSource(ytDlpRunner())],
    ]);
    const chosen = storeFor(environment);
    const { poll, text } = await runOnce({
      panel,
      sources,
      store: chosen.store,
      now: Date.now(),
      postsPerCreator: POSTS_PER_CREATOR,
      windowHours: WINDOW_HOURS,
      limit: CANDIDATES,
      pace: () => new Promise((resolve) => setTimeout(resolve, PACE_MS)),
    });
    return { exitCode: poll.failures.length > 0 ? 2 : 0, output: `${text}\n${chosen.note}` };
  } catch (error) {
    if (error instanceof PanelNotFoundError || error instanceof PanelInvalidError) {
      return { exitCode: 1, output: error.message };
    }
    return { exitCode: 1, output: (error as Error).message };
  }
}

const QUALIFY_POSTS = 30;

/**
 * Checks named creators. It does not search: TikTok gates search behind a signed request, so
 * the handles come from somewhere else and this decides which of them are worth watching.
 */
/** A pause between hashtags, so a round does not arrive as one burst of requests. */
const TAG_PACE_MS = 3_000;

const CHROME_MISSING =
  "Set TRENDJACK_CHROME to a Chrome binary. Neither the size of a hashtag nor the videos on its " +
  "page are in the page source, so a browser has to ask for them.\n" +
  'On a Mac that is usually "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".';

async function tagsCommand(argv: string[], environment: NodeJS.ProcessEnv): Promise<CliResult> {
  const hashtags = argv
    .map((each) => each.replace(/^#/, "").trim())
    .filter((each) => each.length > 0);
  if (hashtags.length === 0) return { exitCode: 1, output: "Name at least one hashtag to record." };

  const executablePath = environment["TRENDJACK_CHROME"]?.trim();
  if (!executablePath) return { exitCode: 1, output: CHROME_MISSING };

  const choice = storeFor(environment);
  const source = new BrowserTikTokTagSource({ executablePath });
  try {
    const report = await recordTagReadings({
      hashtags,
      source,
      store: choice.store,
      now: Date.now(),
      pace: () => new Promise((resolve) => setTimeout(resolve, TAG_PACE_MS)),
    });
    return {
      exitCode: report.failures.length === hashtags.length ? 2 : 0,
      output: `${renderRecord(report)}\n\n${choice.note}`,
    };
  } finally {
    await source.close();
  }
}

/** A pause between video pages, so a round does not arrive as one burst. */
const VIDEO_PACE_MS = 1_200;

async function videosCommand(argv: string[], environment: NodeJS.ProcessEnv): Promise<CliResult> {
  const hashtag = argv[0]?.replace(/^#/, "").trim();
  if (!hashtag) return { exitCode: 1, output: "Name one hashtag to read." };

  const executablePath = environment["TRENDJACK_CHROME"]?.trim();
  if (!executablePath) return { exitCode: 1, output: CHROME_MISSING };

  const source = new BrowserTikTokTagSource({ executablePath });
  try {
    const report = await bestVideosFor({
      hashtag,
      source,
      now: Date.now(),
      pace: () => new Promise((resolve) => setTimeout(resolve, VIDEO_PACE_MS)),
    });
    return {
      exitCode: report.ranked.length === 0 ? 2 : 0,
      output: renderBestVideos(report, MIN_AGE_HOURS),
    };
  } finally {
    await source.close();
  }
}

async function qualifyCommand(argv: string[]): Promise<CliResult> {
  const parsed = parseQualify(argv);
  if (parsed.error) return { exitCode: 1, output: parsed.error };
  const handles = parsed.handles;
  if (handles.length === 0) {
    return { exitCode: 1, output: "Name at least one creator to check." };
  }
  const source = new YtDlpTikTokSource(ytDlpRunner());
  const verdicts: Verdict[] = [];
  for (const handle of handles) {
    verdicts.push(await verdictFor(source, handle));
  }
  const kept = verdicts.filter((each) => each.keep).length;
  return {
    exitCode: kept === 0 ? 2 : 0,
    output: renderQualify({ verdicts, platform: "tiktok" }),
  };
}

async function verdictFor(source: YtDlpTikTokSource, handle: string): Promise<Verdict> {
  try {
    const sightings = await source.recentPostsByCreator(handle, QUALIFY_POSTS);
    return qualifyCreator({ handle, sightings, now: Date.now() });
  } catch (error) {
    return {
      handle,
      keep: false,
      reason: `could not be read: ${(error as Error).message}`,
      posts: 0,
      medianViews: 0,
      bestLikes: 0,
      lastPostedAt: 0,
    };
  }
}

/**
 * The panel used to be grouped by product, and this command took `--product` and `--niche`.
 * Both are gone. They are refused by name rather than read as a creator, because
 * `--product macgleam` would otherwise become two creators called "product" and "macgleam" and
 * the run would look like it worked.
 */
export function parseQualify(argv: string[]): { handles: string[]; error?: string } {
  const handles: string[] = [];
  for (const argument of argv) {
    if (argument === "--product" || argument === "--niche") {
      return {
        handles: [],
        error:
          `"${argument}" is gone. The panel is now one flat list of the best creators, so a ` +
          `creator does not belong to a product. Name the creators only.`,
      };
    }
    if (argument.startsWith("--")) {
      return { handles: [], error: `Unknown option "${argument}".` };
    }
    handles.push(normaliseHandle(argument));
  }
  return { handles: [...new Set(handles.filter((each) => each.length > 0))] };
}

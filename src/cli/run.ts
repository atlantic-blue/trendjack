import {
  loadPanel,
  panelPathFromEnvironment,
  PanelInvalidError,
  PanelNotFoundError,
} from "../panel/load.ts";
import { renderReport, reportOn } from "../panel/report.ts";
import type { Platform } from "../contracts/types.ts";
import type { TrendSource } from "../contracts/ports.ts";
import { YtDlpTikTokSource } from "../sources/tiktok.ts";
import { ytDlpRunner } from "../sources/ytdlp.ts";
import { runOnce } from "./run-once.ts";
import { normaliseHandle } from "../panel/normalise.ts";
import { storeFor } from "./store-for.ts";
import { qualifyCreator, type Verdict } from "../discover/qualify.ts";
import { renderQualify } from "../discover/report.ts";

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
  "",
  "  trendjack qualify --product macgleam --niche 'laptop tips' handle1 handle2",
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
  return { exitCode: 1, output: `Unknown command "${command}".\n\n${USAGE}` };
}

function panelCommand(environment: NodeJS.ProcessEnv): CliResult {
  const panelPath = panelPathFromEnvironment(environment);
  try {
    const report = reportOn(loadPanel(panelPath));
    const hasProblems =
      report.thinNiches.length > 0 ||
      report.productsWithoutCreators.length > 0 ||
      report.duplicatesDropped.length > 0;
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
async function qualifyCommand(argv: string[]): Promise<CliResult> {
  const { product, niche, handles } = parseQualify(argv);
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
    output: renderQualify({ verdicts, product, niche, platform: "tiktok" }),
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

export function parseQualify(argv: string[]): {
  product: string;
  niche: string;
  handles: string[];
} {
  let product = "unassigned";
  let niche = "unassigned";
  const handles: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--product") {
      product = argv[index + 1] ?? product;
      index += 1;
    } else if (argument === "--niche") {
      niche = argv[index + 1] ?? niche;
      index += 1;
    } else {
      handles.push(normaliseHandle(argument));
    }
  }
  return { product, niche, handles: [...new Set(handles.filter((each) => each.length > 0))] };
}

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
  "  trendjack qualify handle1 handle2",
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

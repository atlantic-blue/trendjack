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
import { storeFor } from "./store-for.ts";

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

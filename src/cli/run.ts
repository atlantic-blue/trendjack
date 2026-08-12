import {
  loadPanel,
  panelPathFromEnvironment,
  PanelInvalidError,
  PanelNotFoundError,
} from "../panel/load.ts";
import { renderReport, reportOn } from "../panel/report.ts";

export interface CliResult {
  exitCode: number;
  output: string;
}

const USAGE = [
  "trendjack <command>",
  "",
  "  panel    show what is being watched, and what is wrong with it",
  "",
  "The panel itself lives outside this repository. Point TRENDJACK_PANEL at it.",
].join("\n");

export function runCli(argv: string[], environment: NodeJS.ProcessEnv): CliResult {
  const [command] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    return { exitCode: command === undefined ? 1 : 0, output: USAGE };
  }
  if (command === "panel") return panelCommand(environment);
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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { panelSchema, type Panel, type PanelEntry } from "../contracts/types.ts";
import { normaliseEntry, watchKey } from "./normalise.ts";

/**
 * The panel is the list of creators, hashtags and sounds we watch, and it is the part of this
 * project that is expensive to reproduce. It lives outside the repository for that reason, so
 * the loader takes a path rather than importing anything.
 */
export const DEFAULT_PANEL_PATH = path.join(
  os.homedir(),
  "claude",
  "orgs",
  "atlantic-blue",
  ".secrets",
  "trendjack-panel.json",
);

export class PanelNotFoundError extends Error {
  readonly panelPath: string;

  constructor(panelPath: string) {
    super(
      `No panel at ${panelPath}. Set TRENDJACK_PANEL to point at one, or create it there. ` +
        `The panel is deliberately not in this repository.`,
    );
    this.name = "PanelNotFoundError";
    this.panelPath = panelPath;
  }
}

export class PanelInvalidError extends Error {
  readonly panelPath: string;

  constructor(panelPath: string, detail: string) {
    super(`The panel at ${panelPath} does not match the contract: ${detail}`);
    this.name = "PanelInvalidError";
    this.panelPath = panelPath;
  }
}

export function panelPathFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const configured = environment["TRENDJACK_PANEL"]?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_PANEL_PATH;
}

export interface LoadedPanel {
  entries: Panel;
  /** Entries dropped because something else in the file already watched the same thing. */
  duplicates: PanelEntry[];
}

/**
 * Reads, validates, normalises and deduplicates. A duplicate is dropped rather than rejected,
 * because a panel is edited by hand and the same creator appearing under two products is a
 * reasonable thing for a person to write.
 */
export function loadPanel(panelPath: string): LoadedPanel {
  if (!fs.existsSync(panelPath)) throw new PanelNotFoundError(panelPath);

  const parsed = panelSchema.safeParse(readJson(panelPath));
  if (!parsed.success) {
    throw new PanelInvalidError(panelPath, parsed.error.issues.map(describeIssue).join("; "));
  }
  if (parsed.data.length === 0) {
    throw new PanelInvalidError(panelPath, "it is empty, so there is nothing to watch");
  }

  const seen = new Set<string>();
  const entries: Panel = [];
  const duplicates: PanelEntry[] = [];
  for (const entry of parsed.data.map(normaliseEntry)) {
    const key = watchKey(entry);
    if (seen.has(key)) {
      duplicates.push(entry);
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }
  return { entries, duplicates };
}

function readJson(panelPath: string): unknown {
  const raw = fs.readFileSync(panelPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new PanelInvalidError(panelPath, `it is not valid JSON (${(cause as Error).message})`);
  }
}

function describeIssue(issue: { path: PropertyKey[]; message: string }): string {
  const where = issue.path.length > 0 ? issue.path.join(".") : "the file";
  return `${where}: ${issue.message}`;
}

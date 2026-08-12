import type { Panel, PanelEntry, Platform } from "../contracts/types.ts";
import type { LoadedPanel } from "./load.ts";

/**
 * Below this many creators the panel cannot say much. The heuristic asks whether the same shape
 * is breaking out for other creators too, and that question needs a crowd to ask it of.
 */
export const MIN_CREATORS = 20;

export interface PlatformSummary {
  platform: Platform;
  creators: number;
  hashtags: number;
  sounds: number;
}

export interface PanelReport {
  totalWatched: number;
  creators: number;
  platforms: PlatformSummary[];
  duplicatesDropped: PanelEntry[];
  /** True when the panel is too small for the spread signal to mean anything. */
  tooFewCreators: boolean;
}

export function reportOn(loaded: LoadedPanel): PanelReport {
  const platforms = summarisePlatforms(loaded.entries);
  const creators = platforms.reduce((total, each) => total + each.creators, 0);
  return {
    totalWatched: loaded.entries.length,
    creators,
    platforms,
    duplicatesDropped: loaded.duplicates,
    tooFewCreators: creators < MIN_CREATORS,
  };
}

function summarisePlatforms(entries: Panel): PlatformSummary[] {
  const byPlatform = new Map<Platform, PlatformSummary>();
  for (const entry of entries) {
    const summary = byPlatform.get(entry.platform) ?? {
      platform: entry.platform,
      creators: 0,
      hashtags: 0,
      sounds: 0,
    };
    if (entry.kind === "creator") summary.creators += 1;
    if (entry.kind === "hashtag") summary.hashtags += 1;
    if (entry.kind === "sound") summary.sounds += 1;
    byPlatform.set(entry.platform, summary);
  }
  return [...byPlatform.values()].sort((left, right) =>
    left.platform.localeCompare(right.platform),
  );
}

function count(amount: number, singular: string): string {
  return `${amount} ${amount === 1 ? singular : `${singular}s`}`;
}

export function renderReport(report: PanelReport): string {
  const lines: string[] = [`Watching ${count(report.totalWatched, "thing")}.`, ""];
  for (const platform of report.platforms) {
    lines.push(
      `  ${platform.platform}: ${count(platform.creators, "creator")}, ` +
        `${count(platform.hashtags, "hashtag")}, ${count(platform.sounds, "sound")}`,
    );
  }
  lines.push("", ...warnings(report));
  return lines.join("\n");
}

function warnings(report: PanelReport): string[] {
  const lines: string[] = [];
  for (const entry of report.duplicatesDropped) {
    lines.push(`  dropped a duplicate watch of ${entry.platform} ${entry.kind} ${entry.handle}`);
  }
  if (report.tooFewCreators) {
    lines.push(
      `  ${count(report.creators, "creator")}, fewer than the ${MIN_CREATORS} the spread ` +
        `signal needs`,
    );
  }
  return lines.length > 0 ? lines : ["  nothing to flag"];
}

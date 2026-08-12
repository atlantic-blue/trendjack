import type { Panel, PanelEntry, Platform } from "../contracts/types.ts";
import type { LoadedPanel } from "./load.ts";

/**
 * Below this many creators a niche cannot say anything. The heuristic scores a video against
 * its own creator's baseline and then asks whether the same shape is breaking out for other
 * creators too, and that second question needs a crowd to ask it of.
 */
export const MIN_CREATORS_PER_NICHE = 5;

export interface NicheSummary {
  product: string;
  niche: string;
  platform: Platform;
  creators: number;
  hashtags: number;
  sounds: number;
}

export interface PanelReport {
  totalWatched: number;
  niches: NicheSummary[];
  duplicatesDropped: PanelEntry[];
  /** Niches with a crowd too small for spread to mean anything. */
  thinNiches: NicheSummary[];
  /** Products watched only through hashtags or sounds, which can never produce a score. */
  productsWithoutCreators: string[];
}

export function reportOn(loaded: LoadedPanel): PanelReport {
  const niches = summariseNiches(loaded.entries);
  return {
    totalWatched: loaded.entries.length,
    niches,
    duplicatesDropped: loaded.duplicates,
    thinNiches: niches.filter((niche) => niche.creators < MIN_CREATORS_PER_NICHE),
    productsWithoutCreators: productsWithoutCreators(loaded.entries),
  };
}

function summariseNiches(entries: Panel): NicheSummary[] {
  const byKey = new Map<string, NicheSummary>();
  for (const entry of entries) {
    const key = `${entry.product}|${entry.niche}|${entry.platform}`;
    const summary = byKey.get(key) ?? {
      product: entry.product,
      niche: entry.niche,
      platform: entry.platform,
      creators: 0,
      hashtags: 0,
      sounds: 0,
    };
    if (entry.kind === "creator") summary.creators += 1;
    if (entry.kind === "hashtag") summary.hashtags += 1;
    if (entry.kind === "sound") summary.sounds += 1;
    byKey.set(key, summary);
  }
  return [...byKey.values()].sort(byProductThenNiche);
}

function byProductThenNiche(left: NicheSummary, right: NicheSummary): number {
  return (
    left.product.localeCompare(right.product) ||
    left.niche.localeCompare(right.niche) ||
    left.platform.localeCompare(right.platform)
  );
}

function productsWithoutCreators(entries: Panel): string[] {
  const products = new Set(entries.map((entry) => entry.product));
  const withCreators = new Set(
    entries.filter((entry) => entry.kind === "creator").map((entry) => entry.product),
  );
  return [...products].filter((product) => !withCreators.has(product)).sort();
}

function count(amount: number, singular: string, plural = `${singular}s`): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

export function renderReport(report: PanelReport): string {
  const lines: string[] = [`Watching ${count(report.totalWatched, "thing")}.`, ""];
  for (const niche of report.niches) {
    lines.push(
      `  ${niche.product} / ${niche.niche} / ${niche.platform}: ` +
        `${count(niche.creators, "creator")}, ${count(niche.hashtags, "hashtag")}, ` +
        `${count(niche.sounds, "sound")}`,
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
  for (const niche of report.thinNiches) {
    lines.push(
      `  ${niche.product} / ${niche.niche} / ${niche.platform} has ` +
        `${count(niche.creators, "creator")}, ` +
        `fewer than the ${MIN_CREATORS_PER_NICHE} a spread signal needs`,
    );
  }
  for (const product of report.productsWithoutCreators) {
    lines.push(
      `  ${product} has no creators, only hashtags or sounds, so nothing there can be scored`,
    );
  }
  return lines.length > 0 ? lines : ["  nothing to flag"];
}

import type { Verdict } from "./qualify.ts";

export interface QualifyReport {
  verdicts: Verdict[];
  product: string;
  niche: string;
  platform: "tiktok" | "instagram";
}

/**
 * What a person reads after running the check. The kept creators come with the exact lines to
 * paste into the panel, because the next step after "keep this one" is always the same and
 * copying it by hand is where a handle gets mistyped.
 */
export function renderQualify(report: QualifyReport): string {
  const kept = report.verdicts.filter((each) => each.keep);
  const rejected = report.verdicts.filter((each) => !each.keep);
  const lines = [`Checked ${count(report.verdicts.length, "creator")}. Keep ${kept.length}.`, ""];

  for (const verdict of kept) {
    lines.push(`  keep    @${verdict.handle}  ${verdict.reason}`);
  }
  for (const verdict of rejected) {
    lines.push(`  drop    @${verdict.handle}  ${verdict.reason}`);
  }

  if (kept.length > 0) {
    lines.push("", "Panel entries for the ones to keep:", "");
    lines.push(JSON.stringify(entriesFor(report, kept), null, 2));
  }
  return lines.join("\n");
}

function entriesFor(report: QualifyReport, kept: Verdict[]) {
  return kept.map((verdict) => ({
    product: report.product,
    niche: report.niche,
    platform: report.platform,
    kind: "creator",
    handle: verdict.handle,
  }));
}

function count(amount: number, singular: string): string {
  return `${amount} ${amount === 1 ? singular : `${singular}s`}`;
}

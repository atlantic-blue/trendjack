import type { Digest, DigestRow, ProvenRow } from "./build.ts";

/**
 * What a person reads over coffee. Everything here is chosen so a decision can be made without
 * opening anything: how far above normal, whether it is still climbing, whether anybody else is
 * on the same shape, how much of the window is left, and the link.
 */
export function renderDigest(digest: Digest): string {
  const lines = [`Trendjack, ${stamp(digest.generatedAt)}`, "", headline(digest), ""];
  if (digest.candidates.length === 0) {
    lines.push("  nothing cleared the bar today");
  }
  digest.candidates.forEach((row, index) => lines.push(...candidate(row, index + 1)));
  lines.push(...provenSection(digest.proven));
  lines.push("", ...footer(digest));
  return lines.join("\n");
}

function headline(digest: Digest): string {
  const found =
    digest.candidates.length === 1 ? "1 worth a look" : `${digest.candidates.length} worth a look`;
  return `${found}, from ${plural(digest.postsConsidered, "video")} by ${plural(digest.creatorsSeen, "creator")} in the last ${digest.windowHours} hours.`;
}

function candidate(row: DigestRow, rank: number): string[] {
  const { score, post } = row;
  return [
    `${rank}. ${score.features.outlier.toFixed(1)}x  ${score.band}  ${Math.round(score.features.ageHours)}h old  @${post.creatorId}`,
    `   ${movement(row)}`,
    `   ${post.url}`,
    "",
  ];
}

function movement(row: DigestRow): string {
  const { features } = row.score;
  const parts: string[] = [];
  if (!features.velocityMeasurable) {
    parts.push("rate unreadable, the counts are reported too roundly to see movement");
  } else if (features.acceleration > 0) {
    parts.push(`still picking up, ${features.normVelocity.toFixed(2)} baselines an hour`);
  } else if (features.acceleration < 0) {
    parts.push(`losing pace, ${features.normVelocity.toFixed(2)} baselines an hour`);
  } else {
    parts.push(`${features.normVelocity.toFixed(2)} baselines an hour`);
  }
  if (features.spread > 0) parts.push(`${plural(features.spread, "other creator")} on this shape`);
  if (features.saturation >= 0.5) parts.push("the sound is already crowded");
  if (features.qualityRatio < 0.8) parts.push("engagement below this creator's normal");
  return parts.join(", ");
}

/**
 * A short digest on a day when forty candidates were held back is a different thing from a
 * quiet day, so the counts are always printed even when they are nought.
 */
function footer(digest: Digest): string[] {
  const lines = [`Held back: ${digest.heldBack.length}${byReason(digest.heldBack)}`];
  lines.push(`Not scored at all: ${digest.unscored.length}${firstReason(digest.unscored)}`);
  return lines;
}

function byReason(rows: DigestRow[]): string {
  if (rows.length === 0) return "";
  const counted = new Map<string, number>();
  for (const row of rows) {
    const reason = row.score.suppressedReason ?? "no reason recorded";
    counted.set(reason, (counted.get(reason) ?? 0) + 1);
  }
  return ` (${[...counted].map(([reason, count]) => `${count} ${reason}`).join("; ")})`;
}

function firstReason(unscored: { reason: string }[]): string {
  if (unscored.length === 0) return "";
  const counted = new Map<string, number>();
  for (const each of unscored) counted.set(each.reason, (counted.get(each.reason) ?? 0) + 1);
  const commonest = [...counted].sort((left, right) => right[1] - left[1])[0];
  return commonest ? ` (mostly: ${commonest[0]})` : "";
}

function plural(amount: number, singular: string): string {
  return `${amount} ${amount === 1 ? singular : `${singular}s`}`;
}

function stamp(at: number): string {
  return new Date(at).toISOString().replace("T", " ").slice(0, 16);
}

/**
 * Videos that reached the like floor. These are a separate list because they answer a different
 * question from the candidates: not "is this growing" but "does this shape work at scale".
 */
function provenSection(proven: ProvenRow[]): string[] {
  if (proven.length === 0) return [];
  const lines = ["", `Formats that worked at scale (${plural(proven.length, "video")}):`, ""];
  for (const row of proven) {
    lines.push(`   ${row.likes.toLocaleString("en-GB")} likes  @${row.post.creatorId}`);
    lines.push(`   ${row.post.url}`, "");
  }
  return lines;
}

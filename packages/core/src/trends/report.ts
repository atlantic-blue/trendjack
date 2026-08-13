import { byFastestGrowth, type Growth } from "./growth.ts";
import type { RecordReport } from "./record.ts";

/**
 * What a person reads after a round.
 *
 * The count of hashtags that did not answer is always shown, even at nought. A round where half
 * the topics refused and a genuinely quiet day produce the same short list otherwise.
 */
export function renderRecord(report: RecordReport): string {
  const lines = [
    `Read ${report.recorded.length} of ${report.asked} hashtags. ` +
      `${report.failures.length} did not answer.`,
    "",
  ];

  const ranked = [...report.growth].sort(byFastestGrowth);
  const growing = ranked.filter((each) => each.dailyRate !== undefined);
  const first = ranked.filter((each) => each.dailyRate === undefined);

  if (growing.length > 0) {
    lines.push("Growing fastest against their own size:", "");
    for (const growth of growing) lines.push(`  ${line(growth)}`);
    lines.push("");
  }

  if (first.length > 0) {
    lines.push(
      first.length === ranked.length
        ? "First reading. Nothing to compare with until the next round."
        : "Read for the first time, so no growth yet:",
      "",
    );
    for (const growth of first) {
      lines.push(`  ${growth.hashtag.padEnd(20)} ${whole(growth.latest.videoCount)} videos`);
    }
    lines.push("");
  }

  for (const failure of report.failures) {
    lines.push(`  no answer  #${failure.hashtag}  ${failure.reason}`);
  }
  return lines.join("\n").trimEnd();
}

function line(growth: Growth): string {
  const perDay = growth.videosPerDay ?? 0;
  const rate = ((growth.dailyRate ?? 0) * 100).toFixed(2);
  return (
    `${growth.hashtag.padEnd(20)} ${rate.padStart(7)}% a day  ` +
    `${whole(Math.round(perDay)).padStart(12)} videos a day  ` +
    `${whole(growth.latest.videoCount).padStart(14)} in total  ` +
    `over ${(growth.hours ?? 0).toFixed(1)}h`
  );
}

function whole(value: number): string {
  return value.toLocaleString("en-GB");
}

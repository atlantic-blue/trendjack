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
  const changed = ranked.filter((each) => each.since !== undefined);
  const first = ranked.filter((each) => each.since === undefined);

  if (changed.length > 0) {
    lines.push("What the counts did, largest change against their size first:", "");
    for (const growth of changed) lines.push(`  ${line(growth)}`);
    lines.push("");
  }

  if (first.length > 0) {
    lines.push(
      first.length === ranked.length
        ? "First reading. Nothing to compare with until the next round."
        : "Read for the first time, so no change yet:",
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

/** The reading leads. The rate follows it, in brackets, because it is worked out and not read. */
function line(growth: Growth): string {
  const rate = ((growth.dailyRate ?? 0) * 100).toFixed(2);
  return `${growth.hashtag.padEnd(20)} ${observedPart(growth)}  (${rate}% a day if it holds)`;
}

/**
 * What was read, never what it would be if it kept up.
 *
 * "the count rose by 1", not "one video was posted". The number is a net total the platform
 * reports, so a rise of one can be forty posted and thirty nine deleted, and we never see which.
 */
function observedPart(growth: Growth): string {
  const added = growth.addedVideos ?? 0;
  const sign = added < 0 ? "" : "+";
  return (
    `${sign}${whole(added)} to the count in ${span(growth.hours ?? 0)}, ` +
    `now ${whole(growth.latest.videoCount)}`
  );
}

function span(hours: number): string {
  if (hours >= 1) return `${hours.toFixed(1)} hours`;
  return `${Math.round(hours * 60)} minutes`;
}

function whole(value: number): string {
  return value.toLocaleString("en-GB");
}

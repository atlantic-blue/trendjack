import type { BestVideosReport } from "./best-videos.ts";
import type { RankedVideo } from "./videos.ts";

/**
 * What a person reads. The counts that were fetched lead, and the rate follows them.
 *
 * The dropped counts are always shown, even at nought, because a short list from a page of thirty
 * and a page that had nothing on it are different things.
 */
export function renderBestVideos(report: BestVideosReport, minAgeHours: number): string {
  const lines = [
    `#${report.hashtag}: ${report.onThePage} videos on the page, ` +
      `${report.tooYoung} under ${minAgeHours} hours old, ` +
      `${report.unreadable} would not report their counts.`,
    "",
  ];
  if (report.ranked.length === 0) {
    lines.push("Nothing left to rank.");
    return lines.join("\n");
  }
  lines.push("Best performing, by views an hour since posting:", "");
  for (const video of report.ranked) lines.push(`  ${line(video)}`);
  return lines.join("\n");
}

function line(video: RankedVideo): string {
  return (
    `${whole(Math.round(video.viewsPerHour)).padStart(9)} an hour  ` +
    `${whole(video.views).padStart(11)} views  ` +
    `${age(video.ageHours).padStart(7)}  ` +
    `@${video.handle.padEnd(20)} ${video.url}`
  );
}

function age(hours: number): string {
  return hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours.toFixed(1)}h`;
}

function whole(value: number): string {
  return value.toLocaleString("en-GB");
}

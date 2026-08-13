import type { DigestTag } from "./digest.ts";

export interface TagListProps {
  tags: DigestTag[];
}

/**
 * The topics, largest change against their size first.
 *
 * The reading leads and the rate follows it. A count that rose by one over half an hour is
 * "+1 in 31 minutes", and calling that 46 a day is arithmetic rather than a measurement. How much
 * change is worth calling a trend is not known yet, so nothing here passes a verdict.
 */
export function TagList({ tags }: TagListProps) {
  if (tags.length === 0) return <p className="empty">No hashtag has been read yet.</p>;
  return (
    <ol className="topics">
      {tags.map((tag) => (
        <li className="topic" key={tag.hashtag}>
          <span className="topic-name">#{tag.hashtag}</span>
          <span className="topic-figures">{totalText(tag)}</span>
          <span className={changeClass(tag)}>{changeText(tag)}</span>
        </li>
      ))}
    </ol>
  );
}

function changeClass(tag: DigestTag): string {
  if (tag.addedVideos === undefined) return "topic-rate topic-rate-unknown";
  return tag.addedVideos < 0 ? "topic-rate topic-rate-falling" : "topic-rate";
}

/**
 * What the count did, in the words of what was read.
 *
 * "the count rose by 1", never "one video was posted". The number is a net total the platform
 * reports, so a rise of one can be forty posted and thirty nine deleted, and we never see which.
 */
function changeText(tag: DigestTag): string {
  if (tag.addedVideos === undefined) return "first reading";
  return `${signed(tag.addedVideos)} in ${span(tag.overHours ?? 0)}`;
}

function totalText(tag: DigestTag): string {
  const total = `${whole(tag.videoCount)} in the count`;
  if (tag.dailyRate === undefined) return total;
  return `${total}, which is ${(tag.dailyRate * 100).toFixed(2)}% a day if it holds`;
}

function span(hours: number): string {
  if (hours >= 24) return `${(hours / 24).toFixed(1)} days`;
  if (hours >= 1) return `${hours.toFixed(1)} hours`;
  return `${Math.round(hours * 60)} minutes`;
}

function signed(value: number): string {
  return value < 0 ? whole(value) : `+${whole(value)}`;
}

function whole(value: number): string {
  return value.toLocaleString("en-GB");
}

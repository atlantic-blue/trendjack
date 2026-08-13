import type { DigestTag } from "./digest.ts";

export interface TagListProps {
  tags: DigestTag[];
}

/**
 * The topics, fastest growing first.
 *
 * There is no video to show here, so the number is the content. The rate is the loudest thing on
 * the row, because it is the reason the row is there at all: a topic that added four hundred
 * videos to seven hundred is a trend, and one that added forty thousand to sixty million is a
 * Tuesday.
 */
export function TagList({ tags }: TagListProps) {
  if (tags.length === 0) return <p className="empty">No hashtag has been read yet.</p>;
  return (
    <ol className="topics">
      {tags.map((tag) => (
        <li className="topic" key={tag.hashtag}>
          <span className="topic-name">#{tag.hashtag}</span>
          <span className={rateClass(tag)}>{rateText(tag)}</span>
          <span className="topic-figures">{figuresText(tag)}</span>
        </li>
      ))}
    </ol>
  );
}

function rateClass(tag: DigestTag): string {
  if (tag.dailyRate === undefined) return "topic-rate topic-rate-unknown";
  return tag.dailyRate < 0 ? "topic-rate topic-rate-falling" : "topic-rate";
}

/** A first reading says so. A rate of nought and a rate nobody could read mean opposite things. */
function rateText(tag: DigestTag): string {
  if (tag.dailyRate === undefined) return "first reading";
  return `${(tag.dailyRate * 100).toFixed(2)}% a day`;
}

function figuresText(tag: DigestTag): string {
  const total = `${whole(tag.videoCount)} videos`;
  if (tag.videosPerDay === undefined) return total;
  const measured = tag.overHours === undefined ? "" : `, measured over ${hours(tag.overHours)}`;
  return `${signed(tag.videosPerDay)} a day, of ${total}${measured}`;
}

function hours(value: number): string {
  if (value >= 1) return `${value.toFixed(1)} hours`;
  return `${Math.round(value * 60)} minutes`;
}

function signed(value: number): string {
  return value < 0 ? `${whole(value)}` : `+${whole(value)}`;
}

function whole(value: number): string {
  return value.toLocaleString("en-GB");
}

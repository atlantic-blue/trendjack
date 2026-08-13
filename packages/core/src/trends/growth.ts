import type { TagReading } from "../contracts/types.ts";
import { HOUR_MS } from "../ranking/constants.ts";

export interface Growth {
  hashtag: string;
  latest: TagReading;
  /** Absent until a hashtag has been read twice. Nothing can be said from one reading. */
  since: TagReading | undefined;
  addedVideos: number | undefined;
  addedViews: number | undefined;
  hours: number | undefined;
  videosPerDay: number | undefined;
  /**
   * Videos added per day against the videos already there, so a small topic doubling outranks a
   * huge one growing by a rounding error. A tag with a million videos gains thousands a day and
   * means nothing by it.
   */
  dailyRate: number | undefined;
}

/**
 * What changed between the oldest reading in the window and the newest.
 *
 * The two ends rather than the last pair, because a missed day would otherwise make a tag look
 * as though it had stopped. A gap in the readings is a gap in our polling, never a gap in what
 * people posted.
 */
export function growthFrom(hashtag: string, readings: TagReading[]): Growth | undefined {
  const ordered = [...readings].sort((left, right) => left.observedAt - right.observedAt);
  const latest = ordered.at(-1);
  if (!latest) return undefined;

  const since = ordered.length > 1 ? ordered[0] : undefined;
  if (!since) {
    return {
      hashtag,
      latest,
      since: undefined,
      addedVideos: undefined,
      addedViews: undefined,
      hours: undefined,
      videosPerDay: undefined,
      dailyRate: undefined,
    };
  }

  const hours = (latest.observedAt - since.observedAt) / HOUR_MS;
  const addedVideos = latest.videoCount - since.videoCount;
  const videosPerDay = hours > 0 ? (addedVideos / hours) * 24 : undefined;
  return {
    hashtag,
    latest,
    since,
    addedVideos,
    addedViews: latest.viewCount - since.viewCount,
    hours,
    videosPerDay,
    dailyRate:
      videosPerDay !== undefined && since.videoCount > 0
        ? videosPerDay / since.videoCount
        : undefined,
  };
}

/**
 * The growth of every hashtag that has been read, fastest first.
 *
 * The set of hashtags is whatever the store holds. Nothing has to be configured twice, so a tag
 * added to a round shows up here on its own.
 */
export function growthForAll(readings: TagReading[]): Growth[] {
  const byTag = new Map<string, TagReading[]>();
  for (const reading of readings) {
    byTag.set(reading.hashtag, [...(byTag.get(reading.hashtag) ?? []), reading]);
  }
  return [...byTag.entries()]
    .map(([hashtag, forTag]) => growthFrom(hashtag, forTag))
    .filter((each): each is Growth => each !== undefined)
    .sort(byFastestGrowth);
}

/** Fastest growing first. A hashtag with only one reading has nothing to rank on and sorts last. */
export function byFastestGrowth(left: Growth, right: Growth): number {
  return (right.dailyRate ?? -1) - (left.dailyRate ?? -1);
}

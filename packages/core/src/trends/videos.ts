import { HOUR_MS } from "../ranking/constants.ts";

export interface TagVideo {
  hashtag: string;
  videoId: string;
  handle: string;
  url: string;
  caption: string;
  /** Unknown when the identifier does not decode to a plausible time. */
  postedAt: number | undefined;
}

export interface VideoCounts {
  views: number;
  likes: number;
  comments: number;
}

export interface RankedVideo extends TagVideo {
  views: number;
  likes: number;
  comments: number;
  ageHours: number;
  viewsPerHour: number;
}

/**
 * How old a video must be before a rate is taken from it.
 *
 * A video forty minutes old shows a high rate from a handful of views, and every one of those
 * would head the list. Waiting means being late to a video by half a day, and it buys a rate
 * measured over a window long enough to mean something.
 */
export const MIN_AGE_HOURS = 12;

/** TikTok launched in 2016, so anything before this did not come from an identifier. */
const EARLIEST_PLAUSIBLE_MS = Date.UTC(2016, 0, 1);

/**
 * When a video was posted, read from its identifier rather than fetched.
 *
 * The top 32 bits are the second it was minted. Checked against three videos whose pages report a
 * creation time: the identifier ran 13 to 24 seconds early each time. That is far inside the
 * precision anything here needs, and it costs no request, so a page of thirty videos can be sorted
 * by age before a single one is fetched.
 */
export function postedAtFrom(videoId: string): number | undefined {
  if (!/^\d+$/.test(videoId)) return undefined;
  const milliseconds = Number(BigInt(videoId) >> 32n) * 1000;
  if (milliseconds < EARLIEST_PLAUSIBLE_MS) return undefined;
  if (milliseconds > Date.now() + HOUR_MS) return undefined;
  return milliseconds;
}

export function ageHoursOf(video: TagVideo, now: number): number | undefined {
  if (video.postedAt === undefined) return undefined;
  return Math.max(0, (now - video.postedAt) / HOUR_MS);
}

/**
 * Which videos are old enough to be worth fetching counts for.
 *
 * The age comes from the identifier, so this runs before any request. On a page of thirty, it
 * usually removes about half, and each one removed is a fetch not made.
 */
export function worthFetching(
  videos: TagVideo[],
  now: number,
  minAgeHours = MIN_AGE_HOURS,
): TagVideo[] {
  return videos.filter((video) => {
    const age = ageHoursOf(video, now);
    return age !== undefined && age >= minAgeHours;
  });
}

/**
 * The videos on a hashtag page, best performing first.
 *
 * Views per hour rather than views, because the page carries videos years old alongside videos
 * from this morning. Ranked by views alone, the archive wins every time: one page held a video
 * with 195,800 views posted 426 days ago, which is 19 an hour, above a video doing 2,021 an hour.
 */
export function rankVideos(
  counted: { video: TagVideo; counts: VideoCounts }[],
  now: number,
  minAgeHours = MIN_AGE_HOURS,
): RankedVideo[] {
  const ranked: RankedVideo[] = [];
  for (const { video, counts } of counted) {
    const ageHours = ageHoursOf(video, now);
    if (ageHours === undefined || ageHours < minAgeHours) continue;
    ranked.push({
      ...video,
      ...counts,
      ageHours,
      viewsPerHour: counts.views / ageHours,
    });
  }
  return ranked.sort((left, right) => right.viewsPerHour - left.viewsPerHour);
}

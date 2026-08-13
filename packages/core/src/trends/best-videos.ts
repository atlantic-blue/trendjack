import type { TagVideoSource } from "../contracts/ports.ts";
import {
  MIN_AGE_HOURS,
  rankVideos,
  worthFetching,
  type RankedVideo,
  type TagVideo,
} from "./videos.ts";

export interface BestVideosReport {
  hashtag: string;
  /** Every video the page drew, before anything was dropped. */
  onThePage: number;
  /** Dropped for being younger than the floor, so no request was spent on them. */
  tooYoung: number;
  /** Asked about but the page did not describe them. */
  unreadable: number;
  ranked: RankedVideo[];
}

export interface BestVideosOptions {
  hashtag: string;
  source: TagVideoSource;
  now: number;
  minAgeHours?: number;
  /** At most this many fetched, newest first, because each one is a request. */
  limit?: number;
  pace?: () => Promise<void>;
}

const DEFAULT_LIMIT = 20;

/**
 * The videos on a hashtag page, best performing first.
 *
 * Two costs, and they are very different. Listing the page is one request. Reading the counts is
 * one request per video, so everything that cannot be ranked is dropped first: the age comes from
 * the identifier, and that needs no request at all.
 */
export async function bestVideosFor(options: BestVideosOptions): Promise<BestVideosReport> {
  const onThePage = await options.source.videosFor(options.hashtag);
  const minAgeHours = options.minAgeHours ?? MIN_AGE_HOURS;
  const wanted = newestFirst(worthFetching(onThePage, options.now, minAgeHours)).slice(
    0,
    options.limit ?? DEFAULT_LIMIT,
  );

  const counted: {
    video: TagVideo;
    counts: NonNullable<Awaited<ReturnType<TagVideoSource["countsFor"]>>>;
  }[] = [];
  let unreadable = 0;
  for (const [index, video] of wanted.entries()) {
    if (index > 0 && options.pace) await options.pace();
    const counts = await options.source.countsFor(video);
    if (!counts) {
      unreadable += 1;
      continue;
    }
    counted.push({ video, counts });
  }

  return {
    hashtag: options.hashtag,
    onThePage: onThePage.length,
    tooYoung: onThePage.length - worthFetching(onThePage, options.now, minAgeHours).length,
    unreadable,
    ranked: rankVideos(counted, options.now, minAgeHours),
  };
}

/** Newest first, so a limit keeps the recent videos rather than an arbitrary slice of the page. */
function newestFirst(videos: TagVideo[]): TagVideo[] {
  return [...videos].sort((left, right) => (right.postedAt ?? 0) - (left.postedAt ?? 0));
}

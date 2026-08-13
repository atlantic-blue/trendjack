import type { TagVideo, VideoCounts } from "../trends/videos.ts";
import type {
  Baseline,
  CreatorId,
  Observation,
  Platform,
  Post,
  PostId,
  Score,
  TagReading,
} from "./types.ts";

/** A post together with the reading taken at the moment it was fetched. */
export interface Sighting {
  post: Post;
  observation: Observation;
}

/**
 * Somewhere posts can be fetched from. There is no endpoint on any platform that answers "what
 * is trending", so this port deliberately cannot ask that question. It can only fetch what a
 * named creator, hashtag or sound has produced, and the trend is inferred from the history.
 *
 * Nothing above this port learns which tool or vendor answered.
 */
export interface TrendSource {
  readonly platform: Platform;
  /** Most recent posts by one creator, newest first. */
  recentPostsByCreator(handle: string, limit: number): Promise<Sighting[]>;
}

/**
 * Raised when a source returns nothing at all. An empty result and a creator who has not
 * posted are indistinguishable from the outside, so this is thrown rather than returned as an
 * empty array, and the run fails loudly instead of producing a quietly empty digest.
 */
export class EmptySourceResultError extends Error {
  readonly platform: Platform;
  readonly handle: string;

  constructor(platform: Platform, handle: string) {
    super(`${platform} returned no posts for ${handle}`);
    this.name = "EmptySourceResultError";
    this.platform = platform;
    this.handle = handle;
  }
}

/** Raised when a source could be reached but its answer did not match the contract. */
export class SourceContractError extends Error {
  readonly platform: Platform;
  readonly handle: string;
  readonly detail: string;

  constructor(platform: Platform, handle: string, detail: string) {
    super(`${platform} returned an unusable payload for ${handle}: ${detail}`);
    this.name = "SourceContractError";
    this.platform = platform;
    this.handle = handle;
    this.detail = detail;
  }
}

/**
 * How many videos and views a hashtag has right now.
 *
 * This is the one question a platform answers directly. A creator has to be named before it will
 * say anything, and a trending list does not exist, but a topic will report its own size, exactly,
 * to anybody who asks. Two readings a day apart give the number of videos people added.
 */
export interface TagStatsSource {
  readonly platform: Platform;
  readingFor(hashtag: string): Promise<TagReading>;
}

/**
 * The videos a hashtag page is showing, and how each one is doing.
 *
 * Listing is one request for the whole page. Counts are one request per video, so the caller is
 * expected to drop what it does not want before asking.
 */
export interface TagVideoSource {
  readonly platform: Platform;
  videosFor(hashtag: string): Promise<TagVideo[]>;
  /** Undefined when the page did not describe the video, which is not an error worth stopping for. */
  countsFor(video: TagVideo): Promise<VideoCounts | undefined>;
}

/** Raised when a hashtag could be asked for but did not report its size. */
export class TagUnavailableError extends Error {
  readonly platform: Platform;
  readonly hashtag: string;

  constructor(platform: Platform, hashtag: string, detail: string) {
    super(`${platform} did not report a size for #${hashtag}: ${detail}`);
    this.name = "TagUnavailableError";
    this.platform = platform;
    this.hashtag = hashtag;
  }
}

/**
 * The append only history. An observation is never updated in place, because replaying a
 * proposed change to the heuristic over the whole past is the only way weights stop being
 * guesses, and that replay is worthless if the past has been edited.
 */
export interface Store {
  appendTagReading(reading: TagReading): Promise<void>;
  /** Every reading of one hashtag since a moment, oldest first. */
  tagReadingsFor(hashtag: string, since: number): Promise<TagReading[]>;
  /** Every reading of every hashtag since a moment. The set of hashtags is whatever was read. */
  tagReadingsSince(since: number): Promise<TagReading[]>;
  appendObservation(observation: Observation): Promise<void>;
  /** Idempotent: seeing the same post again must not create a second row. */
  putPost(post: Post): Promise<void>;
  observationsFor(postId: PostId): Promise<Observation[]>;
  /** A creator's posts that are old enough to have stopped growing, newest first. */
  settledPostsFor(creatorId: CreatorId, before: number, limit: number): Promise<Post[]>;
  /** Posts still inside the action window, for scoring. */
  postsSince(since: number): Promise<Post[]>;
  putBaseline(baseline: Baseline): Promise<void>;
  putScore(score: Score): Promise<void>;
  scoresSince(since: number): Promise<Score[]>;
}

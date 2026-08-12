import type { Baseline, CreatorId, Observation, Platform, Post, PostId, Score } from "./types.ts";

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
 * The append only history. An observation is never updated in place, because replaying a
 * proposed change to the heuristic over the whole past is the only way weights stop being
 * guesses, and that replay is worthless if the past has been edited.
 */
export interface Store {
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

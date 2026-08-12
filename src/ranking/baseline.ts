import type { Baseline, CreatorId, LevelMetric, Observation, Post } from "../contracts/types.ts";
import { BASELINE_POSTS, MIN_SETTLED_POSTS, SETTLED_AFTER_MS } from "./constants.ts";

/** A settled post together with the last reading taken of it. */
export interface SettledPost {
  post: Post;
  latest: Observation;
}

export type BaselineOutcome =
  { ok: true; baseline: Baseline; flat: boolean } | { ok: false; reason: string };

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? Number.NaN;
  return ((sorted[middle - 1] ?? Number.NaN) + (sorted[middle] ?? Number.NaN)) / 2;
}

export function isSettled(post: Post, now: number): boolean {
  return now - post.postedAt >= SETTLED_AFTER_MS;
}

/**
 * A creator's own normal, measured only over posts old enough to have stopped growing.
 *
 * The median rather than the mean, because view counts are heavy tailed and one past hit in a
 * creator's history would drag a mean up far enough to hide every breakout after it.
 */
export function computeBaseline(input: {
  creatorId: CreatorId;
  metric: LevelMetric;
  settled: SettledPost[];
  now: number;
}): BaselineOutcome {
  const usable = input.settled
    .filter((each) => isSettled(each.post, input.now))
    .filter((each) => each.latest[input.metric] !== undefined)
    .sort((left, right) => right.post.postedAt - left.post.postedAt)
    .slice(0, BASELINE_POSTS);

  if (usable.length < MIN_SETTLED_POSTS) {
    return {
      ok: false,
      reason:
        `the creator has ${usable.length} settled posts with a ${input.metric} count, ` +
        `fewer than the ${MIN_SETTLED_POSTS} a baseline needs`,
    };
  }

  const values = usable.map((each) => each.latest[input.metric] ?? 0);
  const value = median(values);
  if (value <= 0) {
    return {
      ok: false,
      reason: `the creator's median ${input.metric} count is ${value}, so nothing can be measured against it`,
    };
  }

  return {
    ok: true,
    flat: new Set(values).size === 1,
    baseline: {
      creatorId: input.creatorId,
      metric: input.metric,
      value,
      settledPostCount: usable.length,
      newestSettledPostAt: usable[0]?.post.postedAt ?? 0,
      computedAt: input.now,
    },
  };
}

/**
 * Instagram has been removing view counts from its own surfaces, so likes are the fallback.
 * The two are never mixed: a baseline built on likes is only ever compared with likes.
 */
export function chooseMetric(settled: SettledPost[]): LevelMetric {
  const withViews = settled.filter((each) => each.latest.views !== undefined).length;
  return withViews >= MIN_SETTLED_POSTS ? "views" : "likes";
}

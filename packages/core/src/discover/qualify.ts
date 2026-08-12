import type { Sighting } from "../contracts/ports.ts";
import { median } from "../ranking/baseline.ts";
import { DAY_MS, MIN_SETTLED_POSTS, PROVEN_LIKES } from "../ranking/constants.ts";

/** A creator who has not posted in this long is not worth a place in the panel. */
export const INACTIVE_AFTER_MS = 30 * DAY_MS;

export interface Verdict {
  handle: string;
  keep: boolean;
  reason: string;
  posts: number;
  medianViews: number;
  bestLikes: number;
  lastPostedAt: number;
}

export interface QualifyOptions {
  handle: string;
  sightings: Sighting[];
  now: number;
  provenLikes?: number;
}

/**
 * Decides if a creator is worth a place in the panel.
 *
 * Each test is a reason we could not use them. A creator with too few posts has no baseline, so
 * nothing of theirs can get a score. A creator whose posts all get the same number has no
 * breakout to find. A creator who never reached the like floor has a ceiling that is too low to
 * copy from. A creator who stopped posting tells us nothing about now.
 */
export function qualifyCreator(options: QualifyOptions): Verdict {
  const floor = options.provenLikes ?? PROVEN_LIKES;
  const views = numbers(options.sightings, "views");
  const likes = numbers(options.sightings, "likes");
  const facts = {
    handle: options.handle,
    posts: options.sightings.length,
    medianViews: views.length === 0 ? 0 : median(views),
    bestLikes: likes.length === 0 ? 0 : Math.max(...likes),
    lastPostedAt: lastPostedAt(options.sightings),
  };

  if (facts.posts < MIN_SETTLED_POSTS) {
    return reject(facts, `only ${facts.posts} posts, and a baseline needs ${MIN_SETTLED_POSTS}`);
  }
  if (views.length < MIN_SETTLED_POSTS) {
    return reject(facts, `only ${views.length} posts show a view count`);
  }
  if (new Set(views).size === 1) {
    return reject(facts, "every post gets the same view count, so a breakout cannot show");
  }
  if (facts.bestLikes < floor) {
    return reject(
      facts,
      `best post got ${format(facts.bestLikes)} likes, below the floor of ${format(floor)}`,
    );
  }
  const silentFor = options.now - facts.lastPostedAt;
  if (silentFor > INACTIVE_AFTER_MS) {
    return reject(facts, `last posted ${Math.round(silentFor / DAY_MS)} days ago`);
  }
  return {
    ...facts,
    keep: true,
    reason: `${format(facts.bestLikes)} likes at best, median ${format(facts.medianViews)} views`,
  };
}

function reject(facts: Omit<Verdict, "keep" | "reason">, reason: string): Verdict {
  return { ...facts, keep: false, reason };
}

function numbers(sightings: Sighting[], field: "views" | "likes"): number[] {
  return sightings
    .map((each) => each.observation[field])
    .filter((each): each is number => each !== undefined);
}

function lastPostedAt(sightings: Sighting[]): number {
  return sightings.reduce((newest, each) => Math.max(newest, each.post.postedAt), 0);
}

function format(count: number): string {
  return Math.round(count).toLocaleString("en-GB");
}

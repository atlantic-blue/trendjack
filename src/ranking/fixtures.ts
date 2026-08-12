import type { CreatorId, Observation, Post, PostId } from "../contracts/types.ts";
import type { SettledPost } from "./baseline.ts";
import { DAY_MS, HOUR_MS } from "./constants.ts";

/** A fixed moment, so no test depends on when it is run. */
export const NOW = 1_754_000_000_000;

export function makePost(overrides: Partial<Post> = {}): Post {
  return {
    postId: "post-1" as PostId,
    platform: "tiktok",
    creatorId: "alice" as CreatorId,
    postedAt: NOW - 6 * HOUR_MS,
    url: "https://www.tiktok.com/@alice/video/post-1",
    hashtags: [],
    ...overrides,
  };
}

export function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    postId: "post-1" as PostId,
    observedAt: NOW,
    views: 10_000,
    likes: 500,
    comments: 20,
    shares: 10,
    ...overrides,
  };
}

/**
 * A creator with a believable history: enough settled posts for a baseline, with view counts
 * that vary the way a real account's do.
 */
export function makeSettled(
  count: number,
  viewsFor: (index: number) => number = (index) => 1_000 + index * 100,
): SettledPost[] {
  return Array.from({ length: count }, (_unused, index) => {
    const postId = `settled-${index}` as PostId;
    const postedAt = NOW - (8 + index) * DAY_MS;
    const views = viewsFor(index);
    return {
      post: makePost({ postId, postedAt }),
      latest: {
        postId,
        observedAt: postedAt + 7 * DAY_MS,
        views,
        likes: Math.round(views * 0.05),
        comments: Math.round(views * 0.002),
        shares: Math.round(views * 0.001),
      },
    };
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import type { Sighting } from "../contracts/ports.ts";
import type { CreatorId, PostId } from "../contracts/types.ts";
import { DAY_MS } from "../ranking/constants.ts";
import { INACTIVE_AFTER_MS, qualifyCreator } from "./qualify.ts";

const NOW = 1_754_000_000_000;

interface Made {
  count?: number;
  views?: (index: number) => number;
  likes?: (index: number) => number | undefined;
  newestAgeDays?: number;
}

function sightings(made: Made = {}): Sighting[] {
  const count = made.count ?? 12;
  const views = made.views ?? ((index) => 100_000 + index * 1_000);
  const likes = made.likes ?? (() => 150_000);
  const newest = NOW - (made.newestAgeDays ?? 1) * DAY_MS;
  return Array.from({ length: count }, (_unused, index) => {
    const postId = `p${index}` as PostId;
    const like = likes(index);
    return {
      post: {
        postId,
        platform: "tiktok" as const,
        creatorId: "someone" as CreatorId,
        postedAt: newest - index * DAY_MS,
        url: `https://www.tiktok.com/@someone/video/${index}`,
        hashtags: [],
      },
      observation: {
        postId,
        observedAt: NOW,
        views: views(index),
        ...(like === undefined ? {} : { likes: like }),
      },
    };
  });
}

function verdict(made: Made = {}) {
  return qualifyCreator({ handle: "someone", sightings: sightings(made), now: NOW });
}

test("a creator who varies, posts often and has reached the floor is kept", () => {
  const kept = verdict();
  assert.equal(kept.keep, true);
  assert.match(kept.reason, /150,000 likes at best/);
});

test("a creator with too few posts is rejected, and the reason says how many", () => {
  const rejected = verdict({ count: 4 });
  assert.equal(rejected.keep, false);
  assert.match(rejected.reason, /only 4 posts, and a baseline needs 8/);
});

test("a creator whose posts all do the same number is rejected", () => {
  const rejected = verdict({ views: () => 200_000 });
  assert.equal(rejected.keep, false);
  assert.match(rejected.reason, /same view count/);
});

test("a creator who never reached the floor is rejected, whatever their views", () => {
  const rejected = verdict({ views: (index) => 900_000 + index, likes: () => 4_000 });
  assert.equal(rejected.keep, false);
  assert.match(rejected.reason, /best post got 4,000 likes, below the floor of 100,000/);
});

test("one post above the floor is enough, because that is the format we want", () => {
  const kept = verdict({ likes: (index) => (index === 3 ? 250_000 : 900) });
  assert.equal(kept.keep, true);
  assert.equal(kept.bestLikes, 250_000);
});

test("a creator who stopped posting is rejected, and the reason says how long ago", () => {
  const rejected = verdict({ newestAgeDays: 90 });
  assert.equal(rejected.keep, false);
  assert.match(rejected.reason, /last posted 90 days ago/);
});

test("a creator who posted just inside the limit is kept", () => {
  const days = INACTIVE_AFTER_MS / DAY_MS - 1;
  assert.equal(verdict({ newestAgeDays: days }).keep, true);
});

test("a creator whose posts carry no view counts is rejected rather than treated as nought", () => {
  const rejected = qualifyCreator({
    handle: "someone",
    sightings: sightings().map((each) => ({
      post: each.post,
      observation: { postId: each.observation.postId, observedAt: NOW, likes: 200_000 },
    })),
    now: NOW,
  });
  assert.equal(rejected.keep, false);
  assert.match(rejected.reason, /show a view count/);
});

test("a creator with no posts at all is rejected and does not divide by nothing", () => {
  const rejected = qualifyCreator({ handle: "someone", sightings: [], now: NOW });
  assert.equal(rejected.keep, false);
  assert.equal(rejected.medianViews, 0);
  assert.equal(rejected.bestLikes, 0);
});

test("the floor can be lowered for a niche where nothing reaches a hundred thousand", () => {
  const kept = qualifyCreator({
    handle: "someone",
    sightings: sightings({ likes: () => 5_000 }),
    now: NOW,
    provenLikes: 3_000,
  });
  assert.equal(kept.keep, true);
});

test("a verdict always carries the numbers, so a rejection can be argued with", () => {
  const rejected = verdict({ count: 3 });
  assert.equal(rejected.posts, 3);
  assert.ok(rejected.medianViews > 0);
  assert.ok(rejected.lastPostedAt > 0);
});

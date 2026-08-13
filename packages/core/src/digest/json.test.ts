import test from "node:test";
import assert from "node:assert/strict";
import type { CreatorId, PostId } from "../contracts/types.ts";
import { toDigestJson } from "./json.ts";
import type { Digest } from "./build.ts";

const NOW = 1_754_000_000_000;
const HOUR = 3_600_000;

function post(postId: string, postedAt: number) {
  return {
    postId: postId as PostId,
    platform: "tiktok" as const,
    creatorId: "someone" as CreatorId,
    postedAt,
    url: `https://www.tiktok.com/@someone/video/${postId}`,
    hashtags: [],
  };
}

function digestWith(proven: { post: ReturnType<typeof post>; likes: number }[]): Digest {
  return {
    generatedAt: NOW,
    windowHours: 72,
    provenWindowHours: 720,
    postsConsidered: 0,
    creatorsSeen: 0,
    candidates: [],
    proven,
    heldBack: [],
    unscored: [],
    tags: [],
  };
}

test("a proven video says how old it is, the same as any other card", () => {
  const json = toDigestJson(digestWith([{ post: post("a", NOW - 30 * HOUR), likes: 200_000 }]));
  assert.equal(json.proven[0]?.ageHours, 30);
  assert.equal(json.proven[0]?.postedAt, NOW - 30 * HOUR);
});

test("a video whose clock is ahead of ours is nought hours old, never negative", () => {
  const json = toDigestJson(digestWith([{ post: post("a", NOW + 5 * HOUR), likes: 200_000 }]));
  assert.equal(json.proven[0]?.ageHours, 0);
});

test("an age in days is still reported in hours, since the label says hours", () => {
  const json = toDigestJson(
    digestWith([{ post: post("a", NOW - 20 * 24 * HOUR), likes: 200_000 }]),
  );
  assert.equal(json.proven[0]?.ageHours, 480);
});

test("a hashtag with one reading is published without a rate, never with a zero", () => {
  const json = toDigestJson({
    ...digestWith([]),
    tags: [
      {
        hashtag: "storytime",
        latest: {
          hashtag: "storytime",
          platform: "tiktok",
          observedAt: NOW,
          videoCount: 60_455_583,
          viewCount: 1_238_133_174_079,
        },
        since: undefined,
        addedVideos: undefined,
        addedViews: undefined,
        hours: undefined,
        videosPerDay: undefined,
        dailyRate: undefined,
      },
    ],
  });
  assert.equal(json.tags?.[0]?.videoCount, 60_455_583);
  assert.equal(json.tags?.[0]?.viewCount, 1_238_133_174_079);
  assert.equal("dailyRate" in (json.tags?.[0] ?? {}), false);
  assert.equal("videosPerDay" in (json.tags?.[0] ?? {}), false);
});

test("a growth rate survives being published, because a third of a per cent is not nought", () => {
  const json = toDigestJson({
    ...digestWith([]),
    tags: [
      {
        hashtag: "saas",
        latest: {
          hashtag: "saas",
          platform: "tiktok",
          observedAt: NOW,
          videoCount: 201_677,
          viewCount: 1_000,
        },
        since: {
          hashtag: "saas",
          platform: "tiktok",
          observedAt: NOW - 3_600_000,
          videoCount: 201_665,
          viewCount: 900,
        },
        addedVideos: 12,
        addedViews: 100,
        hours: 1,
        videosPerDay: 288,
        dailyRate: 0.0033,
      },
    ],
  });
  assert.equal(json.tags?.[0]?.dailyRate, 0.0033);
  assert.notEqual(json.tags?.[0]?.dailyRate, 0);
  assert.equal(json.tags?.[0]?.videosPerDay, 288);
});

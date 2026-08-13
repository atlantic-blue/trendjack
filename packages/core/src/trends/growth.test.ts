import test from "node:test";
import assert from "node:assert/strict";
import type { TagReading } from "../contracts/types.ts";
import { DAY_MS, HOUR_MS } from "../ranking/constants.ts";
import { byFastestGrowth, growthFrom } from "./growth.ts";

const NOW = 1_786_600_000_000;

function reading(atMsAgo: number, videoCount: number, viewCount = videoCount * 1_000): TagReading {
  return {
    hashtag: "storytime",
    platform: "tiktok",
    observedAt: NOW - atMsAgo,
    videoCount,
    viewCount,
  };
}

test("one reading says nothing about growth", () => {
  const growth = growthFrom("storytime", [reading(0, 1_000)]);
  assert.equal(growth?.addedVideos, undefined);
  assert.equal(growth?.dailyRate, undefined);
  assert.equal(growth?.latest.videoCount, 1_000);
});

test("no readings at all produce nothing, not a zero", () => {
  assert.equal(growthFrom("storytime", []), undefined);
});

test("two readings a day apart give the videos added per day", () => {
  const growth = growthFrom("storytime", [reading(DAY_MS, 1_000), reading(0, 1_400)]);
  assert.equal(growth?.addedVideos, 400);
  assert.equal(growth?.videosPerDay, 400);
  assert.equal(growth?.hours, 24);
});

test("half a day of growth is reported as a daily rate, not as the raw difference", () => {
  const growth = growthFrom("storytime", [reading(12 * HOUR_MS, 1_000), reading(0, 1_100)]);
  assert.equal(growth?.addedVideos, 100);
  assert.equal(growth?.videosPerDay, 200);
});

test("the rate is measured against the size, so a small topic doubling beats a huge one crawling", () => {
  const small = growthFrom("small", [reading(DAY_MS, 500), reading(0, 1_000)]);
  const huge = growthFrom("huge", [reading(DAY_MS, 60_000_000), reading(0, 60_100_000)]);
  assert.ok(small && huge);
  assert.ok(
    huge.videosPerDay! > small.videosPerDay!,
    "the huge topic adds more videos, which is why raw counts mislead",
  );
  assert.ok(huge.dailyRate! < small.dailyRate!, "but it grows far more slowly against its size");
  assert.deepEqual([small, huge].sort(byFastestGrowth)[0]?.hashtag, "small");
});

test("readings arriving out of order are put in order before anything is worked out", () => {
  const growth = growthFrom("storytime", [reading(0, 1_400), reading(DAY_MS, 1_000)]);
  assert.equal(growth?.addedVideos, 400);
});

test("a missed day is our gap, so the ends of the window are compared, never the last pair", () => {
  const growth = growthFrom("storytime", [
    reading(3 * DAY_MS, 1_000),
    reading(2 * DAY_MS, 1_600),
    reading(0, 2_200),
  ]);
  assert.equal(growth?.addedVideos, 1_200);
  assert.equal(growth?.hours, 72);
  assert.equal(growth?.videosPerDay, 400);
});

test("views are carried through as well as videos", () => {
  const growth = growthFrom("storytime", [reading(DAY_MS, 1_000), reading(0, 1_400)]);
  assert.equal(growth?.addedViews, 400_000);
});

test("a hashtag with one reading sorts below one that has grown", () => {
  const alone = growthFrom("alone", [reading(0, 10)]);
  const grown = growthFrom("grown", [reading(DAY_MS, 10), reading(0, 11)]);
  assert.ok(alone && grown);
  assert.equal([alone, grown].sort(byFastestGrowth)[0]?.hashtag, "grown");
});

test("a topic that lost videos reports a fall rather than nothing", () => {
  const growth = growthFrom("storytime", [reading(DAY_MS, 1_000), reading(0, 900)]);
  assert.equal(growth?.addedVideos, -100);
  assert.ok((growth?.dailyRate ?? 0) < 0);
});

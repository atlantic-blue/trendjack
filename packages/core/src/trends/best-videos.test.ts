import test from "node:test";
import assert from "node:assert/strict";
import type { TagVideoSource } from "../contracts/ports.ts";
import { HOUR_MS } from "../ranking/constants.ts";
import { bestVideosFor } from "./best-videos.ts";
import type { TagVideo, VideoCounts } from "./videos.ts";

const NOW = 1_786_600_000_000;

function video(id: string, ageHours: number): TagVideo {
  return {
    hashtag: "buildinpublic",
    videoId: id,
    handle: "someone",
    url: `https://www.tiktok.com/@someone/video/${id}`,
    caption: "",
    postedAt: NOW - ageHours * HOUR_MS,
  };
}

function source(
  videos: TagVideo[],
  counts: Record<string, VideoCounts | undefined>,
  asked: string[] = [],
): TagVideoSource {
  return {
    platform: "tiktok",
    async videosFor() {
      return videos;
    },
    async countsFor(each: TagVideo) {
      asked.push(each.videoId);
      return counts[each.videoId];
    },
  };
}

test("a video under the floor is never fetched, so the request is never spent", async () => {
  const asked: string[] = [];
  const report = await bestVideosFor({
    hashtag: "buildinpublic",
    source: source(
      [video("young", 0.8), video("old", 24)],
      { old: { views: 2_400, likes: 1, comments: 1 } },
      asked,
    ),
    now: NOW,
  });
  assert.deepEqual(asked, ["old"]);
  assert.equal(report.tooYoung, 1);
  assert.equal(report.ranked.length, 1);
});

test("the ranking is by views an hour, so the archive does not win", async () => {
  const report = await bestVideosFor({
    hashtag: "buildinpublic",
    source: source([video("archive", 426 * 24), video("today", 24.3)], {
      archive: { views: 195_800, likes: 24_100, comments: 100 },
      today: { views: 49_100, likes: 1_316, comments: 50 },
    }),
    now: NOW,
  });
  assert.deepEqual(
    report.ranked.map((each) => each.videoId),
    ["today", "archive"],
  );
});

test("a video the page would not describe is counted, never treated as having no views", async () => {
  const report = await bestVideosFor({
    hashtag: "buildinpublic",
    source: source([video("a", 24), video("b", 24)], {
      a: { views: 10, likes: 1, comments: 1 },
      b: undefined,
    }),
    now: NOW,
  });
  assert.equal(report.unreadable, 1);
  assert.equal(report.ranked.length, 1);
});

test("the limit keeps the newest, not an arbitrary slice of the page", async () => {
  const asked: string[] = [];
  await bestVideosFor({
    hashtag: "buildinpublic",
    source: source([video("older", 100), video("newer", 20), video("newest", 13)], {}, asked),
    now: NOW,
    limit: 2,
  });
  assert.deepEqual(asked, ["newest", "newer"]);
});

test("the report says how many were on the page before anything was dropped", async () => {
  const report = await bestVideosFor({
    hashtag: "buildinpublic",
    source: source([video("a", 1), video("b", 2), video("c", 24)], {
      c: { views: 5, likes: 1, comments: 1 },
    }),
    now: NOW,
  });
  assert.equal(report.onThePage, 3);
  assert.equal(report.tooYoung, 2);
});

test("the pause runs between fetches and not before the first", async () => {
  let paused = 0;
  await bestVideosFor({
    hashtag: "buildinpublic",
    source: source([video("a", 24), video("b", 25), video("c", 26)], {}),
    now: NOW,
    pace: async () => {
      paused += 1;
    },
  });
  assert.equal(paused, 2);
});

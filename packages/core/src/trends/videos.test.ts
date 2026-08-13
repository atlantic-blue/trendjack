import test from "node:test";
import assert from "node:assert/strict";
import { HOUR_MS } from "../ranking/constants.ts";
import {
  MIN_AGE_HOURS,
  ageHoursOf,
  postedAtFrom,
  rankVideos,
  worthFetching,
  type TagVideo,
} from "./videos.ts";

/** Real identifiers, with the creation time their pages report. */
const REAL = [
  { videoId: "7673169793343622430", createTime: 1_786_549_074 },
  { videoId: "7670293981833612574", createTime: 1_785_879_508 },
  { videoId: "7665823355194363167", createTime: 1_784_838_608 },
];

const NOW = 1_786_600_000_000;

function video(videoId: string, over: Partial<TagVideo> = {}): TagVideo {
  return {
    hashtag: "buildinpublic",
    videoId,
    handle: "someone",
    url: `https://www.tiktok.com/@someone/video/${videoId}`,
    caption: "",
    postedAt: postedAtFrom(videoId),
    ...over,
  };
}

function atAge(hours: number, over: Partial<TagVideo> = {}): TagVideo {
  return video("1", { postedAt: NOW - hours * HOUR_MS, ...over });
}

test("the posted time read from an identifier matches the page, to within half a minute", () => {
  for (const each of REAL) {
    const derived = postedAtFrom(each.videoId);
    assert.ok(derived !== undefined);
    const secondsOut = Math.abs(derived / 1000 - each.createTime);
    assert.ok(secondsOut <= 30, `${each.videoId} was ${secondsOut} seconds out`);
  }
});

test("an identifier that is not a number has no time, rather than a wrong one", () => {
  assert.equal(postedAtFrom("not-a-number"), undefined);
  assert.equal(postedAtFrom(""), undefined);
});

test("a time before TikTok existed is refused", () => {
  assert.equal(postedAtFrom("1"), undefined);
});

test("age is measured from the identifier, so it costs no request", () => {
  assert.equal(ageHoursOf(atAge(24), NOW), 24);
  assert.equal(ageHoursOf(video("nonsense", { postedAt: undefined }), NOW), undefined);
});

test("a video younger than the floor is not fetched at all", () => {
  const videos = [atAge(0.8), atAge(7.8), atAge(11.9), atAge(12), atAge(48)];
  assert.equal(worthFetching(videos, NOW).length, 2);
});

test("a video with no readable time is never fetched, because its rate cannot be worked out", () => {
  assert.deepEqual(worthFetching([video("nonsense", { postedAt: undefined })], NOW), []);
});

test("the floor can be moved, and it defaults to twelve hours", () => {
  assert.equal(MIN_AGE_HOURS, 12);
  assert.equal(worthFetching([atAge(6)], NOW, 3).length, 1);
});

test("videos are ranked by views an hour, not by views", () => {
  const ranked = rankVideos(
    [
      { video: atAge(426 * 24), counts: { views: 195_800, likes: 24_100, comments: 100 } },
      { video: atAge(24.3), counts: { views: 49_100, likes: 1_316, comments: 50 } },
      { video: atAge(72), counts: { views: 92_600, likes: 5_279, comments: 80 } },
    ],
    NOW,
  );
  assert.deepEqual(
    ranked.map((each) => each.views),
    [49_100, 92_600, 195_800],
  );
  assert.equal(Math.round(ranked[0]?.viewsPerHour ?? 0), 2_021);
});

test("a video under the floor never reaches the ranking, however fast it looks", () => {
  const ranked = rankVideos(
    [
      { video: atAge(0.8), counts: { views: 129, likes: 7, comments: 1 } },
      { video: atAge(24), counts: { views: 2_400, likes: 100, comments: 10 } },
    ],
    NOW,
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.views, 2_400);
});

test("a video with no readable time is left out rather than treated as new", () => {
  const ranked = rankVideos(
    [
      {
        video: video("nonsense", { postedAt: undefined }),
        counts: { views: 9_999_999, likes: 1, comments: 1 },
      },
    ],
    NOW,
  );
  assert.deepEqual(ranked, []);
});

test("nothing to rank gives nothing, not an error", () => {
  assert.deepEqual(rankVideos([], NOW), []);
});

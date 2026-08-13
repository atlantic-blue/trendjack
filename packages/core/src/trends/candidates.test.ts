import test from "node:test";
import assert from "node:assert/strict";
import type { TagVideos } from "../contracts/types.ts";
import { candidatesFrom, hashtagsIn, seenHashtagsIn } from "./candidates.ts";
import type { TagVideo } from "./videos.ts";

function video(caption: string): TagVideo {
  return {
    hashtag: "buildinpublic",
    videoId: "1",
    handle: "someone",
    url: "https://www.tiktok.com/@someone/video/1",
    caption,
    postedAt: 1,
  };
}

function look(hashtag: string, seen: [string, number][]): TagVideos {
  return {
    hashtag,
    platform: "tiktok",
    observedAt: 1,
    onThePage: 30,
    videos: [],
    seenHashtags: seen.map(([tag, videos]) => ({ hashtag: tag, videos })),
  };
}

test("hashtags are read out of a caption, whatever case they were written in", () => {
  assert.deepEqual(hashtagsIn("Building #inPublic with #SaaS and #saas"), [
    "inpublic",
    "saas",
    "saas",
  ]);
});

test("a caption with no hashtag gives none rather than an empty string", () => {
  assert.deepEqual(hashtagsIn("just a caption"), []);
});

test("hashtags in other alphabets are read too", () => {
  assert.deepEqual(hashtagsIn("#пет_проект #開發"), ["пет_проект", "開發"]);
});

test("one video using a hashtag twice counts once for that video", () => {
  const seen = seenHashtagsIn([video("#saas and more #saas")]);
  assert.deepEqual(seen, [{ hashtag: "saas", videos: 1 }]);
});

test("the most used hashtag on a page comes first", () => {
  const seen = seenHashtagsIn([video("#a #b"), video("#b"), video("#b #c")]);
  assert.equal(seen[0]?.hashtag, "b");
  assert.equal(seen[0]?.videos, 3);
});

test("a hashtag we already watch is never offered as new", () => {
  const found = candidatesFrom([look("saas", [["founder", 4]])], ["saas", "founder"]);
  assert.deepEqual(found, []);
});

test("a hashtag under two topics outranks a busier one under a single topic", () => {
  const found = candidatesFrom(
    [
      look("saas", [
        ["microsaas", 2],
        ["dev", 9],
      ]),
      look("founder", [["microsaas", 1]]),
    ],
    ["saas", "founder"],
  );
  assert.equal(found[0]?.hashtag, "microsaas");
  assert.equal(found[0]?.fromTopics, 2);
  assert.equal(found[0]?.videos, 3);
  assert.deepEqual(found[0]?.topics, ["saas", "founder"]);
  assert.equal(found[1]?.hashtag, "dev");
});

test("a watched hashtag written with a hash or in capitals is still recognised as watched", () => {
  const found = candidatesFrom([look("saas", [["founder", 4]])], ["#Founder"]);
  assert.deepEqual(found, []);
});

test("nothing seen gives no candidates rather than an error", () => {
  assert.deepEqual(candidatesFrom([], ["saas"]), []);
  assert.deepEqual(candidatesFrom([look("saas", [])], ["saas"]), []);
});

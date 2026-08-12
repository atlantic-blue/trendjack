import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { EmptySourceResultError, SourceContractError } from "../contracts/ports.ts";
import { YtDlpTikTokSource, countResolution, hashtagsIn, soundKeyOf } from "./tiktok.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A real capture of `yt-dlp --flat-playlist --dump-json` against a public profile, taken on
 * 2026-08-12, with the signed media urls stripped because they expire. Nothing here is
 * invented, so a change in the payload shape breaks these tests rather than passing quietly.
 */
const capture = fs.readFileSync(path.join(here, "fixtures", "tiktok-user.jsonl"), "utf8");

const NOW = 1_754_000_000_000;
const sourceOver = (stdout: string) =>
  new YtDlpTikTokSource(
    async () => stdout,
    () => NOW,
  );

test("the real capture maps to posts and observations", async () => {
  const sightings = await sourceOver(capture).recentPostsByCreator("tiktok", 3);
  assert.equal(sightings.length, 3);
  assert.equal(sightings[0]?.post.postId, "7670293981833612574");
  assert.equal(sightings[0]?.post.platform, "tiktok");
  assert.equal(sightings[0]?.observation.views, 1_100_000);
  assert.equal(sightings[0]?.observation.shares, 1_263);
});

test("the posted time is read as milliseconds, not the seconds the tool reports", async () => {
  const [first] = await sourceOver(capture).recentPostsByCreator("tiktok", 1);
  assert.equal(first?.post.postedAt, 1_785_879_508_000);
});

test("every reading in one poll shares the moment we took it", async () => {
  const sightings = await sourceOver(capture).recentPostsByCreator("tiktok", 3);
  assert.deepEqual(new Set(sightings.map((each) => each.observation.observedAt)), new Set([NOW]));
});

test("the handle is lowercased so one creator cannot become two", async () => {
  const [first] = await sourceOver(capture).recentPostsByCreator("TikTok", 1);
  assert.equal(first?.post.creatorId, "tiktok");
});

test("a creator with nothing to show fails loudly rather than returning an empty list", async () => {
  await assert.rejects(
    () => sourceOver("").recentPostsByCreator("someone", 5),
    (error: unknown) => {
      assert.ok(error instanceof EmptySourceResultError);
      assert.match(error.message, /no posts for someone/);
      return true;
    },
  );
});

test("whitespace alone is still nothing, and still fails", async () => {
  await assert.rejects(
    () => sourceOver("\n  \n").recentPostsByCreator("someone", 5),
    (error: unknown) => error instanceof EmptySourceResultError,
  );
});

test("a line that is not JSON is a contract failure naming the platform and handle", async () => {
  await assert.rejects(
    () => sourceOver("not json at all").recentPostsByCreator("someone", 5),
    (error: unknown) => {
      assert.ok(error instanceof SourceContractError);
      assert.equal(error.handle, "someone");
      return true;
    },
  );
});

test("a record missing the posted time is refused rather than dated at the epoch", async () => {
  const withoutTimestamp = JSON.stringify({
    id: "1",
    uploader: "someone",
    webpage_url: "https://www.tiktok.com/@someone/video/1",
  });
  await assert.rejects(
    () => sourceOver(withoutTimestamp).recentPostsByCreator("someone", 5),
    (error: unknown) => error instanceof SourceContractError,
  );
});

test("a count the tool did not report stays unknown instead of becoming zero", async () => {
  const withoutViews = JSON.stringify({
    id: "1",
    uploader: "someone",
    webpage_url: "https://www.tiktok.com/@someone/video/1",
    timestamp: 1_700_000_000,
    like_count: 5,
  });
  const [only] = await sourceOver(withoutViews).recentPostsByCreator("someone", 5);
  assert.equal(only?.observation.views, undefined);
  assert.equal(only?.observation.likes, 5);
});

test("a null count is unknown too, since the tool writes null as often as it omits", async () => {
  const nulled = JSON.stringify({
    id: "1",
    uploader: "someone",
    webpage_url: "https://www.tiktok.com/@someone/video/1",
    timestamp: 1_700_000_000,
    view_count: null,
  });
  const [only] = await sourceOver(nulled).recentPostsByCreator("someone", 5);
  assert.equal(only?.observation.views, undefined);
});

test("the requested limit is passed to the tool rather than assumed", async () => {
  const seen: string[][] = [];
  const source = new YtDlpTikTokSource(async (args) => {
    seen.push(args);
    return capture;
  });
  await source.recentPostsByCreator("someone", 25);
  assert.ok(seen[0]?.includes("1-25"));
  assert.ok(seen[0]?.includes("https://www.tiktok.com/@someone"));
});

test("hashtags come out of the caption, lowercased", () => {
  assert.deepEqual(hashtagsIn("look at this #MacTips and #storage_full"), [
    "mactips",
    "storage_full",
  ]);
});

test("a caption with no hashtags gives none rather than an empty string", () => {
  assert.deepEqual(hashtagsIn("nothing here"), []);
  assert.deepEqual(hashtagsIn(null), []);
});

test("a sound key is built from the artist and the track, because there is no music id", () => {
  assert.equal(soundKeyOf("Original Sound", ["TikTok"]), "tiktok::original sound");
});

test("a record with no sound has no sound key rather than an empty one", () => {
  assert.equal(soundKeyOf(null, null), undefined);
  assert.equal(soundKeyOf("  ", []), undefined);
});

test("the resolution of a reading says how coarsely the tool reported it", () => {
  assert.equal(countResolution(1_100_000), 1_000);
  assert.equal(countResolution(235_400), 100);
  assert.equal(countResolution(5_554), 1);
  assert.equal(countResolution(0), 1);
});

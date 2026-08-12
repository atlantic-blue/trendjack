import test from "node:test";
import assert from "node:assert/strict";
import { enrichDigest, tikTokLookUp, type LookUp } from "./enrich.ts";
import { DIGEST_FORMAT_VERSION, type DigestJson } from "./json.ts";

function digestOf(): DigestJson {
  return {
    version: DIGEST_FORMAT_VERSION,
    generatedAt: 1,
    windowHours: 72,
    postsConsidered: 2,
    creatorsSeen: 1,
    candidates: [
      {
        postId: "a",
        url: "https://www.tiktok.com/@who/video/a",
        creator: "who",
        platform: "tiktok",
        postedAt: 1,
        ageHours: 4,
        outlier: 5,
        band: "strong",
        trendScore: 2,
        normVelocity: 1,
        velocityMeasurable: true,
        acceleration: 0,
        spread: 0,
        saturation: 0,
        qualityRatio: 1,
      },
    ],
    proven: [
      { postId: "b", url: "https://www.tiktok.com/@who/video/b", creator: "who", likes: 200_000 },
    ],
    heldBack: { count: 0, reasons: [] },
    unscored: { count: 0, reasons: [] },
  };
}

const always: LookUp = async (url) => ({ thumbnail: `${url}/poster.jpg`, caption: "a caption" });

test("every published video gets its poster and caption", async () => {
  const enriched = await enrichDigest(digestOf(), always);
  assert.match(enriched.candidates[0]?.thumbnail ?? "", /poster\.jpg$/);
  assert.equal(enriched.proven[0]?.caption, "a caption");
});

test("a video that will not describe itself still appears, just without a poster", async () => {
  const enriched = await enrichDigest(digestOf(), async () => {
    throw new Error("the platform said no");
  });
  assert.equal(enriched.candidates.length, 1);
  assert.equal(enriched.candidates[0]?.thumbnail, undefined);
});

test("a video asked about once, however many lists it is in", async () => {
  const asked: string[] = [];
  const digest = digestOf();
  digest.proven[0]!.url = digest.candidates[0]!.url;
  await enrichDigest(digest, async (url) => {
    asked.push(url);
    return { thumbnail: "x" };
  });
  assert.equal(asked.length, 1);
});

test("nothing else in the digest is disturbed", async () => {
  const before = digestOf();
  const after = await enrichDigest(before, always);
  assert.equal(after.candidates[0]?.outlier, before.candidates[0]?.outlier);
  assert.equal(after.heldBack.count, before.heldBack.count);
  assert.equal(after.version, before.version);
});

test("the look up reads the poster and the caption out of the platform's answer", async () => {
  const look = tikTokLookUp(
    async () =>
      new Response(JSON.stringify({ thumbnail_url: "https://p16/poster.jpg", title: "cake?" }), {
        status: 200,
      }),
  );
  const found = await look("https://www.tiktok.com/@who/video/a");
  assert.equal(found?.thumbnail, "https://p16/poster.jpg");
  assert.equal(found?.caption, "cake?");
});

test("a refused look up gives nothing rather than a broken poster", async () => {
  const look = tikTokLookUp(async () => new Response("no", { status: 403 }));
  assert.equal(await look("https://www.tiktok.com/@who/video/a"), undefined);
});

import test from "node:test";
import assert from "node:assert/strict";
import { sizesIn } from "./tiktok-tag.ts";

/** Captured from a real answer for #storytime on 2026-08-13, trimmed to what is read. */
const REAL = {
  challengeInfo: {
    challenge: { title: "storytime" },
    stats: { videoCount: 0, viewCount: 1_238_100_000_000 },
    statsV2: { videoCount: "60455583", viewCount: "1238133174079" },
  },
};

test("the real answer gives the exact counts", () => {
  assert.deepEqual(sizesIn(REAL), { videoCount: 60_455_583, viewCount: 1_238_133_174_079 });
});

test("the newer field wins, because the older one reports no videos for a topic with sixty million", () => {
  assert.equal(sizesIn(REAL)?.videoCount, 60_455_583);
});

test("the older field is used when the newer one is absent", () => {
  const body = { challengeInfo: { stats: { videoCount: 12, viewCount: 34 } } };
  assert.deepEqual(sizesIn(body), { videoCount: 12, viewCount: 34 });
});

test("a body with no size is unknown, never nought", () => {
  assert.equal(sizesIn({ challengeInfo: { challenge: { title: "storytime" } } }), undefined);
  assert.equal(sizesIn({}), undefined);
  assert.equal(sizesIn(undefined), undefined);
});

test("a size that is not a number is unknown", () => {
  const body = { challengeInfo: { statsV2: { videoCount: "many", viewCount: "1" } } };
  assert.equal(sizesIn(body), undefined);
});

test("a count is never read as negative", () => {
  const body = { challengeInfo: { statsV2: { videoCount: "-5", viewCount: "1" } } };
  assert.equal(sizesIn(body), undefined);
});

test("a view count past two to the thirty second is carried whole", () => {
  const body = { challengeInfo: { statsV2: { videoCount: "1", viewCount: "1238133174079" } } };
  assert.equal(sizesIn(body)?.viewCount, 1_238_133_174_079);
});

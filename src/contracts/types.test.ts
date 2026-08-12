import test from "node:test";
import assert from "node:assert/strict";
import {
  observationSchema,
  panelEntrySchema,
  postSchema,
  scoreSchema,
  featuresSchema,
} from "./types.ts";

const validPost = {
  postId: "7412345678901234567",
  platform: "tiktok",
  creatorId: "somecreator",
  postedAt: 1_754_000_000_000,
  url: "https://www.tiktok.com/@somecreator/video/7412345678901234567",
  hashtags: ["mactips"],
};

test("a post parses and keeps its hashtags", () => {
  const parsed = postSchema.parse(validPost);
  assert.deepEqual(parsed.hashtags, ["mactips"]);
});

test("a post with no hashtags gets an empty list rather than undefined", () => {
  const { hashtags: _omitted, ...withoutHashtags } = validPost;
  assert.deepEqual(postSchema.parse(withoutHashtags).hashtags, []);
});

test("a post from an unknown platform is rejected", () => {
  assert.throws(() => postSchema.parse({ ...validPost, platform: "youtube" }));
});

test("a post carrying an unexpected field is rejected rather than silently kept", () => {
  assert.throws(() => postSchema.parse({ ...validPost, playCount: 1000 }));
});

test("a post with something other than a url is rejected", () => {
  assert.throws(() => postSchema.parse({ ...validPost, url: "tiktok.com/@somecreator" }));
});

test("a post with no creator is rejected", () => {
  assert.throws(() => postSchema.parse({ ...validPost, creatorId: "" }));
});

test("a post dated at the epoch is rejected, since that is a missing date not a real one", () => {
  assert.throws(() => postSchema.parse({ ...validPost, postedAt: 0 }));
});

const validObservation = {
  postId: "7412345678901234567",
  observedAt: 1_754_003_600_000,
  views: 12_000,
  likes: 900,
  comments: 40,
  shares: 12,
};

test("an observation parses", () => {
  assert.equal(observationSchema.parse(validObservation).views, 12_000);
});

test("an observation of a post nobody watched is legitimate", () => {
  const parsed = observationSchema.parse({ ...validObservation, views: 0 });
  assert.equal(parsed.views, 0);
});

test("an observation with an unknown view count is not the same as zero", () => {
  const { views: _omitted, ...withoutViews } = validObservation;
  const parsed = observationSchema.parse(withoutViews);
  assert.equal(parsed.views, undefined);
  assert.notEqual(parsed.views, 0);
});

test("an observation with negative views is rejected", () => {
  assert.throws(() => observationSchema.parse({ ...validObservation, views: -1 }));
});

test("an observation with a fractional view count is rejected", () => {
  assert.throws(() => observationSchema.parse({ ...validObservation, views: 12.5 }));
});

const validFeatures = {
  outlier: 4.2,
  normVelocity: 0.31,
  velocityMeasurable: true,
  acceleration: -0.02,
  qualityRatio: 1.4,
  spread: 3,
  saturation: 0.25,
  ageHours: 18.5,
};

test("acceleration is allowed to be negative, because flattening must be expressible", () => {
  assert.equal(featuresSchema.parse({ ...validFeatures, acceleration: -1.7 }).acceleration, -1.7);
});

test("saturation outside nought to one is rejected", () => {
  assert.throws(() => featuresSchema.parse({ ...validFeatures, saturation: 1.4 }));
});

test("a quality ratio of zero is rejected, since a ratio is never zero", () => {
  assert.throws(() => featuresSchema.parse({ ...validFeatures, qualityRatio: 0 }));
});

test("a rate that could not be read is expressible, and is not the same as a rate of nought", () => {
  const unreadable = featuresSchema.parse({
    ...validFeatures,
    normVelocity: 0,
    velocityMeasurable: false,
  });
  assert.equal(unreadable.velocityMeasurable, false);
  assert.throws(() => featuresSchema.parse({ ...validFeatures, velocityMeasurable: undefined }));
});

test("a score carries the features that produced it, so it can be replayed", () => {
  const parsed = scoreSchema.parse({
    postId: "7412345678901234567",
    computedAt: 1_754_003_600_000,
    metric: "views",
    features: validFeatures,
    trendScore: 2.9,
    band: "outlier",
    confidence: "high",
  });
  assert.equal(parsed.features.outlier, 4.2);
  assert.equal(parsed.suppressedReason, undefined);
});

test("a score may explain why it was held back", () => {
  const parsed = scoreSchema.parse({
    postId: "7412345678901234567",
    computedAt: 1_754_003_600_000,
    metric: "views",
    features: validFeatures,
    trendScore: 2.9,
    band: "outlier",
    confidence: "low",
    suppressedReason: "the creator has 4 settled posts, fewer than the 8 a baseline needs",
  });
  assert.match(parsed.suppressedReason ?? "", /settled posts/);
});

test("a panel entry is a platform, a kind and a handle, and nothing else", () => {
  const parsed = panelEntrySchema.parse({
    platform: "tiktok",
    kind: "creator",
    handle: "somecreator",
  });
  assert.equal(parsed.handle, "somecreator");
});

test("a panel entry that still names a product is rejected", () => {
  assert.throws(() =>
    panelEntrySchema.parse({
      product: "macgleam",
      platform: "tiktok",
      kind: "creator",
      handle: "somecreator",
    }),
  );
});

test("a panel entry of an unknown kind is rejected", () => {
  assert.throws(() =>
    panelEntrySchema.parse({ platform: "tiktok", kind: "playlist", handle: "somecreator" }),
  );
});

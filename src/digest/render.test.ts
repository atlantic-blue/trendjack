import test from "node:test";
import assert from "node:assert/strict";
import type { Digest, DigestRow } from "./build.ts";
import { renderDigest } from "./render.ts";
import type { CreatorId, Features, PostId, Score } from "../contracts/types.ts";

const NOW = 1_754_000_000_000;

const features: Features = {
  outlier: 8.4,
  normVelocity: 2.1,
  velocityMeasurable: true,
  acceleration: 0.4,
  qualityRatio: 1.3,
  spread: 3,
  saturation: 0.1,
  ageHours: 6.2,
};

function row(overrides: Partial<Features> = {}, extra: Partial<DigestRow> = {}): DigestRow {
  const merged = { ...features, ...overrides };
  const score: Score = {
    postId: "hot" as PostId,
    computedAt: NOW,
    metric: "views",
    features: merged,
    trendScore: 4.2,
    band: "strong",
    confidence: "high",
  };
  return {
    post: {
      postId: "hot" as PostId,
      platform: "tiktok",
      creatorId: "somecreator" as CreatorId,
      postedAt: NOW,
      url: "https://www.tiktok.com/@somecreator/video/hot",
      hashtags: [],
    },
    score,
    product: "macgleam",
    niche: "mac tips",
    ...extra,
  };
}

function digestOf(overrides: Partial<Digest> = {}): Digest {
  return {
    generatedAt: NOW,
    windowHours: 72,
    postsConsidered: 48,
    creatorsSeen: 12,
    candidates: [row()],
    heldBack: [],
    unscored: [],
    ...overrides,
  };
}

test("the headline says how much was looked at, not only what came out", () => {
  const rendered = renderDigest(digestOf());
  assert.match(rendered, /1 worth a look, from 48 videos by 12 creators in the last 72 hours\./);
});

test("a candidate leads with how far above normal it is, its band, its age and who posted it", () => {
  assert.match(renderDigest(digestOf()), /1\. 8\.4x {2}strong {2}6h old {2}@somecreator/);
});

test("the link is on its own line so it can be clicked without selecting anything", () => {
  assert.match(
    renderDigest(digestOf()),
    /\n {3}https:\/\/www\.tiktok\.com\/@somecreator\/video\/hot\n/,
  );
});

test("a climbing video says so, with its rate", () => {
  assert.match(renderDigest(digestOf()), /still picking up, 2\.10 baselines an hour/);
});

test("a video losing pace says that instead", () => {
  const rendered = renderDigest(digestOf({ candidates: [row({ acceleration: -0.3 })] }));
  assert.match(rendered, /losing pace/);
});

test("a video whose counts are too rounded to read says so rather than claiming a rate", () => {
  const rendered = renderDigest(
    digestOf({ candidates: [row({ velocityMeasurable: false, normVelocity: 0 })] }),
  );
  assert.match(rendered, /rate unreadable, the counts are reported too roundly/);
  assert.doesNotMatch(rendered, /0\.00 baselines an hour/);
});

test("corroboration from other creators is called out, since it is the strongest signal", () => {
  assert.match(renderDigest(digestOf()), /3 other creators on this shape/);
});

test("a lone video does not claim corroboration", () => {
  assert.doesNotMatch(
    renderDigest(digestOf({ candidates: [row({ spread: 0 })] })),
    /on this shape/,
  );
});

test("a crowded sound is flagged, because being late is the main way this wastes time", () => {
  assert.match(
    renderDigest(digestOf({ candidates: [row({ saturation: 0.9 })] })),
    /already crowded/,
  );
});

test("weak engagement is flagged even on a big outlier", () => {
  const rendered = renderDigest(digestOf({ candidates: [row({ qualityRatio: 0.4 })] }));
  assert.match(rendered, /engagement below this creator's normal/);
});

test("the product a candidate was found for is named", () => {
  assert.match(renderDigest(digestOf()), /macgleam \/ mac tips/);
});

test("a candidate from outside the panel says so rather than showing an empty slot", () => {
  const { product: _product, niche: _niche, ...orphan } = row();
  assert.match(renderDigest(digestOf({ candidates: [orphan] })), /not attributed to a product/);
});

test("a quiet day says nothing cleared the bar rather than printing an empty list", () => {
  assert.match(renderDigest(digestOf({ candidates: [] })), /nothing cleared the bar today/);
});

test("what was held back is always counted, so a short digest is never mistaken for a quiet day", () => {
  const held = row();
  held.score = { ...held.score, confidence: "low", suppressedReason: "seen once" };
  const rendered = renderDigest(digestOf({ candidates: [], heldBack: [held, held] }));
  assert.match(rendered, /Held back: 2 \(2 seen once\)/);
});

test("a day with nothing held back still prints the count", () => {
  assert.match(renderDigest(digestOf()), /Held back: 0/);
  assert.match(renderDigest(digestOf()), /Not scored at all: 0/);
});

test("the commonest reason nothing could be scored is surfaced", () => {
  const rendered = renderDigest(
    digestOf({
      unscored: [
        { postId: "a", reason: "the creator has 3 settled posts" },
        { postId: "b", reason: "the creator has 3 settled posts" },
        { postId: "c", reason: "something else" },
      ],
    }),
  );
  assert.match(rendered, /Not scored at all: 3 \(mostly: the creator has 3 settled posts\)/);
});

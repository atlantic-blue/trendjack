import test from "node:test";
import assert from "node:assert/strict";
import { computeFeatures } from "./features.ts";
import { computeBaseline } from "./baseline.ts";
import { HOUR_MS, SATURATION_CREATORS } from "./constants.ts";
import { NOW, makeObservation, makePost, makeSettled } from "./fixtures.ts";
import type { Baseline, CreatorId, Observation } from "../contracts/types.ts";

const settled = makeSettled(20, () => 1_000);

function baselineOf(value = 1_000): Baseline {
  const outcome = computeBaseline({
    creatorId: "alice" as CreatorId,
    metric: "views",
    settled: makeSettled(20, () => value),
    now: NOW,
  });
  assert.ok(outcome.ok);
  return outcome.baseline;
}

function featuresFor(
  observations: Observation[],
  overrides: Partial<Parameters<typeof computeFeatures>[0]> = {},
) {
  return computeFeatures({
    post: makePost(),
    observations,
    baseline: baselineOf(),
    settled,
    spread: 0,
    panelCreatorsUsingSound: 0,
    now: NOW,
    ...overrides,
  });
}

test("the outlier is the latest reading against the creator's normal", () => {
  const features = featuresFor([makeObservation({ views: 5_000 })]);
  assert.equal(features.outlier, 5);
});

test("a video nobody watched scores nought rather than dividing by something", () => {
  const features = featuresFor([makeObservation({ views: 0, likes: 0 })]);
  assert.equal(features.outlier, 0);
  assert.ok(Number.isFinite(features.outlier));
});

test("velocity is baselines gained per hour between the last two readings", () => {
  const features = featuresFor([
    makeObservation({ observedAt: NOW - 2 * HOUR_MS, views: 1_000 }),
    makeObservation({ observedAt: NOW, views: 3_000 }),
  ]);
  assert.equal(features.normVelocity, 1);
});

test("a post seen only once has no velocity, and that is reported rather than guessed", () => {
  assert.equal(featuresFor([makeObservation()]).normVelocity, 0);
});

test("two readings at the same instant do not produce an infinite velocity", () => {
  const features = featuresFor([
    makeObservation({ observedAt: NOW, views: 1_000 }),
    makeObservation({ observedAt: NOW, views: 9_000 }),
  ]);
  assert.equal(features.normVelocity, 0);
});

test("readings arriving out of order are put back in time order first", () => {
  const inOrder = featuresFor([
    makeObservation({ observedAt: NOW - 2 * HOUR_MS, views: 1_000 }),
    makeObservation({ observedAt: NOW, views: 3_000 }),
  ]);
  const shuffled = featuresFor([
    makeObservation({ observedAt: NOW, views: 3_000 }),
    makeObservation({ observedAt: NOW - 2 * HOUR_MS, views: 1_000 }),
  ]);
  assert.deepEqual(shuffled, inOrder);
});

test("a video still picking up pace has positive acceleration", () => {
  const features = featuresFor([
    makeObservation({ observedAt: NOW - 4 * HOUR_MS, views: 1_000 }),
    makeObservation({ observedAt: NOW - 2 * HOUR_MS, views: 2_000 }),
    makeObservation({ observedAt: NOW, views: 6_000 }),
  ]);
  assert.ok(features.acceleration > 0);
});

test("a video flattening out has negative acceleration, which the score can punish", () => {
  const features = featuresFor([
    makeObservation({ observedAt: NOW - 4 * HOUR_MS, views: 1_000 }),
    makeObservation({ observedAt: NOW - 2 * HOUR_MS, views: 9_000 }),
    makeObservation({ observedAt: NOW, views: 9_100 }),
  ]);
  assert.ok(features.acceleration < 0);
});

test("acceleration needs three readings, so two give nought", () => {
  const features = featuresFor([
    makeObservation({ observedAt: NOW - 2 * HOUR_MS, views: 1_000 }),
    makeObservation({ observedAt: NOW, views: 3_000 }),
  ]);
  assert.equal(features.acceleration, 0);
});

test("a video loved more than the creator's normal scores above one on quality", () => {
  const features = featuresFor([makeObservation({ views: 10_000, likes: 2_000 })]);
  assert.ok(features.qualityRatio > 1);
});

test("a video pushed to an audience that did not care scores below one on quality", () => {
  const features = featuresFor([
    makeObservation({ views: 10_000, likes: 20, comments: 0, shares: 0 }),
  ]);
  assert.ok(features.qualityRatio < 1);
});

test("saturation climbs with how many watched creators are already on the sound", () => {
  assert.equal(featuresFor([makeObservation()], { panelCreatorsUsingSound: 4 }).saturation, 0.5);
});

test("saturation is capped at one however crowded it gets", () => {
  const crowded = featuresFor([makeObservation()], {
    panelCreatorsUsingSound: SATURATION_CREATORS * 10,
  });
  assert.equal(crowded.saturation, 1);
});

test("age is measured in hours since posting", () => {
  const features = featuresFor([makeObservation()], {
    post: makePost({ postedAt: NOW - 30 * HOUR_MS }),
  });
  assert.equal(features.ageHours, 30);
});

test("a post whose clock is ahead of ours is nought hours old, never negative", () => {
  const features = featuresFor([makeObservation()], {
    post: makePost({ postedAt: NOW + 5 * HOUR_MS }),
  });
  assert.equal(features.ageHours, 0);
});

test("a big video reported at the same rounded number twice is not called flat", () => {
  const features = featuresFor(
    [
      makeObservation({ observedAt: NOW - 8 * HOUR_MS, views: 1_100_000 }),
      makeObservation({ observedAt: NOW, views: 1_100_000 }),
    ],
    { baseline: baselineOf(100_000) },
  );
  assert.equal(features.velocityMeasurable, false);
  assert.equal(features.normVelocity, 0);
});

test("a big video whose rounded number moved does have a rate", () => {
  const features = featuresFor(
    [
      makeObservation({ observedAt: NOW - 8 * HOUR_MS, views: 1_100_000 }),
      makeObservation({ observedAt: NOW, views: 1_900_000 }),
    ],
    { baseline: baselineOf(100_000) },
  );
  assert.equal(features.velocityMeasurable, true);
  assert.equal(features.normVelocity, 1);
});

test("the rate is measured back to the last reading that actually moved, not the last reading", () => {
  const features = featuresFor(
    [
      makeObservation({ observedAt: NOW - 8 * HOUR_MS, views: 1_100_000 }),
      makeObservation({ observedAt: NOW - 4 * HOUR_MS, views: 1_900_000 }),
      makeObservation({ observedAt: NOW, views: 1_900_000 }),
    ],
    { baseline: baselineOf(100_000) },
  );
  assert.equal(features.velocityMeasurable, true);
  assert.equal(features.normVelocity, 1);
});

test("a small video is compared exactly, so a hundred extra views is a real rate", () => {
  const features = featuresFor([
    makeObservation({ observedAt: NOW - 2 * HOUR_MS, views: 1_000 }),
    makeObservation({ observedAt: NOW, views: 1_100 }),
  ]);
  assert.equal(features.velocityMeasurable, true);
  assert.ok(features.normVelocity > 0);
});

test("a post seen only once has no rate to read", () => {
  assert.equal(featuresFor([makeObservation()]).velocityMeasurable, false);
});

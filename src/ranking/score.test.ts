import test from "node:test";
import assert from "node:assert/strict";
import { bandFor, combine, rank, scorePost, type ScoreOutcome } from "./score.ts";
import { ACTION_WINDOW_HOURS, HOUR_MS, MIN_SETTLED_POSTS } from "./constants.ts";
import { NOW, makeObservation, makePost, makeSettled } from "./fixtures.ts";
import type { Features, PostId } from "../contracts/types.ts";

const settled = makeSettled(20);

const neutral: Features = {
  outlier: 1,
  normVelocity: 0,
  velocityMeasurable: true,
  acceleration: 0,
  qualityRatio: 1,
  spread: 0,
  saturation: 0,
  ageHours: 0,
};

function climbing(views: number[], startingHoursAgo = 4) {
  return views.map((count, index) =>
    makeObservation({ observedAt: NOW - (startingHoursAgo - index * 2) * HOUR_MS, views: count }),
  );
}

function score(observations = climbing([1_000, 4_000, 9_000]), context = {}) {
  return scorePost({
    post: makePost(),
    observations,
    settled,
    context: { spread: 0, panelCreatorsUsingSound: 0, now: NOW, ...context },
  });
}

test("nothing at all against the creator's normal is not a band", () => {
  assert.equal(bandFor(1), "none");
  assert.equal(bandFor(2.9), "none");
});

test("the bands land on their thresholds", () => {
  assert.equal(bandFor(3), "outlier");
  assert.equal(bandFor(5), "strong");
  assert.equal(bandFor(10), "breakout");
  assert.equal(bandFor(20), "monster");
  assert.equal(bandFor(45), "monster");
});

test("a video at its creator's normal scores nothing", () => {
  assert.equal(combine(neutral), 0);
});

test("level is in log space, so doubling the outlier adds a fixed amount rather than doubling", () => {
  const at4 = combine({ ...neutral, outlier: 4 });
  const at8 = combine({ ...neutral, outlier: 8 });
  const at16 = combine({ ...neutral, outlier: 16 });
  assert.ok(Math.abs(at8 - at4 - (at16 - at8)) < 1e-9);
});

test("age pulls the score down as the window runs out", () => {
  const fresh = combine({ ...neutral, outlier: 5, ageHours: 0 });
  const late = combine({ ...neutral, outlier: 5, ageHours: ACTION_WINDOW_HOURS });
  assert.ok(late < fresh);
});

test("a crowded sound pulls the score down, because we are late to it", () => {
  assert.ok(
    combine({ ...neutral, outlier: 5, saturation: 1 }) < combine({ ...neutral, outlier: 5 }),
  );
});

test("the same shape breaking out for other creators pushes the score up", () => {
  assert.ok(combine({ ...neutral, outlier: 5, spread: 4 }) > combine({ ...neutral, outlier: 5 }));
});

test("a big outlier nobody engaged with loses to a smaller one people loved", () => {
  const pushed = combine({ ...neutral, outlier: 8, qualityRatio: 0.1 });
  const loved = combine({ ...neutral, outlier: 5, qualityRatio: 2.5 });
  assert.ok(loved > pushed);
});

test("a flattening video loses to one still climbing at the same level", () => {
  const flattening = combine({ ...neutral, outlier: 6, normVelocity: 0.2, acceleration: -0.5 });
  const climbingHard = combine({ ...neutral, outlier: 6, normVelocity: 0.2, acceleration: 0.5 });
  assert.ok(climbingHard > flattening);
});

test("a post from a creator with no baseline is not scored, and says why", () => {
  const outcome = scorePost({
    post: makePost(),
    observations: [makeObservation()],
    settled: makeSettled(MIN_SETTLED_POSTS - 1),
    context: { spread: 0, panelCreatorsUsingSound: 0, now: NOW },
  });
  assert.equal(outcome.scored, false);
  assert.ok(!outcome.scored && /fewer than the 8 a baseline needs/.test(outcome.reason));
});

test("a scored post carries the features that produced it", () => {
  const outcome = score();
  assert.ok(outcome.scored);
  assert.ok(outcome.score.features.outlier > 0);
  assert.equal(outcome.score.computedAt, NOW);
});

test("a post seen once is low confidence, because it has no velocity yet", () => {
  const outcome = score([makeObservation()]);
  assert.ok(outcome.scored);
  assert.equal(outcome.score.confidence, "low");
  assert.match(outcome.score.suppressedReason ?? "", /no rate could be read/);
});

test("a creator whose posts are all identical is low confidence however big the outlier", () => {
  const outcome = scorePost({
    post: makePost(),
    observations: climbing([1_000, 4_000, 90_000]),
    settled: makeSettled(20, () => 1_000),
    context: { spread: 0, panelCreatorsUsingSound: 0, now: NOW },
  });
  assert.ok(outcome.scored);
  assert.equal(outcome.score.confidence, "low");
});

test("a thin but usable history is medium confidence, so it is reported and not ranked", () => {
  const outcome = scorePost({
    post: makePost(),
    observations: climbing([1_000, 4_000, 9_000]),
    settled: makeSettled(MIN_SETTLED_POSTS + 1),
    context: { spread: 0, panelCreatorsUsingSound: 0, now: NOW },
  });
  assert.ok(outcome.scored);
  assert.equal(outcome.score.confidence, "medium");
});

test("a full history and several readings is high confidence and carries no held back reason", () => {
  const outcome = score();
  assert.ok(outcome.scored);
  assert.equal(outcome.score.confidence, "high");
  assert.equal(outcome.score.suppressedReason, undefined);
});

test("only high confidence is ranked, and the rest are kept rather than dropped", () => {
  const outcomes: ScoreOutcome[] = [score(), score([makeObservation()])];
  const { ranked, suppressed } = rank(outcomes);
  assert.equal(ranked.length, 1);
  assert.equal(suppressed.length, 1);
});

test("ranking puts the highest score first", () => {
  const strong = score(climbing([1_000, 8_000, 40_000]));
  const weak = score(climbing([1_000, 1_100, 1_200]));
  assert.ok(strong.scored && weak.scored);
  const { ranked } = rank([weak, strong]);
  assert.equal(ranked[0]?.trendScore, strong.score.trendScore);
});

test("a post that could not be scored is in neither list, so nothing is invented for it", () => {
  const unscored: ScoreOutcome = { scored: false, postId: "p9" as PostId, reason: "no baseline" };
  const { ranked, suppressed } = rank([unscored]);
  assert.deepEqual(ranked, []);
  assert.deepEqual(suppressed, []);
});

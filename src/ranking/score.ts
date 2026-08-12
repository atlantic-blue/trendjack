import type { Band, Confidence, Features, Observation, Post, Score } from "../contracts/types.ts";
import {
  ACTION_WINDOW_HOURS,
  BAND_THRESHOLDS,
  CONFIDENT_SETTLED_POSTS,
  STALE_BASELINE_MS,
  WEIGHTS,
} from "./constants.ts";
import { chooseMetric, computeBaseline, type SettledPost } from "./baseline.ts";
import { computeFeatures } from "./features.ts";

export interface ScoreInput {
  post: Post;
  observations: Observation[];
  settled: SettledPost[];
  context: { spread: number; panelCreatorsUsingSound: number; now: number };
}

export type ScoreOutcome =
  { scored: true; score: Score } | { scored: false; postId: string; reason: string };

export function bandFor(outlier: number): Band {
  return BAND_THRESHOLDS.find((threshold) => outlier >= threshold.atLeast)?.band ?? "none";
}

/**
 * The composite. Level is in log space so a forty times video cannot swamp every other term,
 * and so the distance from three to six is the same as six to twelve, which is how the
 * underlying process behaves.
 */
export function combine(features: Features): number {
  return (
    WEIGHTS.level * Math.log2(Math.max(features.outlier, Number.EPSILON)) +
    WEIGHTS.velocity * features.normVelocity +
    WEIGHTS.acceleration * features.acceleration +
    WEIGHTS.spread * Math.log2(1 + features.spread) +
    WEIGHTS.quality * Math.log2(Math.max(features.qualityRatio, Number.EPSILON)) -
    WEIGHTS.age * (features.ageHours / ACTION_WINDOW_HOURS) -
    WEIGHTS.saturation * features.saturation
  );
}

export function scorePost(input: ScoreInput): ScoreOutcome {
  const { post, settled, context } = input;
  const metric = chooseMetric(settled);
  const outcome = computeBaseline({
    creatorId: post.creatorId,
    metric,
    settled,
    now: context.now,
  });
  if (!outcome.ok) return { scored: false, postId: post.postId, reason: outcome.reason };

  const features = computeFeatures({
    post,
    observations: input.observations,
    baseline: outcome.baseline,
    settled,
    spread: context.spread,
    panelCreatorsUsingSound: context.panelCreatorsUsingSound,
    now: context.now,
  });

  const readings = input.observations.filter((each) => each[metric] !== undefined).length;
  const confidence = confidenceFor({
    settledPostCount: outcome.baseline.settledPostCount,
    readings,
    velocityMeasurable: features.velocityMeasurable,
    flatBaseline: outcome.flat,
    baselineAgeMs: context.now - outcome.baseline.newestSettledPostAt,
  });

  const score: Score = {
    postId: post.postId,
    computedAt: context.now,
    metric,
    features,
    trendScore: combine(features),
    band: bandFor(features.outlier),
    confidence,
    ...(confidence === "high" ? {} : { suppressedReason: whyNotHigh(confidence) }),
  };
  return { scored: true, score };
}

function confidenceFor(input: {
  settledPostCount: number;
  readings: number;
  velocityMeasurable: boolean;
  flatBaseline: boolean;
  baselineAgeMs: number;
}): Confidence {
  if (input.readings < 2) return "low";
  if (!input.velocityMeasurable) return "low";
  if (input.flatBaseline) return "low";
  if (input.settledPostCount < CONFIDENT_SETTLED_POSTS) return "medium";
  if (input.baselineAgeMs > STALE_BASELINE_MS) return "medium";
  return "high";
}

function whyNotHigh(confidence: Confidence): string {
  return confidence === "low"
    ? "no rate could be read: seen once, reported too roundly to see movement, or the creator's posts are too uniform"
    : "the baseline is thin or the creator has not posted recently";
}

/**
 * Anything below high confidence is kept and reported, never ranked. A digest of three
 * candidates on a day when forty were held back is a different thing from a quiet day, and the
 * two must never look the same.
 */
export function rank(outcomes: ScoreOutcome[]): { ranked: Score[]; suppressed: Score[] } {
  const scores = outcomes.filter((each) => each.scored).map((each) => each.score);
  return {
    ranked: scores
      .filter((score) => score.confidence === "high")
      .sort((left, right) => right.trendScore - left.trendScore),
    suppressed: scores.filter((score) => score.confidence !== "high"),
  };
}

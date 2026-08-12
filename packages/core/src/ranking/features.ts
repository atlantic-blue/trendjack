import type { Baseline, Features, LevelMetric, Observation, Post } from "../contracts/types.ts";
import { HOUR_MS, SATURATION_CREATORS } from "./constants.ts";
import { isDistinguishable } from "./quantisation.ts";
import { median } from "./baseline.ts";
import type { SettledPost } from "./baseline.ts";

export interface FeatureInput {
  post: Post;
  observations: Observation[];
  baseline: Baseline;
  settled: SettledPost[];
  spread: number;
  panelCreatorsUsingSound: number;
  now: number;
}

/**
 * Turns a post's history into the seven numbers the composite is built from. Every one of them
 * is denominated in that creator's own baseline, so a five thousand follower account and a
 * five million follower account can be compared without one drowning the other.
 */
export function computeFeatures(input: FeatureInput): Features {
  const ordered = [...input.observations].sort((left, right) => left.observedAt - right.observedAt);
  const metric = input.baseline.metric;
  const latest = lastWithMetric(ordered, metric);

  const velocity = normalisedVelocity(ordered, metric, input.baseline.value, 0);

  return {
    outlier: latest === undefined ? 0 : latest / input.baseline.value,
    normVelocity: velocity.perHour,
    velocityMeasurable: velocity.measurable,
    acceleration: acceleration(ordered, metric, input.baseline.value),
    qualityRatio: qualityRatio(ordered, input.settled),
    spread: input.spread,
    saturation: Math.min(1, input.panelCreatorsUsingSound / SATURATION_CREATORS),
    ageHours: Math.max(0, (input.now - input.post.postedAt) / HOUR_MS),
  };
}

function lastWithMetric(ordered: Observation[], metric: LevelMetric): number | undefined {
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const value = ordered[index]?.[metric];
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Baselines gained per hour, measured back to the most recent earlier reading that differs by
 * more than the platform's rounding could explain.
 *
 * Taking simply the last two readings looks right and is wrong for any video large enough to
 * be reported rounded: both polls come back as 1,100,000 while the video gains eighty thousand
 * views, and a video climbing hard is recorded as flat. Walking back until the difference is
 * real measures the rate over a longer span instead of inventing a zero.
 *
 * When no earlier reading is far enough away, the rate is unknown rather than nought, and the
 * caller is told so, because those two mean opposite things.
 */
function normalisedVelocity(
  ordered: Observation[],
  metric: LevelMetric,
  baseline: number,
  skipFromEnd: number,
): { perHour: number; measurable: boolean } {
  const readings = ordered.filter((each) => each[metric] !== undefined);
  const end = readings.length - 1 - skipFromEnd;
  const later = end >= 1 ? readings[end] : undefined;
  if (!later) return { perHour: 0, measurable: false };

  const laterValue = later[metric] ?? 0;
  for (let index = end - 1; index >= 0; index -= 1) {
    const earlier = readings[index];
    if (!earlier) continue;
    const earlierValue = earlier[metric] ?? 0;
    const hours = (later.observedAt - earlier.observedAt) / HOUR_MS;
    if (hours <= 0) continue;
    if (!isDistinguishable(earlierValue, laterValue)) continue;
    return { perHour: (laterValue - earlierValue) / hours / baseline, measurable: true };
  }
  return { perHour: 0, measurable: false };
}

/**
 * Whether it is still climbing or flattening. Allowed to be negative, because a video losing
 * pace should be punished rather than merely not rewarded.
 */
function acceleration(ordered: Observation[], metric: LevelMetric, baseline: number): number {
  const readings = ordered.filter((each) => each[metric] !== undefined);
  if (readings.length < 3) return 0;
  const now = normalisedVelocity(ordered, metric, baseline, 0);
  const before = normalisedVelocity(ordered, metric, baseline, 1);
  if (!now.measurable || !before.measurable) return 0;
  return now.perHour - before.perHour;
}

/**
 * Engagement against the creator's own normal engagement. A huge outlier with below normal
 * engagement is usually distribution rather than format: the algorithm handed it an audience
 * that did not care, and cloning that teaches us nothing.
 */
function qualityRatio(ordered: Observation[], settled: SettledPost[]): number {
  const latest = ordered.at(-1);
  const mine = latest ? engagementOf(latest) : undefined;
  const theirs = median(
    settled
      .map((each) => engagementOf(each.latest))
      .filter((each): each is number => each !== undefined),
  );
  if (mine === undefined || !Number.isFinite(theirs) || theirs <= 0) return 1;
  return Math.max(mine / theirs, Number.EPSILON);
}

function engagementOf(observation: Observation): number | undefined {
  const views = observation.views;
  if (views === undefined || views === 0) return undefined;
  const reactions =
    (observation.likes ?? 0) + (observation.comments ?? 0) + (observation.shares ?? 0);
  return reactions / views;
}

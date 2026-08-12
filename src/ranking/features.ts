import type { Baseline, Features, LevelMetric, Observation, Post } from "../contracts/types.ts";
import { HOUR_MS, SATURATION_CREATORS } from "./constants.ts";
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

  return {
    outlier: latest === undefined ? 0 : latest / input.baseline.value,
    normVelocity: normalisedVelocity(ordered, metric, input.baseline.value, 0),
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
 * Baselines gained per hour, between the two most recent readings. Velocity needs two
 * observations, so a post seen only once has none. That is reported as nought rather than
 * guessed at, and the confidence tier is what stops a single sighting being ranked.
 */
function normalisedVelocity(
  ordered: Observation[],
  metric: LevelMetric,
  baseline: number,
  skipFromEnd: number,
): number {
  const readings = ordered.filter((each) => each[metric] !== undefined);
  const end = readings.length - 1 - skipFromEnd;
  if (end < 1) return 0;
  const later = readings[end];
  const earlier = readings[end - 1];
  if (!later || !earlier) return 0;
  const hours = (later.observedAt - earlier.observedAt) / HOUR_MS;
  if (hours <= 0) return 0;
  return ((later[metric] ?? 0) - (earlier[metric] ?? 0)) / hours / baseline;
}

/**
 * Whether it is still climbing or flattening. Allowed to be negative, because a video losing
 * pace should be punished rather than merely not rewarded.
 */
function acceleration(ordered: Observation[], metric: LevelMetric, baseline: number): number {
  const readings = ordered.filter((each) => each[metric] !== undefined);
  if (readings.length < 3) return 0;
  return (
    normalisedVelocity(ordered, metric, baseline, 0) -
    normalisedVelocity(ordered, metric, baseline, 1)
  );
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

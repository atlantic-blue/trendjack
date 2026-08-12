/**
 * The numbers behind the heuristic, in one place so a change to any of them is visible in a
 * diff and can be argued with.
 *
 * The seven weights at the bottom are guesses made on 2026-08-12 with no data behind them.
 * They are written down as guesses rather than dressed up. What turns them into something
 * better is replaying them over the stored history, which is what the append only observation
 * store exists for.
 */

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * A short form video is done growing after about a week, so anything younger than this is too
 * immature to belong in a creator's baseline. Include a three hour old post in the median and
 * the median measures immaturity rather than that creator's normal, which makes every genuine
 * breakout score lower than it should.
 */
export const SETTLED_AFTER_MS = 7 * DAY_MS;

/** How many settled posts the median is taken over. */
export const BASELINE_POSTS = 20;

/** Below this a creator has no usable baseline and is not scored at all. */
export const MIN_SETTLED_POSTS = 8;

/** Below this the baseline is usable but thin, so the score is not trusted enough to rank. */
export const CONFIDENT_SETTLED_POSTS = 15;

/** A creator who has not posted in this long has a baseline that no longer describes them. */
export const STALE_BASELINE_MS = 30 * DAY_MS;

/** The window in which a video is still worth acting on. */
export const ACTION_WINDOW_HOURS = 72;

/** Once this many watched creators are already on a sound, we are late to it. */
export const SATURATION_CREATORS = 8;

/** Bands are for reading, not for scoring. */
export const BAND_THRESHOLDS = [
  { band: "monster", atLeast: 20 },
  { band: "breakout", atLeast: 10 },
  { band: "strong", atLeast: 5 },
  { band: "outlier", atLeast: 3 },
] as const;

export const WEIGHTS = {
  level: 1.0,
  velocity: 0.8,
  acceleration: 0.6,
  spread: 0.5,
  quality: 0.4,
  age: 0.7,
  saturation: 0.6,
} as const;

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

/**
 * A video that gets this many likes has shown its format can reach a lot of people. This is an
 * absolute count, not a comparison with the creator's own normal, and it answers a different
 * question: the outlier score says a video grows now, this says a format works at scale.
 */
export const PROVEN_LIKES = 100_000;

/**
 * How far above its creator's normal a video must be before it is worth a look. Below this it
 * is an ordinary post for that creator, and calling it a candidate would make the page lie.
 */
export const CANDIDATE_OUTLIER = 3;

/**
 * How far back the proven list looks. A format that reached a lot of people is worth copying
 * whether it did so today or three weeks ago, so it is not bound by the window that exists to
 * catch a video while it is still climbing.
 */
export const PROVEN_WINDOW_HOURS = 30 * 24;

/** At most this many videos from one creator, so the list shows a range of formats. */
export const PROVEN_PER_CREATOR = 2;

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

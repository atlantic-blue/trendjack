import { z } from "zod";

/**
 * A tagged string, so a creator id cannot be passed where a post id belongs. The tag exists
 * only in the type system and costs nothing at runtime.
 */
type Tagged<T extends string> = string & { readonly __tag: T };

export type CreatorId = Tagged<"CreatorId">;
export type PostId = Tagged<"PostId">;
export type SoundId = Tagged<"SoundId">;

export const platformSchema = z.enum(["tiktok", "instagram"]);
export type Platform = z.infer<typeof platformSchema>;

/**
 * Instagram has been removing view counts from its own surfaces, so a baseline there may have
 * to be built on likes instead. Which metric a number came from travels with it, because a
 * baseline built on likes must never be compared with one built on views.
 */
export const levelMetricSchema = z.enum(["views", "likes"]);
export type LevelMetric = z.infer<typeof levelMetricSchema>;

const creatorIdSchema = z
  .string()
  .min(1)
  .transform<CreatorId>((value) => value as CreatorId);
const postIdSchema = z
  .string()
  .min(1)
  .transform<PostId>((value) => value as PostId);
const soundIdSchema = z
  .string()
  .min(1)
  .transform<SoundId>((value) => value as SoundId);

/** A whole number of things that cannot be negative: views, likes, a count of posts. */
const countSchema = z.number().int().nonnegative();

/** Epoch milliseconds. Stored as a number so ordering never depends on string formatting. */
const instantSchema = z.number().int().positive();

export const postSchema = z
  .object({
    postId: postIdSchema,
    platform: platformSchema,
    creatorId: creatorIdSchema,
    postedAt: instantSchema,
    url: z.string().url(),
    soundId: soundIdSchema.optional(),
    hashtags: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type Post = z.infer<typeof postSchema>;

/**
 * One reading of a post at one moment. Observations are appended and never rewritten, because
 * the history of how a post grew is the thing the heuristic learns from.
 *
 * A field that is absent is unknown, not zero. A deleted post produces no observation rather
 * than an observation full of zeroes, and the two must not be allowed to look alike.
 */
export const observationSchema = z
  .object({
    postId: postIdSchema,
    observedAt: instantSchema,
    views: countSchema.optional(),
    likes: countSchema.optional(),
    comments: countSchema.optional(),
    shares: countSchema.optional(),
  })
  .strict();
export type Observation = z.infer<typeof observationSchema>;

export const confidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const bandSchema = z.enum(["none", "outlier", "strong", "breakout", "monster"]);
export type Band = z.infer<typeof bandSchema>;

/**
 * A creator's own normal, computed from posts old enough to have stopped growing. Carrying the
 * inputs alongside the number is what makes a stored score replayable later.
 */
export const baselineSchema = z
  .object({
    creatorId: creatorIdSchema,
    metric: levelMetricSchema,
    value: z.number().positive(),
    settledPostCount: countSchema,
    newestSettledPostAt: instantSchema,
    computedAt: instantSchema,
  })
  .strict();
export type Baseline = z.infer<typeof baselineSchema>;

/**
 * The feature vector behind a score. Stored with every score so that a weight change can be
 * replayed over the whole history offline rather than argued about.
 */
export const featuresSchema = z
  .object({
    outlier: z.number().nonnegative(),
    normVelocity: z.number(),
    /**
     * False when every earlier reading sits inside the platform's rounding, so no rate can be
     * read. Distinct from a velocity of nought, which means the video genuinely stopped.
     */
    velocityMeasurable: z.boolean(),
    acceleration: z.number(),
    qualityRatio: z.number().positive(),
    spread: countSchema,
    saturation: z.number().min(0).max(1),
    ageHours: z.number().nonnegative(),
  })
  .strict();
export type Features = z.infer<typeof featuresSchema>;

export const scoreSchema = z
  .object({
    postId: postIdSchema,
    computedAt: instantSchema,
    metric: levelMetricSchema,
    features: featuresSchema,
    trendScore: z.number(),
    band: bandSchema,
    confidence: confidenceSchema,
    /** Why a post was held back, so a short digest is never mistaken for a quiet day. */
    suppressedReason: z.string().min(1).optional(),
  })
  .strict();
export type Score = z.infer<typeof scoreSchema>;

/**
 * One thing we watch. The collection of these is the panel, and the panel is deliberately not
 * committed to this repository.
 */
export const panelEntrySchema = z
  .object({
    product: z.string().min(1),
    niche: z.string().min(1),
    platform: platformSchema,
    kind: z.enum(["creator", "hashtag", "sound"]),
    handle: z.string().min(1),
  })
  .strict();
export type PanelEntry = z.infer<typeof panelEntrySchema>;

export const panelSchema = z.array(panelEntrySchema);
export type Panel = z.infer<typeof panelSchema>;

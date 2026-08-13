import type { Digest } from "./build.ts";

/**
 * The file the front end reads. It is a contract between two things that deploy separately, so
 * it carries a version. A front end that does not know the version it is given must say so
 * rather than draw a page from fields it guessed at.
 */
export const DIGEST_FORMAT_VERSION = 1;

export interface DigestJsonCandidate {
  /** Filled in after the digest is built, by asking the platform how the video looks. */
  thumbnail?: string;
  caption?: string;
  postId: string;
  url: string;
  creator: string;
  platform: string;
  postedAt: number;
  ageHours: number;
  outlier: number;
  band: string;
  trendScore: number;
  normVelocity: number;
  velocityMeasurable: boolean;
  acceleration: number;
  spread: number;
  saturation: number;
  qualityRatio: number;
}

export interface DigestJsonProven {
  thumbnail?: string;
  caption?: string;
  postId: string;
  url: string;
  creator: string;
  likes: number;
  postedAt: number;
  /** Every card says how old its video is, whichever list it is in. */
  ageHours: number;
}

/**
 * A hashtag and how fast it is growing. Absent until a round has recorded one, so a digest
 * written before any hashtag was read stays readable.
 */
export interface DigestJsonTag {
  hashtag: string;
  videoCount: number;
  viewCount: number;
  observedAt: number;
  /** Absent until the hashtag has been read twice. Nothing can be said from one reading. */
  addedVideos?: number;
  videosPerDay?: number;
  dailyRate?: number;
  overHours?: number;
}

export interface DigestJson {
  version: number;
  generatedAt: number;
  /** How far back the candidates were drawn from. */
  windowHours: number;
  /** How far back the proven list was drawn from. Far wider, and it is a different claim. */
  provenWindowHours: number;
  postsConsidered: number;
  creatorsSeen: number;
  candidates: DigestJsonCandidate[];
  proven: DigestJsonProven[];
  heldBack: { count: number; reasons: { reason: string; count: number }[] };
  unscored: { count: number; reasons: { reason: string; count: number }[] };
  tags?: DigestJsonTag[];
}

/**
 * Flattens the digest into the file.
 *
 * The counts of what was held back travel with it, because a page showing three videos on a day
 * when forty were held back is a different thing from a quiet day, and the two must not look
 * alike on a screen either.
 */
export function toDigestJson(digest: Digest): DigestJson {
  return {
    version: DIGEST_FORMAT_VERSION,
    generatedAt: digest.generatedAt,
    windowHours: digest.windowHours,
    provenWindowHours: digest.provenWindowHours,
    postsConsidered: digest.postsConsidered,
    creatorsSeen: digest.creatorsSeen,
    candidates: digest.candidates.map((row) => ({
      postId: row.post.postId,
      url: row.post.url,
      creator: row.post.creatorId,
      platform: row.post.platform,
      postedAt: row.post.postedAt,
      ageHours: round(row.score.features.ageHours),
      outlier: round(row.score.features.outlier),
      band: row.score.band,
      trendScore: round(row.score.trendScore),
      normVelocity: round(row.score.features.normVelocity),
      velocityMeasurable: row.score.features.velocityMeasurable,
      acceleration: round(row.score.features.acceleration),
      spread: row.score.features.spread,
      saturation: round(row.score.features.saturation),
      qualityRatio: round(row.score.features.qualityRatio),
    })),
    proven: digest.proven.map((row) => ({
      postId: row.post.postId,
      url: row.post.url,
      creator: row.post.creatorId,
      likes: row.likes,
      postedAt: row.post.postedAt,
      ageHours: round(Math.max(0, (digest.generatedAt - row.post.postedAt) / 3_600_000)),
    })),
    heldBack: {
      count: digest.heldBack.length,
      reasons: countReasons(digest.heldBack.map((row) => row.score.suppressedReason ?? "unknown")),
    },
    unscored: {
      count: digest.unscored.length,
      reasons: countReasons(digest.unscored.map((each) => each.reason)),
    },
    tags: digest.tags.map((growth) => ({
      hashtag: growth.hashtag,
      videoCount: growth.latest.videoCount,
      viewCount: growth.latest.viewCount,
      observedAt: growth.latest.observedAt,
      ...(growth.addedVideos === undefined ? {} : { addedVideos: growth.addedVideos }),
      ...(growth.videosPerDay === undefined
        ? {}
        : { videosPerDay: Math.round(growth.videosPerDay) }),
      ...(growth.dailyRate === undefined ? {} : { dailyRate: round(growth.dailyRate) }),
      ...(growth.hours === undefined ? {} : { overHours: round(growth.hours) }),
    })),
  };
}

function countReasons(reasons: string[]): { reason: string; count: number }[] {
  const counted = new Map<string, number>();
  for (const reason of reasons) counted.set(reason, (counted.get(reason) ?? 0) + 1);
  return [...counted]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

/** Two decimal places, because a screen does not need seventeen. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

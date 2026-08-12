/**
 * The shape of the file the poller writes. It is kept here rather than imported from the core
 * package because this app is built and shipped on its own, and the version check below is what
 * catches the two drifting apart.
 */
export const DIGEST_FORMAT_VERSION = 1;

export interface DigestCandidate {
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
  caption?: string;
  thumbnail?: string;
}

export interface DigestProven {
  postId: string;
  url: string;
  creator: string;
  likes: number;
  postedAt: number;
  ageHours: number;
  caption?: string;
  thumbnail?: string;
}

export interface DigestJson {
  version: number;
  generatedAt: number;
  windowHours: number;
  provenWindowHours: number;
  postsConsidered: number;
  creatorsSeen: number;
  candidates: DigestCandidate[];
  proven: DigestProven[];
  heldBack: { count: number; reasons: { reason: string; count: number }[] };
  unscored: { count: number; reasons: { reason: string; count: number }[] };
}

export interface Movement {
  text: string;
  direction: "rising" | "falling" | "unknown";
}

/**
 * The one line that decides whether a video is worth the click. A rate that could not be read
 * says so, because a video reported too roundly to measure is not the same as one that stopped.
 */
export function movementOf(candidate: DigestCandidate): Movement {
  if (!candidate.velocityMeasurable) {
    return { text: "rate unreadable", direction: "unknown" };
  }
  const rate = `${candidate.normVelocity.toFixed(2)}/hr`;
  if (candidate.acceleration > 0) return { text: `still picking up ${rate}`, direction: "rising" };
  if (candidate.acceleration < 0) return { text: `losing pace ${rate}`, direction: "falling" };
  return { text: `steady ${rate}`, direction: "rising" };
}

/** The qualifications, which change whether a video is worth copying rather than whether it won. */
export function notesFor(candidate: DigestCandidate): string[] {
  const notes: string[] = [];
  if (candidate.spread > 0) {
    notes.push(
      `${candidate.spread} other creator${candidate.spread === 1 ? "" : "s"} on this shape`,
    );
  }
  if (candidate.saturation >= 0.5) notes.push("sound already crowded");
  if (candidate.qualityRatio < 0.8) notes.push("engagement below their normal");
  return notes;
}

/**
 * The windows a reader can choose between. Kept in step with the poller by the version check:
 * each range is a file the run publishes, and a range with no file shows as unavailable rather
 * than as an empty day.
 */
export interface Range {
  key: string;
  label: string;
}

export const RANGES: Range[] = [
  { key: "24h", label: "24 hours" },
  { key: "72h", label: "3 days" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

export const DEFAULT_RANGE = "72h";

/** The range in the address, so a chosen view can be sent to somebody. */
export function rangeFromLocation(search: string): string {
  const asked = new URLSearchParams(search).get("range");
  return RANGES.some((range) => range.key === asked) ? (asked as string) : DEFAULT_RANGE;
}

export function fileFor(rangeKey: string): string {
  return `digest-${rangeKey}.json`;
}

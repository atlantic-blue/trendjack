import type { TagVideos } from "../contracts/types.ts";
import type { TagVideo } from "./videos.ts";

export interface SeenHashtag {
  hashtag: string;
  /** How many videos on that page mentioned it. */
  videos: number;
}

export interface TagCandidate {
  hashtag: string;
  /** How many watched topics it turned up under. Two is far stronger than one. */
  fromTopics: number;
  videos: number;
  topics: string[];
}

const HASHTAG = /#([\p{L}\p{N}_]+)/gu;

/**
 * The hashtags people wrote in their captions, with how many videos used each.
 *
 * This is the only free source of new topics. Search is closed to us and the trending pages refuse
 * us, but every page we already read carries thirty captions, and people label their own work.
 */
export function seenHashtagsIn(videos: TagVideo[]): SeenHashtag[] {
  const counts = new Map<string, number>();
  for (const video of videos) {
    for (const hashtag of new Set(hashtagsIn(video.caption))) {
      counts.set(hashtag, (counts.get(hashtag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([hashtag, videos]) => ({ hashtag, videos }))
    .sort((left, right) => right.videos - left.videos);
}

export function hashtagsIn(caption: string): string[] {
  return [...caption.matchAll(HASHTAG)].map((match) => (match[1] ?? "").toLowerCase());
}

/**
 * Topics worth watching that nobody is watching.
 *
 * A hashtag that turns up under several different topics we already follow is a stronger candidate
 * than one that is popular under a single topic, because the second is usually that topic's own
 * vocabulary said a different way.
 */
export function candidatesFrom(looks: TagVideos[], watched: string[]): TagCandidate[] {
  const known = new Set(watched.map((each) => each.replace(/^#/, "").toLowerCase()));
  const found = new Map<string, TagCandidate>();

  for (const look of looks) {
    for (const seen of look.seenHashtags ?? []) {
      if (known.has(seen.hashtag)) continue;
      const candidate = found.get(seen.hashtag) ?? {
        hashtag: seen.hashtag,
        fromTopics: 0,
        videos: 0,
        topics: [],
      };
      candidate.videos += seen.videos;
      if (!candidate.topics.includes(look.hashtag)) {
        candidate.topics.push(look.hashtag);
        candidate.fromTopics += 1;
      }
      found.set(seen.hashtag, candidate);
    }
  }

  return [...found.values()].sort(
    (left, right) => right.fromTopics - left.fromTopics || right.videos - left.videos,
  );
}

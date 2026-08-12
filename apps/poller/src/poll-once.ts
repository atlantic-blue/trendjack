import type { Store, TrendSource } from "@trendjack/core/contracts/ports.ts";
import type { Panel, Platform } from "@trendjack/core/contracts/types.ts";
import { buildDigest } from "@trendjack/core/digest/build.ts";
import { toDigestJson, type DigestJson } from "@trendjack/core/digest/json.ts";
import { enrichDigest, type LookUp } from "@trendjack/core/digest/enrich.ts";
import { RANGES } from "@trendjack/core/digest/ranges.ts";
import { pollPanel, type PollReport } from "@trendjack/core/poll/poll.ts";

/** Writes the files the page reads, then clears what changed from the cache. */
export interface DigestPublisher {
  publish(byRange: Map<string, DigestJson>): Promise<void>;
}

export interface PollOnceOptions {
  panel: Panel;
  sources: Map<Platform, TrendSource>;
  store: Store;
  publisher: DigestPublisher;
  now: number;
  postsPerCreator: number;
  limit: number;
  provenLikes?: number;
  pace?: () => Promise<void>;
  /** Asks the platform how each published video looks, for the poster and the caption. */
  look?: LookUp;
}

export interface PollOnceResult {
  poll: PollReport;
  byRange: Map<string, DigestJson>;
}

/**
 * One scheduled round: poll the panel, score the window, publish the file.
 *
 * The publish happens after the poll, never instead of it. If the poll fails completely it
 * throws, so yesterday's file stays in place. A file of nothing would look like a quiet day.
 */
export async function pollOnce(options: PollOnceOptions): Promise<PollOnceResult> {
  const poll = await pollPanel({
    panel: options.panel,
    sources: options.sources,
    store: options.store,
    postsPerCreator: options.postsPerCreator,
    ...(options.pace ? { pace: options.pace } : {}),
  });

  // One digest per range, each built for its own window. The window is not only a filter: how
  // many other creators are on a shape, and how crowded a sound is, are counted inside it.
  const byRange = new Map<string, DigestJson>();
  for (const range of RANGES) {
    const digest = await buildDigest({
      store: options.store,
      panel: options.panel,
      now: options.now,
      windowHours: range.hours,
      limit: options.limit,
      ...(options.provenLikes === undefined ? {} : { provenLikes: options.provenLikes }),
    });
    const built = toDigestJson(digest);
    byRange.set(range.key, options.look ? await enrichDigest(built, options.look) : built);
  }

  await options.publisher.publish(byRange);
  return { poll, byRange };
}

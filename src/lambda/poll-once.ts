import type { Store, TrendSource } from "../contracts/ports.ts";
import type { Panel, Platform } from "../contracts/types.ts";
import { buildDigest } from "../digest/build.ts";
import { toDigestJson, type DigestJson } from "../digest/json.ts";
import { pollPanel, type PollReport } from "../poll/poll.ts";

/** Writes the file the front end reads, then clears it from the cache. */
export interface DigestPublisher {
  publish(json: DigestJson): Promise<void>;
}

export interface PollOnceOptions {
  panel: Panel;
  sources: Map<Platform, TrendSource>;
  store: Store;
  publisher: DigestPublisher;
  now: number;
  postsPerCreator: number;
  windowHours: number;
  limit: number;
  provenLikes?: number;
  pace?: () => Promise<void>;
}

export interface PollOnceResult {
  poll: PollReport;
  json: DigestJson;
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

  const digest = await buildDigest({
    store: options.store,
    panel: options.panel,
    now: options.now,
    windowHours: options.windowHours,
    limit: options.limit,
    ...(options.provenLikes === undefined ? {} : { provenLikes: options.provenLikes }),
  });

  const json = toDigestJson(digest);
  await options.publisher.publish(json);
  return { poll, json };
}

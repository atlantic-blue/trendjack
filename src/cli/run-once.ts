import type { Store, TrendSource } from "../contracts/ports.ts";
import type { Panel, Platform } from "../contracts/types.ts";
import { buildDigest } from "../digest/build.ts";
import { renderDigest } from "../digest/render.ts";
import { pollPanel, type PollReport } from "../poll/poll.ts";

export interface RunOnceOptions {
  panel: Panel;
  sources: Map<Platform, TrendSource>;
  store: Store;
  now: number;
  postsPerCreator: number;
  windowHours: number;
  limit: number;
  pace?: () => Promise<void>;
}

/**
 * One poll followed by one digest.
 *
 * On a first ever run every candidate is held back, and that is correct rather than
 * disappointing: a rate needs two readings taken apart in time, and there has only been one.
 * The baselines are real from the first run, because a creator's settled posts come back in the
 * same call, so the history starts earning immediately.
 */
export async function runOnce(
  options: RunOnceOptions,
): Promise<{ poll: PollReport; text: string }> {
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
  });
  return { poll, text: [renderDigest(digest), "", pollLine(poll)].join("\n") };
}

function pollLine(poll: PollReport): string {
  const failures =
    poll.failures.length === 0
      ? ""
      : ` ${poll.failures.length} failed: ${poll.failures.map((each) => each.handle).join(", ")}.`;
  return `Polled ${poll.watched} creators, stored ${poll.observationsStored} readings.${failures}`;
}

import type { Store, TrendSource } from "../contracts/ports.ts";
import type { Panel, Platform } from "../contracts/types.ts";

export interface PollFailure {
  platform: Platform;
  handle: string;
  reason: string;
}

export interface PollReport {
  /** Creators actually asked about, after duplicates across products are collapsed. */
  watched: number;
  /** Entries we cannot poll yet, meaning hashtags and sounds. */
  skipped: number;
  postsSeen: number;
  observationsStored: number;
  failures: PollFailure[];
}

export class PollFailedError extends Error {
  readonly failures: PollFailure[];

  constructor(failures: PollFailure[]) {
    super(`Every creator in the round failed. First: ${failures[0]?.reason ?? "no reason given"}`);
    this.name = "PollFailedError";
    this.failures = failures;
  }
}

export interface PollOptions {
  panel: Panel;
  sources: Map<Platform, TrendSource>;
  store: Store;
  postsPerCreator: number;
  /** Waits between calls, so a round does not arrive as a burst. Tests pass a no-op. */
  pace?: () => Promise<void>;
}

/**
 * One round of the panel.
 *
 * A single creator failing does not abandon the round, because one deleted account should not
 * cost us a morning's history for everybody else. Every failure is carried back rather than
 * swallowed, and a round where nothing at all succeeded is raised, because a store that gained
 * nothing and a quiet day on the platform must never look alike.
 */
export async function pollPanel(options: PollOptions): Promise<PollReport> {
  const creators = uniqueCreators(options.panel);
  const skipped = options.panel.length - creators.length;
  const report: PollReport = {
    watched: creators.length,
    skipped,
    postsSeen: 0,
    observationsStored: 0,
    failures: [],
  };

  for (const [index, entry] of creators.entries()) {
    if (index > 0 && options.pace) await options.pace();
    const source = options.sources.get(entry.platform);
    if (!source) {
      report.failures.push({
        platform: entry.platform,
        handle: entry.handle,
        reason: `no source is configured for ${entry.platform}`,
      });
      continue;
    }
    try {
      const sightings = await source.recentPostsByCreator(entry.handle, options.postsPerCreator);
      for (const sighting of sightings) {
        await options.store.putPost(sighting.post);
        await options.store.appendObservation(sighting.observation);
        report.postsSeen += 1;
        report.observationsStored += 1;
      }
    } catch (cause) {
      report.failures.push({
        platform: entry.platform,
        handle: entry.handle,
        reason: (cause as Error).message,
      });
    }
  }

  if (report.watched > 0 && report.failures.length === report.watched) {
    throw new PollFailedError(report.failures);
  }
  return report;
}

/**
 * The same creator watched for two products is one creator to poll. Asking twice would spend
 * the request budget twice and write the identical observation twice for no gain.
 */
function uniqueCreators(panel: Panel): Panel {
  const seen = new Set<string>();
  return panel.filter((entry) => {
    if (entry.kind !== "creator") return false;
    const key = `${entry.platform}:${entry.handle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

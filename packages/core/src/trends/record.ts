import type { Store, TagStatsSource } from "../contracts/ports.ts";
import type { TagReading } from "../contracts/types.ts";
import { DAY_MS } from "../ranking/constants.ts";
import { growthFrom, type Growth } from "./growth.ts";

export interface TagFailure {
  hashtag: string;
  reason: string;
}

export interface RecordReport {
  asked: number;
  recorded: TagReading[];
  failures: TagFailure[];
  growth: Growth[];
}

/**
 * Raised when no hashtag reported its size. One tag failing is ordinary; every tag failing means
 * the platform is refusing us, and a run that recorded nothing must not look like a quiet day.
 */
export class EveryTagFailedError extends Error {
  readonly failures: TagFailure[];

  constructor(failures: TagFailure[]) {
    super(`No hashtag reported a size. First: ${failures[0]?.reason ?? "no reason given"}`);
    this.name = "EveryTagFailedError";
    this.failures = failures;
  }
}

export interface RecordOptions {
  hashtags: string[];
  source: TagStatsSource;
  store: Store;
  now: number;
  /** How far back to read when working out what changed. */
  compareWindowMs?: number;
  /** Waits between hashtags, so a round does not arrive as one burst. */
  pace?: () => Promise<void>;
}

const DEFAULT_COMPARE_WINDOW_MS = 7 * DAY_MS;

/**
 * One round: ask each hashtag how big it is, store the answer, then say what changed.
 *
 * The reading is stored before anything is worked out from it. A round that reads the sizes and
 * then fails while reporting must still leave the history richer than it found it, because the
 * reading cannot be taken again later.
 */
export async function recordTagReadings(options: RecordOptions): Promise<RecordReport> {
  const report: RecordReport = {
    asked: options.hashtags.length,
    recorded: [],
    failures: [],
    growth: [],
  };

  for (const [index, hashtag] of options.hashtags.entries()) {
    if (index > 0 && options.pace) await options.pace();
    try {
      const reading = await options.source.readingFor(hashtag);
      await options.store.appendTagReading(reading);
      report.recorded.push(reading);
    } catch (cause) {
      report.failures.push({ hashtag, reason: (cause as Error).message });
    }
  }

  if (report.asked > 0 && report.recorded.length === 0) {
    throw new EveryTagFailedError(report.failures);
  }

  const since = options.now - (options.compareWindowMs ?? DEFAULT_COMPARE_WINDOW_MS);
  for (const reading of report.recorded) {
    const history = await options.store.tagReadingsFor(reading.hashtag, since);
    const growth = growthFrom(reading.hashtag, history);
    if (growth) report.growth.push(growth);
  }
  return report;
}

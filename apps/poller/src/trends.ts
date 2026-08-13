import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BrowserTikTokTagSource } from "@trendjack/core/sources/tiktok-tag.ts";
import { DynamoStore } from "@trendjack/core/store/dynamo.ts";
import { bestVideosFor, tagVideosFrom } from "@trendjack/core/trends/best-videos.ts";
import { recordTagReadings } from "@trendjack/core/trends/record.ts";

/**
 * The scheduled trends run.
 *
 * Two jobs, on two schedules, because they cost very differently and neither fits in one window
 * with the other. Reading how big every hashtag is takes about half a minute each. Reading the
 * videos on a page takes a request per video on top of that.
 */
export type TrendsJob = "tags" | "videos";

export interface TrendsEvent {
  job?: TrendsJob;
  /** How many topics to read videos for, most recently grown first. */
  topics?: number;
}

/** How many videos of a page reach the digest. The rest are read and ranked, just not published. */
const PUBLISHED_VIDEOS = 5;
const TAG_PACE_MS = 3_000;
const VIDEO_PACE_MS = 1_200;
const DEFAULT_TOPICS = 6;

export class MissingSettingError extends Error {
  constructor(name: string) {
    super(`${name} is not set, so the run cannot start.`);
    this.name = "MissingSettingError";
  }
}

export async function handler(event: TrendsEvent = {}): Promise<Record<string, number>> {
  const table = required("TRENDJACK_TABLE");
  const executablePath = required("TRENDJACK_CHROME");
  const hashtags = tagsFrom(required("TRENDJACK_TAGS"));
  const region = process.env["AWS_REGION"] ?? "eu-west-1";

  const store = new DynamoStore({ client: new DynamoDBClient({ region }), tableName: table });
  const source = new BrowserTikTokTagSource({ executablePath });
  const now = Date.now();

  try {
    if (event.job === "videos") {
      return await readVideos(
        store,
        source,
        hashtags.slice(0, event.topics ?? DEFAULT_TOPICS),
        now,
      );
    }
    const report = await recordTagReadings({
      hashtags,
      source,
      store,
      now,
      pace: () => new Promise((resolve) => setTimeout(resolve, TAG_PACE_MS)),
    });
    return {
      asked: report.asked,
      recorded: report.recorded.length,
      failed: report.failures.length,
    };
  } finally {
    await source.close();
  }
}

/**
 * One page per topic. A topic whose page refuses does not stop the others, because a run that
 * gave up on the first refusal would leave every later topic with yesterday's videos and no way
 * to tell that apart from nothing having changed.
 */
async function readVideos(
  store: DynamoStore,
  source: BrowserTikTokTagSource,
  hashtags: string[],
  now: number,
): Promise<Record<string, number>> {
  let read = 0;
  let failed = 0;
  for (const hashtag of hashtags) {
    try {
      const report = await bestVideosFor({
        hashtag,
        source,
        now,
        pace: () => new Promise((resolve) => setTimeout(resolve, VIDEO_PACE_MS)),
      });
      if (report.ranked.length === 0) {
        failed += 1;
        continue;
      }
      await store.putTagVideos(tagVideosFrom(report, now, PUBLISHED_VIDEOS));
      read += 1;
    } catch {
      failed += 1;
    }
  }
  if (hashtags.length > 0 && read === 0) {
    throw new Error(`No hashtag page could be read. ${failed} refused.`);
  }
  return { asked: hashtags.length, read, failed };
}

export function tagsFrom(raw: string): string[] {
  const hashtags = raw
    .split(/[\s,]+/)
    .map((each) => each.replace(/^#/, "").trim().toLowerCase())
    .filter((each) => each.length > 0);
  if (hashtags.length === 0) throw new Error("TRENDJACK_TAGS names no hashtags.");
  return [...new Set(hashtags)];
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingSettingError(name);
  return value;
}

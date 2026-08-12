import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { panelSchema, type Panel, type Platform } from "@trendjack/core/contracts/types.ts";
import type { TrendSource } from "@trendjack/core/contracts/ports.ts";
import { YtDlpTikTokSource } from "@trendjack/core/sources/tiktok.ts";
import { ytDlpRunner } from "@trendjack/core/sources/ytdlp.ts";
import { DynamoStore } from "@trendjack/core/store/dynamo.ts";
import { normaliseEntry } from "@trendjack/core/panel/normalise.ts";
import { pollOnce } from "./poll-once.ts";
import { S3DigestPublisher } from "./s3-publisher.ts";

const POSTS_PER_CREATOR = 30;
const WINDOW_HOURS = 72;
const CANDIDATES = 20;
/** A gap between creators, so a round does not arrive as one burst of requests. */
const PACE_MS = 2_000;

export class MissingSettingError extends Error {
  constructor(name: string) {
    super(`${name} is not set, so the run cannot start.`);
    this.name = "MissingSettingError";
  }
}

/**
 * The scheduled run.
 *
 * Everything it needs comes from the environment, and a missing setting stops the run at the
 * start rather than half way through. A run that polled the panel and then could not publish
 * would spend the requests and show nothing for them.
 */
export async function handler(): Promise<{ watched: number; candidates: number }> {
  const bucket = required("TRENDJACK_BUCKET");
  const table = required("TRENDJACK_TABLE");
  const panel = parsePanel(required("TRENDJACK_PANEL_JSON"));
  const region = process.env["AWS_REGION"] ?? "eu-west-1";
  const distributionId = process.env["TRENDJACK_DISTRIBUTION_ID"];

  const sources = new Map<Platform, TrendSource>([
    ["tiktok", new YtDlpTikTokSource(ytDlpRunner())],
  ]);
  const now = Date.now();

  const { poll, json } = await pollOnce({
    panel,
    sources,
    store: new DynamoStore({ client: new DynamoDBClient({ region }), tableName: table }),
    publisher: new S3DigestPublisher({
      s3: new S3Client({ region }),
      cloudFront: new CloudFrontClient({ region: "us-east-1" }),
      bucket,
      ...(distributionId ? { distributionId } : {}),
      callerReference: `trendjack-${now}`,
    }),
    now,
    postsPerCreator: POSTS_PER_CREATOR,
    windowHours: WINDOW_HOURS,
    limit: CANDIDATES,
    pace: () => new Promise((resolve) => setTimeout(resolve, PACE_MS)),
  });

  return { watched: poll.watched, candidates: json.candidates.length };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingSettingError(name);
  return value;
}

export function parsePanel(raw: string): Panel {
  const parsed = panelSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`TRENDJACK_PANEL_JSON does not match the contract: ${parsed.error.message}`);
  }
  return parsed.data.map(normaliseEntry);
}

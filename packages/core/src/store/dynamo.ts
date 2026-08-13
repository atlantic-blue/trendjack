import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { Store } from "../contracts/ports.ts";
import type {
  Baseline,
  CreatorId,
  Observation,
  Post,
  PostId,
  Score,
  TagReading,
} from "../contracts/types.ts";
import { ObservationConflictError } from "./memory.ts";

/**
 * One table, four kinds of item, keyed so every read the pipeline makes is a query rather than
 * a scan.
 *
 *   observation   pk = post#<postId>        sk = obs#<observedAt>
 *   post          pk = post#<postId>        sk = post
 *                 gsi1pk = creator#<id>     gsi1sk = <postedAt>
 *                 gsi2pk = window           gsi2sk = <postedAt>
 *   baseline      pk = creator#<id>         sk = baseline#<metric>
 *   score         pk = post#<postId>        sk = score#<computedAt>
 *                 gsi2pk = scores           gsi2sk = <computedAt>
 *   tag reading   pk = tag#<hashtag>        sk = reading#<observedAt>
 *
 * The two collection indexes exist because the digest needs "every post in the window" and
 * "every score since", neither of which any natural key gives you.
 */
export const CREATOR_INDEX = "creator-index";
export const COLLECTION_INDEX = "collection-index";

const WINDOW_PARTITION = "window";
const SCORES_PARTITION = "scores";

export interface DynamoStoreOptions {
  client: DynamoDBClient;
  tableName: string;
}

export class DynamoStore implements Store {
  readonly #documents: DynamoDBDocumentClient;
  readonly #table: string;

  constructor(options: DynamoStoreOptions) {
    this.#documents = DynamoDBDocumentClient.from(options.client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.#table = options.tableName;
  }

  async appendTagReading(reading: TagReading): Promise<void> {
    await this.#documents.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          pk: `tag#${reading.hashtag}`,
          sk: `reading#${pad(reading.observedAt)}`,
          body: reading,
        },
      }),
    );
  }

  async tagReadingsFor(hashtag: string, since: number): Promise<TagReading[]> {
    const items = await this.#queryAll({
      TableName: this.#table,
      KeyConditionExpression: "pk = :pk AND sk >= :since",
      ExpressionAttributeValues: { ":pk": `tag#${hashtag}`, ":since": `reading#${pad(since)}` },
      ScanIndexForward: true,
    });
    return items.map((item) => item["body"] as TagReading);
  }

  async putPost(post: Post): Promise<void> {
    await this.#documents.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          pk: `post#${post.postId}`,
          sk: "post",
          gsi1pk: `creator#${post.creatorId}`,
          gsi1sk: post.postedAt,
          gsi2pk: WINDOW_PARTITION,
          gsi2sk: post.postedAt,
          body: post,
        },
      }),
    );
  }

  /**
   * Written with a condition so an existing reading cannot be replaced. A retried poll writing
   * the identical reading is allowed through, since that is a retry rather than a rewrite, but
   * a different reading of the same moment is a contradiction and is raised.
   */
  async appendObservation(observation: Observation): Promise<void> {
    try {
      await this.#documents.send(
        new PutCommand({
          TableName: this.#table,
          Item: {
            pk: `post#${observation.postId}`,
            sk: `obs#${pad(observation.observedAt)}`,
            body: observation,
          },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
    } catch (cause) {
      if (!(cause instanceof ConditionalCheckFailedException)) throw cause;
      const existing = (await this.observationsFor(observation.postId)).find(
        (each) => each.observedAt === observation.observedAt,
      );
      if (existing && sameReading(existing, observation)) return;
      throw new ObservationConflictError(observation.postId, observation.observedAt);
    }
  }

  async observationsFor(postId: PostId): Promise<Observation[]> {
    const items = await this.#queryAll({
      TableName: this.#table,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": `post#${postId}`, ":prefix": "obs#" },
      ScanIndexForward: true,
    });
    return items.map((item) => item["body"] as Observation);
  }

  async settledPostsFor(creatorId: CreatorId, before: number, limit: number): Promise<Post[]> {
    const items = await this.#queryAll({
      TableName: this.#table,
      IndexName: CREATOR_INDEX,
      KeyConditionExpression: "gsi1pk = :pk AND gsi1sk <= :before",
      ExpressionAttributeValues: { ":pk": `creator#${creatorId}`, ":before": before },
      ScanIndexForward: false,
      Limit: limit,
    });
    return items.slice(0, limit).map((item) => item["body"] as Post);
  }

  async postsSince(since: number): Promise<Post[]> {
    const items = await this.#queryAll({
      TableName: this.#table,
      IndexName: COLLECTION_INDEX,
      KeyConditionExpression: "gsi2pk = :pk AND gsi2sk >= :since",
      ExpressionAttributeValues: { ":pk": WINDOW_PARTITION, ":since": since },
      ScanIndexForward: false,
    });
    return items.map((item) => item["body"] as Post);
  }

  async putBaseline(baseline: Baseline): Promise<void> {
    await this.#documents.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          pk: `creator#${baseline.creatorId}`,
          sk: `baseline#${baseline.metric}`,
          body: baseline,
        },
      }),
    );
  }

  async putScore(score: Score): Promise<void> {
    await this.#documents.send(
      new PutCommand({
        TableName: this.#table,
        Item: {
          pk: `post#${score.postId}`,
          sk: `score#${pad(score.computedAt)}`,
          gsi2pk: SCORES_PARTITION,
          gsi2sk: score.computedAt,
          body: score,
        },
      }),
    );
  }

  async scoresSince(since: number): Promise<Score[]> {
    const items = await this.#queryAll({
      TableName: this.#table,
      IndexName: COLLECTION_INDEX,
      KeyConditionExpression: "gsi2pk = :pk AND gsi2sk >= :since",
      ExpressionAttributeValues: { ":pk": SCORES_PARTITION, ":since": since },
      ScanIndexForward: false,
    });
    return items.map((item) => item["body"] as Score);
  }

  /** Follows the pages. A partial answer read as a complete one is how history goes missing. */
  async #queryAll(input: QueryCommandInput): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.#documents.send(
        new QueryCommand(startKey ? { ...input, ExclusiveStartKey: startKey } : input),
      );
      all.push(...(page.Items ?? []));
      startKey = page.LastEvaluatedKey;
      if (input.Limit !== undefined && all.length >= input.Limit) break;
    } while (startKey);
    return all;
  }
}

/** Sort keys are strings, so a timestamp has to be padded or 9 sorts after 10. */
function pad(instant: number): string {
  return String(instant).padStart(16, "0");
}

function sameReading(left: Observation, right: Observation): boolean {
  return (
    left.views === right.views &&
    left.likes === right.likes &&
    left.comments === right.comments &&
    left.shares === right.shares
  );
}

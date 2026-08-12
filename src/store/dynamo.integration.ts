import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import test from "node:test";
import assert from "node:assert/strict";
import { describeStoreConformance } from "./conformance.ts";
import { COLLECTION_INDEX, CREATOR_INDEX, DynamoStore } from "./dynamo.ts";
import { ObservationConflictError } from "./memory.ts";
import type { PostId } from "../contracts/types.ts";

/**
 * Held to the same conformance suite as the in memory store, against a real DynamoDB.
 *
 * A fake whose behaviour is looser than the real thing manufactures green: the unit suite passes
 * and the deployed store then does something else. This is the test that stops that, so it
 * refuses to run rather than skipping when there is no endpoint. A skipped test and a passing
 * one look identical in a summary, and this is exactly the one that must not be waved through.
 */
const endpoint = process.env["TRENDJACK_DYNAMO_ENDPOINT"];
if (!endpoint) {
  throw new Error(
    "TRENDJACK_DYNAMO_ENDPOINT is not set. Start DynamoDB Local and point at it:\n" +
      "  docker run -d -p 8000:8000 amazon/dynamodb-local\n" +
      "  TRENDJACK_DYNAMO_ENDPOINT=http://localhost:8000 npm run test:integration",
  );
}

const client = new DynamoDBClient({
  endpoint,
  region: "eu-west-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

let tablesMade = 0;

async function freshStore(): Promise<DynamoStore> {
  tablesMade += 1;
  const tableName = `trendjack-test-${process.pid}-${tablesMade}`;
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
        { AttributeName: "gsi1pk", AttributeType: "S" },
        { AttributeName: "gsi1sk", AttributeType: "N" },
        { AttributeName: "gsi2pk", AttributeType: "S" },
        { AttributeName: "gsi2sk", AttributeType: "N" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: CREATOR_INDEX,
          KeySchema: [
            { AttributeName: "gsi1pk", KeyType: "HASH" },
            { AttributeName: "gsi1sk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: COLLECTION_INDEX,
          KeySchema: [
            { AttributeName: "gsi2pk", KeyType: "HASH" },
            { AttributeName: "gsi2sk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
  );
  return new DynamoStore({ client, tableName });
}

describeStoreConformance("the dynamodb store", freshStore);

test("a contradicting reading raises the same error the in memory store raises", async () => {
  const store = await freshStore();
  const postId = "p1" as PostId;
  await store.appendObservation({ postId, observedAt: 1_000, views: 10 });
  await assert.rejects(
    () => store.appendObservation({ postId, observedAt: 1_000, views: 99 }),
    (error: unknown) => error instanceof ObservationConflictError,
  );
});

test("timestamps sort by time and not by their spelling", async () => {
  const store = await freshStore();
  const postId = "p1" as PostId;
  await store.appendObservation({ postId, observedAt: 9_000, views: 90 });
  await store.appendObservation({ postId, observedAt: 10_000, views: 100 });
  const found = await store.observationsFor(postId);
  assert.deepEqual(
    found.map((each) => each.observedAt),
    [9_000, 10_000],
  );
});

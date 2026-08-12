import test from "node:test";
import assert from "node:assert/strict";
import { DIGEST_FORMAT_VERSION, type DigestJson } from "../digest/json.ts";
import { DIGEST_KEY, S3DigestPublisher } from "./s3-publisher.ts";

const json: DigestJson = {
  version: DIGEST_FORMAT_VERSION,
  generatedAt: 1_754_000_000_000,
  windowHours: 72,
  postsConsidered: 4,
  creatorsSeen: 2,
  candidates: [],
  proven: [],
  heldBack: { count: 0, reasons: [] },
  unscored: { count: 0, reasons: [] },
};

interface Sent {
  name: string;
  input: Record<string, unknown>;
}

function spy(sent: Sent[]) {
  return {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      return {};
    },
  };
}

function publisherOver(sent: Sent[], distributionId?: string) {
  const client = spy(sent);
  return new S3DigestPublisher({
    s3: client as never,
    cloudFront: client as never,
    bucket: "trendjack-site",
    ...(distributionId ? { distributionId } : {}),
    callerReference: "run-1",
  });
}

test("the digest is written to the file the front end reads", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(json);
  const put = sent.find((each) => each.name === "PutObjectCommand");
  assert.equal(put?.input["Bucket"], "trendjack-site");
  assert.equal(put?.input["Key"], DIGEST_KEY);
  assert.equal(put?.input["ContentType"], "application/json");
});

test("the written file is the digest, not a description of it", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(json);
  const body = sent[0]?.input["Body"];
  assert.deepEqual(JSON.parse(String(body)), json);
});

test("the file is cached for a day, which matches how often it changes", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(json);
  assert.equal(sent[0]?.input["CacheControl"], "public, max-age=86400");
});

test("the cache is cleared for that one file, so a reader is not shown yesterday", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent, "E123").publish(json);
  const invalidation = sent.find((each) => each.name === "CreateInvalidationCommand");
  assert.equal(invalidation?.input["DistributionId"], "E123");
  const batch = invalidation?.input["InvalidationBatch"] as {
    Paths: { Items: string[] };
    CallerReference: string;
  };
  assert.deepEqual(batch.Paths.Items, ["/digest.json"]);
  assert.equal(batch.CallerReference, "run-1");
});

test("with no distribution named the file is still written", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(json);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.name, "PutObjectCommand");
});

test("the write happens before the cache is cleared", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent, "E123").publish(json);
  assert.deepEqual(
    sent.map((each) => each.name),
    ["PutObjectCommand", "CreateInvalidationCommand"],
  );
});

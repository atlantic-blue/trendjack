import test from "node:test";
import assert from "node:assert/strict";
import { DIGEST_FORMAT_VERSION, type DigestJson } from "@trendjack/core/digest/json.ts";
import { DIGEST_KEY, POSTER_PREFIX, S3DigestPublisher } from "./s3-publisher.ts";

function digestOf(thumbnail?: string): DigestJson {
  return {
    version: DIGEST_FORMAT_VERSION,
    generatedAt: 1_754_000_000_000,
    windowHours: 72,
    provenWindowHours: 720,
    postsConsidered: 4,
    creatorsSeen: 2,
    candidates: [],
    proven: thumbnail
      ? [
          {
            postId: "p1",
            url: "https://www.tiktok.com/@who/video/p1",
            creator: "who",
            likes: 200_000,
            postedAt: 1,
            ageHours: 30,
            thumbnail,
          },
        ]
      : [],
    heldBack: { count: 0, reasons: [] },
    unscored: { count: 0, reasons: [] },
  };
}

interface Sent {
  name: string;
  input: Record<string, unknown>;
}

/** Head fails unless the key is in `kept`, which is how "already there" is expressed. */
function spy(sent: Sent[], kept: Set<string> = new Set()) {
  return {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      if (
        command.constructor.name === "HeadObjectCommand" &&
        !kept.has(String(command.input["Key"]))
      ) {
        throw new Error("not found");
      }
      return {};
    },
  };
}

function publisherOver(sent: Sent[], options: { kept?: Set<string>; poster?: boolean } = {}) {
  const client = spy(sent, options.kept);
  return new S3DigestPublisher({
    s3: client as never,
    cloudFront: client as never,
    bucket: "trendjack-site",
    distributionId: "E123",
    callerReference: "run-1",
    ...(options.poster === false
      ? {}
      : { fetchPoster: async () => new Uint8Array([1, 2, 3]).buffer }),
  });
}

function ranges(): Map<string, DigestJson> {
  return new Map([
    ["24h", digestOf()],
    ["72h", digestOf()],
    ["7d", digestOf()],
    ["30d", digestOf()],
  ]);
}

function keysWritten(sent: Sent[]): string[] {
  return sent
    .filter((each) => each.name === "PutObjectCommand")
    .map((each) => String(each.input["Key"]));
}

test("every range gets its own file", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(ranges());
  const keys = keysWritten(sent);
  for (const key of ["digest-24h.json", "digest-72h.json", "digest-7d.json", "digest-30d.json"]) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
});

test("the default range is also written plainly, so a reader with no choice made gets a page", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(ranges());
  assert.ok(keysWritten(sent).includes(DIGEST_KEY));
});

test("the written file is the digest, not a description of it", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(new Map([["72h", digestOf()]]));
  const written = sent.find((each) => String(each.input["Key"]) === "digest-72h.json");
  assert.deepEqual(JSON.parse(String(written?.input["Body"])), digestOf());
});

test("a digest is cached for a day, which matches how often it changes", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(new Map([["72h", digestOf()]]));
  const written = sent.find((each) => String(each.input["Key"]) === "digest-72h.json");
  assert.equal(written?.input["CacheControl"], "public, max-age=86400");
});

test("a poster is copied into the bucket, because the platform's link expires", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(new Map([["72h", digestOf("https://p16/expiring.jpg")]]));
  // The head that checks whether it is already there carries the same key, so match the write.
  const poster = sent.find(
    (each) =>
      each.name === "PutObjectCommand" && String(each.input["Key"]).startsWith(POSTER_PREFIX),
  );
  assert.equal(poster?.input["Key"], `${POSTER_PREFIX}p1.jpg`);
  assert.equal(poster?.input["ContentType"], "image/jpeg");
});

test("the digest points at our copy, not at the link that expires", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(new Map([["72h", digestOf("https://p16/expiring.jpg")]]));
  const written = sent.find((each) => String(each.input["Key"]) === "digest-72h.json");
  const body = JSON.parse(String(written?.input["Body"])) as DigestJson;
  assert.equal(body.proven[0]?.thumbnail, `${POSTER_PREFIX}p1.jpg`);
});

test("a poster is kept for a year, because it never changes", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(new Map([["72h", digestOf("https://p16/expiring.jpg")]]));
  const poster = sent.find(
    (each) =>
      each.name === "PutObjectCommand" && String(each.input["Key"]).startsWith(POSTER_PREFIX),
  );
  assert.equal(poster?.input["CacheControl"], "public, max-age=31536000");
});

test("a poster already in the bucket is not fetched again", async () => {
  const sent: Sent[] = [];
  const kept = new Set([`${POSTER_PREFIX}p1.jpg`]);
  await publisherOver(sent, { kept }).publish(new Map([["72h", digestOf("https://p16/x.jpg")]]));
  assert.equal(
    sent.filter(
      (each) =>
        String(each.input["Key"]).startsWith(POSTER_PREFIX) && each.name === "PutObjectCommand",
    ).length,
    0,
  );
  const written = sent.find((each) => String(each.input["Key"]) === "digest-72h.json");
  const body = JSON.parse(String(written?.input["Body"])) as DigestJson;
  assert.equal(body.proven[0]?.thumbnail, `${POSTER_PREFIX}p1.jpg`);
});

test("a poster that cannot be fetched leaves the card without one rather than losing the digest", async () => {
  const sent: Sent[] = [];
  const publisher = new S3DigestPublisher({
    s3: spy(sent) as never,
    bucket: "trendjack-site",
    callerReference: "run-1",
    fetchPoster: async () => undefined,
  });
  await publisher.publish(new Map([["72h", digestOf("https://p16/gone.jpg")]]));
  const written = sent.find((each) => String(each.input["Key"]) === "digest-72h.json");
  const body = JSON.parse(String(written?.input["Body"])) as DigestJson;
  assert.equal(body.proven[0]?.thumbnail, "https://p16/gone.jpg");
  assert.ok(keysWritten(sent).includes("digest-72h.json"));
});

test("only the files that changed are cleared, never the posters", async () => {
  const sent: Sent[] = [];
  await publisherOver(sent).publish(new Map([["72h", digestOf("https://p16/x.jpg")]]));
  const invalidation = sent.find((each) => each.name === "CreateInvalidationCommand");
  const batch = invalidation?.input["InvalidationBatch"] as { Paths: { Items: string[] } };
  assert.deepEqual(batch.Paths.Items, ["/digest-72h.json", "/digest.json"]);
});

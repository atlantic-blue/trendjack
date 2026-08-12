import test from "node:test";
import assert from "node:assert/strict";
import { EmptySourceResultError, type Sighting, type TrendSource } from "../contracts/ports.ts";
import type { CreatorId, PanelEntry, Platform, PostId } from "../contracts/types.ts";
import { InMemoryStore } from "../store/memory.ts";
import { PollFailedError, pollPanel } from "./poll.ts";

const NOW = 1_754_000_000_000;

function creator(handle: string, platform: Platform = "tiktok", product = "macgleam"): PanelEntry {
  return { product, niche: "mac tips", platform, kind: "creator", handle };
}

function sightingFor(handle: string, index: number): Sighting {
  const postId = `${handle}-${index}` as PostId;
  return {
    post: {
      postId,
      platform: "tiktok",
      creatorId: handle as CreatorId,
      postedAt: NOW - 3_600_000,
      url: `https://www.tiktok.com/@${handle}/video/${index}`,
      hashtags: [],
    },
    observation: { postId, observedAt: NOW, views: 100 * (index + 1) },
  };
}

class FakeSource implements TrendSource {
  readonly platform: Platform;
  readonly asked: string[] = [];
  readonly #perHandle: (handle: string) => Sighting[];

  constructor(platform: Platform, perHandle: (handle: string) => Sighting[]) {
    this.platform = platform;
    this.#perHandle = perHandle;
  }

  async recentPostsByCreator(handle: string): Promise<Sighting[]> {
    this.asked.push(handle);
    return this.#perHandle(handle);
  }
}

function twoPosts(handle: string): Sighting[] {
  return [sightingFor(handle, 0), sightingFor(handle, 1)];
}

function sourcesOf(source: TrendSource): Map<Platform, TrendSource> {
  return new Map([[source.platform, source]]);
}

test("a round stores a post and an observation for everything it saw", async () => {
  const store = new InMemoryStore();
  const report = await pollPanel({
    panel: [creator("alice"), creator("bob")],
    sources: sourcesOf(new FakeSource("tiktok", twoPosts)),
    store,
    postsPerCreator: 10,
  });
  assert.equal(report.watched, 2);
  assert.equal(report.postsSeen, 4);
  assert.equal(report.observationsStored, 4);
  assert.equal((await store.observationsFor("alice-0" as PostId)).length, 1);
});

test("the same creator watched for two products is polled once", async () => {
  const source = new FakeSource("tiktok", twoPosts);
  const report = await pollPanel({
    panel: [creator("alice", "tiktok", "macgleam"), creator("alice", "tiktok", "appshot")],
    sources: sourcesOf(source),
    store: new InMemoryStore(),
    postsPerCreator: 10,
  });
  assert.deepEqual(source.asked, ["alice"]);
  assert.equal(report.watched, 1);
});

test("the same handle on two platforms is two creators", async () => {
  const tiktok = new FakeSource("tiktok", twoPosts);
  const instagram = new FakeSource("instagram", twoPosts);
  const report = await pollPanel({
    panel: [creator("alice", "tiktok"), creator("alice", "instagram")],
    sources: new Map<Platform, TrendSource>([
      ["tiktok", tiktok],
      ["instagram", instagram],
    ]),
    store: new InMemoryStore(),
    postsPerCreator: 10,
  });
  assert.equal(report.watched, 2);
  assert.deepEqual(instagram.asked, ["alice"]);
});

test("hashtags and sounds are counted as skipped, not quietly ignored", async () => {
  const report = await pollPanel({
    panel: [
      creator("alice"),
      { product: "macgleam", niche: "mac tips", platform: "tiktok", kind: "hashtag", handle: "m" },
      { product: "macgleam", niche: "mac tips", platform: "tiktok", kind: "sound", handle: "s" },
    ],
    sources: sourcesOf(new FakeSource("tiktok", twoPosts)),
    store: new InMemoryStore(),
    postsPerCreator: 10,
  });
  assert.equal(report.watched, 1);
  assert.equal(report.skipped, 2);
});

test("one creator failing does not cost the round, and the failure is carried back", async () => {
  const source = new FakeSource("tiktok", (handle) => {
    if (handle === "bob") throw new EmptySourceResultError("tiktok", handle);
    return twoPosts(handle);
  });
  const report = await pollPanel({
    panel: [creator("alice"), creator("bob"), creator("carol")],
    sources: sourcesOf(source),
    store: new InMemoryStore(),
    postsPerCreator: 10,
  });
  assert.equal(report.postsSeen, 4);
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0]?.handle, "bob");
  assert.match(report.failures[0]?.reason ?? "", /no posts for bob/);
});

test("a round where everything failed is raised, because a store that gained nothing is not a quiet day", async () => {
  const source = new FakeSource("tiktok", (handle) => {
    throw new EmptySourceResultError("tiktok", handle);
  });
  await assert.rejects(
    () =>
      pollPanel({
        panel: [creator("alice"), creator("bob")],
        sources: sourcesOf(source),
        store: new InMemoryStore(),
        postsPerCreator: 10,
      }),
    (error: unknown) => {
      assert.ok(error instanceof PollFailedError);
      assert.equal(error.failures.length, 2);
      return true;
    },
  );
});

test("a platform with no source is a failure rather than a silent skip", async () => {
  const report = await pollPanel({
    panel: [creator("alice", "tiktok"), creator("beth", "instagram")],
    sources: sourcesOf(new FakeSource("tiktok", twoPosts)),
    store: new InMemoryStore(),
    postsPerCreator: 10,
  });
  assert.equal(report.failures.length, 1);
  assert.match(report.failures[0]?.reason ?? "", /no source is configured for instagram/);
});

test("an empty panel does not raise, because there was nothing to fail", async () => {
  const report = await pollPanel({
    panel: [],
    sources: sourcesOf(new FakeSource("tiktok", twoPosts)),
    store: new InMemoryStore(),
    postsPerCreator: 10,
  });
  assert.equal(report.watched, 0);
  assert.deepEqual(report.failures, []);
});

test("the round waits between creators, so it does not arrive as a burst", async () => {
  let waits = 0;
  await pollPanel({
    panel: [creator("alice"), creator("bob"), creator("carol")],
    sources: sourcesOf(new FakeSource("tiktok", twoPosts)),
    store: new InMemoryStore(),
    postsPerCreator: 10,
    pace: async () => {
      waits += 1;
    },
  });
  assert.equal(waits, 2);
});

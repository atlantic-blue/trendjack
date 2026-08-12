import test from "node:test";
import assert from "node:assert/strict";
import type { Sighting, TrendSource } from "@trendjack/core/contracts/ports.ts";
import type { CreatorId, Panel, Platform, PostId } from "@trendjack/core/contracts/types.ts";
import { DAY_MS, HOUR_MS } from "@trendjack/core/ranking/constants.ts";
import { InMemoryStore } from "@trendjack/core/store/memory.ts";
import { DIGEST_FORMAT_VERSION, type DigestJson } from "@trendjack/core/digest/json.ts";
import { pollOnce, type DigestPublisher } from "./poll-once.ts";

const NOW = 1_754_000_000_000;
const panel: Panel = [{ platform: "tiktok", kind: "creator", handle: "alice" }];

class Recorder implements DigestPublisher {
  published: DigestJson[] = [];
  async publish(json: DigestJson): Promise<void> {
    this.published.push(json);
  }
}

function sightings(handle: string, freshViews: number, freshLikes: number): Sighting[] {
  const settled = Array.from({ length: 20 }, (_unused, index) => {
    const postId = `${handle}-${index}` as PostId;
    const postedAt = NOW - (8 + index) * DAY_MS;
    return {
      post: {
        postId,
        platform: "tiktok" as const,
        creatorId: handle as CreatorId,
        postedAt,
        url: `https://www.tiktok.com/@${handle}/video/${index}`,
        hashtags: [],
      },
      observation: {
        postId,
        observedAt: NOW,
        views: 1_000 + index,
        likes: 50,
        comments: 4,
        shares: 1,
      },
    };
  });
  const postId = `${handle}-fresh` as PostId;
  return [
    {
      post: {
        postId,
        platform: "tiktok" as const,
        creatorId: handle as CreatorId,
        postedAt: NOW - 6 * HOUR_MS,
        url: `https://www.tiktok.com/@${handle}/video/fresh`,
        hashtags: [],
      },
      observation: {
        postId,
        observedAt: NOW,
        views: freshViews,
        likes: freshLikes,
        comments: 40,
        shares: 20,
      },
    },
    ...settled,
  ];
}

class FakeSource implements TrendSource {
  readonly platform: Platform = "tiktok";
  readonly #views: number;
  readonly #likes: number;

  constructor(views: number, likes: number) {
    this.#views = views;
    this.#likes = likes;
  }

  async recentPostsByCreator(handle: string): Promise<Sighting[]> {
    return sightings(handle, this.#views, this.#likes);
  }
}

function run(publisher: DigestPublisher, views = 12_000, likes = 150_000) {
  return pollOnce({
    panel,
    sources: new Map<Platform, TrendSource>([["tiktok", new FakeSource(views, likes)]]),
    store: new InMemoryStore(),
    publisher,
    now: NOW,
    postsPerCreator: 30,
    windowHours: 72,
    limit: 10,
  });
}

test("a round publishes exactly one file", async () => {
  const recorder = new Recorder();
  await run(recorder);
  assert.equal(recorder.published.length, 1);
});

test("the file carries its format version, so a front end can refuse one it cannot read", async () => {
  const recorder = new Recorder();
  await run(recorder);
  assert.equal(recorder.published[0]?.version, DIGEST_FORMAT_VERSION);
});

test("the file carries what was held back, not only what was chosen", async () => {
  const recorder = new Recorder();
  await run(recorder);
  const json = recorder.published[0];
  assert.equal(json?.heldBack.count, 1);
  assert.match(json?.heldBack.reasons[0]?.reason ?? "", /no rate could be read/);
});

test("a video above the like floor is published as a format that worked at scale", async () => {
  const recorder = new Recorder();
  await run(recorder, 12_000, 150_000);
  assert.equal(recorder.published[0]?.proven.length, 1);
  assert.equal(recorder.published[0]?.proven[0]?.likes, 150_000);
});

test("a video below the like floor is not published as proven", async () => {
  const recorder = new Recorder();
  await run(recorder, 12_000, 900);
  assert.deepEqual(recorder.published[0]?.proven, []);
});

test("nothing is published when the whole round failed, so yesterday's file stays", async () => {
  class DeadSource implements TrendSource {
    readonly platform: Platform = "tiktok";
    async recentPostsByCreator(): Promise<Sighting[]> {
      throw new Error("the tool is broken");
    }
  }
  const recorder = new Recorder();
  await assert.rejects(() =>
    pollOnce({
      panel,
      sources: new Map<Platform, TrendSource>([["tiktok", new DeadSource()]]),
      store: new InMemoryStore(),
      publisher: recorder,
      now: NOW,
      postsPerCreator: 30,
      windowHours: 72,
      limit: 10,
    }),
  );
  assert.deepEqual(recorder.published, []);
});

test("the counts in the file match what was polled", async () => {
  const recorder = new Recorder();
  const { poll } = await run(recorder);
  assert.equal(poll.observationsStored, 21);
  assert.equal(recorder.published[0]?.postsConsidered, 1);
  assert.equal(recorder.published[0]?.creatorsSeen, 1);
});

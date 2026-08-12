import test from "node:test";
import assert from "node:assert/strict";
import type { Sighting, TrendSource } from "../contracts/ports.ts";
import type { CreatorId, Panel, Platform, PostId } from "../contracts/types.ts";
import { DAY_MS, HOUR_MS } from "../ranking/constants.ts";
import { InMemoryStore } from "../store/memory.ts";
import { runOnce } from "./run-once.ts";

const NOW = 1_754_000_000_000;

const panel: Panel = [{ platform: "tiktok", kind: "creator", handle: "alice" }];

/** A creator with a settled history and one fresh post that is beating it. */
function sightings(handle: string, freshViews: number): Sighting[] {
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
        shares: 2,
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
        likes: 900,
        comments: 40,
        shares: 20,
      },
    },
    ...settled,
  ];
}

class FakeSource implements TrendSource {
  readonly platform: Platform = "tiktok";
  readonly #freshViews: number;

  constructor(freshViews: number) {
    this.#freshViews = freshViews;
  }

  async recentPostsByCreator(handle: string): Promise<Sighting[]> {
    return sightings(handle, this.#freshViews);
  }
}

function run(store = new InMemoryStore(), freshViews = 12_000) {
  return runOnce({
    panel,
    sources: new Map<Platform, TrendSource>([["tiktok", new FakeSource(freshViews)]]),
    store,
    now: NOW,
    postsPerCreator: 30,
    windowHours: 72,
    limit: 10,
  });
}

test("a first ever round holds everything back, and the text says why rather than looking quiet", async () => {
  const { poll, text } = await run();
  assert.equal(poll.observationsStored, 21);
  assert.match(text, /nothing cleared the bar today/);
  assert.match(text, /Held back: 1 \(1 no rate could be read/);
  assert.match(text, /Polled 1 creators, stored 21 readings\./);
});

test("a second round taken later can read a rate, and the video becomes a candidate", async () => {
  const store = new InMemoryStore();
  await run(store, 12_000);
  // The same store, polled again with the video further along.
  const later = await runOnce({
    panel,
    sources: new Map<Platform, TrendSource>([["tiktok", new LaterSource()]]),
    store,
    now: NOW + 4 * HOUR_MS,
    postsPerCreator: 30,
    windowHours: 72,
    limit: 10,
  });
  assert.match(later.text, /1 worth a look/);
  assert.match(later.text, /still picking up|baselines an hour/);
  assert.doesNotMatch(later.text, /nothing cleared the bar/);
});

/** The same creator four hours on, with the fresh post grown and everything else settled. */
class LaterSource implements TrendSource {
  readonly platform: Platform = "tiktok";

  async recentPostsByCreator(handle: string): Promise<Sighting[]> {
    return sightings(handle, 40_000).map((sighting) => ({
      post: sighting.post,
      observation: { ...sighting.observation, observedAt: NOW + 4 * HOUR_MS },
    }));
  }
}

test("a round that failed entirely is raised rather than printed as an empty digest", async () => {
  class DeadSource implements TrendSource {
    readonly platform: Platform = "tiktok";
    async recentPostsByCreator(): Promise<Sighting[]> {
      throw new Error("the tool is broken");
    }
  }
  await assert.rejects(() =>
    runOnce({
      panel,
      sources: new Map<Platform, TrendSource>([["tiktok", new DeadSource()]]),
      store: new InMemoryStore(),
      now: NOW,
      postsPerCreator: 30,
      windowHours: 72,
      limit: 10,
    }),
  );
});

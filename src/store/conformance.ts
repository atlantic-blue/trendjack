import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Store } from "../contracts/ports.ts";
import type { CreatorId, Observation, Post, PostId } from "../contracts/types.ts";

/**
 * One suite that every Store implementation must pass.
 *
 * A fake whose behaviour is looser than the real thing manufactures green: the suite passes
 * against the in memory store and the deployed one then does something else. Both are held to
 * this, so a disagreement between them is a failing test rather than a surprise in production.
 */
export function describeStoreConformance(name: string, makeStore: () => Promise<Store>): void {
  describe(`${name} conforms to the Store contract`, () => {
    test("an observation can be read back", async () => {
      const store = await makeStore();
      await store.appendObservation(observation("p1", 1_000, 10));
      const found = await store.observationsFor(id("p1"));
      assert.equal(found.length, 1);
      assert.equal(found[0]?.views, 10);
    });

    test("a second observation of the same post is added, never substituted", async () => {
      const store = await makeStore();
      await store.appendObservation(observation("p1", 1_000, 10));
      await store.appendObservation(observation("p1", 2_000, 90));
      const found = await store.observationsFor(id("p1"));
      assert.deepEqual(
        found.map((each) => each.views),
        [10, 90],
      );
    });

    test("observations come back in time order however they arrived", async () => {
      const store = await makeStore();
      await store.appendObservation(observation("p1", 3_000, 300));
      await store.appendObservation(observation("p1", 1_000, 100));
      await store.appendObservation(observation("p1", 2_000, 200));
      const found = await store.observationsFor(id("p1"));
      assert.deepEqual(
        found.map((each) => each.observedAt),
        [1_000, 2_000, 3_000],
      );
    });

    test("re-recording an identical reading is harmless, because a poll may be retried", async () => {
      const store = await makeStore();
      await store.appendObservation(observation("p1", 1_000, 10));
      await store.appendObservation(observation("p1", 1_000, 10));
      assert.equal((await store.observationsFor(id("p1"))).length, 1);
    });

    test("a different reading of the same moment is a contradiction and is refused", async () => {
      const store = await makeStore();
      await store.appendObservation(observation("p1", 1_000, 10));
      await assert.rejects(() => store.appendObservation(observation("p1", 1_000, 11)));
      const found = await store.observationsFor(id("p1"));
      assert.equal(found[0]?.views, 10);
    });

    test("a post nobody has observed has no observations rather than failing", async () => {
      assert.deepEqual(await (await makeStore()).observationsFor(id("never-seen")), []);
    });

    test("an observation with an unknown view count keeps that distinct from zero", async () => {
      const store = await makeStore();
      await store.appendObservation({ postId: id("p1"), observedAt: 1_000, likes: 4 });
      const found = await store.observationsFor(id("p1"));
      assert.equal(found[0]?.views, undefined);
      assert.notEqual(found[0]?.views, 0);
    });

    test("seeing the same post twice does not create a second post", async () => {
      const store = await makeStore();
      await store.putPost(post("p1", "alice", 5_000));
      await store.putPost(post("p1", "alice", 5_000));
      assert.equal((await store.settledPostsFor(id("alice"), 9_000, 10)).length, 1);
    });

    test("settled posts are newest first and exclude anything past the cutoff", async () => {
      const store = await makeStore();
      await store.putPost(post("old", "alice", 1_000));
      await store.putPost(post("mid", "alice", 5_000));
      await store.putPost(post("new", "alice", 9_000));
      const found = await store.settledPostsFor(id("alice"), 6_000, 10);
      assert.deepEqual(
        found.map((each) => each.postId),
        ["mid", "old"],
      );
    });

    test("settled posts never include another creator's work", async () => {
      const store = await makeStore();
      await store.putPost(post("a1", "alice", 1_000));
      await store.putPost(post("b1", "bob", 1_000));
      const found = await store.settledPostsFor(id("alice"), 9_000, 10);
      assert.deepEqual(
        found.map((each) => each.postId),
        ["a1"],
      );
    });

    test("the limit is honoured and takes the newest", async () => {
      const store = await makeStore();
      await store.putPost(post("a1", "alice", 1_000));
      await store.putPost(post("a2", "alice", 2_000));
      await store.putPost(post("a3", "alice", 3_000));
      const found = await store.settledPostsFor(id("alice"), 9_000, 2);
      assert.deepEqual(
        found.map((each) => each.postId),
        ["a3", "a2"],
      );
    });

    test("posts since a moment are newest first", async () => {
      const store = await makeStore();
      await store.putPost(post("a1", "alice", 1_000));
      await store.putPost(post("a2", "alice", 5_000));
      await store.putPost(post("a3", "alice", 9_000));
      const found = await store.postsSince(5_000);
      assert.deepEqual(
        found.map((each) => each.postId),
        ["a3", "a2"],
      );
    });

    test("scores are kept and read back newest first", async () => {
      const store = await makeStore();
      await store.putScore(score("p1", 1_000, 1.5));
      await store.putScore(score("p2", 2_000, 2.5));
      const found = await store.scoresSince(0);
      assert.deepEqual(
        found.map((each) => each.postId),
        ["p2", "p1"],
      );
    });

    test("scoring the same post again keeps both, because the history is the training set", async () => {
      const store = await makeStore();
      await store.putScore(score("p1", 1_000, 1.5));
      await store.putScore(score("p1", 2_000, 4.5));
      const found = await store.scoresSince(0);
      assert.equal(found.length, 2);
    });

    test("a baseline can be stored for each metric independently", async () => {
      const store = await makeStore();
      await store.putBaseline({
        creatorId: id("alice") as unknown as CreatorId,
        metric: "views",
        value: 1_000,
        settledPostCount: 12,
        newestSettledPostAt: 5_000,
        computedAt: 9_000,
      });
      await store.putBaseline({
        creatorId: id("alice") as unknown as CreatorId,
        metric: "likes",
        value: 80,
        settledPostCount: 12,
        newestSettledPostAt: 5_000,
        computedAt: 9_000,
      });
    });
  });
}

function id<T extends string>(value: string): T & PostId & CreatorId {
  return value as T & PostId & CreatorId;
}

function observation(postId: string, observedAt: number, views: number): Observation {
  return { postId: id(postId), observedAt, views, likes: Math.floor(views / 10) };
}

function post(postId: string, creatorId: string, postedAt: number): Post {
  return {
    postId: id(postId),
    platform: "tiktok",
    creatorId: id(creatorId),
    postedAt,
    url: `https://www.tiktok.com/@${creatorId}/video/${postId}`,
    hashtags: [],
  };
}

function score(postId: string, computedAt: number, trendScore: number) {
  return {
    postId: id(postId),
    computedAt,
    metric: "views" as const,
    features: {
      outlier: 3,
      normVelocity: 0.2,
      velocityMeasurable: true,
      acceleration: 0.1,
      qualityRatio: 1.1,
      spread: 2,
      saturation: 0.1,
      ageHours: 12,
    },
    trendScore,
    band: "outlier" as const,
    confidence: "high" as const,
  };
}

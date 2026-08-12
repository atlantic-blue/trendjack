import test from "node:test";
import assert from "node:assert/strict";
import type { CreatorId, Panel, PostId, SoundId } from "../contracts/types.ts";
import { InMemoryStore } from "../store/memory.ts";
import { DAY_MS, HOUR_MS } from "../ranking/constants.ts";
import { buildDigest } from "./build.ts";

const NOW = 1_754_000_000_000;

const panel: Panel = [
  { product: "macgleam", niche: "mac tips", platform: "tiktok", kind: "creator", handle: "alice" },
];

interface Seed {
  creator: string;
  postId: string;
  ageHours: number;
  views: number[];
  likes?: (number | undefined)[];
  soundId?: string;
  settledViews?: number;
}

/**
 * Gives a creator a believable settled history and then one fresh post observed as many times
 * as `views` has entries, two hours apart.
 */
async function seed(store: InMemoryStore, options: Seed): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const postId = `${options.creator}-settled-${index}` as PostId;
    const postedAt = NOW - (8 + index) * DAY_MS;
    await store.putPost({
      postId,
      platform: "tiktok",
      creatorId: options.creator as CreatorId,
      postedAt,
      url: `https://www.tiktok.com/@${options.creator}/video/${index}`,
      hashtags: [],
    });
    await store.appendObservation({
      postId,
      observedAt: postedAt + 7 * DAY_MS,
      views: (options.settledViews ?? 1_000) + index,
      likes: 50 + index,
      comments: 5,
      shares: 2,
    });
  }

  const postId = options.postId as PostId;
  await store.putPost({
    postId,
    platform: "tiktok",
    creatorId: options.creator as CreatorId,
    postedAt: NOW - options.ageHours * HOUR_MS,
    url: `https://www.tiktok.com/@${options.creator}/video/${options.postId}`,
    hashtags: [],
    ...(options.soundId ? { soundId: options.soundId as SoundId } : {}),
  });
  for (const [index, views] of options.views.entries()) {
    const likes = options.likes ? options.likes[index] : Math.round(views * 0.05);
    await store.appendObservation({
      postId,
      observedAt: NOW - (options.views.length - 1 - index) * 2 * HOUR_MS,
      views,
      ...(likes === undefined ? {} : { likes }),
      comments: Math.round(views * 0.002),
      shares: Math.round(views * 0.001),
    });
  }
}

function build(store: InMemoryStore, limit = 10) {
  return buildDigest({ store, panel, now: NOW, windowHours: 72, limit });
}

test("a breakout inside the window becomes a candidate", async () => {
  const store = new InMemoryStore();
  await seed(store, { creator: "alice", postId: "hot", ageHours: 6, views: [2_000, 6_000, 9_000] });
  const digest = await build(store);
  assert.equal(digest.candidates.length, 1);
  assert.equal(digest.candidates[0]?.post.postId, "hot");
  assert.ok((digest.candidates[0]?.score.features.outlier ?? 0) > 8);
});

test("a candidate carries the product whose niche its creator was watched for", async () => {
  const store = new InMemoryStore();
  await seed(store, { creator: "alice", postId: "hot", ageHours: 6, views: [2_000, 6_000, 9_000] });
  const digest = await build(store);
  assert.equal(digest.candidates[0]?.product, "macgleam");
  assert.equal(digest.candidates[0]?.niche, "mac tips");
});

test("a creator not in the panel is scored but not attributed to a product", async () => {
  const store = new InMemoryStore();
  await seed(store, { creator: "zoe", postId: "hot", ageHours: 6, views: [2_000, 6_000, 9_000] });
  const digest = await build(store);
  assert.equal(digest.candidates[0]?.product, undefined);
});

test("the window keeps a fresh post and drops one that has aged out", async () => {
  const store = new InMemoryStore();
  await seed(store, {
    creator: "alice",
    postId: "fresh",
    ageHours: 6,
    views: [2_000, 6_000, 9_000],
  });
  await seed(store, { creator: "bob", postId: "aged", ageHours: 100, views: [2_000, 9_000] });
  const digest = await build(store);
  assert.equal(digest.postsConsidered, 1);
  assert.deepEqual(
    digest.candidates.map((row) => row.post.postId),
    ["fresh"],
  );
});

test("a creator without enough history is reported as unscored, with the reason", async () => {
  const store = new InMemoryStore();
  await store.putPost({
    postId: "lonely" as PostId,
    platform: "tiktok",
    creatorId: "newcomer" as CreatorId,
    postedAt: NOW - 2 * HOUR_MS,
    url: "https://www.tiktok.com/@newcomer/video/1",
    hashtags: [],
  });
  await store.appendObservation({ postId: "lonely" as PostId, observedAt: NOW, views: 90_000 });
  const digest = await build(store);
  assert.equal(digest.candidates.length, 0);
  assert.equal(digest.unscored.length, 1);
  assert.match(digest.unscored[0]?.reason ?? "", /fewer than the 8 a baseline needs/);
});

test("a post seen only once is held back rather than ranked", async () => {
  const store = new InMemoryStore();
  await seed(store, { creator: "alice", postId: "once", ageHours: 4, views: [40_000] });
  const digest = await build(store);
  assert.equal(digest.candidates.length, 0);
  assert.equal(digest.heldBack.length, 1);
  assert.match(digest.heldBack[0]?.score.suppressedReason ?? "", /no rate could be read/);
});

test("other creators breaking out on the same sound raise the spread", async () => {
  const store = new InMemoryStore();
  const sound = "someone::a rising sound";
  await seed(store, {
    creator: "alice",
    postId: "a",
    ageHours: 6,
    views: [2_000, 6_000, 9_000],
    soundId: sound,
  });
  await seed(store, {
    creator: "bob",
    postId: "b",
    ageHours: 5,
    views: [2_000, 6_000, 9_000],
    soundId: sound,
  });
  await seed(store, {
    creator: "carol",
    postId: "c",
    ageHours: 4,
    views: [2_000, 6_000, 9_000],
    soundId: sound,
  });
  const digest = await build(store);
  assert.equal(digest.candidates[0]?.score.features.spread, 2);
});

test("a creator does not corroborate their own shape", async () => {
  const store = new InMemoryStore();
  const sound = "someone::a rising sound";
  await seed(store, {
    creator: "alice",
    postId: "a",
    ageHours: 6,
    views: [2_000, 6_000, 9_000],
    soundId: sound,
  });
  const digest = await build(store);
  assert.equal(digest.candidates[0]?.score.features.spread, 0);
});

test("a creator on the sound who is not breaking out adds saturation but not spread", async () => {
  const store = new InMemoryStore();
  const sound = "someone::a crowded sound";
  await seed(store, {
    creator: "alice",
    postId: "a",
    ageHours: 6,
    views: [2_000, 6_000, 9_000],
    soundId: sound,
  });
  await seed(store, {
    creator: "bob",
    postId: "b",
    ageHours: 5,
    views: [900, 1_000, 1_050],
    soundId: sound,
  });
  const digest = await build(store);
  const alice = digest.candidates.find((row) => row.post.postId === "a");
  assert.equal(alice?.score.features.spread, 0);
  assert.ok((alice?.score.features.saturation ?? 0) > 0);
});

test("the limit caps the candidates but never the held back count", async () => {
  const store = new InMemoryStore();
  for (const name of ["alice", "bob", "carol"]) {
    await seed(store, {
      creator: name,
      postId: `${name}-hot`,
      ageHours: 6,
      views: [2_000, 6_000, 9_000],
    });
  }
  const digest = await build(store, 2);
  assert.equal(digest.candidates.length, 2);
  assert.equal(digest.creatorsSeen, 3);
});

test("an empty store gives an empty digest rather than failing", async () => {
  const digest = await build(new InMemoryStore());
  assert.equal(digest.postsConsidered, 0);
  assert.deepEqual(digest.candidates, []);
});

test("a video that cleared the like floor is listed as a format that worked at scale", async () => {
  const store = new InMemoryStore();
  await seed(store, {
    creator: "alice",
    postId: "big",
    ageHours: 6,
    views: [3_000_000, 4_000_000],
    likes: [90_000, 250_000],
  });
  const digest = await build(store);
  assert.equal(digest.proven.length, 1);
  assert.equal(digest.proven[0]?.post.postId, "big");
  assert.equal(digest.proven[0]?.likes, 250_000);
});

test("a video below the floor is not listed", async () => {
  const store = new InMemoryStore();
  await seed(store, {
    creator: "alice",
    postId: "small",
    ageHours: 6,
    views: [3_000_000, 4_000_000],
    likes: [1_000, 99_999],
  });
  assert.deepEqual((await build(store)).proven, []);
});

test("the floor uses the largest reading, because a later one can be missing the field", async () => {
  const store = new InMemoryStore();
  await seed(store, {
    creator: "alice",
    postId: "big",
    ageHours: 6,
    views: [3_000_000, 4_000_000],
    likes: [250_000, undefined],
  });
  assert.equal((await build(store)).proven[0]?.likes, 250_000);
});

test("a proven video appears even when its own creator makes it look ordinary", async () => {
  const store = new InMemoryStore();
  await seed(store, {
    creator: "alice",
    postId: "routine",
    ageHours: 6,
    views: [3_000_000, 3_100_000],
    likes: [200_000, 210_000],
    settledViews: 3_000_000,
  });
  const digest = await build(store);
  assert.equal(digest.proven.length, 1);
  // Its own creator makes 3 million views normal, so the score says nothing special happened.
  assert.ok((digest.candidates[0]?.score.features.outlier ?? 0) < 1.1);
});

test("proven videos are listed most liked first", async () => {
  const store = new InMemoryStore();
  await seed(store, {
    creator: "alice",
    postId: "a",
    ageHours: 6,
    views: [9_000_000],
    likes: [150_000],
  });
  await seed(store, {
    creator: "bob",
    postId: "b",
    ageHours: 5,
    views: [9_000_000],
    likes: [900_000],
  });
  const digest = await build(store);
  assert.deepEqual(
    digest.proven.map((row) => row.post.postId),
    ["b", "a"],
  );
});

test("the floor can be lowered for a niche where nothing reaches a hundred thousand", async () => {
  const store = new InMemoryStore();
  await seed(store, {
    creator: "alice",
    postId: "modest",
    ageHours: 6,
    views: [50_000],
    likes: [4_000],
  });
  const digest = await buildDigest({
    store,
    panel,
    now: NOW,
    windowHours: 72,
    limit: 10,
    provenLikes: 3_000,
  });
  assert.equal(digest.proven.length, 1);
});

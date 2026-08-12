import test from "node:test";
import assert from "node:assert/strict";
import { chooseMetric, computeBaseline, isSettled, median } from "./baseline.ts";
import { DAY_MS, HOUR_MS, MIN_SETTLED_POSTS } from "./constants.ts";
import { NOW, makePost, makeSettled } from "./fixtures.ts";
import type { CreatorId, PostId } from "../contracts/types.ts";

const alice = "alice" as CreatorId;

test("the median of an odd count is the middle value", () => {
  assert.equal(median([3, 1, 2]), 2);
});

test("the median of an even count is the midpoint of the middle two", () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("the median shrugs off one past hit that a mean would be dragged up by", () => {
  const withOneHit = [100, 110, 90, 105, 95, 5_000_000];
  const mean = withOneHit.reduce((total, each) => total + each, 0) / withOneHit.length;
  assert.equal(median(withOneHit), 102.5);
  assert.ok(mean > 800_000, "the mean is the thing this is protecting against");
});

test("a post younger than a week is not settled", () => {
  assert.equal(isSettled(makePost({ postedAt: NOW - 3 * DAY_MS }), NOW), false);
});

test("a post older than a week is settled", () => {
  assert.equal(isSettled(makePost({ postedAt: NOW - 8 * DAY_MS }), NOW), true);
});

test("a baseline is the median of the creator's settled posts", () => {
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: makeSettled(10, () => 1_000),
    now: NOW,
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.baseline.value, 1_000);
  assert.equal(outcome.baseline.settledPostCount, 10);
});

test("an unsettled post is excluded, so the median measures the creator and not immaturity", () => {
  const settled = makeSettled(MIN_SETTLED_POSTS, () => 1_000);
  const stillGrowing = {
    post: makePost({ postId: "fresh" as PostId, postedAt: NOW - 2 * HOUR_MS }),
    latest: { postId: "fresh" as PostId, observedAt: NOW, views: 3 },
  };
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: [...settled, stillGrowing],
    now: NOW,
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.baseline.value, 1_000);
  assert.equal(outcome.baseline.settledPostCount, MIN_SETTLED_POSTS);
});

test("a creator with too little history has no baseline and says how short they are", () => {
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: makeSettled(MIN_SETTLED_POSTS - 1),
    now: NOW,
  });
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /7 settled posts/.test(outcome.reason));
  assert.ok(!outcome.ok && /fewer than the 8/.test(outcome.reason));
});

test("a creator whose median is zero has no baseline, rather than a division by zero", () => {
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: makeSettled(10, () => 0),
    now: NOW,
  });
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /nothing can be measured against it/.test(outcome.reason));
});

test("a creator whose every post does the same number is flagged as flat", () => {
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: makeSettled(10, () => 1_000),
    now: NOW,
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.flat, true);
});

test("a creator with varying numbers is not flat", () => {
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: makeSettled(10),
    now: NOW,
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.flat, false);
});

test("only the most recent posts count, so an old account is measured as it is now", () => {
  const recentAreBigger = makeSettled(30, (index) => (index < 20 ? 5_000 : 10));
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: recentAreBigger,
    now: NOW,
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.baseline.value, 5_000);
});

test("views are the metric when enough posts carry them", () => {
  assert.equal(chooseMetric(makeSettled(10)), "views");
});

test("likes are the fallback when instagram will not give view counts", () => {
  const withoutViews = makeSettled(10).map((each) => ({
    post: each.post,
    latest: { ...each.latest, views: undefined },
  }));
  assert.equal(chooseMetric(withoutViews), "likes");
});

test("a prolific creator whose fetched posts are all recent has no baseline at all", () => {
  // Thirty posts from an account that posts ten times a day never reach past the settled line.
  const allRecent = makeSettled(30).map((each, index) => ({
    post: makePost({ postId: `p${index}` as PostId, postedAt: NOW - index * HOUR_MS * 2 }),
    latest: each.latest,
  }));
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: allRecent,
    now: NOW,
  });
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /0 settled posts/.test(outcome.reason));
});

test("the same creator read far enough back does have one", () => {
  const reachingBack = makeSettled(30).map((each, index) => ({
    post: makePost({ postId: `p${index}` as PostId, postedAt: NOW - (index + 1) * DAY_MS }),
    latest: each.latest,
  }));
  const outcome = computeBaseline({
    creatorId: alice,
    metric: "views",
    settled: reachingBack,
    now: NOW,
  });
  assert.ok(outcome.ok);
  assert.ok(outcome.baseline.settledPostCount >= MIN_SETTLED_POSTS);
});

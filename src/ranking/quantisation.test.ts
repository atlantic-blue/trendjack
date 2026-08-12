import test from "node:test";
import assert from "node:assert/strict";
import { countResolution, isDistinguishable } from "./quantisation.ts";

test("the resolution matches how coarsely the real capture reported each count", () => {
  assert.equal(countResolution(1_100_000), 1_000);
  assert.equal(countResolution(388_300), 100);
  assert.equal(countResolution(41_900), 10);
  assert.equal(countResolution(5_554), 1);
});

test("a small count is reported exactly, so its resolution is one", () => {
  assert.equal(countResolution(1_263), 1);
  assert.equal(countResolution(7), 1);
});

test("nothing and less than nothing still have a resolution of one", () => {
  assert.equal(countResolution(0), 1);
  assert.equal(countResolution(-5), 1);
});

test("two identical readings are never distinguishable, however small", () => {
  assert.equal(isDistinguishable(10, 10), false);
  assert.equal(isDistinguishable(1_100_000, 1_100_000), false);
});

test("a change smaller than the rounding is not a change we can see", () => {
  assert.equal(isDistinguishable(1_100_000, 1_100_500), false);
});

test("a change larger than the rounding is real", () => {
  assert.equal(isDistinguishable(1_100_000, 1_200_000), true);
});

test("small numbers are compared exactly, so one extra view counts", () => {
  assert.equal(isDistinguishable(1_263, 1_264), true);
});

test("a drop is as visible as a rise", () => {
  assert.equal(isDistinguishable(1_200_000, 1_100_000), true);
});

test("the coarser of the two readings sets the bar", () => {
  assert.equal(isDistinguishable(999, 1_500), true);
  assert.equal(isDistinguishable(1_000_400, 1_000_800), false);
});

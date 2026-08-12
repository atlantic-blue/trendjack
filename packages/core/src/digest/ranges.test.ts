import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RANGE, RANGES, digestKeyFor, rangeFor } from "./ranges.ts";

test("the ranges run from a day to a month, shortest first", () => {
  assert.deepEqual(
    RANGES.map((range) => range.key),
    ["24h", "72h", "7d", "30d"],
  );
  assert.deepEqual(
    RANGES.map((range) => range.hours),
    [24, 72, 168, 720],
  );
});

test("the default is one a reader can act on, not the widest", () => {
  assert.ok(rangeFor(DEFAULT_RANGE));
  assert.equal(rangeFor(DEFAULT_RANGE)?.hours, 72);
});

test("an unknown range is not guessed at", () => {
  assert.equal(rangeFor("all-time"), undefined);
  assert.equal(rangeFor(""), undefined);
});

test("each range has its own file", () => {
  assert.equal(digestKeyFor("24h"), "digest-24h.json");
  assert.equal(new Set(RANGES.map((range) => digestKeyFor(range.key))).size, RANGES.length);
});

test("nothing looks further back than a month", () => {
  assert.ok(RANGES.every((range) => range.hours <= 24 * 30));
});

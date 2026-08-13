import test from "node:test";
import assert from "node:assert/strict";
import type { TagReading } from "../contracts/types.ts";
import { DAY_MS } from "../ranking/constants.ts";
import { growthFrom } from "./growth.ts";
import { renderRecord } from "./report.ts";
import type { RecordReport } from "./record.ts";

const NOW = 1_786_600_000_000;

function reading(hashtag: string, agoMs: number, videoCount: number): TagReading {
  return {
    hashtag,
    platform: "tiktok",
    observedAt: NOW - agoMs,
    videoCount,
    viewCount: videoCount * 1_000,
  };
}

function report(over: Partial<RecordReport> = {}): RecordReport {
  return { asked: 0, recorded: [], failures: [], growth: [], ...over };
}

test("a first round says there is nothing to compare with yet", () => {
  const growth = growthFrom("storytime", [reading("storytime", 0, 60_455_583)]);
  const rendered = renderRecord(report({ asked: 1, recorded: [], growth: [growth!] }));
  assert.match(rendered, /First reading/);
  assert.match(rendered, /60,455,583 videos/);
});

test("the smaller faster topic is listed above the huge slow one", () => {
  const small = growthFrom("newthing", [
    reading("newthing", DAY_MS, 500),
    reading("newthing", 0, 1_500),
  ]);
  const huge = growthFrom("storytime", [
    reading("storytime", DAY_MS, 60_000_000),
    reading("storytime", 0, 60_100_000),
  ]);
  const rendered = renderRecord(report({ asked: 2, growth: [huge!, small!] }));
  assert.ok(
    rendered.indexOf("newthing") < rendered.indexOf("storytime"),
    "growth against size decides the order, not videos added",
  );
});

test("hashtags that did not answer are always counted, even at nought", () => {
  assert.match(renderRecord(report({ asked: 3 })), /0 did not answer/);
  const withFailure = renderRecord(
    report({ asked: 2, failures: [{ hashtag: "grwm", reason: "the page refused" }] }),
  );
  assert.match(withFailure, /1 did not answer/);
  assert.match(withFailure, /no answer {2}#grwm {2}the page refused/);
});

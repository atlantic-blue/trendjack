import test from "node:test";
import assert from "node:assert/strict";
import { renderQualify } from "./report.ts";
import type { Verdict } from "./qualify.ts";

function verdict(handle: string, keep: boolean, reason: string): Verdict {
  return {
    handle,
    keep,
    reason,
    posts: 20,
    medianViews: 100_000,
    bestLikes: 250_000,
    lastPostedAt: 1,
  };
}

test("the report leads with how many were checked and how many to keep", () => {
  const text = renderQualify({
    verdicts: [verdict("alice", true, "good"), verdict("bob", false, "too small")],
    platform: "tiktok",
  });
  assert.match(text, /Checked 2 creators\. Keep 1\./);
});

test("a rejection shows its reason, so it can be argued with", () => {
  const text = renderQualify({
    verdicts: [verdict("bob", false, "best post got 4,000 likes")],
    platform: "tiktok",
  });
  assert.match(text, /drop {4}@bob {2}best post got 4,000 likes/);
});

test("the kept creators come with panel entries ready to paste", () => {
  const text = renderQualify({
    verdicts: [verdict("alice", true, "good")],
    platform: "tiktok",
  });
  const json = JSON.parse(text.slice(text.indexOf("[")));
  assert.deepEqual(json, [{ platform: "tiktok", kind: "creator", handle: "alice" }]);
});

test("with nothing kept there are no entries to paste", () => {
  const text = renderQualify({
    verdicts: [verdict("bob", false, "too small")],
    platform: "tiktok",
  });
  assert.doesNotMatch(text, /Panel entries/);
});

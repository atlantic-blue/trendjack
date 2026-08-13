import test from "node:test";
import assert from "node:assert/strict";
import { tagsFrom } from "./trends.ts";

test("a list of hashtags is read from one setting, however it is punctuated", () => {
  assert.deepEqual(tagsFrom("saas, #founder  startup"), ["saas", "founder", "startup"]);
});

test("the same hashtag twice is watched once", () => {
  assert.deepEqual(tagsFrom("saas #SAAS saas"), ["saas"]);
});

test("a setting that names no hashtags is refused rather than silently watching nothing", () => {
  assert.throws(() => tagsFrom("   "), /names no hashtags/);
  assert.throws(() => tagsFrom(",,,"), /names no hashtags/);
});

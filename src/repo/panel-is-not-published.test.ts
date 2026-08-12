import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The panel is the list of creators, hashtags and sounds we watch. Publishing it hands over
 * the only part of this repository that is expensive to reproduce, and a public repository
 * makes that a single careless `git add` away. These assertions are the guard.
 */
function isIgnored(relativePath: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", relativePath], { cwd: repoRoot });
    return true;
  } catch {
    return false;
  }
}

test("a panel file at the root is ignored", () => {
  assert.equal(isIgnored("panel.json"), true);
});

test("a panel file named after a product is ignored", () => {
  assert.equal(isIgnored("panel.macgleam.json"), true);
});

test("an invented sample panel under a fixtures directory is committable", () => {
  assert.equal(isIgnored("src/sources/fixtures/panel-sample.json"), false);
});

test("a file holding a key is ignored", () => {
  assert.equal(isIgnored(".env"), true);
  assert.equal(isIgnored("ensembledata.key"), true);
});

test("ordinary source is not ignored", () => {
  assert.equal(isIgnored("src/ranking/score.ts"), false);
});

import path from "node:path";
import os from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runCli } from "./run.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(here, "..", "panel", "fixtures", "panel-sample.json");

test("no command prints usage and fails, so a bare invocation is never mistaken for success", () => {
  const result = runCli([], {});
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /trendjack <command>/);
});

test("asking for help succeeds", () => {
  assert.equal(runCli(["--help"], {}).exitCode, 0);
});

test("an unknown command names what was typed", () => {
  const result = runCli(["digest"], {});
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Unknown command "digest"/);
});

test("the panel command reports on the panel it was pointed at", () => {
  const result = runCli(["panel"], { TRENDJACK_PANEL: samplePath });
  assert.match(result.output, /Watching 6 things\./);
});

test("a panel with problems exits non zero, so a scheduled run cannot ignore it", () => {
  const result = runCli(["panel"], { TRENDJACK_PANEL: samplePath });
  assert.equal(result.exitCode, 2);
  assert.match(result.output, /fewer than the 5 a spread signal needs/);
});

test("a missing panel fails with the reason rather than a stack trace", () => {
  const missing = path.join(os.tmpdir(), "trendjack-absent", "panel.json");
  const result = runCli(["panel"], { TRENDJACK_PANEL: missing });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /No panel at/);
});

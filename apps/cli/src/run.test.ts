import path from "node:path";
import os from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseQualify, runCli } from "./run.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(
  here,
  "..",
  "..",
  "..",
  "packages",
  "core",
  "src",
  "panel",
  "fixtures",
  "panel-sample.json",
);

test("no command prints usage and fails, so a bare invocation is never mistaken for success", async () => {
  const result = await runCli([], {});
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /trendjack <command>/);
});

test("asking for help succeeds", async () => {
  assert.equal((await runCli(["--help"], {})).exitCode, 0);
});

test("an unknown command names what was typed", async () => {
  const result = await runCli(["nonsense"], {});
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Unknown command "nonsense"/);
});

test("the panel command reports on the panel it was pointed at", async () => {
  const result = await runCli(["panel"], { TRENDJACK_PANEL: samplePath });
  assert.match(result.output, /Watching 6 things\./);
});

test("a panel with problems exits non zero, so a scheduled run cannot ignore it", async () => {
  const result = await runCli(["panel"], { TRENDJACK_PANEL: samplePath });
  assert.equal(result.exitCode, 2);
  assert.match(result.output, /fewer than the 20 the spread signal needs/);
});

test("a missing panel fails with the reason rather than a stack trace", async () => {
  const missing = path.join(os.tmpdir(), "trendjack-absent", "panel.json");
  const result = await runCli(["panel"], { TRENDJACK_PANEL: missing });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /No panel at/);
});

test("the usage names the run command, so it is discoverable without reading the source", async () => {
  assert.match(
    (await runCli(["--help"], {})).output,
    /run {6}poll the panel once and print the digest/,
  );
});

test("run without a panel fails with the reason rather than a stack trace", async () => {
  const missing = path.join(os.tmpdir(), "trendjack-absent", "panel.json");
  const result = await runCli(["run"], { TRENDJACK_PANEL: missing });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /No panel at/);
});

test("qualify keeps the handles it is given", () => {
  assert.deepEqual(parseQualify(["@Alice", "bob"]).handles, ["alice", "bob"]);
});

test("the removed product option is refused by name, not read as a creator", () => {
  const parsed = parseQualify(["--product", "macgleam", "alice"]);
  assert.deepEqual(parsed.handles, []);
  assert.match(parsed.error ?? "", /"--product" is gone/);
  assert.match(parsed.error ?? "", /one flat list of the best creators/);
});

test("the removed niche option is refused too", () => {
  assert.match(parseQualify(["--niche", "laptop tips"]).error ?? "", /"--niche" is gone/);
});

test("any other unknown option is refused rather than treated as a creator", () => {
  assert.match(parseQualify(["--limit", "5"]).error ?? "", /Unknown option "--limit"/);
});

test("a refused option makes the command fail rather than check nothing", async () => {
  const result = await runCli(["qualify", "--product", "macgleam", "alice"], {});
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /is gone/);
});

test("qualify strips an at sign and a url, so one creator cannot become two", () => {
  const parsed = parseQualify(["@Alice", "https://www.tiktok.com/@alice", "alice"]);
  assert.deepEqual(parsed.handles, ["alice"]);
});

test("qualify with no creators named fails rather than reporting nothing to do", async () => {
  const result = await runCli(["qualify"], {});
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Name at least one creator/);
});

test("the usage names the qualify command", async () => {
  assert.match((await runCli(["--help"], {})).output, /qualify {2}check creators/);
});

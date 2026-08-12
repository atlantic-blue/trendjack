import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadPanel } from "./load.ts";
import { MIN_CREATORS, renderReport, reportOn } from "./report.ts";
import type { PanelEntry } from "../contracts/types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = loadPanel(path.join(here, "fixtures", "panel-sample.json"));

function creator(handle: string): PanelEntry {
  return { platform: "tiktok", kind: "creator", handle };
}

function enough(): PanelEntry[] {
  return Array.from({ length: MIN_CREATORS }, (_unused, index) => creator(`invented${index}`));
}

test("the report counts each kind of watch per platform", () => {
  const report = reportOn(sample);
  const tiktok = report.platforms.find((each) => each.platform === "tiktok");
  assert.equal(tiktok?.creators, 3);
  assert.equal(tiktok?.hashtags, 1);
  assert.equal(tiktok?.sounds, 0);
});

test("a panel with too few creators is flagged, because spread needs a crowd", () => {
  const report = reportOn(sample);
  assert.equal(report.tooFewCreators, true);
  assert.match(renderReport(report), /fewer than the 20 the spread signal needs/);
});

test("a panel with enough creators is not flagged", () => {
  const report = reportOn({ entries: enough(), duplicates: [] });
  assert.equal(report.tooFewCreators, false);
  assert.match(renderReport(report), /nothing to flag/);
});

test("only creators count towards the crowd, since a hashtag cannot have a baseline", () => {
  const entries: PanelEntry[] = [
    ...enough().slice(0, MIN_CREATORS - 1),
    { platform: "tiktok", kind: "hashtag", handle: "mactips" },
  ];
  assert.equal(reportOn({ entries, duplicates: [] }).tooFewCreators, true);
});

test("dropped duplicates are reported rather than disappearing silently", () => {
  const report = reportOn(sample);
  assert.equal(report.duplicatesDropped.length, 1);
  assert.match(renderReport(report), /dropped a duplicate watch of tiktok creator inventedmactips/);
});

test("the rendered report leads with how much is being watched", () => {
  assert.match(renderReport(reportOn(sample)), /^Watching 6 things\./);
});

test("both platforms are listed separately", () => {
  const report = reportOn(sample);
  assert.deepEqual(
    report.platforms.map((each) => each.platform),
    ["instagram", "tiktok"],
  );
});

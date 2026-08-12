import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadPanel } from "./load.ts";
import { MIN_CREATORS_PER_NICHE, renderReport, reportOn } from "./report.ts";
import type { PanelEntry } from "../contracts/types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = loadPanel(path.join(here, "fixtures", "panel-sample.json"));

function creator(product: string, niche: string, handle: string): PanelEntry {
  return { product, niche, platform: "tiktok", kind: "creator", handle };
}

test("the report counts each kind of watch separately", () => {
  const report = reportOn(sample);
  const macTips = report.niches.find((niche) => niche.niche === "mac tips");
  assert.equal(macTips?.creators, 3);
  assert.equal(macTips?.hashtags, 1);
  assert.equal(macTips?.sounds, 0);
});

test("a niche with too few creators is flagged, because spread needs a crowd", () => {
  const report = reportOn(sample);
  assert.ok(report.thinNiches.some((niche) => niche.niche === "mac tips"));
  assert.match(renderReport(report), /fewer than the 5 a spread signal needs/);
});

test("a niche with enough creators is not flagged", () => {
  const entries = Array.from({ length: MIN_CREATORS_PER_NICHE }, (_unused, index) =>
    creator("macgleam", "mac tips", `invented${index}`),
  );
  const report = reportOn({ entries, duplicates: [] });
  assert.deepEqual(report.thinNiches, []);
});

test("a product watched only through hashtags can never be scored, so it is flagged", () => {
  const report = reportOn({
    entries: [
      { product: "myna", niche: "accents", platform: "tiktok", kind: "hashtag", handle: "accent" },
    ],
    duplicates: [],
  });
  assert.deepEqual(report.productsWithoutCreators, ["myna"]);
  assert.match(renderReport(report), /nothing there can be scored/);
});

test("a product with a creator is not flagged", () => {
  const report = reportOn({ entries: [creator("myna", "accents", "someone")], duplicates: [] });
  assert.deepEqual(report.productsWithoutCreators, []);
});

test("dropped duplicates are reported rather than disappearing silently", () => {
  const report = reportOn(sample);
  assert.equal(report.duplicatesDropped.length, 1);
  assert.match(renderReport(report), /dropped a duplicate watch of tiktok creator inventedmactips/);
});

test("a healthy panel says so instead of printing an empty warning block", () => {
  const entries = Array.from({ length: MIN_CREATORS_PER_NICHE }, (_unused, index) =>
    creator("macgleam", "mac tips", `invented${index}`),
  );
  assert.match(renderReport(reportOn({ entries, duplicates: [] })), /nothing to flag/);
});

test("the rendered report leads with how much is being watched", () => {
  assert.match(renderReport(reportOn(sample)), /^Watching 6 things\./);
});

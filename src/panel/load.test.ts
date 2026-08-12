import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PANEL_PATH,
  PanelInvalidError,
  PanelNotFoundError,
  loadPanel,
  panelPathFromEnvironment,
} from "./load.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(here, "fixtures", "panel-sample.json");

function writeTemporaryPanel(contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trendjack-panel-"));
  const panelPath = path.join(directory, "panel.json");
  fs.writeFileSync(panelPath, contents);
  return panelPath;
}

test("the sample panel loads", () => {
  const loaded = loadPanel(samplePath);
  assert.ok(loaded.entries.length > 0);
});

test("the same creator written two ways is watched once", () => {
  const loaded = loadPanel(samplePath);
  const handles = loaded.entries
    .filter((entry) => entry.kind === "creator" && entry.platform === "tiktok")
    .map((entry) => entry.handle);
  assert.equal(new Set(handles).size, handles.length);
  assert.equal(loaded.duplicates.length, 1);
  assert.equal(loaded.duplicates[0]?.handle, "inventedmactips");
});

test("a url in the file becomes a plain handle", () => {
  const loaded = loadPanel(samplePath);
  assert.ok(loaded.entries.some((entry) => entry.handle === "invented.second"));
  assert.ok(!loaded.entries.some((entry) => entry.handle.includes("http")));
});

test("a missing panel says where it looked and that it is deliberately not in the repository", () => {
  const missing = path.join(os.tmpdir(), "trendjack-does-not-exist", "panel.json");
  assert.throws(
    () => loadPanel(missing),
    (error: unknown) => {
      assert.ok(error instanceof PanelNotFoundError);
      assert.match(error.message, /TRENDJACK_PANEL/);
      assert.match(error.message, /not in this repository/);
      return true;
    },
  );
});

test("a panel that is not JSON is rejected with the reason", () => {
  const panelPath = writeTemporaryPanel("{ this is not json");
  assert.throws(
    () => loadPanel(panelPath),
    (error: unknown) => error instanceof PanelInvalidError && /not valid JSON/.test(error.message),
  );
});

test("an empty panel is a failure, not a quiet success", () => {
  const panelPath = writeTemporaryPanel("[]");
  assert.throws(
    () => loadPanel(panelPath),
    (error: unknown) =>
      error instanceof PanelInvalidError && /nothing to watch/.test(error.message),
  );
});

test("a panel entry missing a field names the field", () => {
  const panelPath = writeTemporaryPanel(
    JSON.stringify([{ product: "macgleam", platform: "tiktok", kind: "creator", handle: "a" }]),
  );
  assert.throws(
    () => loadPanel(panelPath),
    (error: unknown) => error instanceof PanelInvalidError && /niche/.test(error.message),
  );
});

test("the panel path comes from the environment when it is set", () => {
  assert.equal(
    panelPathFromEnvironment({ TRENDJACK_PANEL: "/tmp/elsewhere.json" }),
    "/tmp/elsewhere.json",
  );
});

test("an empty environment variable falls back rather than pointing at nothing", () => {
  assert.equal(panelPathFromEnvironment({ TRENDJACK_PANEL: "   " }), DEFAULT_PANEL_PATH);
  assert.equal(panelPathFromEnvironment({}), DEFAULT_PANEL_PATH);
});

test("the default panel path is outside this repository", () => {
  const repoRoot = path.resolve(here, "..", "..");
  assert.ok(!DEFAULT_PANEL_PATH.startsWith(repoRoot));
});

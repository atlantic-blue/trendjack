import test from "node:test";
import assert from "node:assert/strict";
import { normaliseEntry, normaliseHandle, watchKey } from "./normalise.ts";
import type { PanelEntry } from "../contracts/types.ts";

test("an at sign is not part of a handle", () => {
  assert.equal(normaliseHandle("@somecreator"), "somecreator");
});

test("a hash is not part of a hashtag", () => {
  assert.equal(normaliseHandle("#mactips"), "mactips");
});

test("a profile url reduces to the handle inside it", () => {
  assert.equal(normaliseHandle("https://www.tiktok.com/@somecreator"), "somecreator");
  assert.equal(normaliseHandle("https://www.instagram.com/somecreator/"), "somecreator");
});

test("capitals and surrounding space do not make a second creator", () => {
  assert.equal(normaliseHandle("  SomeCreator "), "somecreator");
});

test("dots and dashes inside a handle survive, because they are part of it", () => {
  assert.equal(normaliseHandle("@some.creator-two"), "some.creator-two");
});

const entry: PanelEntry = {
  product: "MacGleam",
  niche: "Mac Tips",
  platform: "tiktok",
  kind: "creator",
  handle: "@SomeCreator",
};

test("an entry normalises its product, niche and handle together", () => {
  const normalised = normaliseEntry(entry);
  assert.equal(normalised.product, "macgleam");
  assert.equal(normalised.niche, "mac tips");
  assert.equal(normalised.handle, "somecreator");
});

test("the same creator written three ways produces one watch key", () => {
  const asUrl = { ...entry, handle: "https://www.tiktok.com/@somecreator" };
  const asBare = { ...entry, handle: "somecreator" };
  const keys = new Set([entry, asUrl, asBare].map((each) => watchKey(normaliseEntry(each))));
  assert.equal(keys.size, 1);
});

test("the same handle on two platforms is two watches, not one", () => {
  const onInstagram: PanelEntry = { ...entry, platform: "instagram" };
  assert.notEqual(watchKey(normaliseEntry(entry)), watchKey(normaliseEntry(onInstagram)));
});

test("a creator and a hashtag of the same name are two watches", () => {
  const asHashtag: PanelEntry = { ...entry, kind: "hashtag" };
  assert.notEqual(watchKey(normaliseEntry(entry)), watchKey(normaliseEntry(asHashtag)));
});

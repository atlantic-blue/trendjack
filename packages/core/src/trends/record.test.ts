import test from "node:test";
import assert from "node:assert/strict";
import type { Store, TagStatsSource } from "../contracts/ports.ts";
import { TagUnavailableError } from "../contracts/ports.ts";
import type { TagReading } from "../contracts/types.ts";
import { DAY_MS } from "../ranking/constants.ts";
import { InMemoryStore } from "../store/memory.ts";
import { EveryTagFailedError, recordTagReadings } from "./record.ts";

const NOW = 1_786_600_000_000;

function source(answers: Record<string, number | Error>): TagStatsSource {
  return {
    platform: "tiktok",
    async readingFor(hashtag: string): Promise<TagReading> {
      const answer = answers[hashtag];
      if (answer === undefined) throw new TagUnavailableError("tiktok", hashtag, "not configured");
      if (answer instanceof Error) throw answer;
      return {
        hashtag,
        platform: "tiktok",
        observedAt: NOW,
        videoCount: answer,
        viewCount: answer * 1_000,
      };
    },
  };
}

test("every hashtag asked for is stored", async () => {
  const store = new InMemoryStore();
  const report = await recordTagReadings({
    hashtags: ["storytime", "grwm"],
    source: source({ storytime: 60_000_000, grwm: 4_000_000 }),
    store,
    now: NOW,
  });
  assert.equal(report.recorded.length, 2);
  assert.equal((await store.tagReadingsFor("storytime", 0))[0]?.videoCount, 60_000_000);
  assert.equal((await store.tagReadingsFor("grwm", 0))[0]?.videoCount, 4_000_000);
});

test("one hashtag failing does not cost the round, and the reason is carried back", async () => {
  const store = new InMemoryStore();
  const report = await recordTagReadings({
    hashtags: ["storytime", "broken"],
    source: source({ storytime: 10, broken: new Error("the page refused") }),
    store,
    now: NOW,
  });
  assert.equal(report.recorded.length, 1);
  assert.deepEqual(report.failures, [{ hashtag: "broken", reason: "the page refused" }]);
  assert.equal(report.asked, 2);
});

test("a round where nothing answered is raised, never reported as a quiet day", async () => {
  await assert.rejects(
    recordTagReadings({
      hashtags: ["one", "two"],
      source: source({ one: new Error("refused"), two: new Error("refused") }),
      store: new InMemoryStore(),
      now: NOW,
    }),
    EveryTagFailedError,
  );
});

test("the first round reports a reading and no growth", async () => {
  const report = await recordTagReadings({
    hashtags: ["storytime"],
    source: source({ storytime: 1_000 }),
    store: new InMemoryStore(),
    now: NOW,
  });
  assert.equal(report.growth[0]?.latest.videoCount, 1_000);
  assert.equal(report.growth[0]?.addedVideos, undefined);
});

test("a second round reports what changed since the first", async () => {
  const store = new InMemoryStore();
  await store.appendTagReading({
    hashtag: "storytime",
    platform: "tiktok",
    observedAt: NOW - DAY_MS,
    videoCount: 900,
    viewCount: 900_000,
  });
  const report = await recordTagReadings({
    hashtags: ["storytime"],
    source: source({ storytime: 1_000 }),
    store,
    now: NOW,
  });
  assert.equal(report.growth[0]?.addedVideos, 100);
  assert.equal(report.growth[0]?.videosPerDay, 100);
});

test("a reading older than the comparison window is not used", async () => {
  const store = new InMemoryStore();
  await store.appendTagReading({
    hashtag: "storytime",
    platform: "tiktok",
    observedAt: NOW - 30 * DAY_MS,
    videoCount: 1,
    viewCount: 1_000,
  });
  const report = await recordTagReadings({
    hashtags: ["storytime"],
    source: source({ storytime: 1_000 }),
    store,
    now: NOW,
    compareWindowMs: 7 * DAY_MS,
  });
  assert.equal(report.growth[0]?.addedVideos, undefined);
});

test("the reading is stored even when working out the growth then fails", async () => {
  const kept = new InMemoryStore();
  const failing = {
    appendTagReading: (reading: TagReading) => kept.appendTagReading(reading),
    tagReadingsFor: async () => {
      throw new Error("the history could not be read");
    },
  } as unknown as Store;

  await assert.rejects(
    recordTagReadings({
      hashtags: ["storytime"],
      source: source({ storytime: 1_000 }),
      store: failing,
      now: NOW,
    }),
    /history could not be read/,
  );
  assert.equal((await kept.tagReadingsFor("storytime", 0)).length, 1);
});

test("the pause runs between hashtags and not before the first", async () => {
  let paused = 0;
  await recordTagReadings({
    hashtags: ["one", "two", "three"],
    source: source({ one: 1, two: 2, three: 3 }),
    store: new InMemoryStore(),
    now: NOW,
    pace: async () => {
      paused += 1;
    },
  });
  assert.equal(paused, 2);
});

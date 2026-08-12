import test from "node:test";
import assert from "node:assert/strict";
import { describeStoreConformance } from "./conformance.ts";
import { InMemoryStore, ObservationConflictError } from "./memory.ts";
import type { PostId } from "../contracts/types.ts";

describeStoreConformance("the in memory store", async () => new InMemoryStore());

test("the conflict carries the post and the moment, so a caller can say what disagreed", async () => {
  const store = new InMemoryStore();
  const postId = "p1" as PostId;
  await store.appendObservation({ postId, observedAt: 1_000, views: 10 });
  await assert.rejects(
    () => store.appendObservation({ postId, observedAt: 1_000, views: 99 }),
    (error: unknown) => {
      assert.ok(error instanceof ObservationConflictError);
      assert.equal(error.postId, postId);
      assert.equal(error.observedAt, 1_000);
      return true;
    },
  );
});

test("two stores do not share state", async () => {
  const first = new InMemoryStore();
  await first.appendObservation({ postId: "p1" as PostId, observedAt: 1_000, views: 10 });
  assert.deepEqual(await new InMemoryStore().observationsFor("p1" as PostId), []);
});

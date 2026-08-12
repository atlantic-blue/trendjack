import test from "node:test";
import assert from "node:assert/strict";
import { storeFor } from "./store-for.ts";
import { InMemoryStore } from "../store/memory.ts";
import { DynamoStore } from "../store/dynamo.ts";

test("with no table configured the run keeps nothing, and says so out loud", () => {
  const chosen = storeFor({});
  assert.ok(chosen.store instanceof InMemoryStore);
  assert.match(chosen.note, /Nothing was kept/);
  assert.match(chosen.note, /cannot be compared with any other/);
});

test("a table name that is only whitespace counts as no table", () => {
  assert.ok(storeFor({ TRENDJACK_TABLE: "   " }).store instanceof InMemoryStore);
});

test("with a table configured the history is kept, and the note names where", () => {
  const chosen = storeFor({ TRENDJACK_TABLE: "trendjack" });
  assert.ok(chosen.store instanceof DynamoStore);
  assert.equal(chosen.note, "Kept in trendjack.");
});

test("a local endpoint is honoured, so the same path can be exercised against a container", () => {
  const chosen = storeFor({
    TRENDJACK_TABLE: "trendjack",
    TRENDJACK_DYNAMO_ENDPOINT: "http://localhost:8000",
  });
  assert.ok(chosen.store instanceof DynamoStore);
});

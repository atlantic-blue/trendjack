import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { Store } from "@trendjack/core/contracts/ports.ts";
import { DynamoStore } from "@trendjack/core/store/dynamo.ts";
import { InMemoryStore } from "@trendjack/core/store/memory.ts";

export interface StoreChoice {
  store: Store;
  /** What to tell the operator, so a run that kept nothing never looks like one that did. */
  note: string;
}

/**
 * A run with nowhere to write is still useful for trying the panel out, but it can never show a
 * rate, because a rate needs two readings taken apart in time and nothing survives the process.
 * So the choice is reported rather than made silently.
 */
export function storeFor(environment: NodeJS.ProcessEnv): StoreChoice {
  const table = environment["TRENDJACK_TABLE"]?.trim();
  if (!table) {
    return {
      store: new InMemoryStore(),
      note: "Nothing was kept: TRENDJACK_TABLE is not set, so this round cannot be compared with any other.",
    };
  }
  const region = environment["AWS_REGION"]?.trim() || "eu-west-1";
  const endpoint = environment["TRENDJACK_DYNAMO_ENDPOINT"]?.trim();
  const client = new DynamoDBClient(endpoint ? { region, endpoint } : { region });
  return { store: new DynamoStore({ client, tableName: table }), note: `Kept in ${table}.` };
}

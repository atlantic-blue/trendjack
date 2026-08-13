import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoStore } from "@trendjack/core/store/dynamo.ts";
import { DAY_MS } from "@trendjack/core/ranking/constants.ts";

const store = new DynamoStore({
  client: new DynamoDBClient({ region: "eu-west-1" }),
  tableName: "trendjack",
});
const posts = await store.postsSince(Date.now() - 30 * DAY_MS);
const seen = new Set<string>();
for (const post of posts) {
  if (seen.has(post.creatorId)) continue;
  seen.add(post.creatorId);
  console.log(new URL(post.url).pathname);
}

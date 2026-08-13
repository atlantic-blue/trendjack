import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoStore } from "@trendjack/core/store/dynamo.ts";
import { DAY_MS } from "@trendjack/core/ranking/constants.ts";

const store = new DynamoStore({
  client: new DynamoDBClient({ region: "eu-west-1" }),
  tableName: "trendjack",
});
const posts = await store.postsSince(Date.now() - 30 * DAY_MS);
const own = posts.filter((each) => /original sound|sonido original|son original/i.test(each.soundId ?? ""));
console.log(`posts: ${posts.length}`);
console.log(`posts on the creator's own sound: ${own.length} (${Math.round((own.length / posts.length) * 100)}%)`);
console.log(`posts on a shared or licensed sound: ${posts.length - own.length}`);
const perCreator = new Map<string, number>();
for (const post of posts) perCreator.set(post.creatorId, (perCreator.get(post.creatorId) ?? 0) + 1);
console.log(`creators: ${perCreator.size}, posts per creator median ${[...perCreator.values()].sort((a, b) => a - b)[Math.floor(perCreator.size / 2)]}`);
const newest = Math.max(...posts.map((each) => each.postedAt));
const oldest = Math.min(...posts.map((each) => each.postedAt));
console.log(`newest post ${Math.round((Date.now() - newest) / (60 * 60 * 1000))}h old, oldest ${Math.round((Date.now() - oldest) / DAY_MS)}d old`);
const last24 = posts.filter((each) => Date.now() - each.postedAt <= DAY_MS);
console.log(`posts in the last 24 hours: ${last24.length} from ${new Set(last24.map((e) => e.creatorId)).size} creators`);

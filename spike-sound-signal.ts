/**
 * Read only spike. Scores sounds instead of videos, over the history already in the table.
 *
 * Two measures, both computable from a single daily poll, because every post carries its own
 * posted time:
 *   adoption burst  distinct creators who used a sound in the last 24 hours, against the
 *                   daily rate over the 7 days before that
 *   lift            the median of "this post's views divided by its creator's own baseline",
 *                   over the posts using that sound
 *
 * Nothing here writes. Every call is a query.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoStore } from "@trendjack/core/store/dynamo.ts";
import { computeBaseline, median, type SettledPost } from "@trendjack/core/ranking/baseline.ts";
import { BASELINE_POSTS, DAY_MS, SETTLED_AFTER_MS } from "@trendjack/core/ranking/constants.ts";
import type { CreatorId, Post } from "@trendjack/core/contracts/types.ts";

const LOOKBACK_DAYS = 30;
const TOP = 12;

interface Scored {
  post: Post;
  views: number;
  lift: number;
}

async function main(): Promise<void> {
  const table = process.env["TRENDJACK_TABLE"] ?? "trendjack";
  const store = new DynamoStore({
    client: new DynamoDBClient({ region: process.env["AWS_REGION"] ?? "eu-west-1" }),
    tableName: table,
  });
  const now = Date.now();

  const posts = await store.postsSince(now - LOOKBACK_DAYS * DAY_MS);
  const creators = new Set(posts.map((each) => each.creatorId));
  console.log(
    `Read ${posts.length} posts from ${creators.size} creators over ${LOOKBACK_DAYS} days.`,
  );
  console.log(`Posts carrying a sound key: ${posts.filter((each) => each.soundId).length}.`);

  const baselines = new Map<string, number>();
  for (const creatorId of creators) {
    const value = await baselineFor(store, creatorId as CreatorId, now);
    if (value !== undefined) baselines.set(creatorId, value);
  }
  console.log(`Creators with a usable baseline: ${baselines.size} of ${creators.size}.\n`);

  const scored: Scored[] = [];
  for (const post of posts) {
    const baseline = baselines.get(post.creatorId);
    if (baseline === undefined) continue;
    const observations = await store.observationsFor(post.postId);
    const views = observations.map((each) => each.views).filter(isNumber).at(-1);
    if (views === undefined) continue;
    scored.push({ post, views, lift: views / baseline });
  }

  reportSounds(scored, now);
  reportCreatorConcentration(scored);
  reportWhatTheTopWouldBe(scored);
}

async function baselineFor(
  store: DynamoStore,
  creatorId: CreatorId,
  now: number,
): Promise<number | undefined> {
  const settledPosts = await store.settledPostsFor(creatorId, now - SETTLED_AFTER_MS, BASELINE_POSTS);
  const settled: SettledPost[] = [];
  for (const post of settledPosts) {
    const latest = (await store.observationsFor(post.postId)).at(-1);
    if (latest) settled.push({ post, latest });
  }
  const outcome = computeBaseline({ creatorId, metric: "views", settled, now });
  return outcome.ok ? outcome.baseline.value : undefined;
}

/** Adoption burst and lift, per sound. */
function reportSounds(scored: Scored[], now: number): void {
  const bySound = new Map<string, Scored[]>();
  for (const each of scored) {
    if (!each.post.soundId) continue;
    bySound.set(each.post.soundId, [...(bySound.get(each.post.soundId) ?? []), each]);
  }

  const rows = [...bySound.entries()].map(([soundId, uses]) => {
    const recent = uses.filter((each) => now - each.post.postedAt <= DAY_MS);
    const prior = uses.filter((each) => {
      const age = now - each.post.postedAt;
      return age > DAY_MS && age <= 8 * DAY_MS;
    });
    const adopters24 = new Set(recent.map((each) => each.post.creatorId)).size;
    const adoptersPrior = new Set(prior.map((each) => each.post.creatorId)).size;
    return {
      soundId,
      uses: uses.length,
      creators: new Set(uses.map((each) => each.post.creatorId)).size,
      adopters24,
      adoptersPrior,
      burst: adopters24 / (adoptersPrior / 7 + 0.2),
      medianLift: median(uses.map((each) => each.lift)),
    };
  });

  const shared = rows.filter((row) => row.creators > 1);
  console.log(`SOUNDS: ${rows.length} distinct, ${shared.length} used by more than one creator.`);
  console.log(`Any sound with 2 or more adopters in the last 24 hours: ${rows.filter((r) => r.adopters24 >= 2).length}.\n`);

  console.log(`Top ${TOP} sounds by median lift, among those used by more than one creator:`);
  for (const row of shared.sort((a, b) => b.medianLift - a.medianLift).slice(0, TOP)) {
    console.log(
      `  lift ${row.medianLift.toFixed(2)}  creators ${row.creators}  uses ${row.uses}  ` +
        `adopters24 ${row.adopters24}  prior ${row.adoptersPrior}  ${row.soundId.slice(0, 60)}`,
    );
  }

  console.log(`\nTop ${TOP} sounds by adoption burst:`);
  for (const row of rows.sort((a, b) => b.burst - a.burst).slice(0, TOP)) {
    console.log(
      `  burst ${row.burst.toFixed(2)}  adopters24 ${row.adopters24}  prior ${row.adoptersPrior}  ` +
        `lift ${row.medianLift.toFixed(2)}  ${row.soundId.slice(0, 60)}`,
    );
  }
}

/** How much of the top comes from how few accounts. This is the complaint, measured. */
function reportCreatorConcentration(scored: Scored[]): void {
  const byViews = [...scored].sort((a, b) => b.views - a.views).slice(0, 20);
  const byLift = [...scored].sort((a, b) => b.lift - a.lift).slice(0, 20);
  console.log(
    `\nCONCENTRATION: the top 20 by raw views come from ` +
      `${new Set(byViews.map((each) => each.post.creatorId)).size} creators.`,
  );
  console.log(
    `               the top 20 by lift come from ` +
      `${new Set(byLift.map((each) => each.post.creatorId)).size} creators.`,
  );
  const overlap = byViews.filter((each) => byLift.some((other) => other.post.postId === each.post.postId));
  console.log(`               ${overlap.length} of 20 videos appear in both lists.`);
}

/** What the page would show if the unit stayed a video but the sort became lift. */
function reportWhatTheTopWouldBe(scored: Scored[]): void {
  console.log(`\nTop ${TOP} videos by lift, which is what a lift sorted page would show:`);
  for (const each of [...scored].sort((a, b) => b.lift - a.lift).slice(0, TOP)) {
    const ageHours = Math.round((Date.now() - each.post.postedAt) / (60 * 60 * 1000));
    console.log(
      `  lift ${each.lift.toFixed(1).padStart(6)}  views ${String(each.views).padStart(9)}  ` +
        `age ${String(ageHours).padStart(4)}h  ${each.post.url}`,
    );
  }
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}

await main();

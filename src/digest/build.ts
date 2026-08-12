import type { Store } from "../contracts/ports.ts";
import type { Observation, Panel, Post, Score } from "../contracts/types.ts";
import type { SettledPost } from "../ranking/baseline.ts";
import { BASELINE_POSTS, HOUR_MS, SETTLED_AFTER_MS } from "../ranking/constants.ts";
import { rank, scorePost, type ScoreOutcome } from "../ranking/score.ts";

export interface DigestRow {
  post: Post;
  score: Score;
  product?: string;
  niche?: string;
}

export interface Digest {
  generatedAt: number;
  windowHours: number;
  postsConsidered: number;
  creatorsSeen: number;
  candidates: DigestRow[];
  heldBack: DigestRow[];
  unscored: { postId: string; reason: string }[];
}

export interface BuildOptions {
  store: Store;
  panel: Panel;
  now: number;
  windowHours: number;
  limit: number;
}

/**
 * Scores everything inside the window and sorts it.
 *
 * Spread needs two passes: whether other creators are breaking out on the same shape can only
 * be known once every post has a provisional level, so the first pass scores with no spread and
 * the second uses what the first found.
 */
export async function buildDigest(options: BuildOptions): Promise<Digest> {
  const since = options.now - options.windowHours * HOUR_MS;
  const posts = await options.store.postsSince(since);
  const gathered = await Promise.all(posts.map((post) => gather(options.store, post, options.now)));

  const provisional = gathered.map((each) =>
    score(each, { spread: 0, using: 0, now: options.now }),
  );
  const breakoutCreators = breakoutCreatorsBySound(gathered, provisional);
  const creatorsUsing = allCreatorsBySound(gathered);

  const outcomes = gathered.map((each) =>
    score(each, {
      spread: countOthers(breakoutCreators, each),
      using: countOthers(creatorsUsing, each),
      now: options.now,
    }),
  );

  const { ranked, suppressed } = rank(outcomes);
  const byPost = new Map(posts.map((post) => [post.postId as string, post]));
  const attribution = attributionFrom(options.panel);

  return {
    generatedAt: options.now,
    windowHours: options.windowHours,
    postsConsidered: posts.length,
    creatorsSeen: new Set(posts.map((post) => post.creatorId)).size,
    candidates: ranked.slice(0, options.limit).map((each) => row(each, byPost, attribution)),
    heldBack: suppressed.map((each) => row(each, byPost, attribution)),
    unscored: outcomes
      .filter((each) => !each.scored)
      .map((each) => ({ postId: each.postId, reason: each.reason })),
  };
}

interface Gathered {
  post: Post;
  observations: Observation[];
  settled: SettledPost[];
}

async function gather(store: Store, post: Post, now: number): Promise<Gathered> {
  const observations = await store.observationsFor(post.postId);
  const settledPosts = await store.settledPostsFor(
    post.creatorId,
    now - SETTLED_AFTER_MS,
    BASELINE_POSTS,
  );
  const settled = await Promise.all(
    settledPosts.map(async (each) => {
      const history = await store.observationsFor(each.postId);
      return { post: each, latest: history.at(-1) };
    }),
  );
  return {
    post,
    observations,
    settled: settled.filter((each): each is SettledPost => each.latest !== undefined),
  };
}

function score(
  gathered: Gathered,
  context: { spread: number; using: number; now: number },
): ScoreOutcome {
  return scorePost({
    post: gathered.post,
    observations: gathered.observations,
    settled: gathered.settled,
    context: {
      spread: context.spread,
      panelCreatorsUsingSound: context.using,
      now: context.now,
    },
  });
}

/** Creators whose post on a given sound is already beating their own normal by three times. */
function breakoutCreatorsBySound(
  gathered: Gathered[],
  outcomes: ScoreOutcome[],
): Map<string, Set<string>> {
  const byPostId = new Map(
    outcomes.filter((each) => each.scored).map((each) => [each.score.postId as string, each.score]),
  );
  return collect(gathered, (each) => (byPostId.get(each.post.postId)?.features.outlier ?? 0) >= 3);
}

function allCreatorsBySound(gathered: Gathered[]): Map<string, Set<string>> {
  return collect(gathered, () => true);
}

function collect(
  gathered: Gathered[],
  keep: (each: Gathered) => boolean,
): Map<string, Set<string>> {
  const bySound = new Map<string, Set<string>>();
  for (const each of gathered) {
    if (!each.post.soundId || !keep(each)) continue;
    const creators = bySound.get(each.post.soundId) ?? new Set<string>();
    creators.add(each.post.creatorId);
    bySound.set(each.post.soundId, creators);
  }
  return bySound;
}

/** A creator is never counted as corroborating themselves. */
function countOthers(bySound: Map<string, Set<string>>, each: Gathered): number {
  if (!each.post.soundId) return 0;
  const creators = bySound.get(each.post.soundId);
  if (!creators) return 0;
  return [...creators].filter((creator) => creator !== each.post.creatorId).length;
}

function attributionFrom(panel: Panel): Map<string, { product: string; niche: string }> {
  const byCreator = new Map<string, { product: string; niche: string }>();
  for (const entry of panel) {
    if (entry.kind !== "creator" || byCreator.has(entry.handle)) continue;
    byCreator.set(entry.handle, { product: entry.product, niche: entry.niche });
  }
  return byCreator;
}

function row(
  score: Score,
  byPost: Map<string, Post>,
  attribution: Map<string, { product: string; niche: string }>,
): DigestRow {
  const post = byPost.get(score.postId);
  if (!post) throw new Error(`Scored ${score.postId} but the post is not in the window`);
  const belongsTo = attribution.get(post.creatorId);
  return {
    post,
    score,
    ...(belongsTo ? { product: belongsTo.product, niche: belongsTo.niche } : {}),
  };
}

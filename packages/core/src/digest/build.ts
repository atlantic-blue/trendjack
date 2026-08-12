import type { Store } from "../contracts/ports.ts";
import type { Observation, Panel, Post, Score } from "../contracts/types.ts";
import type { SettledPost } from "../ranking/baseline.ts";
import {
  BASELINE_POSTS,
  CANDIDATE_OUTLIER,
  HOUR_MS,
  PROVEN_LIKES,
  PROVEN_WINDOW_HOURS,
  SETTLED_AFTER_MS,
} from "../ranking/constants.ts";
import { rank, scorePost, type ScoreOutcome } from "../ranking/score.ts";

export interface DigestRow {
  post: Post;
  score: Score;
}

/**
 * A video that cleared the like floor. It carries no score, because a large account posts these
 * as a matter of course and the score would be near its normal. The point is the format, not
 * the growth.
 */
export interface ProvenRow {
  post: Post;
  likes: number;
}

export interface Digest {
  generatedAt: number;
  windowHours: number;
  postsConsidered: number;
  creatorsSeen: number;
  candidates: DigestRow[];
  proven: ProvenRow[];
  heldBack: DigestRow[];
  unscored: { postId: string; reason: string }[];
}

export interface BuildOptions {
  store: Store;
  panel: Panel;
  now: number;
  windowHours: number;
  limit: number;
  /** Likes a video needs to count as a format that works at scale. */
  provenLikes?: number;
  /** How far back the proven list looks. Far wider than the window for candidates. */
  provenWindowHours?: number;
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
  const provenSince = options.now - (options.provenWindowHours ?? PROVEN_WINDOW_HOURS) * HOUR_MS;
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

  return {
    generatedAt: options.now,
    windowHours: options.windowHours,
    postsConsidered: posts.length,
    creatorsSeen: new Set(posts.map((post) => post.creatorId)).size,
    candidates: ranked
      .filter((score) => score.features.outlier >= CANDIDATE_OUTLIER)
      .slice(0, options.limit)
      .map((each) => row(each, byPost)),
    proven: await provenFrom(options, provenSince),
    heldBack: suppressed.map((each) => row(each, byPost)),
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

function row(score: Score, byPost: Map<string, Post>): DigestRow {
  const post = byPost.get(score.postId);
  if (!post) throw new Error(`Scored ${score.postId} but the post is not in the window`);
  return { post, score };
}

/**
 * Videos that reached the like floor, most liked first.
 *
 * This list does not use the score at all. A big account posts videos with this many likes all
 * the time, so the score for one of them sits near their normal and the ranking would drop it.
 * The two lists answer different questions: the candidates grow now, these worked at scale.
 */
async function provenFrom(options: BuildOptions, since: number): Promise<ProvenRow[]> {
  const floor = options.provenLikes ?? PROVEN_LIKES;
  const rows: ProvenRow[] = [];
  for (const post of await options.store.postsSince(since)) {
    const likes = mostLikes(await options.store.observationsFor(post.postId));
    if (likes === undefined || likes < floor) continue;
    rows.push({ post, likes });
  }
  return rows.sort((left, right) => right.likes - left.likes).slice(0, options.limit);
}

/** The largest like count seen, because a later reading can be missing the field. */
function mostLikes(observations: Observation[]): number | undefined {
  const counts = observations
    .map((each) => each.likes)
    .filter((each): each is number => each !== undefined);
  return counts.length === 0 ? undefined : Math.max(...counts);
}

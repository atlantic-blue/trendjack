import type { Store } from "../contracts/ports.ts";
import type {
  Baseline,
  CreatorId,
  Observation,
  Post,
  PostId,
  Score,
  TagReading,
} from "../contracts/types.ts";

/**
 * Raised when a second, different reading claims a moment that has already been recorded.
 *
 * The history is append only because replaying a proposed change to the heuristic over the
 * whole past is what stops the weights being guesses, and that replay is worthless if the past
 * can be edited. Re-recording an identical reading is harmless and allowed, since a retried
 * poll will do exactly that. Recording a different one is a contradiction and says something
 * upstream is wrong, so it is raised rather than absorbed.
 */
export class ObservationConflictError extends Error {
  readonly postId: PostId;
  readonly observedAt: number;

  constructor(postId: PostId, observedAt: number) {
    super(`A different observation of ${postId} at ${observedAt} is already recorded`);
    this.name = "ObservationConflictError";
    this.postId = postId;
    this.observedAt = observedAt;
  }
}

export class InMemoryStore implements Store {
  readonly #posts = new Map<PostId, Post>();
  readonly #observations = new Map<PostId, Map<number, Observation>>();
  readonly #baselines = new Map<string, Baseline>();
  readonly #scores: Score[] = [];
  readonly #tagReadings = new Map<string, Map<number, TagReading>>();

  async appendTagReading(reading: TagReading): Promise<void> {
    const forTag = this.#tagReadings.get(reading.hashtag) ?? new Map<number, TagReading>();
    forTag.set(reading.observedAt, reading);
    this.#tagReadings.set(reading.hashtag, forTag);
  }

  async tagReadingsSince(since: number): Promise<TagReading[]> {
    return [...this.#tagReadings.values()]
      .flatMap((forTag) => [...forTag.values()])
      .filter((reading) => reading.observedAt >= since)
      .sort((left, right) => left.observedAt - right.observedAt);
  }

  async tagReadingsFor(hashtag: string, since: number): Promise<TagReading[]> {
    return [...(this.#tagReadings.get(hashtag)?.values() ?? [])]
      .filter((reading) => reading.observedAt >= since)
      .sort((left, right) => left.observedAt - right.observedAt);
  }

  async putPost(post: Post): Promise<void> {
    this.#posts.set(post.postId, post);
  }

  async appendObservation(observation: Observation): Promise<void> {
    const forPost = this.#observations.get(observation.postId) ?? new Map<number, Observation>();
    const existing = forPost.get(observation.observedAt);
    if (existing && !sameReading(existing, observation)) {
      throw new ObservationConflictError(observation.postId, observation.observedAt);
    }
    forPost.set(observation.observedAt, observation);
    this.#observations.set(observation.postId, forPost);
  }

  async observationsFor(postId: PostId): Promise<Observation[]> {
    const forPost = this.#observations.get(postId);
    if (!forPost) return [];
    return [...forPost.values()].sort((left, right) => left.observedAt - right.observedAt);
  }

  async settledPostsFor(creatorId: CreatorId, before: number, limit: number): Promise<Post[]> {
    return [...this.#posts.values()]
      .filter((post) => post.creatorId === creatorId && post.postedAt <= before)
      .sort((left, right) => right.postedAt - left.postedAt)
      .slice(0, limit);
  }

  async postsSince(since: number): Promise<Post[]> {
    return [...this.#posts.values()]
      .filter((post) => post.postedAt >= since)
      .sort((left, right) => right.postedAt - left.postedAt);
  }

  async putBaseline(baseline: Baseline): Promise<void> {
    this.#baselines.set(`${baseline.creatorId}|${baseline.metric}`, baseline);
  }

  async putScore(score: Score): Promise<void> {
    this.#scores.push(score);
  }

  async scoresSince(since: number): Promise<Score[]> {
    return this.#scores
      .filter((score) => score.computedAt >= since)
      .sort((left, right) => right.computedAt - left.computedAt);
  }
}

function sameReading(left: Observation, right: Observation): boolean {
  return (
    left.views === right.views &&
    left.likes === right.likes &&
    left.comments === right.comments &&
    left.shares === right.shares
  );
}

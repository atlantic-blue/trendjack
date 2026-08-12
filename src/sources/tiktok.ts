import { z } from "zod";
import {
  EmptySourceResultError,
  SourceContractError,
  type Sighting,
  type TrendSource,
} from "../contracts/ports.ts";
import type { CreatorId, PostId, Post, SoundId } from "../contracts/types.ts";

/** Runs the tool and returns its standard output. Injected so tests never touch the network. */
export type CommandRunner = (args: string[]) => Promise<string>;

/**
 * yt-dlp reports counts to about four significant figures, so a large number arrives rounded:
 * 1,100,000 rather than 1,138,204. Two polls of a big video can therefore read identically
 * while it is still climbing hard. The resolution travels with the reading so that later
 * arithmetic can tell "did not move" apart from "moved less than we can see".
 */
export function countResolution(value: number): number {
  if (value <= 0) return 1;
  return Math.max(1, 10 ** (Math.floor(Math.log10(value)) - 3));
}

const recordSchema = z.object({
  id: z.string().min(1),
  uploader: z.string().min(1),
  webpage_url: z.string().url(),
  timestamp: z.number().int().positive(),
  view_count: z.number().int().nonnegative().nullish(),
  like_count: z.number().int().nonnegative().nullish(),
  comment_count: z.number().int().nonnegative().nullish(),
  repost_count: z.number().int().nonnegative().nullish(),
  track: z.string().nullish(),
  artists: z.array(z.string()).nullish(),
  description: z.string().nullish(),
});

export function hashtagsIn(description: string | null | undefined): string[] {
  return [...(description ?? "").matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) =>
    (match[1] ?? "").toLowerCase(),
  );
}

/**
 * There is no music id in this payload, only the sound's name and artist, so the key is built
 * from those. Two genuinely different sounds sharing a name will collide, which overstates how
 * crowded a sound is rather than understating it.
 */
export function soundKeyOf(track: string | null | undefined, artists: string[] | null | undefined) {
  const name = (track ?? "").trim().toLowerCase();
  if (name.length === 0) return undefined;
  const by = (artists ?? []).join(",").trim().toLowerCase();
  return `${by}::${name}` as SoundId;
}

export class YtDlpTikTokSource implements TrendSource {
  readonly platform = "tiktok" as const;
  readonly #run: CommandRunner;
  readonly #clock: () => number;

  constructor(run: CommandRunner, clock: () => number = Date.now) {
    this.#run = run;
    this.#clock = clock;
  }

  async recentPostsByCreator(handle: string, limit: number): Promise<Sighting[]> {
    const stdout = await this.#run([
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--no-update",
      "--playlist-items",
      `1-${limit}`,
      `https://www.tiktok.com/@${handle}`,
    ]);
    const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) throw new EmptySourceResultError(this.platform, handle);
    const observedAt = this.#clock();
    return lines.map((line) => this.#toSighting(line, handle, observedAt));
  }

  #toSighting(line: string, handle: string, observedAt: number): Sighting {
    const parsed = recordSchema.safeParse(parseJson(line, this.platform, handle));
    if (!parsed.success) {
      throw new SourceContractError(this.platform, handle, parsed.error.issues[0]?.message ?? "");
    }
    const record = parsed.data;
    const postId = record.id as PostId;
    const soundId = soundKeyOf(record.track, record.artists);
    const post: Post = {
      postId,
      platform: this.platform,
      creatorId: record.uploader.toLowerCase() as CreatorId,
      postedAt: record.timestamp * 1000,
      url: record.webpage_url,
      hashtags: hashtagsIn(record.description),
      ...(soundId ? { soundId } : {}),
    };
    return {
      post,
      observation: {
        postId,
        observedAt,
        ...numeric("views", record.view_count),
        ...numeric("likes", record.like_count),
        ...numeric("comments", record.comment_count),
        ...numeric("shares", record.repost_count),
      },
    };
  }
}

/** A count the tool did not report is left out, because unknown is not the same as zero. */
function numeric<K extends string>(key: K, value: number | null | undefined) {
  return value === null || value === undefined ? {} : ({ [key]: value } as Record<K, number>);
}

function parseJson(line: string, platform: "tiktok", handle: string): unknown {
  try {
    return JSON.parse(line);
  } catch (cause) {
    throw new SourceContractError(
      platform,
      handle,
      `a line was not JSON (${(cause as Error).message})`,
    );
  }
}

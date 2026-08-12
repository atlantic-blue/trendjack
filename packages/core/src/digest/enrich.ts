import type { DigestJson } from "./json.ts";

export interface VideoLook {
  thumbnail?: string;
  caption?: string;
}

/** Fetches how a video looks. Injected, so a test never touches the network. */
export type LookUp = (url: string) => Promise<VideoLook | undefined>;

/**
 * Adds the poster and the caption to everything the page will show.
 *
 * Without these the page is a grid of grey boxes with play buttons on them, which is the design
 * we already rejected once. A video the reader cannot see is a row about a video.
 *
 * A lookup that fails is not an error. The card still works, it just has no poster, and losing
 * the whole digest because one video would not describe itself would be a poor trade.
 */
export async function enrichDigest(digest: DigestJson, look: LookUp): Promise<DigestJson> {
  const wanted = new Set([
    ...digest.candidates.map((each) => each.url),
    ...digest.proven.map((each) => each.url),
  ]);

  const looks = new Map<string, VideoLook>();
  for (const url of wanted) {
    const found = await safely(look, url);
    if (found) looks.set(url, found);
  }

  return {
    ...digest,
    candidates: digest.candidates.map((each) => ({ ...each, ...(looks.get(each.url) ?? {}) })),
    proven: digest.proven.map((each) => ({ ...each, ...(looks.get(each.url) ?? {}) })),
  };
}

async function safely(look: LookUp, url: string): Promise<VideoLook | undefined> {
  try {
    return await look(url);
  } catch {
    return undefined;
  }
}

/**
 * TikTok's oEmbed endpoint. It needs no key and returns a vertical poster at 720 by 1280, the
 * caption, and the creator, which is everything a card shows.
 */
export function tikTokLookUp(fetcher: typeof fetch = fetch, timeoutMs = 8_000): LookUp {
  return async (url: string) => {
    const response = await fetcher(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { thumbnail_url?: string; title?: string };
    const look: VideoLook = {};
    if (body.thumbnail_url) look.thumbnail = body.thumbnail_url;
    if (body.title) look.caption = body.title;
    return look;
  };
}

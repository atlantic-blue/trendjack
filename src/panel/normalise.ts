import type { PanelEntry } from "../contracts/types.ts";

/**
 * Handles arrive written however a human copied them: with an at sign, with the capitals the
 * profile displays, occasionally as a whole profile url. Left alone, the same creator lands in
 * the panel twice under two spellings, gets polled twice, and has their history split across
 * two identities, which quietly halves the baseline they are measured against.
 */
export function normaliseHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/^https?:\/\/[^\s]*?\/@?([\w.\-]+)\/?$/);
  const bare = (fromUrl?.[1] ?? trimmed).replace(/^[@#]/, "");
  return bare.trim().toLowerCase();
}

export function normaliseEntry(entry: PanelEntry): PanelEntry {
  return {
    ...entry,
    product: entry.product.trim().toLowerCase(),
    niche: entry.niche.trim().toLowerCase(),
    handle: normaliseHandle(entry.handle),
  };
}

/** Two entries are the same watch if they point the same tool at the same thing. */
export function watchKey(entry: PanelEntry): string {
  return `${entry.platform}:${entry.kind}:${entry.handle}`;
}

/**
 * The windows a reader can choose between.
 *
 * Each one is a separate digest, built and published on its own, rather than one wide file the
 * page filters. The window is not only a filter: whether other creators are on the same shape,
 * and how crowded a sound is, are both counted inside it. Filtering a thirty day file down to a
 * day would keep those numbers and they would be answering a different question.
 */
export interface Range {
  /** Used in the file name and in the address, so it must stay stable. */
  key: string;
  label: string;
  hours: number;
}

export const RANGES: Range[] = [
  { key: "24h", label: "Last 24 hours", hours: 24 },
  { key: "72h", label: "Last 3 days", hours: 72 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 },
  { key: "30d", label: "Last 30 days", hours: 24 * 30 },
];

/** What a reader sees before choosing anything. */
export const DEFAULT_RANGE = "72h";

export function rangeFor(key: string): Range | undefined {
  return RANGES.find((range) => range.key === key);
}

export function digestKeyFor(key: string): string {
  return `digest-${key}.json`;
}

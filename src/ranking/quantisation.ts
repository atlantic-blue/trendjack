/**
 * Platforms report large counts rounded. A real capture on 2026-08-12 read 1,100,000 and
 * 235,400 rather than exact numbers, which is about four significant figures.
 *
 * That matters more than it looks. Two polls of a video at 1.1 million can return the same
 * number while it gains eighty thousand views between them, and velocity would then report a
 * video that is climbing hard as perfectly flat. The fix is to know how coarse a reading was
 * and refuse to draw a conclusion inside that margin.
 */
export function countResolution(value: number): number {
  if (value <= 0) return 1;
  return Math.max(1, 10 ** (Math.floor(Math.log10(value)) - 3));
}

/**
 * Whether two readings differ by more than the rounding could explain. Equal readings are
 * never distinguishable, however small, because no movement was seen either way.
 */
export function isDistinguishable(earlier: number, later: number): boolean {
  const difference = Math.abs(later - earlier);
  if (difference === 0) return false;
  return difference >= Math.max(countResolution(earlier), countResolution(later));
}

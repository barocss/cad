export type InterferenceOrder = 'original' | 'largest' | 'smallest';

/** Rank only reported finite overlaps; never mutate the accepted report or recalculate geometry.
 * Nonfinite defensive inputs remain visible at the end, not silently promoted to zero. */
export function orderedInterference<T extends { volume: number }>(pairs: readonly T[], order: InterferenceOrder): readonly T[] {
  if (order === 'original') return pairs;
  return pairs.map((pair, index) => ({ pair, index })).sort((a, b) => {
    const af = Number.isFinite(a.pair.volume), bf = Number.isFinite(b.pair.volume);
    if (af !== bf) return af ? -1 : 1;
    return (af ? (order === 'largest' ? b.pair.volume - a.pair.volume : a.pair.volume - b.pair.volume) : 0) || a.index - b.index;
  }).map(row => row.pair);
}

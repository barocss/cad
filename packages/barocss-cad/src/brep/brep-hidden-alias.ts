import type { Point } from '../types.js';

/** Internal provenance of an exact straight cylinder generator, not a projected-ink identity. */
export interface HiddenGenerator { body: number; faces: readonly string[]; native: boolean }
export interface HiddenGeneratorRun { generator: HiddenGenerator; ends: readonly [Point, Point] }

/** Only a whole, roundoff-equivalent 3D run on that body's native supporting joint is an alias. */
export function hiddenGeneratorAlias(alias: HiddenGeneratorRun, source: HiddenGeneratorRun): boolean {
  const a = alias.generator, b = source.generator;
  if (a.native || !b.native || a.body !== b.body || !a.faces.some(f => b.faces.includes(f))) return false;
  const same = (p: Point, q: Point) => p.every((x, k) => Math.abs(x - q[k]) <= 128 * Number.EPSILON * Math.max(1, Math.abs(x), Math.abs(q[k])));
  return (same(alias.ends[0], source.ends[0]) && same(alias.ends[1], source.ends[1]))
    || (same(alias.ends[0], source.ends[1]) && same(alias.ends[1], source.ends[0]));
}

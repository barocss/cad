// Derived 1D linear circle patterns on a closed sketch outline (#223).
// The seed circle and pattern definition are the sole authority: derived copies
// (ordinals 1..count-1) are recomputed from the seed and never stored as independent circles.
import { insideRing, segmentDistance } from '../engine/geom2';
import { sampleOutline, type P2 } from './profile';

export type SketchPatternAxis = 'x' | 'y';

export interface SketchLinearPattern {
  /** Monotonic pattern identity in the outline (e.g. 'sp1'), never reused after deletion. */
  id: string;
  /** Index of the attached seed circle in `Polygon.circles`. */
  seedCircle: number;
  /** Linear direction axis ('x' or 'y'). */
  axis: SketchPatternAxis;
  /** Direction sign (+1 or -1 along `axis`). */
  sign: -1 | 1;
  /** Fixed positive center-to-center spacing in mm. */
  spacing: number;
  /** Total count including the seed (ordinal 0 = seed, 1..count-1 = derived copies). */
  count: number;
}

export interface DerivedPatternCircle {
  patternId: string;
  seedCircle: number;
  ordinal: number;
  sideId: string;
  c: [number, number];
  r: number;
}

export interface ParsedPatternCopyKey {
  kind: 'pcdx' | 'pcdy';
  a: number;
  pattern: string;
  ordinal: number;
}

export interface PatternOutlineLike {
  points: [number, number][];
  bulges?: number[];
  circles?: { c: [number, number]; r: number }[];
  patterns?: SketchLinearPattern[];
  patternSeq?: number;
  rules?: readonly { kind: string; a?: number; pattern?: string; ordinal?: number }[];
}

export const SKETCH_PATTERN_MIN_COUNT = 2;
export const SKETCH_PATTERN_MAX_COUNT = 16;
export const SKETCH_PATTERN_MIN_SPACING = 0.001;
const PATTERN_ID_RE = /^[A-Za-z][A-Za-z0-9-]{0,19}$/;

/** Stable lineage-bound side tag for a derived copy loop in `profileOf` / `sideTags`. */
export function patternCopySideId(patternId: string, ordinal: number): string {
  return `${patternId}_k${ordinal}`;
}

/** Driving horizontal / vertical distance keys from outline point `a` to derived copy `(patternId, ordinal)`. */
export function patternCopyDimensionKeys(a: number, patternId: string, ordinal: number): { dx: string; dy: string } {
  return { dx: `pcdx${a}_${patternId}_${ordinal}`, dy: `pcdy${a}_${patternId}_${ordinal}` };
}

/** Parses `pcdx<point>_<patternId>_<ordinal>` or `pcdy<point>_<patternId>_<ordinal>`. */
export function parsePatternCopyKey(key: string): ParsedPatternCopyKey | null {
  const m = /^(pcdx|pcdy)(\d+)_([A-Za-z][A-Za-z0-9-]*)_(\d+)$/.exec(key);
  if (!m) return null;
  const ordinal = Number(m[4]);
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;
  return { kind: m[1] as 'pcdx' | 'pcdy', a: Number(m[2]), pattern: m[3], ordinal };
}

/** Allocates the next monotonic pattern ID so deleted pattern IDs are never reused. */
export function nextPatternId(s: Pick<PatternOutlineLike, 'patterns' | 'patternSeq'>): { id: string; seq: number } {
  let max = Number.isInteger(s.patternSeq) && (s.patternSeq ?? 0) > 0 ? s.patternSeq! : 0;
  for (const p of s.patterns ?? []) {
    const m = /^sp(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const seq = max + 1;
  return { id: `sp${seq}`, seq };
}

/** Displacement vector from the seed centre to derived copy `ordinal` (1..count-1). */
export function patternOffset(pattern: SketchLinearPattern, ordinal: number): [number, number] {
  const delta = pattern.sign * ordinal * pattern.spacing;
  return pattern.axis === 'x' ? [delta, 0] : [0, delta];
}

/** Exact centre of derived copy `ordinal` computed strictly from seed centre + pattern parameters. */
export function patternCopyCenter(seed: readonly [number, number], pattern: SketchLinearPattern, ordinal: number): [number, number] {
  const [dx, dy] = patternOffset(pattern, ordinal);
  return [seed[0] + dx, seed[1] + dy];
}

/** All derived circles for valid patterns on the outline (ordinals 1..count-1). */
export function derivedPatternCircles(s: Pick<PatternOutlineLike, 'circles' | 'patterns'>): DerivedPatternCircle[] {
  const circles = s.circles ?? [];
  const out: DerivedPatternCircle[] = [];
  for (const p of s.patterns ?? []) {
    const seed = circles[p.seedCircle];
    if (!seed || !Number.isInteger(p.count) || p.count < SKETCH_PATTERN_MIN_COUNT) continue;
    if (!Number.isFinite(p.spacing) || p.spacing < SKETCH_PATTERN_MIN_SPACING) continue;
    for (let ordinal = 1; ordinal < p.count; ordinal++) {
      out.push({
        patternId: p.id,
        seedCircle: p.seedCircle,
        ordinal,
        sideId: patternCopySideId(p.id, ordinal),
        c: patternCopyCenter(seed.c, p, ordinal),
        r: seed.r,
      });
    }
  }
  return out;
}

/** Resolves one derived pattern copy by `(patternId, ordinal)`, or null if absent. */
export function findDerivedPatternCircle(
  s: Pick<PatternOutlineLike, 'circles' | 'patterns'>,
  patternId: string,
  ordinal: number,
): DerivedPatternCircle | null {
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;
  const p = (s.patterns ?? []).find(item => item.id === patternId);
  if (!p || ordinal >= p.count) return null;
  const seed = s.circles?.[p.seedCircle];
  if (!seed) return null;
  return {
    patternId: p.id,
    seedCircle: p.seedCircle,
    ordinal,
    sideId: patternCopySideId(p.id, ordinal),
    c: patternCopyCenter(seed.c, p, ordinal),
    r: seed.r,
  };
}

/** Structural validation of one pattern entry against the outline's attached circles. */
export function patternParamProblem(
  pattern: SketchLinearPattern,
  circleCount: number,
): string | null {
  if (!pattern || typeof pattern !== 'object') return 'Pattern definition is malformed';
  if (typeof pattern.id !== 'string' || !PATTERN_ID_RE.test(pattern.id)) return 'Pattern ID must be a safe identifier';
  if (!Number.isInteger(pattern.seedCircle) || pattern.seedCircle < 0 || pattern.seedCircle >= circleCount) {
    return 'Pattern seed circle does not exist on this outline';
  }
  if (pattern.axis !== 'x' && pattern.axis !== 'y') return 'Pattern axis must be X or Y';
  if (pattern.sign !== 1 && pattern.sign !== -1) return 'Pattern direction sign must be +1 or -1';
  if (typeof pattern.spacing !== 'number' || !Number.isFinite(pattern.spacing) || pattern.spacing < SKETCH_PATTERN_MIN_SPACING) {
    return 'Pattern spacing must be a finite positive number (at least 0.001 mm)';
  }
  if (typeof pattern.count !== 'number' || !Number.isInteger(pattern.count)
    || pattern.count < SKETCH_PATTERN_MIN_COUNT || pattern.count > SKETCH_PATTERN_MAX_COUNT) {
    return `Pattern count must be an integer between ${SKETCH_PATTERN_MIN_COUNT} and ${SKETCH_PATTERN_MAX_COUNT} (including the seed)`;
  }
  return null;
}

function ringDistance(p: P2, ring: P2[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, segmentDistance(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

function relationToRing(ring: P2[], c: readonly [number, number], r: number): 'inside' | 'outside' | 'crossing' {
  if (ringDistance([c[0], c[1]], ring) < r - 1e-6) return 'crossing';
  return insideRing([c[0], c[1]], ring) ? 'inside' : 'outside';
}

/**
 * Checks structural, reference, containment, and non-overlap invariants for every linear pattern on `s`.
 * Returns null when valid, or an explicit refusal reason (never silently truncating or accepting partial copies).
 */
export function linearPatternsProblem(s: PatternOutlineLike): string | null {
  const patterns = s.patterns ?? [];
  const circles = s.circles ?? [];
  const seenIds = new Set<string>();
  const seenSeeds = new Set<number>();
  for (const p of patterns) {
    const paramErr = patternParamProblem(p, circles.length);
    if (paramErr) return paramErr;
    if (seenIds.has(p.id)) return `Duplicate sketch pattern ID "${p.id}"`;
    seenIds.add(p.id);
    if (seenSeeds.has(p.seedCircle)) return `Circle ${p.seedCircle + 1} already belongs to a linear pattern`;
    seenSeeds.add(p.seedCircle);
  }
  // Every pattern-copy rule must reference an existing pattern and live ordinal (1..count-1).
  for (const r of s.rules ?? []) {
    if (r.kind !== 'pcdx' && r.kind !== 'pcdy') continue;
    const p = patterns.find(item => item.id === r.pattern);
    if (!p) return `Constraint references missing pattern "${r.pattern}"`;
    if (!Number.isInteger(r.ordinal) || (r.ordinal ?? 0) < 1 || (r.ordinal ?? 0) >= p.count) {
      return `Constraint references copy #${r.ordinal} of pattern ${p.id}, which is outside count ${p.count}`;
    }
  }
  if (!patterns.length) return null;
  if (s.points.length < 3) return 'Linear circle patterns require a closed outline';
  const ring = sampleOutline(s.points as P2[], s.bulges, true);
  const allCircles: { label: string; c: [number, number]; r: number }[] = circles.map((c, j) => ({
    label: `circle ${j + 1}`,
    c: c.c,
    r: c.r,
  }));
  for (const p of patterns) {
    const seed = circles[p.seedCircle];
    const seedRel = relationToRing(ring, seed.c, seed.r);
    if (seedRel === 'crossing') return `Seed circle ${p.seedCircle + 1} crosses the outline boundary`;
    for (let ordinal = 1; ordinal < p.count; ordinal++) {
      const c = patternCopyCenter(seed.c, p, ordinal);
      const rel = relationToRing(ring, c, seed.r);
      if (rel === 'crossing') return `Pattern ${p.id} copy #${ordinal} would cross the outline boundary`;
      if (seedRel === 'inside' && rel !== 'inside') return `Pattern ${p.id} copy #${ordinal} would fall outside the outline`;
      if (seedRel === 'outside' && rel !== 'outside') return `Pattern ${p.id} copy #${ordinal} would enter the outline`;
      allCircles.push({ label: `pattern ${p.id} copy #${ordinal}`, c, r: seed.r });
    }
  }
  // All circles (seeds, derived copies, and other attached circles) must stay strictly disjoint.
  for (let i = 0; i < allCircles.length; i++) {
    for (let j = i + 1; j < allCircles.length; j++) {
      const a = allCircles[i], b = allCircles[j];
      const dist = Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]);
      if (dist <= a.r + b.r + 1e-6) {
        return `${a.label} and ${b.label} would overlap or touch (centre spacing ${Math.round(dist * 1e4) / 1e4} mm ≤ ${Math.round((a.r + b.r) * 1e4) / 1e4} mm)`;
      }
    }
  }
  return null;
}

/** Returns indices of `s.rules` referencing copies of `patternId` with `ordinal >= minOrdinal`. */
export function patternReferencingRuleIndices(
  rules: readonly { kind: string; pattern?: string; ordinal?: number }[] | undefined,
  patternId: string,
  minOrdinal = 1,
): number[] {
  const out: number[] = [];
  (rules ?? []).forEach((r, idx) => {
    if ((r.kind === 'pcdx' || r.kind === 'pcdy') && r.pattern === patternId && (r.ordinal ?? 0) >= minOrdinal) {
      out.push(idx);
    }
  });
  return out;
}

/** Updates pattern seedCircle indices when attached circle `j` is removed. */
export function patternsWithoutCircle(patterns: readonly SketchLinearPattern[], j: number): SketchLinearPattern[] {
  const out: SketchLinearPattern[] = [];
  for (const p of patterns) {
    if (p.seedCircle === j) continue;
    out.push(p.seedCircle > j ? { ...p, seedCircle: p.seedCircle - 1 } : { ...p });
  }
  return out;
}

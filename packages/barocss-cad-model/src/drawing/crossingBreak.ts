// Optional crossing break/gap on one straight linear dimension line over another in the same orthographic view.
// Stored as verified target intent + paper-mm gap (never cut coordinates or mark indices); recomputed on each sheet build.
import {
  DEFAULT_CROSSING_BREAK_GAP,
  MAX_CROSSING_BREAK_GAP,
  MIN_CROSSING_BREAK_GAP,
  crossingBreakGapOk,
  readLinearCrossingBreak,
  type DrawingDimension,
  type DrawingSettings,
  type LinearCrossingBreak,
  type LinearCrossingBreakTarget,
  type XY,
} from './types';
export {
  DEFAULT_CROSSING_BREAK_GAP,
  MAX_CROSSING_BREAK_GAP,
  MIN_CROSSING_BREAK_GAP,
  crossingBreakGapOk,
  readLinearCrossingBreak,
  type LinearCrossingBreak,
  type LinearCrossingBreakTarget,
};
import { isOrthographicView } from './foreshorten';
import type { Resolved } from './dimensions';
import { PENS, placementOf, type Mark, type MarkGroup } from './sheet';
import { textCorners } from './text';
import type { SheetLayout } from './views';

export const CROSSING_BREAK_END_MARGIN = 1;

export type CrossingBreakStatusCode =
  | 'applied'
  | 'conflict'
  | 'missing-target'
  | 'target-changed'
  | 'unsupported-scope'
  | 'unsupported-view'
  | 'unresolved'
  | 'no-crossing'
  | 'multiple-crossings'
  | 'too-close';

export interface CrossingBreakEvaluation {
  readonly dimId: string;
  readonly overId: string;
  readonly gap: number;
  readonly visibleGap: number;
  readonly status: CrossingBreakStatusCode;
  readonly reason?: string;
  readonly crossing?: XY;
  readonly interval?: readonly [number, number];
}

export interface CrossingBreakCandidate {
  readonly id: string;
  readonly target: LinearCrossingBreakTarget;
  readonly crossing: XY;
  readonly conflict: boolean;
}

export interface ProperCrossingHit {
  readonly point: XY;
  readonly distanceAlongA: number;
  readonly lengthA: number;
}

interface LineCrossingSplit {
  readonly hostMarkIndex: number;
  readonly q0: XY;
  readonly q1: XY;
  readonly crossing: XY;
  readonly interval: readonly [number, number];
  readonly visibleGap: number;
}

type LinearDimension = Extract<DrawingDimension, { kind: 'linear' }>;
type DimensionLineMark = Extract<Mark, { kind: 'line' }>;

const CROSS_EPS = 1e-6;
const TEXT_PAD_MM = 0.5;

const sub2 = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const add2 = (a: XY, b: XY, k = 1): XY => [a[0] + b[0] * k, a[1] + b[1] * k];
const dot2 = (a: XY, b: XY): number => a[0] * b[0] + a[1] * b[1];
const cross2 = (a: XY, b: XY): number => a[0] * b[1] - a[1] * b[0];

export function crossingTargetOf(dim: LinearDimension): LinearCrossingBreakTarget {
  return { id: dim.id, orient: dim.orient, aEdge: dim.a.edge, bEdge: dim.b.edge };
}

export function sameCrossingTarget(saved: LinearCrossingBreakTarget, candidate: LinearDimension): boolean {
  return saved.id === candidate.id
    && saved.orient === candidate.orient
    && saved.aEdge === candidate.a.edge
    && saved.bEdge === candidate.b.edge;
}

/** Strict interior crossing between two straight 2D sheet segments; rejects parallel, collinear, and endpoint touches. */
export function properSegmentCrossing(a0: XY, a1: XY, b0: XY, b1: XY): ProperCrossingHit | null {
  const da = sub2(a1, a0), db = sub2(b1, b0);
  const lenA = Math.hypot(da[0], da[1]), lenB = Math.hypot(db[0], db[1]);
  if (lenA <= CROSS_EPS || lenB <= CROSS_EPS) return null;
  const denom = cross2(da, db);
  if (Math.abs(denom) <= CROSS_EPS * lenA * lenB) return null;
  const diff = sub2(b0, a0);
  const t = cross2(diff, db) / denom;
  const u = cross2(diff, da) / denom;
  const epsT = Math.min(1e-4, 1e-3 / lenA);
  const epsU = Math.min(1e-4, 1e-3 / lenB);
  if (!(t > epsT && t < 1 - epsT && u > epsU && u < 1 - epsU)) return null;
  return {
    point: [a0[0] + da[0] * t, a0[1] + da[1] * t],
    distanceAlongA: t * lenA,
    lengthA: lenA,
  };
}

/** Reconstruct unbroken straight role:'dimension' segments from a group so repeated checks never depend on prior splits. */
function unbrokenDimensionLines(group: MarkGroup): { markIndex: number; line: DimensionLineMark }[] {
  const out: { markIndex: number; line: DimensionLineMark }[] = [];
  for (let i = 0; i < group.marks.length; i++) {
    const m = group.marks[i];
    if (m.kind !== 'line' || m.role !== 'dimension') continue;
    if (m.crossingBreak) {
      if (m.crossingBreak.part === 0) {
        out.push({
          markIndex: i,
          line: { kind: 'line', a: m.crossingBreak.origin[0], b: m.crossingBreak.origin[1], pen: m.pen, role: 'dimension' },
        });
      }
      continue;
    }
    out.push({ markIndex: i, line: m });
  }
  return out;
}

function intervalOverlapsPoints(
  origin: XY,
  dir: XY,
  normal: XY,
  s0: number,
  s1: number,
  points: readonly XY[],
  perpLimit: number,
  axialPad: number,
): boolean {
  let minS = Infinity, maxS = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const q of points) {
    const rel = sub2(q, origin);
    const s = dot2(rel, dir), n = dot2(rel, normal);
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
  }
  if (minN > perpLimit || maxN < -perpLimit) return false;
  return Math.min(maxS + axialPad, s1) > Math.max(minS - axialPad, s0);
}

function evaluateSplit(
  hostGroup: MarkGroup,
  targetLines: readonly DimensionLineMark[],
  gap: number,
): { ok: true; split: LineCrossingSplit } | { ok: false; status: 'no-crossing' | 'multiple-crossings' | 'too-close'; reason: string } {
  const hostLines = unbrokenDimensionLines(hostGroup);
  const hits: { markIndex: number; line: DimensionLineMark; hit: ProperCrossingHit }[] = [];
  for (const h of hostLines) {
    for (const t of targetLines) {
      const hit = properSegmentCrossing(h.line.a, h.line.b, t.a, t.b);
      if (hit) hits.push({ markIndex: h.markIndex, line: h.line, hit });
    }
  }
  if (hits.length === 0) return { ok: false, status: 'no-crossing', reason: 'The two dimension lines do not cross at an interior point.' };
  if (hits.length > 1) return { ok: false, status: 'multiple-crossings', reason: 'Multiple crossings found; only one interior crossing is supported.' };

  const { markIndex, line, hit } = hits[0];
  const half = gap / 2;
  const s0 = hit.distanceAlongA - half;
  const s1 = hit.distanceAlongA + half;
  const strokeWidth = PENS[line.pen].width;
  if (s0 < CROSSING_BREAK_END_MARGIN || hit.lengthA - s1 < CROSSING_BREAK_END_MARGIN) {
    return { ok: false, status: 'too-close', reason: 'Crossing is too close to the end of the dimension line or an existing text gap.' };
  }
  const d = sub2(line.b, line.a);
  const dir: XY = [d[0] / hit.lengthA, d[1] / hit.lengthA];
  const normal: XY = [-dir[1], dir[0]];
  for (const m of hostGroup.marks) {
    if (m.kind === 'fill' && m.head) {
      if (intervalOverlapsPoints(line.a, dir, normal, s0, s1, m.points, strokeWidth, strokeWidth)) {
        return { ok: false, status: 'too-close', reason: 'Crossing is too close to a dimension arrowhead.' };
      }
    } else if (m.kind === 'text') {
      const corners = textCorners(m.at, m.text, m.size, m.anchor, m.angle ?? 0, !!m.bold);
      if (intervalOverlapsPoints(line.a, dir, normal, s0, s1, corners, strokeWidth, TEXT_PAD_MM)) {
        return { ok: false, status: 'too-close', reason: 'Crossing is too close to the dimension text.' };
      }
    } else if (m.kind === 'polyline' && m.role === 'frame') {
      if (intervalOverlapsPoints(line.a, dir, normal, s0, s1, m.points, strokeWidth, TEXT_PAD_MM)) {
        return { ok: false, status: 'too-close', reason: 'Crossing is too close to the basic dimension frame.' };
      }
    }
  }
  const q0 = add2(line.a, dir, s0);
  const q1 = add2(line.a, dir, s1);
  return {
    ok: true,
    split: {
      hostMarkIndex: markIndex,
      q0,
      q1,
      crossing: hit.point,
      interval: [s0, s1],
      visibleGap: Math.round((gap - strokeWidth) * 1000) / 1000,
    },
  };
}

function uniqueDimById(dimensions: readonly DrawingDimension[], id: string): DrawingDimension | null {
  let found: DrawingDimension | null = null;
  for (const d of dimensions) {
    if (d.id !== id) continue;
    if (found) return null;
    found = d;
  }
  return found;
}

/**
 * Apply authored crossing breaks AFTER final text placement (D416) so short-label fallback and ASME text gaps run first.
 * Evaluates all crossings against unbroken dimension segments, enforces mutual-conflict refusal, and leaves non-crossing
 * or invalid lines unbroken with explicit diagnostic status.
 */
export function applyLinearCrossingBreaks(
  groups: readonly MarkGroup[],
  resolved: readonly Resolved[],
  settings: DrawingSettings,
  layout: SheetLayout,
): CrossingBreakEvaluation[] {
  const evaluations: CrossingBreakEvaluation[] = [];
  const isAssembly = settings.scope?.kind === 'assembly';
  const resolvedById = new Map<string, Resolved>();
  for (const r of resolved) resolvedById.set(r.dim.id, r);
  const groupById = new Map<string, MarkGroup>();
  for (const g of groups) if (g.role === 'dimension' && g.id) groupById.set(g.id, g);

  // Snapshot original unbroken dimension lines before applying any split.
  const originalLines = new Map<string, DimensionLineMark[]>();
  for (const [id, g] of groupById) originalLines.set(id, unbrokenDimensionLines(g).map(x => x.line));

  const pendingSplits: { group: MarkGroup; split: LineCrossingSplit }[] = [];

  for (const d of settings.dimensions) {
    if (d.kind !== 'linear' || !d.crossingBreak) continue;
    const cb = d.crossingBreak;
    const gap = cb.gap;
    const visibleGap = Math.round((gap - PENS.thin.width) * 1000) / 1000;
    const push = (status: CrossingBreakStatusCode, reason?: string, extra?: Partial<CrossingBreakEvaluation>) => {
      evaluations.push({ dimId: d.id, overId: cb.over, gap, visibleGap, status, ...(reason ? { reason } : {}), ...extra });
    };

    if (d.auto === true || isAssembly) {
      push('unsupported-scope', 'Crossing break applies only to manual linear dimensions in a part drawing.');
      continue;
    }
    if (!isOrthographicView(d.view)) {
      push('unsupported-view', 'Crossing break applies only in front, top, or right orthographic views.');
      continue;
    }
    const vp = placementOf(layout, undefined, d.view);
    if (!vp || vp.hidden || vp.breaks?.length) {
      push('unsupported-view', 'Crossing break is inactive because the view is hidden or broken.');
      continue;
    }
    if (uniqueDimById(settings.dimensions, d.id) !== d) {
      push('unresolved', `Duplicate dimension ID ${d.id}.`);
      continue;
    }
    const hostResolved = resolvedById.get(d.id);
    if (!hostResolved?.ok) {
      push('unresolved', 'The dimension reference is unresolved; the saved crossing break is retained.');
      continue;
    }
    if (cb.over === d.id) {
      push('missing-target', 'A dimension cannot break over itself.');
      continue;
    }
    const targetDim = uniqueDimById(settings.dimensions, cb.over);
    if (!targetDim) {
      push('missing-target', `Target dimension ${cb.over} is missing or duplicated.`);
      continue;
    }
    if (targetDim.kind !== 'linear' || targetDim.auto === true || targetDim.view !== d.view || !sameCrossingTarget(cb.target, targetDim)) {
      push('target-changed', `Target dimension ${cb.over} no longer matches the saved linear dimension.`);
      continue;
    }
    if (targetDim.crossingBreak?.over === d.id) {
      push('conflict', `Both ${d.id} and ${targetDim.id} are set to break over each other. Remove one break.`);
      continue;
    }
    const targetResolved = resolvedById.get(targetDim.id);
    if (!targetResolved?.ok) {
      push('unresolved', `Target dimension ${targetDim.id} is unresolved.`);
      continue;
    }
    const hostGroup = groupById.get(d.id);
    const targetLines = originalLines.get(targetDim.id);
    if (!hostGroup || !targetLines?.length) {
      push('no-crossing', 'No drawable straight dimension line was found for the pair.');
      continue;
    }
    const check = evaluateSplit(hostGroup, targetLines, gap);
    if (!check.ok) {
      push(check.status, check.reason);
      continue;
    }
    pendingSplits.push({ group: hostGroup, split: check.split });
    push('applied', undefined, { crossing: check.split.crossing, interval: check.split.interval, visibleGap: check.split.visibleGap });
  }

  for (const { group, split } of pendingSplits) {
    const orig = group.marks[split.hostMarkIndex];
    if (!orig || orig.kind !== 'line' || orig.role !== 'dimension') continue;
    const origin: readonly [XY, XY] = [orig.a, orig.b];
    const left: DimensionLineMark = { kind: 'line', a: orig.a, b: split.q0, pen: orig.pen, role: 'dimension', crossingBreak: { origin, part: 0 } };
    const right: DimensionLineMark = { kind: 'line', a: split.q1, b: orig.b, pen: orig.pen, role: 'dimension', crossingBreak: { origin, part: 1 } };
    group.marks = [
      ...group.marks.slice(0, split.hostMarkIndex),
      left,
      right,
      ...group.marks.slice(split.hostMarkIndex + 1),
    ];
  }

  return evaluations;
}

/** Eligible other manual linear dimensions in the same unbroken orthographic part view whose dimension line cleanly crosses `dimId`. */
export function eligibleCrossingBreaks(
  groups: readonly MarkGroup[],
  resolved: readonly Resolved[],
  settings: DrawingSettings,
  layout: SheetLayout,
  dimId: string,
  gap = DEFAULT_CROSSING_BREAK_GAP,
): CrossingBreakCandidate[] {
  if (!crossingBreakGapOk(gap) || settings.scope?.kind === 'assembly') return [];
  const hostDim = uniqueDimById(settings.dimensions, dimId);
  if (!hostDim || hostDim.kind !== 'linear' || hostDim.auto === true || !isOrthographicView(hostDim.view)) return [];
  const vp = placementOf(layout, undefined, hostDim.view);
  if (!vp || vp.hidden || vp.breaks?.length) return [];
  const hostResolved = resolved.find(r => r.dim.id === dimId);
  if (!hostResolved?.ok) return [];
  const hostGroup = groups.find(g => g.role === 'dimension' && g.id === dimId);
  if (!hostGroup) return [];

  const out: CrossingBreakCandidate[] = [];
  for (const other of settings.dimensions) {
    if (other.id === dimId || other.kind !== 'linear' || other.auto === true || other.view !== hostDim.view) continue;
    if (uniqueDimById(settings.dimensions, other.id) !== other) continue;
    const otherResolved = resolved.find(r => r.dim.id === other.id);
    if (!otherResolved?.ok) continue;
    const otherGroup = groups.find(g => g.role === 'dimension' && g.id === other.id);
    if (!otherGroup) continue;
    const otherLines = unbrokenDimensionLines(otherGroup).map(x => x.line);
    const check = evaluateSplit(hostGroup, otherLines, gap);
    if (!check.ok) continue;
    out.push({
      id: other.id,
      target: crossingTargetOf(other),
      crossing: check.split.crossing,
      conflict: other.crossingBreak?.over === dimId,
    });
  }
  return out;
}

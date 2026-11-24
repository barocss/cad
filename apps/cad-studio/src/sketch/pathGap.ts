import { CadNumericPolicy } from '@barocss/cad';
import { arcOf, type Arc, type P2 } from '@barocss/cad-model/sketch/profile';
import type { SketchShape } from '@barocss/cad-model/sketch/types';

type Outline = Extract<SketchShape, { kind: 'polygon' }>;
type Polygon = Outline & { ids: [string, string] };
type Polyline = Outline & { ids: string[] };
type Circle = Extract<SketchShape, { kind: 'circle' }> & { ids: [string] };

export type PreparedPathGap =
  | { kind: 'line'; shape: Polygon; arc: null }
  | { kind: 'arc'; shape: Polygon; arc: Arc }
  | { kind: 'polyline'; shape: Polyline; arcs?: readonly (Arc | undefined)[] }
  | { kind: 'circle'; shape: Circle };

type GapGeometry = {
  hit: P2;
  removed: P2[];
  cutA: P2;
  cutB: P2;
};
type SegmentGap = GapGeometry & { kind: 'segment'; bulges: [number, number] };
export type PathGapPlan = SegmentGap | (GapGeometry & { kind: 'circle'; bulges: [number] })
  | (GapGeometry & { kind: 'polyline'; span: number; bulges: [number, number] });

const fullTurn = 2 * Math.PI;
// Finish calls joinOpen with this distance. A stored gap must survive that join.
const openJoinTolerance = 1e-4;
const storedPathTolerance = 1e-5;

const inRange = (point: P2) => point.every(value => Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs);
const distance = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const storedPoint = ([x, y]: P2): P2 => [Math.round(x * 1e6) / 1e6 || 0, Math.round(y * 1e6) / 1e6 || 0];

function boundedCircle(center: P2, radius: number): boolean {
  const { coordinateAbs, linearTolerance } = CadNumericPolicy;
  return inRange(center) && Number.isFinite(radius) && radius > linearTolerance &&
    center.every(value => Math.abs(value) + radius <= coordinateAbs);
}

function boundedArc(a: P2, b: P2, bulge: number): Arc | null {
  const arc = arcOf(a, b, bulge);
  if (!boundedCircle(arc.center, arc.radius) ||
      Math.abs(distance(b, arc.center) - arc.radius) > CadNumericPolicy.linearTolerance || Math.abs(arc.sweep) >= fullTurn) return null;
  return arc;
}

export function preparePathGap(shape: SketchShape, ordinaryDraft = false): PreparedPathGap | null {
  const independentDraft = ordinaryDraft && (shape.kind === 'circle' || shape.kind === 'polygon');
  if (!shape.construction && !independentDraft) return null;
  if (shape.kind === 'circle') {
    if (shape.ids?.length !== 1 || typeof shape.ids[0] !== 'string' || !shape.ids[0] || !boundedCircle(shape.c, shape.r)) return null;
    return { kind: 'circle', shape: shape as Circle };
  }
  if (shape.kind !== 'polygon' || shape.closed || shape.pending || shape.points.length < 2) return null;
  const { ids } = shape;
  if (ids?.length !== shape.points.length || !ids.every(id => typeof id === 'string' && id) || new Set(ids).size !== ids.length) return null;
  if (shape.fromRectangle || shape.fromSpline || shape.spline || shape.fromEllipse || shape.ellipse) return null;
  if (Object.keys(shape.lengths ?? {}).length || Object.keys(shape.radii ?? {}).length || shape.tangents?.length ||
      shape.equalRadii?.length || shape.concentric?.length || shape.hv?.h?.length || shape.hv?.v?.length ||
      shape.rules?.length || shape.circles?.length || shape.circleIds?.length) return null;

  if (shape.points.length > 2) {
    const { points } = shape;
    if (!points.every((point, i) => inRange(point) && (i === 0 || distance(point, points[i - 1]) > openJoinTolerance)) ||
        distance(points[0], points[points.length - 1]) <= openJoinTolerance) return null;
    let arcs: (Arc | undefined)[] | undefined;
    for (let i = 0; i < points.length - 1; i++) {
      const bulge = shape.bulges?.[i] ?? 0;
      if (!Number.isFinite(bulge) || (!shape.construction && bulge !== 0)) return null;
      if (bulge !== 0) {
        const geometry = boundedArc(points[i], points[i + 1], bulge);
        if (!geometry) return null;
        (arcs ??= [])[i] = geometry;
      }
    }
    return { kind: 'polyline', shape: shape as Polyline, ...(arcs ? { arcs } : {}) };
  }

  const [a, b] = shape.points, bulge = shape.bulges?.[0] ?? 0;
  const { linearTolerance } = CadNumericPolicy;
  if (!Number.isFinite(bulge) || !inRange(a) || !inRange(b) || distance(a, b) <= linearTolerance) return null;
  const identified = shape as Polygon;
  if (bulge === 0) return { kind: 'line', shape: identified, arc: null };
  const arc = boundedArc(a, b, bulge);
  if (!arc) return null;
  return { kind: 'arc', shape: identified, arc };
}

function separateStoredEnds(a: P2, cutA: P2, cutB: P2, b: P2): boolean {
  if (!inRange(cutA) || !inRange(cutB)) return false;
  const ends = [a, cutA, cutB, b];
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      if (distance(ends[i], ends[j]) <= openJoinTolerance) return false;
    }
  }
  return true;
}

function planLineGap(a: P2, b: P2, pointer: P2, gapMm: number): SegmentGap | null {
  const total = distance(a, b);
  const dx = (b[0] - a[0]) / total, dy = (b[1] - a[1]) / total;
  const travelled = dx * (pointer[0] - a[0]) + dy * (pointer[1] - a[1]);
  const lo = travelled - gapMm / 2, hi = travelled + gapMm / 2;
  if (!(0 < lo && lo < hi && hi < total)) return null;
  const pointAt = (length: number): P2 => [a[0] + dx * length, a[1] + dy * length];
  const cutA = storedPoint(pointAt(lo)), cutB = storedPoint(pointAt(hi));
  if (!separateStoredEnds(a, cutA, cutB, b)) return null;
  if (Math.abs(distance(cutA, cutB) - gapMm) > storedPathTolerance ||
      Math.abs(distance(a, cutA) - lo) > storedPathTolerance ||
      Math.abs(distance(cutB, b) - (total - hi)) > storedPathTolerance) return null;
  return { kind: 'segment', hit: pointAt(travelled), removed: [cutA, cutB], cutA, cutB, bulges: [0, 0] };
}

function arcTravel(arc: Arc, pointer: P2): number {
  const offset = Math.sign(arc.sweep) * (Math.atan2(pointer[1] - arc.center[1], pointer[0] - arc.center[0]) - arc.start);
  return offset < 0 ? offset + fullTurn : offset;
}

function spanDistance(a: P2, b: P2, arc: Arc | null, pointer: P2): number {
  if (arc) {
    // The radial projection is on the finite arc only inside its signed sweep.
    if (arcTravel(arc, pointer) <= Math.abs(arc.sweep)) return Math.abs(distance(pointer, arc.center) - arc.radius);
    return Math.min(distance(pointer, a), distance(pointer, b));
  }
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((pointer[0] - a[0]) * dx + (pointer[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(pointer[0] - a[0] - t * dx, pointer[1] - a[1] - t * dy);
}

function planPolylineGap(source: Extract<PreparedPathGap, { kind: 'polyline' }>, pointer: P2, gapMm: number): PathGapPlan | null {
  const { points } = source.shape;
  let closest = Infinity, next = Infinity, span = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const distance = spanDistance(points[i], points[i + 1], source.arcs?.[i] ?? null, pointer);
    if (distance < closest) {
      next = closest;
      closest = distance;
      span = i;
    } else next = Math.min(next, distance);
  }
  // Locate the picked span before testing whether a gap fits in it.
  if (span < 0 || next - closest <= openJoinTolerance) return null;
  const arc = source.arcs?.[span];
  const gap = arc ? planArcGap(points[span], points[span + 1], arc, pointer, gapMm) : planLineGap(points[span], points[span + 1], pointer, gapMm);
  if (!gap || points.some(point => distance(point, gap.cutA) <= openJoinTolerance || distance(point, gap.cutB) <= openJoinTolerance)) return null;
  if ((source.arcs || !source.shape.construction) && points.some((point, i) => {
    if (i >= points.length - 1 || i === span) return false;
    const otherArc = source.arcs?.[i] ?? null;
    return spanDistance(point, points[i + 1], otherArc, gap.cutA) <= openJoinTolerance ||
      spanDistance(point, points[i + 1], otherArc, gap.cutB) <= openJoinTolerance;
  })) return null;
  return { ...gap, kind: 'polyline', span };
}

function retainedLength(source: Pick<Arc, 'center' | 'radius' | 'sweep'>, a: P2, b: P2, bulge: number, expectedLength: number): number | null {
  if (Math.sign(bulge) !== Math.sign(source.sweep)) return null;
  const stored = arcOf(a, b, bulge), length = stored.radius * Math.abs(stored.sweep);
  if (!(distance(stored.center, source.center) <= storedPathTolerance) ||
      !(Math.abs(stored.radius - source.radius) <= storedPathTolerance) ||
      !(Math.abs(length - expectedLength) <= storedPathTolerance)) return null;
  return length;
}

function sampleRemovedArc(pointAt: (angle: number) => P2, lo: number, hi: number, cutA: P2, cutB: P2): P2[] {
  const segments = Math.max(2, Math.ceil((hi - lo) / (Math.PI / 24)));
  return [cutA, ...Array.from({ length: segments - 1 }, (_, i) => pointAt(lo + (hi - lo) * (i + 1) / segments)), cutB];
}

function planCircleGap(shape: Circle, pointer: P2, gapMm: number): PathGapPlan | null {
  const { c: center, r: radius } = shape;
  const dx = pointer[0] - center[0], dy = pointer[1] - center[1];
  const pointerRadius = Math.hypot(dx, dy);
  if (!Number.isFinite(pointerRadius) || pointerRadius <= radius / 2) return null;

  const gapSweep = gapMm / radius, remaining = fullTurn - gapSweep;
  if (!(remaining > 0)) return null;
  const angle = Math.atan2(dy, dx), lo = angle - gapSweep / 2, hi = angle + gapSweep / 2;
  const pointAt = (theta: number): P2 => [center[0] + radius * Math.cos(theta), center[1] + radius * Math.sin(theta)];
  const cutA = storedPoint(pointAt(lo)), cutB = storedPoint(pointAt(hi));
  if (!inRange(cutA) || !inRange(cutB) || distance(cutA, cutB) <= openJoinTolerance) return null;

  // A circle is CCW. Its remainder starts after the cut and runs back to the first cut end.
  const bulge = Math.round(Math.tan(remaining / 4) * 1e9) / 1e9;
  if (retainedLength({ center, radius, sweep: fullTurn }, cutB, cutA, bulge, radius * remaining) === null) return null;
  return { kind: 'circle', hit: pointAt(angle), removed: sampleRemovedArc(pointAt, lo, hi, cutA, cutB), cutA, cutB, bulges: [bulge] };
}

function planArcGap(a: P2, b: P2, arc: Arc, pointer: P2, gapMm: number): SegmentGap | null {
  const { center, radius, start, sweep } = arc;
  const dx = pointer[0] - center[0], dy = pointer[1] - center[1];
  const pointerRadius = Math.hypot(dx, dy);
  if (!Number.isFinite(pointerRadius) || pointerRadius <= radius / 2) return null;

  const direction = Math.sign(sweep), total = Math.abs(sweep);
  const travelled = arcTravel(arc, pointer);
  const halfGap = gapMm / (2 * radius), lo = travelled - halfGap, hi = travelled + halfGap;
  if (!(0 < lo && lo < hi && hi < total)) return null;

  const pointAt = (travel: number): P2 => {
    const angle = start + direction * travel;
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
  };
  const cutA = storedPoint(pointAt(lo)), cutB = storedPoint(pointAt(hi));
  if (!separateStoredEnds(a, cutA, cutB, b)) return null;

  const storedBulge = (travel: number) => Math.round(Math.tan(direction * travel / 4) * 1e9) / 1e9;
  const bulges: [number, number] = [storedBulge(lo), storedBulge(total - hi)];
  const head = retainedLength(arc, a, cutA, bulges[0], radius * lo);
  const tail = retainedLength(arc, cutB, b, bulges[1], radius * (total - hi));
  if (head === null || tail === null || Math.abs(head + tail + gapMm - radius * total) > storedPathTolerance) return null;

  return { kind: 'segment', hit: pointAt(travelled), removed: sampleRemovedArc(pointAt, lo, hi, cutA, cutB), cutA, cutB, bulges };
}

export function planPathGap(source: PreparedPathGap, pointer: P2, gapMm: number): PathGapPlan | null {
  if (!Number.isFinite(gapMm) || gapMm <= openJoinTolerance) return null;
  if (source.kind === 'circle') return planCircleGap(source.shape, pointer, gapMm);
  if (source.kind === 'polyline') return planPolylineGap(source, pointer, gapMm);
  const [a, b] = source.shape.points;
  return source.kind === 'line' ? planLineGap(a, b, pointer, gapMm) : planArcGap(a, b, source.arc, pointer, gapMm);
}

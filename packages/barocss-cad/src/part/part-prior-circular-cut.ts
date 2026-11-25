import { CadNumericPolicy } from '../numeric-policy.js';
import type { CurveSegment2 } from '../brep/curved-arrangement.js';
import type { Part } from './part-types.js';
import type { Tools } from './part-model.js';
import type { Point } from '../types.js';
import { priorCutRectangle } from './part-prior-rectangular-cut.js';

export type PriorCircularCut = {
  stock: Part;
  first: { result: Part; cutter: Part };
  later: readonly { result: Part; cutter: Part }[];
};
type Circle = { center: readonly [number, number]; radius: number; tag: string };
type Pattern = 'linear' | 'rectangular' | 'fill' | 'path';
const requirement = (pattern: Pattern) => `${pattern} feature pattern source needs one original circular through cut followed by original rectangular through cuts on upright rectangular stock and ${pattern === 'linear' ? 'one XY line' : pattern === 'fill' ? 'selected XY placements' : pattern === 'path' ? 'an open XY path of exact straight spans, one polynomial quadratic or one canonical quarter arc' : 'an XY grid'}`;

function profile(part: Part) {
  if (part.solid.kind !== 'upright' || part.solid.solid.slabs.length !== 1) return;
  const slab = part.solid.solid.slabs[0];
  if (slab.regions.length !== 1 || !Number.isFinite(slab.z0) || !Number.isFinite(slab.z1) || !(slab.z0 < slab.z1)) return;
  return { ...slab.regions[0], z0: slab.z0, z1: slab.z1 };
}

/** The existing arrangement stores a complete native circle as two same-carrier half-arcs. */
function circle(ring: readonly CurveSegment2[]): Circle | undefined {
  if (ring.length !== 2 || ring.some(segment => segment.kind !== 'arc')) return;
  const [a, b] = ring as readonly Extract<CurveSegment2, { kind: 'arc' }>[];
  const angular = 256 * Number.EPSILON * Math.PI;
  const sameAngle = (x: number) => Math.abs(Math.atan2(Math.sin(x), Math.cos(x))) <= angular;
  if (!(a.r > 0) || ![...a.c, a.r, a.t0, b.t0, a.sweep, b.sweep].every(Number.isFinite)
    || a.c[0] !== b.c[0] || a.c[1] !== b.c[1] || a.r !== b.r || !a.tag || a.tag !== b.tag
    || Math.abs(Math.abs(a.sweep) - Math.PI) > angular || Math.abs(Math.abs(b.sweep) - Math.PI) > angular
    || Math.sign(a.sweep) !== Math.sign(b.sweep)
    || !sameAngle(a.t0 + a.sweep - b.t0) || !sameAngle(b.t0 + b.sweep - a.t0)) return;
  return { center: a.c, radius: a.r, tag: a.tag };
}

const sameCircle = (a: Circle | undefined, b: Circle) => !!a && a.center[0] === b.center[0] && a.center[1] === b.center[1]
  && a.radius === b.radius && a.tag === b.tag;
const sameRectangle = (a: readonly CurveSegment2[], b: readonly CurveSegment2[]) => {
  const x = priorCutRectangle(a), y = priorCutRectangle(b);
  const pointEqual = (p: readonly number[], q: readonly number[]) => p[0] === q[0] && p[1] === q[1];
  return !!x && !!y && x.min.every((v, i) => v === y.min[i] && x.max[i] === y.max[i])
    && a.every(line => line.kind === 'line' && b.some(other => other.kind === 'line' && line.tag === other.tag
      && ((pointEqual(line.a, other.a) && pointEqual(line.b, other.b)) || (pointEqual(line.a, other.b) && pointEqual(line.b, other.a)))));
};

/** Certify each original native cavity along the Difference chain, then each explicit XY placement in order. */
export function certifyPriorCircularPlacements(prior: PriorCircularCut, offsets: readonly Point[], fail: Tools['fail'], pattern: Pattern): void {
  const label = `${pattern} feature pattern source`;
  const stock = profile(prior.stock), first = profile(prior.first.cutter), firstResult = profile(prior.first.result);
  const box = stock && priorCutRectangle(stock.outer), source = first && circle(first.outer);
  if (!stock || stock.holes.length || !box || !first || first.holes.length || !source || !firstResult || !prior.later.length
    || first.z0 > stock.z0 || first.z1 < stock.z1)
    return fail('CAPABILITY', requirement(pattern));
  const margin = 10 * CadNumericPolicy.linearTolerance;
  const insideCircle = (c: Circle) => c.center.every((v, i) => v - c.radius - box.min[i] > margin && box.max[i] - v - c.radius > margin);
  const insideRectangle = (rect: { min: [number, number]; max: [number, number] }) =>
    rect.min.every((v, i) => v - box.min[i] > margin && box.max[i] - rect.max[i] > margin);
  const separateCircleRect = (c: Circle, rect: { min: [number, number]; max: [number, number] }) =>
    Math.hypot(...c.center.map((v, i) => v - Math.max(rect.min[i], Math.min(rect.max[i], v)))) > c.radius + margin;
  const separateRectangles = (a: { min: [number, number]; max: [number, number] }, b: { min: [number, number]; max: [number, number] }) =>
    [0, 1].some(axis => b.min[axis] - a.max[axis] > margin || a.min[axis] - b.max[axis] > margin);
  if (!insideCircle(source)) return fail('GEOMETRY', `${label} needs strictly interior original through cuts`);
  const firstCircles = firstResult.holes.map(circle).filter((c): c is Circle => !!c);
  if (firstResult.z0 !== stock.z0 || firstResult.z1 !== stock.z1 || !sameRectangle(firstResult.outer, stock.outer)
    || firstResult.holes.length !== 1 || firstCircles.length !== 1 || !sameCircle(firstCircles[0], source))
    return fail('CAPABILITY', `${label} must retain its separate original full-height circular and rectangular cavities at each cut`);

  const laterRects: { box: { min: [number, number]; max: [number, number] }; ring: readonly CurveSegment2[] }[] = [];
  for (const stage of prior.later) {
    const cutter = profile(stage.cutter), result = profile(stage.result);
    const rectangle = cutter && priorCutRectangle(cutter.outer);
    if (!cutter || cutter.holes.length || !rectangle || !result || cutter.z0 > stock.z0 || cutter.z1 < stock.z1)
      return fail('CAPABILITY', requirement(pattern));
    if (!insideRectangle(rectangle)) return fail('GEOMETRY', `${label} needs strictly interior original through cuts`);
    if (!separateCircleRect(source, rectangle) || laterRects.some(prev => !separateRectangles(rectangle, prev.box)))
      return fail('GEOMETRY', `${label} needs disjoint original through cuts`);
    laterRects.push({ box: rectangle, ring: cutter.outer });
    const circles = result.holes.map(circle).filter((c): c is Circle => !!c);
    const rectangles = result.holes.filter(hole => priorCutRectangle(hole));
    if (result.z0 !== stock.z0 || result.z1 !== stock.z1 || !sameRectangle(result.outer, stock.outer)
      || result.holes.length !== 1 + laterRects.length || circles.length !== 1 || !sameCircle(circles[0], source)
      || rectangles.length !== laterRects.length
      || !laterRects.every(entry => rectangles.some(hole => sameRectangle(hole, entry.ring))))
      return fail('CAPABILITY', `${label} must retain its separate original full-height circular and rectangular cavities at each cut`);
  }

  const placed: Circle[] = [source];
  for (const offset of offsets) {
    if (offset.length !== 3 || offset[2] !== 0 || !offset.every(Number.isFinite))
      return fail('CAPABILITY', `${label} needs finite XY copy offsets`);
    const center: [number, number] = [source.center[0] + offset[0], source.center[1] + offset[1]];
    const copy = { ...source, center };
    if (!center.every(Number.isFinite) || !insideCircle(copy))
      return fail('GEOMETRY', `${label} cells must stay strictly inside the original stock`);
    if (!laterRects.every(entry => separateCircleRect(copy, entry.box))
      || placed.some(previous => Math.hypot(center[0] - previous.center[0], center[1] - previous.center[1]) <= source.radius + previous.radius + margin))
      return fail('GEOMETRY', `${label} cells must stay disjoint from the newer ${laterRects.length === 1 ? 'cut' : 'cuts'} and every other cell`);
    placed.push(copy);
  }
}

/** Preserve the original signed Linear schedule and its diagnostics. */
export function certifyPriorCircularCut(prior: PriorCircularCut, axis: number, spacing: number, count: number, fail: Tools['fail']): void {
  if (axis !== 0 && axis !== 1) return fail('CAPABILITY', requirement('linear'));
  const offsets: Point[] = [];
  for (let k = 1; k < count; k++) {
    const offset: Point = [0, 0, 0]; offset[axis] = spacing * k; offsets.push(offset);
  }
  certifyPriorCircularPlacements(prior, offsets, fail, 'linear');
}

/** The existing Rectangular producer visits columns inside rows and omits only its already-cut origin. */
export function certifyPriorCircularGrid(prior: PriorCircularCut, first: number, spacing: number, count: number,
  second: number, spacing2: number, count2: number, fail: Tools['fail']): void {
  if ((first !== 0 && first !== 1) || (second !== 0 && second !== 1) || first === second)
    return fail('CAPABILITY', requirement('rectangular'));
  const offsets: Point[] = [];
  for (let j = 0; j < count2; j++) for (let i = 0; i < count; i++) {
    if (!i && !j) continue;
    const offset: Point = [0, 0, 0]; offset[first] = spacing * i; offset[second] = spacing2 * j; offsets.push(offset);
  }
  certifyPriorCircularPlacements(prior, offsets, fail, 'rectangular');
}

import { CadNumericPolicy } from '../numeric-policy.js';
import type { CurveSegment2 } from '../brep/curved-arrangement.js';
import type { Part } from './part-types.js';
import type { Tools } from './part-model.js';
import { priorCutRectangle } from './part-prior-rectangular-cut.js';

export type PriorCircularCut = {
  stock: Part;
  first: { result: Part; cutter: Part };
  later: { result: Part; cutter: Part };
};
type Circle = { center: readonly [number, number]; radius: number; tag: string };
const requirement = 'linear feature pattern source needs one original circular through cut followed by one original rectangular through cut on upright rectangular stock and one XY line';

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

/** Certify both original native cavities, then every signed Linear copy, before changing the current solid. */
export function certifyPriorCircularCut(prior: PriorCircularCut, axis: number, spacing: number, count: number, fail: Tools['fail']): void {
  const stock = profile(prior.stock), first = profile(prior.first.cutter), later = profile(prior.later.cutter);
  const firstResult = profile(prior.first.result), laterResult = profile(prior.later.result);
  const box = stock && priorCutRectangle(stock.outer), source = first && circle(first.outer), rectangle = later && priorCutRectangle(later.outer);
  if ((axis !== 0 && axis !== 1) || !stock || stock.holes.length || !box || !first || first.holes.length || !source
    || !later || later.holes.length || !rectangle || !firstResult || !laterResult
    || first.z0 > stock.z0 || first.z1 < stock.z1 || later.z0 > stock.z0 || later.z1 < stock.z1)
    return fail('CAPABILITY', requirement);
  const margin = 10 * CadNumericPolicy.linearTolerance;
  const insideCircle = (c: Circle) => c.center.every((v, i) => v - c.radius - box.min[i] > margin && box.max[i] - v - c.radius > margin);
  const insideRectangle = rectangle.min.every((v, i) => v - box.min[i] > margin && box.max[i] - rectangle.max[i] > margin);
  const separateRectangle = (c: Circle) => Math.hypot(...c.center.map((v, i) => v - Math.max(rectangle.min[i], Math.min(rectangle.max[i], v)))) > c.radius + margin;
  if (!insideCircle(source) || !insideRectangle)
    return fail('GEOMETRY', 'linear feature pattern source needs strictly interior original through cuts');
  if (!separateRectangle(source)) return fail('GEOMETRY', 'linear feature pattern source needs disjoint original through cuts');
  for (const [i, result] of [firstResult, laterResult].entries()) {
    const circles = result.holes.map(circle).filter((c): c is Circle => !!c);
    const rectangles = result.holes.filter(hole => priorCutRectangle(hole));
    if (result.z0 !== stock.z0 || result.z1 !== stock.z1 || !sameRectangle(result.outer, stock.outer)
      || result.holes.length !== i + 1 || circles.length !== 1 || !sameCircle(circles[0], source)
      || rectangles.length !== i || (i === 1 && !sameRectangle(rectangles[0], later.outer)))
      return fail('CAPABILITY', 'linear feature pattern source must retain its separate original full-height circular and rectangular cavities at each cut');
  }
  const placed: Circle[] = [source];
  for (let k = 1; k < count; k++) {
    const center: [number, number] = [...source.center]; center[axis] += spacing * k;
    const copy = { ...source, center };
    if (!center.every(Number.isFinite) || !insideCircle(copy))
      return fail('GEOMETRY', 'linear feature pattern source cells must stay strictly inside the original stock');
    if (!separateRectangle(copy) || placed.some(previous => Math.hypot(center[0] - previous.center[0], center[1] - previous.center[1]) <= source.radius + previous.radius + margin))
      return fail('GEOMETRY', 'linear feature pattern source cells must stay disjoint from the newer cut and every other cell');
    placed.push(copy);
  }
}

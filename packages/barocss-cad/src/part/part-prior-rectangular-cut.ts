import { CadNumericPolicy } from '../numeric-policy.js';
import type { CurveSegment2 } from '../brep/curved-arrangement.js';
import type { Part } from './part-types.js';
import type { Tools } from './part-model.js';
import type { Point } from '../types.js';

type Rectangle = { min: [number, number]; max: [number, number] };
export type PriorRectangularCut = { stock: Part; previous: Part; other: Part };

/** Only four literal axis-aligned native lines, in their actual closed traversal order. */
function rectangle(ring: readonly CurveSegment2[]): Rectangle | undefined {
  if (ring.length !== 4 || ring.some(segment => segment.kind !== 'line')) return;
  const lines = ring as readonly Extract<CurveSegment2, { kind: 'line' }>[];
  const points = lines.map(line => line.a);
  const min: [number, number] = [Infinity, Infinity], max: [number, number] = [-Infinity, -Infinity];
  for (const point of points) for (const axis of [0, 1]) {
    min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
  }
  if (!(min[0] < max[0] && min[1] < max[1]) || ![...min, ...max].every(Number.isFinite)
    || new Set(points.map(p => `${p[0]},${p[1]}`)).size !== 4) return;
  if (lines.some((line, i) => {
    const next = points[(i + 1) % 4];
    return line.b[0] !== next[0] || line.b[1] !== next[1]
      || (line.a[0] === line.b[0]) === (line.a[1] === line.b[1])
      || ![min[0], max[0]].includes(line.a[0]) || ![min[1], max[1]].includes(line.a[1]);
  })) return;
  return { min, max };
}

function profile(part: Part) {
  if (part.solid.kind !== 'upright' || part.solid.solid.slabs.length !== 1) return;
  const slab = part.solid.solid.slabs[0];
  if (slab.regions.length !== 1 || !(slab.z0 < slab.z1)) return;
  const region = slab.regions[0], outer = rectangle(region.outer), holes = region.holes.map(rectangle);
  if (!outer || holes.some(hole => !hole)) return;
  return { outer, holes: holes as Rectangle[], z0: slab.z0, z1: slab.z1 };
}

type Pattern = 'rectangular' | 'linear' | 'fill' | 'path';
const profileRequirement = (pattern: Pattern) => `${pattern} feature pattern source needs two original upright rectangular through cuts on one rectangular stock and ${pattern === 'linear' ? 'one XY line' : pattern === 'fill' ? 'selected XY placements' : pattern === 'path' ? 'an open XY path' : 'an XY grid'}`;

/** Prove the unconditional original and precisely the captured additional placements, without clipping tools. */
export function certifyPriorCutPlacements(seed: Part, tool: Part, prior: PriorRectangularCut,
  copyOffsets: readonly Point[], fail: Tools['fail'], pattern: Pattern = 'fill'): void {
  const label = `${pattern} feature pattern source`;
  const stock = profile(prior.stock), earlier = profile(prior.previous), current = profile(seed), olderTool = profile(tool), newerTool = profile(prior.other);
  if (!stock || !earlier || !current || !olderTool || !newerTool || stock.holes.length || olderTool.holes.length || newerTool.holes.length
    || earlier.holes.length !== 1 || current.holes.length !== 2)
    return fail('CAPABILITY', profileRequirement(pattern));
  const same = (a: Rectangle, b: Rectangle) => a.min.every((value, i) => value === b.min[i]) && a.max.every((value, i) => value === b.max[i]);
  if (!same(stock.outer, earlier.outer) || !same(stock.outer, current.outer)
    || earlier.z0 !== stock.z0 || earlier.z1 !== stock.z1 || current.z0 !== stock.z0 || current.z1 !== stock.z1
    || olderTool.z0 > stock.z0 || olderTool.z1 < stock.z1 || newerTool.z0 > stock.z0 || newerTool.z1 < stock.z1
    || !same(earlier.holes[0], olderTool.outer)
    || current.holes.filter(hole => same(hole, olderTool.outer)).length !== 1 || current.holes.filter(hole => same(hole, newerTool.outer)).length !== 1)
    return fail('CAPABILITY', `${label} must retain both original full-height rectangular cavities in the current stock`);
  const margin = 10 * CadNumericPolicy.linearTolerance;
  const inside = (box: Rectangle) => box.min.every((value, axis) => value - stock.outer.min[axis] > margin
    && stock.outer.max[axis] - box.max[axis] > margin);
  const separate = (a: Rectangle, b: Rectangle) => [0, 1].some(axis => b.min[axis] - a.max[axis] > margin || a.min[axis] - b.max[axis] > margin);
  if (!inside(newerTool.outer)) return fail('GEOMETRY', `${label} needs strictly interior original through cuts`);
  const placed: Rectangle[] = [];
  const place = (offset: Point) => {
    if (offset.length !== 3 || offset[2] !== 0 || !offset.every(Number.isFinite))
      return fail('CAPABILITY', `${label} needs finite XY copy offsets`);
    const box: Rectangle = { min: [olderTool.outer.min[0] + offset[0], olderTool.outer.min[1] + offset[1]],
      max: [olderTool.outer.max[0] + offset[0], olderTool.outer.max[1] + offset[1]] };
    if (!inside(box)) return fail('GEOMETRY', `${label} cells must stay strictly inside the original stock`);
    if (!separate(box, newerTool.outer) || placed.some(previous => !separate(box, previous)))
      return fail('GEOMETRY', `${label} cells must stay disjoint from the newer cut and every other cell`);
    placed.push(box);
  };
  place([0, 0, 0]);
  for (const offset of copyOffsets) place(offset);
}

/** Existing rectangular and linear recipes retain their original row-major placement schedule and diagnostics. */
export function certifyPriorRectangularCut(seed: Part, tool: Part, prior: PriorRectangularCut,
  first: number, spacing: number, count: number, second: number, spacing2: number, count2: number, fail: Tools['fail'], pattern: 'rectangular' | 'linear' = 'rectangular'): void {
  if (![first, second].every(axis => axis === 0 || axis === 1)) return fail('CAPABILITY', profileRequirement(pattern));
  const copies: Point[] = [];
  for (let j = 0; j < count2; j++) for (let i = 0; i < count; i++) {
    if (!i && !j) continue;
    const offset: Point = [0, 0, 0]; offset[first] = spacing * i; offset[second] = spacing2 * j;
    copies.push(offset);
  }
  certifyPriorCutPlacements(seed, tool, prior, copies, fail, pattern);
}

import { checkBrep, type Brep } from './brep-core.js';
import { cardinalBoxOf } from './cardinal-box.js';

const areas = new WeakMap<Brep, number>();

export const sphericalCubeAreaOf = (brep: Brep): number | undefined => areas.get(brep);

/** Record area on the exact output of the twelve-cylinder, eight-sphere convex corner branch. */
export function recordSphericalCubeArea(source: Brep, result: Brep, radius: number): void {
  if (result.bodies.length !== 1 || result.faces.length !== 34) return;
  const box = cardinalBoxOf(source);
  if (!box) return;
  const lengths = box.ranges.map(([lo, hi]) => hi - lo), [side] = lengths;
  if (!lengths.every(length => length === side)) return;
  const inner = side - 2 * radius;
  const scale = Math.max(1, ...box.ranges.flatMap(range => range.map(Math.abs)));
  const smallest = Math.min(radius, inner);
  // Allow for frame and inset roundoff relative to the narrowest retained band.
  if (!(smallest * 1e-10 >= 64 * Number.EPSILON * scale)) return;
  const report = checkBrep(result, { strict: true });
  if (!report.valid || report.topology[0]?.genus !== 0 || report.maximumEdgeSurfaceGap > smallest * 1e-9) return;
  // Six squares, twelve quarter-cylinders and eight sphere octants.
  areas.set(result, 6 * inner ** 2 + 6 * Math.PI * inner * radius + 4 * Math.PI * radius ** 2);
}

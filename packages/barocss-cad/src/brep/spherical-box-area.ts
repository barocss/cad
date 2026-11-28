import { checkBrep, type Brep } from './brep-core.js';
import { cardinalBoxOf } from './cardinal-box.js';

const areas = new WeakMap<Brep, number>();

export const sphericalBoxAreaOf = (brep: Brep): number | undefined => areas.get(brep);

/** Record area on the exact output of the twelve-cylinder, eight-sphere convex corner branch. */
export function recordSphericalBoxArea(source: Brep, result: Brep, radius: number): void {
  if (result.bodies.length !== 1 || result.faces.length !== 34) return;
  const box = cardinalBoxOf(source);
  if (!box) return;
  const [width, depth, height] = box.ranges.map(([lo, hi]) => hi - lo);
  const x = width - 2 * radius, y = depth - 2 * radius, z = height - 2 * radius;
  const scale = Math.max(1, ...box.ranges.flatMap(range => range.map(Math.abs)));
  const smallest = Math.min(radius, x, y, z);
  // Allow for frame and inset roundoff relative to the narrowest retained band.
  if (!(smallest * 1e-10 >= 64 * Number.EPSILON * scale)) return;
  const report = checkBrep(result, { strict: true });
  if (!report.valid || report.topology[0]?.genus !== 0 || report.maximumEdgeSurfaceGap > smallest * 1e-9) return;
  // Six rectangles, twelve quarter-cylinders and eight sphere octants. Preserve the cube calculation.
  const area = width === depth && width === height
    ? 6 * x ** 2 + 6 * Math.PI * x * radius + 4 * Math.PI * radius ** 2
    : 2 * (x * y + x * z + y * z) + 2 * Math.PI * radius * (x + y + z) + 4 * Math.PI * radius ** 2;
  areas.set(result, area);
}

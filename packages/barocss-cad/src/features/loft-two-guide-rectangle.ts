import type { Point } from '../types.js';
import { buildProfileLoop, ExtrudedProfileLimits, type XY } from './extruded-profile-solid.js';
import type { LoftSectionInput } from './loft.js';

const corners = [0, 1, 2, 3];
const limit = ExtrudedProfileLimits.coordinateMM;

/** Read the exact axis-aligned rectangle and its persistent side order. */
export function twoGuideRectangle(section: LoftSectionInput, index: number, fail: (reason: string) => never) {
  if (!section || Object.hasOwn(section, 'frame') || typeof section.z !== 'number' || !Number.isFinite(section.z) || Math.abs(section.z) > limit)
    return fail(`need finite z heights within ±${limit} mm on both sections`);
  if (!Array.isArray(section.profile) || section.profile.length !== 4 || !Array.from(section.profile).every(seg => seg?.kind === 'line'))
    return fail(`need a four-line rectangle on section ${index + 1}`);
  const loop = buildProfileLoop(section.profile), { min, max } = loop.bounds;
  const positions: XY[] = [min, [max[0], min[1]], max, [min[0], max[1]]];
  const same = (a: XY, b: XY) => a[0] === b[0] && a[1] === b[1];
  const start = loop.segments.findIndex(segment => same(segment.start, min));
  if (start < 0 || !positions.every((p, i) => same(p, loop.segments[(start + i) % 4].start)))
    return fail(`need an axis-aligned rectangle on section ${index + 1}`);
  const z = section.z;
  const tags = corners.map(i => (start + i) % 4).map(i => loop.reversed ? 3 - i : i);
  return { z, tags, points: positions.map(([x, y]): Point => [x, y, z]), bounds: loop.bounds, width: max[0] - min[0], depth: max[1] - min[1] };
}

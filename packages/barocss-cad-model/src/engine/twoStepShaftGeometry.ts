import type { Brep } from '@barocss/cad';

/** Recover the two stages of the origin-aligned shaft. The caller certifies their geometry. */
export function twoStepShaftDimensions(brep: Brep) {
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed
    || brep.faces.length !== 10 || brep.loops.length !== 10 || brep.coedges.length !== 36
    || brep.edges.length !== 18 || brep.vertices.length !== 10) return;
  const points = brep.vertices.map(vertex => vertex.point);
  const levels = [...new Set(points.map(point => point[2]))].sort((a, b) => a - b);
  if (levels.length !== 3 || levels[0] !== 0) return;
  const groups = levels.map(z => points.filter(point => point[2] === z));
  if (groups[0].length !== 3 || groups[1].length !== 4 || groups[2].length !== 3) return;
  const endRadius = (group: typeof points) => {
    if (!group.some(([x, y]) => x === 0 && y === 0)) return;
    const seams = group.filter(([x, y]) => x > 0 && y === 0);
    if (seams.length === 1) return seams[0][0];
  };
  // The positive-X seam is exact. The opposite seam can have a small Y value from the half turn.
  const start = endRadius(groups[0]), end = endRadius(groups[2]);
  if (!start || !end || start === end) return;
  return {
    steps: [{ diameter: 2 * start, length: levels[1] }, { diameter: 2 * end, length: levels[2] - levels[1] }],
    height: levels[2], radius: Math.max(start, end),
  };
}

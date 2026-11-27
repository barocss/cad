import type { Brep } from '../brep/brep-core.js';
import type { Point } from '../types.js';

/** Retain exact authored base coordinates after a Draft construction is placed in the sketch frame. */
export function retainDraftBaseEndpoints(brep: Brep, fixed: ReadonlyMap<string, Point>): Brep {
  const vertices = brep.vertices.map(vertex => {
    const point = fixed.get(vertex.id);
    return point ? { ...vertex, point } : vertex;
  });
  const edges = brep.edges.map(edge => {
    const start = fixed.get(edge.vertices[0]), end = fixed.get(edge.vertices[1]);
    if (!start && !end) return edge;
    const controlPoints = [...edge.curve.controlPoints];
    if (start) controlPoints[0] = start;
    if (end) controlPoints[controlPoints.length - 1] = end;
    return { ...edge, curve: { ...edge.curve, controlPoints } };
  });
  return { ...brep, vertices, edges };
}

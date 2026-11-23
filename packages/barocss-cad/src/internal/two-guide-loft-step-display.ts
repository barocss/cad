import { faceGeometry } from '../brep/analytic-boolean.js';
import { checkBrep, type Brep, type BrepFace } from '../brep/brep-core.js';
import { twoGuideLoftSolid } from '../features/loft-two-guides.js';
import type { Point } from '../types.js';
import { tessellateTwoGuideLoftDisplay } from './two-guide-loft-display.js';

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const sameGrid = (a: readonly (readonly number[])[], b: readonly (readonly number[])[]) =>
  a.length === b.length && a.every((row, i) => same(row, b[i]));

function rectangleAt(vertices: readonly Point[], z: number) {
  const points = vertices.filter(p => p[2] === z);
  if (points.length !== 4) return;
  const xs = [...new Set(points.map(p => p[0]))].sort((a, b) => a - b);
  const ys = [...new Set(points.map(p => p[1]))].sort((a, b) => a - b);
  if (xs.length !== 2 || ys.length !== 2) return;
  const [x0, x1] = xs, [y0, y1] = ys;
  const profile: readonly [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (!profile.every(([x, y]) => points.some(p => p[0] === x && p[1] === y))) return;
  return { profile: profile.map(start => ({ kind: 'line' as const, start })), z };
}

/** Reconstruct the existing exact taper only as an independent display template. */
function taperTemplate(brep: Brep): Brep | undefined {
  const vertices = brep.vertices.map(v => v.point);
  if (!vertices.every(p => p.every(Number.isFinite))) return;
  const heights = [...new Set(vertices.map(p => p[2]))].sort((a, b) => a - b);
  const degrees = brep.faces.map(face => face.surface.kind === 'surface' ? face.surface.degreeV : 0);
  if (heights.length !== 2 || degrees.filter(degree => degree === 1).length !== 2 ||
      degrees.filter(degree => degree === 3).length !== 4) return;
  const [lo, hi] = heights.map(z => rectangleAt(vertices, z));
  if (!lo || !hi) return;
  const endpoints = new Map(brep.vertices.map(v => [v.id, v.point]));
  const guide = (index: number) => {
    const a = [...lo.profile[index].start, lo.z], b = [...hi.profile[index].start, hi.z];
    const edge = brep.edges.find(e => same(endpoints.get(e.vertices[0])!, a) && same(endpoints.get(e.vertices[1])!, b));
    if (edge?.curve.degree !== 2 || edge.curve.controlPoints.length !== 3) return;
    const [start, middle, end] = edge.curve.controlPoints;
    return { kind: 'quadratic-bezier' as const, controlPoints: [start, middle, end] as const };
  };
  const a = guide(0), b = guide(1);
  if (!a || !b) return;
  // Require the same untwisted taper family as the edited rectangular Loft.
  if (a.controlPoints[1][1] !== (lo.profile[0].start[1] + hi.profile[0].start[1]) / 2 ||
      b.controlPoints[1][1] !== (lo.profile[1].start[1] + hi.profile[1].start[1]) / 2) return;
  return twoGuideLoftSolid({ id: 'display-taper', name: 'display-taper', sections: [lo, hi], guides: [a, b] }).brep;
}

function sameFaceSupport(a: BrepFace, b: BrepFace): boolean {
  const x = a.surface, y = b.surface;
  if (x.kind !== 'surface' || y.kind !== 'surface') return false;
  if (x.degreeU !== y.degreeU || x.degreeV !== y.degreeV || !same(x.knotsU, y.knotsU) || !same(x.knotsV, y.knotsV) ||
      !x.weights.every(row => row.every(w => w === 1))) return false;
  if (y.degreeV === 3) return a.sense === b.sense && x.controlPoints.length === y.controlPoints.length &&
    x.controlPoints.every((row, i) => sameGrid(row, y.controlPoints[i])) && sameGrid(x.weights, y.weights);
  // The imported plane is wider than its trim. Keep the native oriented plane
  // and certify the trim separately by matching the full material loop below.
  const pa = faceGeometry(a), pb = faceGeometry(b);
  return pa.kind === 'plane' && pb.kind === 'plane' && same(pa.n, pb.n) &&
    x.controlPoints.length === 2 && x.controlPoints.every(row => row.length === 2 && row.every(p => p[2] === pb.o[2]));
}

function matchTopology(actual: Brep, template: Brep) {
  const vertices = new Map(template.vertices.map(v => [v.point.join(','), v.id]));
  const vertexIds = new Map(actual.vertices.map(v => [v.id, vertices.get(v.point.join(','))]));
  if ([...vertexIds.values()].some(id => id === undefined) || new Set(vertexIds.values()).size !== vertices.size) return;

  const edges = new Map(template.edges.map(e => [e.vertices.join('|'), e]));
  const edgeIds = new Map<string, string>();
  for (const edge of actual.edges) {
    const peer = edges.get(edge.vertices.map(v => vertexIds.get(v)).join('|'));
    if (!peer) return;
    const a = edge.curve, b = peer.curve;
    if (a.degree !== b.degree || !same(a.knots, b.knots) || !same(a.weights, b.weights) ||
        !sameGrid(a.controlPoints, b.controlPoints)) return;
    edgeIds.set(edge.id, peer.id);
  }
  if (new Set(edgeIds.values()).size !== template.edges.length) return;

  const loopKey = (brep: Brep, face: BrepFace, translate: (edge: string) => string | undefined) => {
    const loop = brep.loops.find(l => l.id === face.loops[0]);
    if (face.loops.length !== 1 || loop?.kind !== 'outer' || loop.coedges.length !== 4) return;
    const ring = loop.coedges.map(id => {
      const use = brep.coedges.find(c => c.id === id)!;
      return translate(use.edge) + ':' + use.sense;
    });
    const first = ring.indexOf([...ring].sort()[0]);
    return [...ring.slice(first), ...ring.slice(0, first)].join('|');
  };
  const peers = new Map(template.faces.map(face => [loopKey(template, face, id => id), face]));
  const faceIds = new Map<string, string>();
  for (const face of actual.faces) {
    const peer = peers.get(loopKey(actual, face, id => edgeIds.get(id)));
    if (!peer || !sameFaceSupport(face, peer)) return;
    faceIds.set(face.id, peer.id);
  }
  if (new Set(faceIds.values()).size !== template.faces.length) return;
  const originalIds = (mapping: ReadonlyMap<string, string>) => new Map([...mapping].map(([a, b]) => [b, a]));
  return { faces: originalIds(faceIds), edges: originalIds(edgeIds) };
}

/** Refine the certified import for display while retaining the original geometry and selection IDs. */
export function tessellateStepTwoGuideLoftDisplay(brep: Brep): ReturnType<typeof tessellateTwoGuideLoftDisplay> {
  if (brep.source.family !== 'step' || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' ||
      brep.shells.length !== 1 || !brep.shells[0].closed || brep.vertices.length !== 8 || brep.edges.length !== 12 ||
      brep.faces.length !== 6 || brep.loops.length !== 6 || brep.coedges.length !== 24 || brep.coedges.some(c => c.pcurve !== null) ||
      !checkBrep(brep).valid) return;
  try {
    const template = taperTemplate(brep);
    if (!template) return;
    const ids = matchTopology(brep, template);
    if (!ids) return;
    const detail = tessellateTwoGuideLoftDisplay(template);
    if (!detail) return;
    const { mesh, error } = detail;
    return { error, mesh: { ...mesh, faces: mesh.faces.map(f => ({ ...f, faceId: ids.faces.get(f.faceId)! })),
      edges: mesh.edges.map(e => ({ ...e, edgeId: ids.edges.get(e.edgeId)! })) } };
  } catch {
    // Optional detail must preserve the already accepted import on any failure.
    return;
  }
}

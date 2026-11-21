import { curveEvaluator, faceGeometry, surfaceD1Evaluator, type Brep } from '@barocss/cad';
import type { DisplayMesh, SmoothTurnDisplayMesh, Vec3 } from './mesh';
import { add, cross, dot, len, scale, sub } from './vec3';

const along = 96;
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const mid = (a: Vec3, b: Vec3) => scale(add(a, b), .5);

/** Replace only the display of an admitted external-axis Screw. The mesh still indexes the native owners. */
export function screwDisplayMesh(mesh: DisplayMesh, brep: Brep): SmoothTurnDisplayMesh | undefined {
  const byEdge = new Map(brep.edges.map(edge => [edge.id, edge]));
  const byFace = new Map(brep.faces.map(face => [face.id, face]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const rails = brep.edges.filter(edge => edge.curve.degree === 3);
  if (rails.length !== 4) return;
  const knots = rails[0].curve.knots;
  if (knots[0] !== 0 || knots.at(-1) !== 1 || rails.some(edge => !same(edge.curve.knots, knots))) return;
  const stations = [...new Set(knots)];
  for (let j = 1; j < along; j++) {
    const t = j / along;
    // Keep the exact native knot when it coincides with a uniform sample to roundoff.
    if (!knots.some(knot => Math.abs(knot - t) <= 16 * Number.EPSILON)) stations.push(t);
  }
  stations.sort((a, b) => a - b);
  const samples = new Map<string, Vec3[]>();
  for (const edge of brep.edges) {
    const { curve } = edge;
    if (!curve.weights.every(w => w === 1)) return;
    if (curve.degree === 3) samples.set(edge.id, stations.map(curveEvaluator(curve)));
    else if (curve.degree === 1 && curve.controlPoints.length === 2) {
      const [a, b] = curve.controlPoints;
      samples.set(edge.id, [a, mid(a, b), b]);
    } else return;
  }

  const positions: number[] = [], normals: number[] = [], faceOfVertex: number[] = [], indices: number[] = [];
  const bounds = { min: [Infinity, Infinity, Infinity] as Vec3, max: [-Infinity, -Infinity, -Infinity] as Vec3 };
  const vertex = (p: Vec3, n: Vec3, owner: number) => {
    positions.push(...p);
    normals.push(...n);
    faceOfVertex.push(owner);
    for (let i = 0; i < 3; i++) {
      bounds.min[i] = Math.min(p[i], bounds.min[i]);
      bounds.max[i] = Math.max(p[i], bounds.max[i]);
    }
  };

  for (const { id, index } of mesh.faces) {
    const face = byFace.get(id);
    if (!face || face.surface.kind !== 'surface' || face.loops.length !== 1) return;
    const loop = loops.get(face.loops[0]);
    if (!loop || loop.kind !== 'outer' || loop.coedges.length !== 4) return;
    const coedges = loop.coedges.map(id => uses.get(id)!);
    const start = positions.length / 3;
    const { surface } = face;
    if (surface.degreeV === 1) {
      const support = faceGeometry(face);
      if (support.kind !== 'plane' || coedges.some(use => byEdge.get(use.edge)?.curve.degree !== 1)) return;
      const rim = coedges.flatMap(({ edge, sense }) => {
        const [a, m, b] = samples.get(edge)!;
        return [sense === 'forward' ? a : b, m];
      });
      const centre = scale(rim.reduce((sum, p) => add(sum, p), [0, 0, 0] as Vec3), 1 / rim.length);
      vertex(centre, support.n, index);
      for (const p of rim) vertex(p, support.n, index);
      for (const [j, p] of rim.entries()) {
        const next = (j + 1) % rim.length;
        const sameSense = dot(cross(sub(p, centre), sub(rim[next], centre)), support.n) > 0;
        indices.push(start, start + 1 + (sameSense ? j : next), start + 1 + (sameSense ? next : j));
      }
      continue;
    }
    if (surface.degreeU !== 1 || surface.degreeV !== 3 || !same(surface.knotsU, [0, 0, 1, 1]) || !same(surface.knotsV, knots)) return;
    const sideRails = coedges.map(use => byEdge.get(use.edge)!).filter(edge => edge.curve.degree === 3);
    const sides = surface.controlPoints.map(row => sideRails.find(edge => {
      const poles = edge.curve.controlPoints;
      return row.length === poles.length && row.every((point, i) => same(point, poles[i]));
    }));
    if (sides.length !== 2 || !sides[0] || !sides[1] || sides[0] === sides[1]) return;
    const a = samples.get(sides[0].id)!, b = samples.get(sides[1].id)!;
    const at = surfaceD1Evaluator(surface), sense = face.sense === 'forward' ? 1 : -1;
    for (const [j, v] of stations.entries()) {
      for (const [i, p] of [a[j], mid(a[j], b[j]), b[j]].entries()) {
        const { du, dv } = at(i / 2, v);
        const n = cross(du, dv), length = len(n);
        if (!Number.isFinite(length) || length <= 0) return;
        vertex(p, scale(n, sense / length), index);
      }
      if (j === 0) continue;
      for (let i = 0; i < 2; i++) {
        const k = start + 3 * (j - 1) + i;
        if (sense === 1) indices.push(k, k + 1, k + 3, k + 1, k + 4, k + 3);
        else indices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4);
      }
    }
  }

  const edgeLines: number[] = [], edgeOfSegment: number[] = [];
  for (const edge of mesh.edges) {
    const points = edge.nativeJoint && samples.get(edge.nativeJoint.edgeId);
    if (!points) return;
    for (let i = 1; i < points.length; i++) {
      edgeLines.push(...points[i - 1], ...points[i]);
      edgeOfSegment.push(edge.index, edge.index);
    }
  }
  return { kind: 'smooth-turn', screwGrid: true, positions: new Float64Array(positions), normals: new Float32Array(normals),
    faceOfVertex: new Float32Array(faceOfVertex), indices: new Uint32Array(indices), bounds,
    edgeLines: new Float64Array(edgeLines), edgeOfSegment: new Float32Array(edgeOfSegment) };
}

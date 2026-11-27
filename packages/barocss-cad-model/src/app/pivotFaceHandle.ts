import type { BodyResult } from '../engine/evaluate';
import { pivotStockEdge } from '../engine/pivotStock';
import { add, cross, dot, len, scale, sub, unit, type Vec3 } from '../engine/vec3';
import type { HandleSpec } from './commands';

const finite = (point: readonly number[]): boolean => point.length === 3 && point.every(Number.isFinite);
const unitNormal = (point: Vec3): boolean => finite(point) && Math.abs(len(point) - 1) <= 1e-9;

/** An original native rectangular face supplies the fixed hinge and the direction into its material. */
export function pivotFaceAngleHandle(body: BodyResult, faceName: string, edgeName: string): HandleSpec | undefined {
  const faces = body.mesh.faces.filter(face => face.nativePlaneName === faceName);
  const edges = body.mesh.edges.filter(edge => edge.names.includes(edgeName));
  if (faces.length !== 1 || edges.length !== 1) return;
  const target = pivotStockEdge(body, faces[0].index, edges[0].index);
  if (!target || target.face !== faces[0] || target.edge !== edges[0]
    || target.face.exact?.kind !== 'plane' || target.other.exact?.kind !== 'plane') return;
  const { face, edge, other } = target, selected = target.face.exact, support = target.other.exact;
  if (!unitNormal(selected.n) || !unitNormal(support.n) || !finite(selected.o) || !finite(support.o)
    || Math.abs(dot(selected.n, support.n)) > 1e-9 || !finite(edge.a) || !finite(edge.b)
    || !edge.nativeJoint?.faces.includes(face.id) || !edge.nativeJoint.faces.includes(other.id)) return;
  const span = len(sub(edge.b, edge.a));
  if (!(span > 0) || !Number.isFinite(span)) return;
  const tangent = unit(sub(edge.b, edge.a)), intended = cross(support.n, selected.n);
  if (Math.abs(Math.abs(dot(tangent, intended)) - 1) > 1e-9) return;
  const axis = scale(tangent, dot(tangent, intended) < 0 ? -1 : 1).map(value => value === 0 ? 0 : value) as Vec3;
  const radial = unit(cross(scale(selected.n, -1), axis)), centre = scale(add(edge.a, edge.b), 0.5);
  if (!unitNormal(radial) || dot(radial, scale(support.n, -1)) < 1 - 1e-9) return;

  // Only exact native endpoints establish the opposite edge; mesh bounds and tessellated centroids do not.
  const boundary = body.mesh.edges.filter(member => member.faces.includes(face.index));
  if (boundary.length !== 4 || new Set(boundary.map(member => member.nativeJoint?.edgeId)).size !== 4) return;
  const corners = new Map<string, Vec3>(), degree = new Map<string, number>();
  for (const member of boundary) {
    if (!member.nativeLine || member.names.length !== 1 || member.nativeVertices?.length !== 2
      || member.nativeVertices[0] === member.nativeVertices[1] || !member.nativeJoint?.faces.includes(face.id)) return;
    for (const [index, point] of [member.a, member.b].entries()) {
      if (!finite(point)) return;
      const vertex = member.nativeVertices[index], before = corners.get(vertex);
      if (before && before.some((value, axis) => value !== point[axis])) return;
      corners.set(vertex, point); degree.set(vertex, (degree.get(vertex) ?? 0) + 1);
    }
  }
  if (corners.size !== 4 || [...degree.values()].some(count => count !== 2)) return;
  const points = [...corners.values()], distances = points.map(point => dot(sub(point, centre), radial));
  const extent = Math.max(...distances), tolerance = 1e-9 * Math.max(1, span, extent);
  if (!(extent > tolerance) || distances.filter(value => Math.abs(value) <= tolerance).length !== 2
    || distances.filter(value => Math.abs(value - extent) <= tolerance).length !== 2
    || points.some(point => Math.abs(dot(sub(point, selected.o), selected.n)) > tolerance
      || Math.abs(Math.abs(dot(sub(point, centre), axis)) - span / 2) > tolerance)) return;
  const from = add(centre, scale(radial, extent / 2));
  if (![centre, axis, from].every(finite)) return;
  return { key: 'deg', at: from, dir: axis, min: -45, max: 45, step: 1,
    arc: { centre, axis, from, worldPlane: true } };
}

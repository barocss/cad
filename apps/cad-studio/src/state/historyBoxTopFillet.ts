import type { HandleSpec } from '@barocss/cad-model/app/commands';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { featureId } from '@barocss/cad-model/engine/ids';
import type { DisplayFace } from '@barocss/cad-model/engine/mesh';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { add, cross, len, scale, sub, unit, type Vec3 } from '@barocss/cad-model/engine/vec3';
import { closedSolid, exactStraightEdge, originalFilletEdge, sameVec } from './historyFilletEvidence';

type Fillet = Extract<ModelNode, { kind: 'fillet' }>;
const vertical: Vec3 = [0, 0, 1];
const walls: Vec3[] = [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]];
const tolerance = 1e-8;

export function boxTopFilletRims(doc: StudioDoc, fillet: Fillet) {
  const sketch = doc.nodes[0];
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' || fillet.edges.length !== 4) return;
  const stock = featureId(doc.nodes, 1), cap = `${stock}.top`;
  const rims = walls.map((normal, side) => ({ normal, wall: `${stock}.side${side}`, edge: `${stock}.side${side}|${cap}`, cap }));
  if (rims.every(rim => fillet.edges.includes(rim.edge) && fillet.sigs?.[rim.edge]?.k === 'line')) return rims;
}

export function boxTopFilletFrame(rims: NonNullable<ReturnType<typeof boxTopFilletRims>>, fillet: Fillet, stock: BodyResult,
  finished: BodyResult, face: DisplayFace, radius: number): Pick<HandleSpec, 'at' | 'dir'> | undefined {
  const rounds = finished.nativeBoxTopFillets;
  if (!rounds || rounds.length !== 4 || new Set(rounds.map(round => round.faceId)).size !== 4 ||
    !closedSolid(stock) || !closedSolid(finished)) return;
  // All four rounds form one display group. Its representative face can belong to any rim.
  const root = rounds.find(round => round.faceId === face.id), exact = face.exact;
  if (!root || exact?.kind !== 'cylinder' || Math.abs(exact.r - root.radius) > tolerance ||
    len(cross(exact.a, root.axis)) > tolerance || len(cross(sub(exact.c, root.centre), root.axis)) > tolerance) return;
  const signatures = signaturesOf(stock);
  const original = rims.map(rim => {
    const match = originalFilletEdge(stock, fillet, rim.edge, signatures);
    const native = rounds.filter(round => round.edge === rim.edge);
    if (!match || !exactStraightEdge(match) || native.length !== 1) return;
    const { a, b, nativeVertices, nativeJoint } = match.source;
    if (!nativeVertices || nativeVertices[0] === nativeVertices[1] || !nativeJoint) return;
    const parents = nativeJoint.faces.map(id => stock.mesh.faces.find(parent => parent.id === id));
    const cap = parents.find(parent => parent?.nativePlaneName === rim.cap);
    const wall = parents.find(parent => parent?.nativePlaneName === rim.wall);
    if (cap?.exact?.kind !== 'plane' || !sameVec(cap.exact.n, vertical) ||
      wall?.exact?.kind !== 'plane' || !sameVec(wall.exact.n, rim.normal)) return;
    const along = cross(vertical, rim.normal), outward = add(vertical, rim.normal);
    const midpoint = scale(add(a, b), .5), centre = sub(midpoint, scale(outward, radius));
    const [round] = native;
    if (![...a, ...b, ...round.centre, ...round.axis, round.radius].every(Number.isFinite) ||
      Math.abs(len(round.axis) - 1) > tolerance || len(cross(sub(a, b), along)) > tolerance ||
      len(cross(round.axis, along)) > tolerance || len(cross(sub(round.centre, centre), along)) > tolerance ||
      Math.abs(round.radius - radius) > tolerance) return;
    return { edge: rim.edge, cap: cap.id, nativeVertices, midpoint, outward };
  });
  if (!original.every(rim => !!rim) || new Set(original.map(rim => rim.cap)).size !== 1) return;
  const vertices = original.flatMap(rim => rim.nativeVertices);
  if (new Set(vertices).size !== 4 || vertices.some(vertex => vertices.filter(id => id === vertex).length !== 2)) return;
  const first = original.find(rim => rim.edge === fillet.edges[0]);
  if (first) {
    const dir = unit(first.outward);
    return { at: add(first.midpoint, scale(dir, radius)), dir };
  }
}

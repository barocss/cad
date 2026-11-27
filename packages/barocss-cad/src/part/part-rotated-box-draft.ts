import { checkBrep, lineCurve, type Brep } from '../brep/brep-core.js';
import { transformBrep, type BrepAffine } from '../brep/brep-transform.js';
import { CadNumericPolicy } from '../numeric-policy.js';
import type { Point } from '../types.js';
import { draftBoxHinge } from './part-box-draft.js';
import { cardinalBoxOf } from './part-box-shell.js';
import type { Tools } from './part-model.js';

export interface RotatedBoxStock { readonly brep: Brep; readonly placements: readonly BrepAffine[] }

/** Exact signed permutations: put an original stock support at the lower local Z end. */
function pullFrame(axis: 0 | 1 | 2, side: 0 | 1): BrepAffine['matrix'] {
  if (axis === 0) return side === 0 ? [0, 1, 0, 0, 0, 1, 1, 0, 0] : [0, 1, 0, 0, 0, -1, -1, 0, 0];
  if (axis === 1) return side === 0 ? [0, 0, 1, 1, 0, 0, 0, 1, 0] : [0, 0, 1, -1, 0, 0, 0, -1, 0];
  return side === 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, -1, 0, 0, 0, -1];
}

/** Box corners are owned by three original supports, even when materialization changes their IDs. */
function boxOwners(brep: Brep, fail: Tools['fail']) {
  const reject = (): never => fail('CAPABILITY', 'Pivot face needs the same six original stock faces and twelve original edges.');
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed
    || brep.faces.length !== 6 || brep.loops.length !== 6 || brep.coedges.length !== 24 || brep.edges.length !== 12 || brep.vertices.length !== 8)
    return reject();
  const faces = new Map(brep.faces.map(face => [face.name, face]));
  const edges = new Map(brep.edges.map(edge => [edge.name, edge]));
  if (faces.size !== 6 || edges.size !== 12 || faces.has(undefined) || faces.has('') || edges.has(undefined) || edges.has('')) return reject();
  const faceOfLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face.name!] as const)));
  const edgeFaces = new Map<string, string[]>(), vertexFaces = new Map<string, Set<string>>();
  for (const edge of brep.edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    const incident = uses.map(use => faceOfLoop.get(use.loop));
    if (uses.length !== 2 || uses[0].sense === uses[1].sense || incident.some(name => !name) || incident[0] === incident[1]) return reject();
    edgeFaces.set(edge.name!, (incident as string[]).sort());
    for (const vertex of edge.vertices) {
      const names = vertexFaces.get(vertex) ?? new Set<string>();
      for (const name of incident) names.add(name!);
      vertexFaces.set(vertex, names);
    }
  }
  const vertices = new Map<string, Brep['vertices'][number]>();
  for (const vertex of brep.vertices) {
    const names = vertexFaces.get(vertex.id);
    if (names?.size !== 3) return reject();
    const key = JSON.stringify([...names].sort());
    if (vertices.has(key)) return reject();
    vertices.set(key, vertex);
  }
  return { faces, edges, edgeFaces, vertices };
}

/** Pivot in the proven original stock; keep the current world's native topology and fixed records. */
export function draftRotatedBoxHinge(world: Brep, stock: RotatedBoxStock, name: string, edgeName: string,
  angle: number, id: string, fail: Tools['fail']): Brep {
  const original = stock.brep, box = cardinalBoxOf(original);
  if (!box) return fail('CAPABILITY', 'Pivot face after Rotate needs one original closed cardinal box.');
  const source = boxOwners(original, fail), current = boxOwners(world, fail);
  for (const [faceName] of source.faces) if (!current.faces.has(faceName))
    return fail('REFERENCE', 'An original Pivot face is missing after Rotate.');
  for (const [edgeName, incident] of source.edgeFaces) {
    const actual = current.edgeFaces.get(edgeName);
    if (!actual || JSON.stringify(actual) !== JSON.stringify(incident))
      return fail('REFERENCE', 'An original Pivot edge has changed its face owners after Rotate.');
  }
  const face = source.faces.get(name), edge = source.edges.get(edgeName);
  if (!face || !edge || !current.faces.has(name) || !current.edges.has(edgeName))
    return fail('REFERENCE', 'The original Draft face or edge is missing or ambiguous.');
  const incident = source.edgeFaces.get(edgeName)!;
  if (!incident.includes(name)) return fail('SELECTION', 'The fixed Pivot edge must belong to the selected original face.');
  const startFace = source.faces.get(incident.find(candidate => candidate !== name)!)!;
  const start = box.sides.get(startFace.id)!, selected = box.sides.get(face.id)!;
  if (start.axis === selected.axis) return fail('SELECTION', 'The fixed Pivot edge must join two different original stock supports.');

  const toZ = pullFrame(start.axis, start.side);
  const fromZ: BrepAffine['matrix'] = [toZ[0], toZ[3], toZ[6], toZ[1], toZ[4], toZ[7], toZ[2], toZ[5], toZ[8]];
  const local = draftBoxHinge(transformBrep(original, { matrix: toZ }), name, edgeName, angle, id, fail);
  const drafted = transformBrep(local, { matrix: fromZ });
  let placed = drafted;
  for (const placement of stock.placements) placed = transformBrep(placed, placement);
  const madeFaces = new Map(placed.faces.map(face => [face.id, face]));
  const madeVertices = new Map(drafted.vertices.map(vertex => [vertex.id, vertex]));
  const verticesById = new Map<string, Brep['vertices'][number]>();
  const vector = (p: Point, m: BrepAffine['matrix']): Point => [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
  ];
  for (const [key, vertex] of source.vertices) {
    const currentVertex = current.vertices.get(key);
    if (!currentVertex) return fail('REFERENCE', 'An original Pivot corner has changed its face owners after Rotate.');
    const made = madeVertices.get(vertex.id)!;
    let delta: Point = [made.point[0] - vertex.point[0], made.point[1] - vertex.point[1], made.point[2] - vertex.point[2]];
    if (delta.every(value => value === 0)) { verticesById.set(currentVertex.id, currentVertex); continue; }
    for (const placement of stock.placements) delta = vector(delta, placement.matrix);
    const point: Point = [currentVertex.point[0] + delta[0], currentVertex.point[1] + delta[1], currentVertex.point[2] + delta[2]];
    if (point.every((value, axis) => value === currentVertex.point[axis]))
      return fail('GEOMETRY', 'The angle is too small to move the selected Pivot face in world coordinates.');
    verticesById.set(currentVertex.id, { ...currentVertex, point });
  }
  const vertices = world.vertices.map(vertex => verticesById.get(vertex.id)!);
  const hinge = current.edges.get(edgeName)!;
  const edges = world.edges.map(edge => edge.id === hinge.id || edge.vertices.every(vertex =>
    verticesById.get(vertex) === world.vertices.find(candidate => candidate.id === vertex)) ? edge : {
    ...edge, curve: lineCurve(edge.curve.id, verticesById.get(edge.vertices[0])!.point, verticesById.get(edge.vertices[1])!.point),
  });
  const faces = world.faces.map(face => {
    const made = madeFaces.get(source.faces.get(face.name)!.id)!;
    return { ...face, sense: made.sense, surface: { ...made.surface, id: face.surface.id } };
  });
  if ([...vertices.map(vertex => vertex.point), ...faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])]
    .some(point => point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.coordinateAbs)))
    return fail('PARAMETER', 'The pivoted box exceeds the modeling coordinate range.');
  const result: Brep = { ...world, source: { family: 'draft', id }, vertices, edges, faces,
    coedges: world.coedges.map(coedge => ({ ...coedge, pcurve: null })) };
  const report = checkBrep(result, { strict: true });
  if (!report.valid) return fail('GEOMETRY', `The pivoted box is invalid: ${report.issues[0]}`);
  return result;
}

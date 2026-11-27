import { checkBrep, type Brep } from '../brep/brep-core.js';
import { add, dot, scale, sub, unit } from '../core/vec3.js';
import { affineChart, coverAffineTrim, pivotPrismWallFromCap, rebindPrismTrim, type PrismTrimFace } from '../features/prism-wall-offset.js';
import { CadNumericPolicy, geometryScaleMM } from '../numeric-policy.js';
import type { Point } from '../types.js';
import type { RotatedBoxStock } from './part-rotated-box-draft.js';
import type { Tools } from './part-model.js';

export interface RotatedPivotStock extends RotatedBoxStock { readonly kind: 'box' | 'polygon' }

/** Original support owners identify a placed prism without inverse-coordinate matching. */
function prismOwners(brep: Brep, count: number, fail: Tools['fail']) {
  const reject = (): never => fail('CAPABILITY', 'Pivot face needs the same original polygon faces, edges and corners after Rotate.');
  if (count < 3 || count > 1024 || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid'
    || brep.shells.length !== 1 || !brep.shells[0].closed || brep.faces.length !== count + 2
    || brep.loops.length !== count + 2 || brep.coedges.length !== 6 * count
    || brep.edges.length !== 3 * count || brep.vertices.length !== 2 * count) return reject();
  const faces = new Map(brep.faces.map(face => [face.name, face]));
  const edges = new Map(brep.edges.map(edge => [edge.name, edge]));
  if (faces.size !== count + 2 || edges.size !== 3 * count || faces.has(undefined) || faces.has('')
    || edges.has(undefined) || edges.has('')) return reject();
  const faceOfLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face.name!] as const)));
  const usesByEdge = new Map<string, Brep['coedges'][number][]>();
  for (const use of brep.coedges) {
    const uses = usesByEdge.get(use.edge) ?? [];
    uses.push(use); usesByEdge.set(use.edge, uses);
  }
  const edgeFaces = new Map<string, string[]>(), vertexFaces = new Map<string, Set<string>>();
  for (const edge of brep.edges) {
    const uses = usesByEdge.get(edge.id) ?? [], incident = uses.map(use => faceOfLoop.get(use.loop));
    if (uses.length !== 2 || uses[0].sense === uses[1].sense || incident.some(name => !name) || incident[0] === incident[1]) return reject();
    edgeFaces.set(edge.name!, (incident as string[]).sort());
    for (const id of edge.vertices) {
      const names = vertexFaces.get(id) ?? new Set<string>();
      for (const name of incident) names.add(name!);
      vertexFaces.set(id, names);
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

/** Transport only changed local corners; retain the fixed world cap, hinge and native parameter curves. */
export function draftRotatedPolygonHinge(world: Brep, stock: RotatedBoxStock, name: string, edgeName: string,
  angle: number, fail: Tools['fail']): Brep {
  const original = stock.brep, local = pivotPrismWallFromCap(original, name, edgeName, angle, fail);
  const count = original.faces.length - 2, source = prismOwners(original, count, fail), current = prismOwners(world, count, fail);
  if (!checkBrep(world, { strict: true }).valid || world.coedges.some(use => !use.pcurve))
    return fail('CAPABILITY', 'Pivot face needs the complete original native polygon trims after Rotate.');
  for (const [faceName] of source.faces) if (!current.faces.has(faceName)) return fail('REFERENCE', 'An original Pivot face is missing after Rotate.');
  for (const [edgeName, incident] of source.edgeFaces) {
    if (JSON.stringify(current.edgeFaces.get(edgeName)) !== JSON.stringify(incident))
      return fail('REFERENCE', 'An original Pivot edge has changed its face owners after Rotate.');
  }
  const made = new Map(local.brep.vertices.map(vertex => [vertex.id, vertex]));
  const moved = new Map<string, Point>();
  for (const [key, vertex] of source.vertices) {
    const currentVertex = current.vertices.get(key);
    if (!currentVertex) return fail('REFERENCE', 'An original Pivot corner has changed its face owners after Rotate.');
    let delta = sub(made.get(vertex.id)!.point, vertex.point);
    if (delta.every(value => value === 0)) continue;
    for (const { matrix: m } of stock.placements) delta = [
      m[0] * delta[0] + m[1] * delta[1] + m[2] * delta[2],
      m[3] * delta[0] + m[4] * delta[1] + m[5] * delta[2],
      m[6] * delta[0] + m[7] * delta[1] + m[8] * delta[2],
    ];
    const point = add(currentVertex.point, delta);
    if (point.every((value, axis) => value === currentVertex.point[axis])) return fail('GEOMETRY', 'The Pivot angle is too small to move the wall in world coordinates.');
    moved.set(currentVertex.id, point);
  }
  if (moved.size !== 2) return fail('GEOMETRY', 'Pivot face did not retain its original cap corners.');

  const selected = current.faces.get(name)!, fixedCap = current.faces.get(local.capName)!, hinge = current.edges.get(edgeName)!;
  const selectedChart = affineChart(selected.surface, selected.sense), capChart = affineChart(fixedCap.surface, fixedCap.sense);
  if (!selectedChart || !capChart) return fail('CAPABILITY', 'Pivot face needs the original affine wall and cap charts after Rotate.');
  const n = selectedChart.normal, pull = scale(capChart.normal, -1);
  if (Math.abs(dot(n, pull)) > 1e-9) return fail('GEOMETRY', 'The placed wall and its original cap are not perpendicular.');
  const normal = unit(add(scale(n, Math.cos(angle)), scale(pull, Math.sin(angle))));
  const origin = hinge.curve.controlPoints[0], projected = dot(normal, n);
  if (!(projected > 0)) return fail('GEOMETRY', 'The placed Pivot support lost its original outward direction.');
  const supportAt = (point: Point) => dot(sub(point, origin), normal);
  const lift = (point: Point) => add(point, scale(n, -supportAt(point) / projected));
  const points = world.vertices.map(vertex => moved.get(vertex.id) ?? vertex.point), extent = geometryScaleMM(points);
  if (!(extent <= CadNumericPolicy.coordinateAbs)) return fail('PARAMETER', 'The pivoted polygon exceeds the modeling coordinate range.');
  const roundoff = 64 * Number.EPSILON * Math.max(1, extent);
  const edges = new Map(world.edges.map(edge => [edge.id, edge]));
  const coedges = new Map(world.coedges.map(use => [use.id, use]));
  const loops = new Map(world.loops.map(loop => [loop.id, loop]));
  const vertices = new Map(world.vertices.map(vertex => [vertex.id, vertex]));
  const charts = new Map<PrismTrimFace, NonNullable<ReturnType<typeof affineChart>>>();
  for (const face of world.faces) {
    const loop = face.loops.length === 1 ? loops.get(face.loops[0]) : undefined, chart = affineChart(face.surface, face.sense);
    if (!loop || !chart) return fail('CAPABILITY', 'Pivot face needs one affine native loop per original face.');
    const cornerIds = loop.coedges.map(id => {
      const use = coedges.get(id)!, edge = edges.get(use.edge)!;
      return edge.vertices[use.sense === 'forward' ? 0 : 1];
    });
    if (!cornerIds.some(id => moved.has(id))) continue;
    const corners = cornerIds.map(id => moved.get(id) ?? vertices.get(id)!.point);
    const seed = face === selected ? affineChart({ ...chart.surface, controlPoints: chart.surface.controlPoints.map(row => row.map(lift)) }, face.sense) : chart;
    const fitted = seed && coverAffineTrim(seed, face.sense, corners, roundoff);
    if (!fitted) return fail('GEOMETRY', 'Pivot face cannot preserve a placed support and its native trim.');
    if (face === selected && (dot(fitted.normal, normal) <= 0 || fitted.surface.controlPoints.flat().some(point => Math.abs(supportAt(point)) > roundoff)))
      return fail('GEOMETRY', 'Pivot face cannot preserve its placed support plane.');
    charts.set({ original: face, loop, chart }, fitted);
  }
  const result = rebindPrismTrim(world, moved, charts);
  if (result.faces.find(face => face.id === fixedCap.id) !== fixedCap || result.edges.find(edge => edge.id === hinge.id) !== hinge)
    return fail('GEOMETRY', 'Pivot face did not retain the exact fixed world cap and edge.');
  if (result.faces.some(face => face.surface.kind !== 'surface' || face.surface.controlPoints.flat().some(point => point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.coordinateAbs))))
    return fail('PARAMETER', 'The pivoted polygon charts exceed the modeling coordinate range.');
  const report = checkBrep(result, { strict: true });
  if (!report.valid) return fail('GEOMETRY', `The pivoted polygon is invalid: ${report.issues[0]}`);
  return result;
}

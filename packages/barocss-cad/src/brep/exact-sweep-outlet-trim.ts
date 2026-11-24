import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { ExtrudedProfileLimits } from '../features/extruded-profile-solid.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point } from '../types.js';
import { faceGeometry } from './analytic-boolean.js';
import { affinePlaneBinding } from './affine-plane-binding.js';
import { BrepError, checkBrep, type Brep } from './brep-core.js';

export function trimExactSweepOutlet(
  brep: Brep, outlet: string, rail: { axis: Point; length: number; wallPrefix: string },
  plane: { readonly origin: Point; readonly normal: Point },
): Brep {
  const fail = (detail: string): never => { throw new BrepError('GEOMETRY', `Exact paired sweep outlet replacement: ${detail}`); };
  const size = len(plane.normal);
  if (![...plane.origin, ...plane.normal, size].every(Number.isFinite) || size <= 0 ||
    plane.origin.some(value => Math.abs(value) > CadNumericPolicy.coordinateAbs)) return fail('the reference plane is outside the native modeling range.');
  const normal = unit(plane.normal), alignment = dot(normal, rail.axis), angular = 256 * Number.EPSILON;
  if (len(cross(normal, rail.axis)) <= angular || Math.abs(alignment) <= angular)
    return fail('the reference plane must be tilted across the original straight outlet.');

  const cap = brep.faces.find(face => face.name === outlet)!;
  if (cap.surface.kind !== 'surface') return fail('the original outlet has no planar chart.');
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const capLoops = new Set(cap.loops);
  const rimIds = new Set(brep.coedges.filter(use => capLoops.has(use.loop)).map(use => use.edge));
  const terminalIds = new Set(brep.edges.filter(edge => rimIds.has(edge.id)).flatMap(edge => edge.vertices));
  if (rimIds.size !== 12 || terminalIds.size !== 12) return fail('the original outer rim and two passages are required.');

  const tolerance = linearToleranceMM(geometryScaleMM(brep.vertices.map(vertex => vertex.point)));
  const displacement = (point: Point) => dot(normal, sub(plane.origin, point)) / alignment;
  const lift = (point: Point) => add(point, scale(rail.axis, displacement(point)));
  const vertices = brep.vertices.map(vertex => {
    if (!terminalIds.has(vertex.id)) return vertex;
    const shift = displacement(vertex.point);
    if (!(shift < -tolerance && rail.length + shift > Math.max(tolerance, ExtrudedProfileLimits.minimumLengthMM)))
      return fail('the new cap must stay strictly between the original outlet and its preceding bend join.');
    return { ...vertex, point: lift(vertex.point) };
  });
  const points = new Map(vertices.map(vertex => [vertex.id, vertex.point]));
  const movedEdges = new Map<string, Brep['edges'][number]>();
  const edges = brep.edges.map(edge => {
    if (!edge.vertices.some(id => terminalIds.has(id))) return edge;
    const curve = edge.curve;
    if (curve.degree !== 1 || curve.controlPoints.length !== 2 || curve.weights[0] !== curve.weights[1])
      return fail('the moved cap and its straight tail must have linear edges.');
    const next = { ...edge, curve: { ...curve, controlPoints: edge.vertices.map(id => points.get(id)!) } };
    movedEdges.set(edge.id, next);
    return next;
  });
  if (movedEdges.size !== 24) return fail('the outlet must have twelve straight rails and twelve rim edges.');

  const newCap = { ...cap, surface: { ...cap.surface, controlPoints: cap.surface.controlPoints.map(row => row.map(lift)) } };
  const faces = brep.faces.map(face => face === cap ? newCap : face);
  const byFace = new Map(faces.map(face => [face.id, face]));
  const coedges = brep.coedges.map(use => {
    const edge = movedEdges.get(use.edge);
    if (!edge || capLoops.has(use.loop)) return use;
    const wall = byFace.get(loops.get(use.loop)!.face);
    // The replacement is inward. Each shortened edge still lies in its original planar wall chart.
    if (!use.pcurve || !wall?.name?.startsWith(rail.wallPrefix) || wall.surface.kind !== 'surface')
      return fail('the moved edges must stay on the original tail walls.');
    const binding = affinePlaneBinding(edge.curve, wall.surface, tolerance);
    if (!binding) return fail('a shortened edge could not bind to its original wall chart.');
    return { ...use, pcurve: { ...binding, id: use.pcurve.id } };
  });
  const result = { ...brep, vertices, edges, faces, coedges };
  const support = faceGeometry(newCap);
  if (support.kind !== 'plane' || dot(support.n, rail.axis) <= 0 || len(cross(support.n, normal)) > angular ||
    Math.abs(dot(sub(support.o, plane.origin), normal)) > tolerance) return fail('the outlet could not match the reference plane.');
  const report = checkBrep(result, { strict: true });
  if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 2)
    return fail(`the replacement could not retain both passages${report.issues[0] ? `: ${report.issues[0]}` : '.'}`);
  return result;
}

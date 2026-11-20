import {
  CadNumericPolicy, CadPartLimits, checkOutput, evaluateCadPart, faceGeometry,
  type Brep, type CadPartFeature, type CadPartOutput,
} from '@barocss/cad';
import { boxFaceReplacementFrame, draftedCapReplacementFrame, draftedFaceOffsetFrame, draftedWallReplacementFrame } from '@barocss/cad/internal/drafted-cap-offset';
import { prismWallOffsetFrame } from '@barocss/cad/internal/prism-wall-offset';
import type { OffsetFaceNode, OffsetPlaneRef, ReplaceFaceNode, StudioDoc } from './doc';
import { featureId } from './ids';
import { refusal } from './refusal';
import { cross, dot, len, sub, type Vec3 } from './vec3';

const invalid = (reason: string) => refusal('VALUE', `Offset face: ${reason}`);
const roundoff = 128 * Number.EPSILON;

/** The anchor's position in the body distinguishes ordinal faces without freezing its placement. */
export function offsetPlaneWitness(brep: Brep, name: string) {
  const faces = brep.faces.filter(face => face.name === name);
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || faces.length !== 1) return null;
  const face = faces[0], surface = face.surface;
  if (surface.kind !== 'surface' || surface.degreeU !== 1 || surface.degreeV !== 1 ||
      surface.controlPoints.length !== 2 || surface.controlPoints.some(row => row.length !== 2)) return null;
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane') return null;
  const poles = surface.controlPoints.flat();
  const tolerance = roundoff * Math.max(1, ...poles.flat().map(Math.abs));
  if (poles.some(point => Math.abs(dot(sub(point, plane.o), plane.n)) > tolerance)) return null;
  const loops = new Set(face.loops);
  const edgeIds = new Set(brep.coedges.filter(use => loops.has(use.loop)).map(use => use.edge));
  const vertexIds = new Set(brep.edges.filter(edge => edgeIds.has(edge.id)).flatMap(edge => edge.vertices));
  const min: Vec3 = [Infinity, Infinity, Infinity], trimMin: Vec3 = [Infinity, Infinity, Infinity];
  for (const vertex of brep.vertices) for (const axis of [0, 1, 2] as const) {
    min[axis] = Math.min(min[axis], vertex.point[axis]);
    if (vertexIds.has(vertex.id)) trimMin[axis] = Math.min(trimMin[axis], vertex.point[axis]);
  }
  if (!trimMin.every(Number.isFinite) || !min.every(Number.isFinite)) return null;
  return { point: plane.o, normal: plane.n, localAnchor: sub(trimMin, min), localSupport: dot(sub(plane.o, min), plane.n) };
}

function liveSolid(outputs: readonly CadPartOutput[], id: string, missing: (reason: string) => Error) {
  const matches = outputs.filter(output => output.id === id);
  const [output] = matches;
  if (matches.length !== 1 || output.representation === 'faceted' || !checkOutput(output).valid)
    throw missing('both faces must remain on two current exact solids.');
  return output.brep;
}

function boundSolids(doc: StudioDoc, binding: OffsetPlaneRef, parent: OffsetFaceNode['parent'], prefix: CadPartFeature[], missing: (reason: string) => Error) {
  if (doc.nodes[binding.body.node]?.suppressed) throw missing('the reference body is suppressed.');
  const { outputs } = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: doc.parameters, features: prefix });
  const source = liveSolid(outputs, featureId(doc.nodes, parent.node), missing);
  const target = liveSolid(outputs, binding.feature, missing);
  return { source, target };
}

function checkedPlane(target: Brep, binding: OffsetPlaneRef, missing: (reason: string) => Error) {
  const plane = offsetPlaneWitness(target, binding.face);
  if (!plane || len(sub(plane.normal, binding.normal)) > roundoff ||
      len(sub(plane.localAnchor, binding.localAnchor)) > CadNumericPolicy.linearTolerance ||
      Math.abs(plane.localSupport - binding.localSupport) > CadNumericPolicy.linearTolerance)
    throw missing('the original reference face changed. Pick it again.');
  return plane;
}

/** Lower the saved binding from the same native prefix that owns both selected faces. */
export function resolveOffsetPlaneDistance(doc: StudioDoc, binding: OffsetPlaneRef, node: Pick<OffsetFaceNode, 'parent' | 'faces'>, prefix: CadPartFeature[]): number {
  const missing = (reason: string) => refusal('BAD_REFERENCE', `Offset face: ${reason}`);
  const { source, target } = boundSolids(doc, binding, node.parent, prefix, missing);
  const frame = draftedFaceOffsetFrame(source, node.faces[0]) ?? prismWallOffsetFrame(source, node.faces[0]);
  if (!frame) throw missing('the original face no longer supports this direct edit.');
  const plane = checkedPlane(target, binding, missing);
  if (len(cross(frame.normal, plane.normal)) > roundoff) throw invalid('the reference plane must be parallel to the selected face.');
  const distance = dot(sub(plane.point, frame.anchor), frame.normal);
  if (!Number.isFinite(distance) || Math.abs(distance) > CadPartLimits.length) throw invalid('the move exceeds the native modeling range.');
  if (Math.abs(distance) <= CadNumericPolicy.linearTolerance) throw invalid('the faces are already on the same plane within modeling tolerance.');
  return distance;
}

export function resolveReplacementPlane(doc: StudioDoc, node: ReplaceFaceNode, prefix: CadPartFeature[]) {
  const missing = (reason: string) => refusal('BAD_REFERENCE', `Replace face: ${reason}`);
  const { source, target } = boundSolids(doc, node.target, node.parent, prefix, missing);
  const face = node.faces[0];
  if (!boxFaceReplacementFrame(source, face) && !draftedCapReplacementFrame(source, face) && !draftedWallReplacementFrame(source, face))
    throw missing('the original rectangular face no longer supports replacement.');
  const plane = checkedPlane(target, node.target, missing);
  return { origin: plane.point, normal: plane.normal };
}

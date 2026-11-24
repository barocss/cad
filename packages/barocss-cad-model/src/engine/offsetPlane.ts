import {
  CadNumericPolicy, CadPartLimits, checkOutput, evaluateCadPart, faceGeometry,
  type Brep, type CadPartDocument, type CadPartFeature, type CadPartOutput, type CadPartSnapshot,
} from '@barocss/cad';
import { boxFaceReplacementFrame, draftedCapReplacementFrame, draftedFaceOffsetFrame, draftedWallReplacementFrame } from '@barocss/cad/internal/drafted-cap-offset';
import { annularCapReplacementFrame, boredCapReplacementFrame, circularCapReplacementFrame } from '@barocss/cad/internal/bored-cap-offset';
import { exactSemicylinderCapOffsetFrame, exactSemicylinderCapReplacementAfterWallFrame, exactSemicylinderCapReplacementFrame } from '@barocss/cad/internal/exact-cylinder-cap-offset';
import { exactPairedElbowOutletOffsetFrame, exactPerpendicularAnnularOutletOffsetFrame } from '@barocss/cad/internal/exact-paired-elbow-offset';
import { prismCapReplacementFrame, prismWallOffsetFrame, prismWallReplacementFrame } from '@barocss/cad/internal/prism-wall-offset';
import { exactSemicylinderCapAfterWall, exactSemicylinderCapSource, isPairedFiveSpanCapPlaneSource, pairedFiveSpanOppositeReplacementSourceIndex, sweepOffsetPlaneSource, type OffsetFaceNode, type OffsetPlaneRef, type ReplaceFaceNode, type StudioDoc } from './doc';
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

type BuildPart = (doc: CadPartDocument) => CadPartSnapshot;

function boundSolids(doc: StudioDoc, binding: OffsetPlaneRef, parent: OffsetFaceNode['parent'], prefix: CadPartFeature[],
  missing: (reason: string) => Error, build: BuildPart = evaluateCadPart) {
  if (doc.nodes[binding.body.node]?.suppressed) throw missing('the reference body is suppressed.');
  const { outputs } = build({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: doc.parameters, features: prefix });
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

function requireCurrentSweepDonor(doc: StudioDoc, binding: OffsetPlaneRef, missing: (reason: string) => Error) {
  const reference = doc.nodes[binding.body.node];
  if (!reference || reference.suppressed || reference.held !== undefined || featureId(doc.nodes, binding.body.node) !== binding.feature)
    throw missing('the original reference body is missing, held, suppressed or changed.');
}

/** Lower the saved binding from the same native prefix that owns both selected faces. */
export function resolveOffsetPlaneDistance(doc: StudioDoc, binding: OffsetPlaneRef, node: Pick<OffsetFaceNode, 'parent' | 'faces'>,
  prefix: CadPartFeature[], build?: BuildPart): number {
  const missing = (reason: string) => refusal('BAD_REFERENCE', `Offset face: ${reason}`);
  const owner = doc.nodes[node.parent.node], face = node.faces[0];
  const sweepCap = sweepOffsetPlaneSource(doc.nodes, node.parent.node, face);
  if (sweepCap) requireCurrentSweepDonor(doc, binding, missing);
  const { source, target } = boundSolids(doc, binding, node.parent, prefix, missing, build);
  let frame: { anchor: Vec3; normal: Vec3 } | undefined;
  if (owner?.kind === 'sweep-curve') {
    if (sweepCap) {
      const readFrame = sweepCap === 'paired' ? exactPairedElbowOutletOffsetFrame : exactPerpendicularAnnularOutletOffsetFrame;
      frame = readFrame(source, face, {
        id: featureId(doc.nodes, node.parent.node), mode: 'exact', path: { kind: 'curve', id: 'path', ...owner.path },
      });
    }
  } else if (owner?.kind === 'thicken' && owner.mode === 'exact-cylinder') {
    const cap = exactSemicylinderCapSource(doc.nodes, node.parent.node, doc.parameters);
    if (cap?.faces.includes(face)) frame = exactSemicylinderCapOffsetFrame(source, face, {
      id: cap.id, surface: { ...owner.surface, kind: 'surface', id: 'surface' }, thickness: cap.thickness, side: owner.side,
    });
  } else {
    frame = draftedFaceOffsetFrame(source, face) ?? prismWallOffsetFrame(source, face);
  }
  if (!frame) throw missing('the original face no longer supports this direct edit.');
  const plane = checkedPlane(target, binding, missing);
  if (len(cross(frame.normal, plane.normal)) > roundoff) throw invalid('the reference plane must be parallel to the selected face.');
  const distance = dot(sub(plane.point, frame.anchor), frame.normal);
  if (!Number.isFinite(distance) || Math.abs(distance) > CadPartLimits.length) throw invalid('the move exceeds the native modeling range.');
  if (Math.abs(distance) <= CadNumericPolicy.linearTolerance) throw invalid('the faces are already on the same plane within modeling tolerance.');
  return distance;
}

export function resolveReplacementPlane(doc: StudioDoc, node: ReplaceFaceNode, prefix: CadPartFeature[], build?: BuildPart) {
  const missing = (reason: string) => refusal('BAD_REFERENCE', `Replace face: ${reason}`);
  const face = node.faces[0];
  const originalSweep = pairedFiveSpanOppositeReplacementSourceIndex(doc.nodes, node.parent.node, face);
  const pairedCap = originalSweep !== undefined || isPairedFiveSpanCapPlaneSource(doc.nodes, node.parent.node, face);
  if (pairedCap) requireCurrentSweepDonor(doc, node.target, missing);
  const { source, target } = boundSolids(doc, node.target, node.parent, prefix, missing, build);
  const paired = exactSemicylinderCapAfterWall(doc.nodes, node.parent.node, doc.parameters, face);
  const owner = doc.nodes[paired?.sourceIndex ?? originalSweep ?? node.parent.node];
  if (owner?.kind === 'thicken' && owner.mode === 'exact-cylinder') {
    const cap = paired?.source ?? exactSemicylinderCapSource(doc.nodes, node.parent.node, doc.parameters);
    const authored = cap && { id: cap.id, surface: { ...owner.surface, kind: 'surface' as const, id: 'surface' }, thickness: cap.thickness, side: owner.side };
    const frame = authored && (paired ? exactSemicylinderCapReplacementAfterWallFrame(source, face, authored, paired.prior)
      : exactSemicylinderCapReplacementFrame(source, face, authored));
    if (!frame) throw missing('pick the original upper cap of an Exact semicylinder.');
  } else if (owner?.kind === 'sweep-curve') {
    if (!pairedCap || !exactPairedElbowOutletOffsetFrame(source, face, {
      id: featureId(doc.nodes, originalSweep ?? node.parent.node), mode: 'exact', path: { kind: 'curve', id: 'path', ...owner.path },
    })) throw missing('pick the original straight inlet or outlet of the five-span paired Exact Sweep.');
  } else if (!boxFaceReplacementFrame(source, face) && !draftedCapReplacementFrame(source, face) &&
      !draftedWallReplacementFrame(source, face) && !prismCapReplacementFrame(source, face) && !prismWallReplacementFrame(source, face) &&
      !boredCapReplacementFrame(source, face) && !circularCapReplacementFrame(source, face) && !annularCapReplacementFrame(source, face)) {
    throw missing('the original face no longer supports replacement.');
  }
  const plane = checkedPlane(target, node.target, missing);
  return { origin: plane.point, normal: plane.normal };
}

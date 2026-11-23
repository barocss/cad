import { CadNumericPolicy, type Brep } from '@barocss/cad';
import { bodyKey, isPairedFiveSpanOutletPlaneSource, withNode, type BodyRef, type OffsetPlaneRef, type StudioDoc } from '../engine/doc';
import { partBreps, type BodyResult } from '../engine/evaluate';
import { featureId } from '../engine/ids';
import { offsetPlaneWitness } from '../engine/offsetPlane';
import { captureSignatures } from '../engine/references';
import type { Proposal } from '../engine/schema/proposals';
import { cross, dot, len, sub, unit } from '../engine/vec3';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, canonicalOf, revisionOf } from '../util/revision';
import { pairedElbowOutletOffsetEvidence } from './pairedElbowOutletOffsetEvidence';
import { pairedDuctSection } from './rectangularDuctProposalReview';

type Member = { body: string; feature: string; face: string; faceId: Brep['faces'][number]['id']; bodySha256: string };
type PlaneEvidence = {
  brep: Brep;
  pairedElbowOutletPlaneOffset: NonNullable<ReturnType<typeof pairedElbowOutletOffsetEvidence>> & {
    sourceBody: string; body: string;
    source: Member;
    reference: Member & { target: OffsetPlaneRef; normalRelation: 'aligned' | 'opposed' };
    candidate: Member;
  };
};

function scope(doc: StudioDoc) {
  if (doc.nodes.length !== 5 || doc.instances?.length || doc.direct ||
    doc.nodes.some(node => node.suppressed || node.held !== undefined)) return;
  const [sketch, sweep, donorSketch, donor, placement] = doc.nodes;
  const section = pairedDuctSection(sketch);
  const face = `${featureId(doc.nodes, 1)}.end`;
  if (!section || sweep?.kind !== 'sweep-curve' || sweep.sketch !== 0 ||
    !isPairedFiveSpanOutletPlaneSource(doc.nodes, 1, face) ||
    donorSketch?.kind !== 'sketch' || donorSketch.profile !== 'rectangle' || donorSketch.holes?.length ||
    donorSketch.regions?.length || donorSketch.plane || donorSketch.outline || donorSketch.on || donorSketch.association ||
    donorSketch.pocketFloor || donor?.kind !== 'extrude' || donor.sketch !== 2 || (donor.draft !== undefined && donor.draft !== 0) ||
    donor.cutDepth !== undefined || typeof donor.height !== 'number' || !Number.isFinite(donor.height) ||
    (donor.from !== undefined && (typeof donor.from !== 'number' || !Number.isFinite(donor.from))) ||
    placement?.kind !== 'translate' || canonical(placement.parent) !== canonical({ node: 3, side: 'solid' }) ||
    placement.offset.length !== 3 || !placement.offset.every(value => typeof value === 'number' && Number.isFinite(value))) return;
  const parent: BodyRef = { node: 1, side: 'solid' }, reference: BodyRef = { node: 4, side: 'solid' };
  const body = bodyKey(parent, doc.nodes), referenceBody = bodyKey(reference, doc.nodes);
  if (canonical(doc.outputs) !== canonical({ [body]: parent, [referenceBody]: reference })) return;
  return { section, path: sweep.path, face, parent, body, reference, referenceBody,
    referenceFeature: featureId(doc.nodes, 4), donorFeature: featureId(doc.nodes, 3) };
}

function donorFace(source: NonNullable<ReturnType<typeof scope>>, face: unknown): face is string {
  return typeof face === 'string' && ['bottom', 'top', 'side0', 'side1', 'side2', 'side3']
    .some(role => face === `${source.donorFeature}.${role}`);
}

/** Bind an original five-span outlet and a separate current rectangular donor, before native replay. */
export function pairedElbowOutletPlaneProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1) return;
  const [{ tool, args }] = proposal.ops;
  if (tool !== 'run_command' || !isObj(args) || args.command !== 'offset-face' ||
    Object.keys(args).sort().join(',') !== 'command,expectedRevision,faces,values' ||
    args.expectedRevision !== revisionOf(doc) || !isObj(args.values) ||
    Object.keys(args.values).join(',') !== 'offsetMode' || args.values.offsetMode !== 'to-plane') return;
  const source = scope(doc);
  if (!source || !Array.isArray(args.faces) || args.faces.length !== 2 || args.faces[0] !== source.face ||
    !donorFace(source, args.faces[1])) return;
  return { revision: digestOf(proposal), sourceRevision: args.expectedRevision, source: canonicalOf(doc),
    sourceFace: source.face, referenceFace: args.faces[1] };
}

/** Rebuild the live donor binding, then prove the complete native edit independently of the rendered view. */
export async function reviewedPairedElbowOutletPlaneEvidence(base: StudioDoc, bodies: readonly BodyResult[], candidate: StudioDoc,
  edit: NonNullable<ReturnType<typeof pairedElbowOutletPlaneProposal>>): Promise<PlaneEvidence | { error: string } | undefined> {
  const source = scope(base);
  if (!source || edit.source !== canonicalOf(base) || edit.sourceRevision !== revisionOf(base) ||
    edit.sourceFace !== source.face || !donorFace(source, edit.referenceFace) ||
    canonical(candidate.direct) !== canonical(base.direct) || candidate.format !== base.format ||
    candidate.schema !== base.schema || candidate.units !== base.units || bodies.length !== 2 ||
    [source.parent, source.reference].some(ref => bodies.filter(body => body.key === bodyKey(ref, base.nodes) &&
      canonical(body.ref) === canonical(ref)).length !== 1)) return;
  try {
    const original = partBreps(base);
    if (original.length !== 2) return;
    const inputs = original.filter(output => output.key === source.body), donors = original.filter(output => output.key === source.referenceBody);
    if (inputs.length !== 1 || donors.length !== 1) return;
    const input = inputs[0].brep, donor = donors[0].brep;
    const selected = input.faces.filter(face => face.name === source.face), reference = donor.faces.filter(face => face.name === edit.referenceFace);
    const plane = offsetPlaneWitness(donor, edit.referenceFace);
    if (selected.length !== 1 || reference.length !== 1 || !plane) return;
    // Authored terminal points supply an independent signed material direction. Donor sense can oppose it.
    const points = source.path.controlPoints, anchor = points[10], normal = unit(sub(anchor, points[8]));
    if (len(normal) === 0 || len(cross(normal, plane.normal)) > 128 * Number.EPSILON) return;
    const distance = dot(sub(plane.point, anchor), normal);
    if (!Number.isFinite(distance) || Math.abs(distance) <= CadNumericPolicy.linearTolerance) return;
    const target: OffsetPlaneRef = { body: source.reference, feature: source.referenceFeature, face: edit.referenceFace,
      normal: plane.normal, localAnchor: plane.localAnchor, localSupport: plane.localSupport };
    const expected = captureSignatures(withNode(base, { kind: 'offset-face', parent: source.parent, faces: [source.face], target }), bodies);
    if (canonicalOf(candidate) !== canonicalOf(expected) || candidate.nextId !== expected.nextId) return;
    const output = partBreps(candidate), body = bodyKey({ node: base.nodes.length, side: 'solid' }, candidate.nodes);
    const changed = output.filter(output => output.key === body), retained = output.filter(output => output.key === source.referenceBody);
    if (output.length !== 2 || changed.length !== 1 || retained.length !== 1 || canonical(retained[0].brep) !== canonical(donor)) return;
    const brep = changed[0].brep, mouth = brep.faces.filter(face => face.name === source.face);
    if (mouth.length !== 1 || mouth[0].id !== selected[0].id) return;
    const evidence = pairedElbowOutletOffsetEvidence(input, brep, source.path, source.section, distance);
    if (!evidence || evidence.pathKind !== 'line-arc-line-arc-line' ||
      Math.abs(dot(sub(evidence.movedCap.center, plane.point), plane.normal)) > CadNumericPolicy.linearTolerance) return;
    return { brep, pairedElbowOutletPlaneOffset: { ...evidence, sourceBody: source.body, body,
      source: { body: source.body, feature: featureId(base.nodes, 1), face: source.face, faceId: selected[0].id, bodySha256: digestOf(input) },
      reference: { body: source.referenceBody, feature: source.referenceFeature, face: edit.referenceFace, faceId: reference[0].id,
        bodySha256: digestOf(donor), target, normalRelation: dot(normal, plane.normal) < 0 ? 'opposed' : 'aligned' },
      candidate: { body, feature: featureId(candidate.nodes, base.nodes.length), face: source.face, faceId: mouth[0].id, bodySha256: digestOf(brep) } } };
  } catch { return; }
}

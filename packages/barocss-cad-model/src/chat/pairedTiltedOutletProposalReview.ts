import { brepMassProperties, CadNumericPolicy, checkBrep, faceGeometry, type Brep } from '@barocss/cad';
import { isPairedFiveSpanCapPlaneSource, pairedFiveSpanOppositeReplacementSourceIndex, type StudioDoc } from '../engine/doc';
import { partBreps } from '../engine/evaluate';
import { bodyKeyFor, featureId } from '../engine/ids';
import type { Proposal } from '../engine/schema/proposals';
import { cross, dot, len, sub } from '../engine/vec3';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, canonicalOf, revisionOf } from '../util/revision';

const solid = (node: number) => ({ node, side: 'solid' as const });

function currentTiltedReplaceFaces(doc: StudioDoc, proposal: Proposal): [string, string] | undefined {
  if (proposal.status !== 'open' || proposal.ops.length !== 1 || doc.direct || doc.instances?.length ||
      doc.nodes.some(node => node.suppressed || node.held !== undefined)) return;
  const [{ tool, args }] = proposal.ops;
  if (tool !== 'run_command' || !isObj(args) || Object.keys(args).sort().join(',') !== 'command,expectedRevision,faces' ||
      args.command !== 'replace-face' || args.expectedRevision !== revisionOf(doc) ||
      !Array.isArray(args.faces) || args.faces.length !== 2) return;
  const [sourceFace, referenceFace] = args.faces;
  if (typeof sourceFace === 'string' && typeof referenceFace === 'string') return [sourceFace, referenceFace];
}

function placedRectangularDonor(doc: StudioDoc, index: number, face: string) {
  const sketch = doc.nodes[index - 2], donor = doc.nodes[index - 1], placement = doc.nodes[index];
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' || !sketch.plane || sketch.holes?.length ||
      sketch.regions?.length || donor.kind !== 'extrude' || donor.sketch !== index - 2 ||
      placement.kind !== 'translate' || canonical(placement.parent) !== canonical(solid(index - 1))) return;
  const solidFeature = featureId(doc.nodes, index - 1);
  if (face !== `${solidFeature}.bottom` && face !== `${solidFeature}.top`) return;
  return { index, face, feature: featureId(doc.nodes, index), body: bodyKeyFor(doc.nodes, index, 'solid') };
}

/** Only an original native cap and detached donor from the admitted Replace face recipe. */
function pairedTiltedCapProposal<End extends 'start' | 'end'>(doc: StudioDoc, proposal: Proposal, end: End) {
  if (doc.nodes.length !== 5) return;
  const faces = currentTiltedReplaceFaces(doc, proposal), sweep = doc.nodes[1];
  if (!faces || sweep.kind !== 'sweep-curve' || sweep.sketch !== 0) return;
  const [sourceFace, referenceFace] = faces, sourceFeature = featureId(doc.nodes, 1);
  if (sourceFace !== `${sourceFeature}.${end}` || !isPairedFiveSpanCapPlaneSource(doc.nodes, 1, sourceFace)) return;
  const reference = placedRectangularDonor(doc, 4, referenceFace);
  if (!reference) return;
  const sourceBody = bodyKeyFor(doc.nodes, 1, 'solid');
  if (canonical(doc.outputs) !== canonical({ [sourceBody]: solid(1), [reference.body]: solid(reference.index) })) return;
  return { end, revision: digestOf(proposal), source: canonicalOf(doc), sourceFeature, sourceFace, sourceBody,
    referenceFeature: reference.feature, referenceFace, referenceBody: reference.body };
}

export const pairedTiltedOutletProposal = (doc: StudioDoc, proposal: Proposal) => pairedTiltedCapProposal(doc, proposal, 'end');
export const pairedTiltedInletProposal = (doc: StudioDoc, proposal: Proposal) => pairedTiltedCapProposal(doc, proposal, 'start');

/** Review a second original cap when the first cap and both detached donors already have current owners. */
export function pairedTiltedOppositeCapProposal(doc: StudioDoc, proposal: Proposal) {
  if (doc.nodes.length !== 9) return;
  const faces = currentTiltedReplaceFaces(doc, proposal), sweep = doc.nodes[1], first = doc.nodes[8];
  if (!faces || sweep.kind !== 'sweep-curve' || sweep.sketch !== 0 || first.kind !== 'replace-face') return;
  const [sourceFace, referenceFace] = faces;
  if (pairedFiveSpanOppositeReplacementSourceIndex(doc.nodes, 8, sourceFace) !== 1) return;
  const priorIndex = first.target.body.node;
  if ((priorIndex !== 4 && priorIndex !== 7) || canonical(first.target.body) !== canonical(solid(priorIndex))) return;
  const prior = placedRectangularDonor(doc, priorIndex, first.target.face);
  const reference = placedRectangularDonor(doc, priorIndex === 4 ? 7 : 4, referenceFace);
  if (!prior || prior.feature !== first.target.feature || !reference) return;
  const sourceBody = bodyKeyFor(doc.nodes, 8, 'solid'), sourceFeature = featureId(doc.nodes, 8);
  if (canonical(doc.outputs) !== canonical({ [sourceBody]: solid(8), [prior.body]: solid(prior.index),
    [reference.body]: solid(reference.index) })) return;
  return { revision: digestOf(proposal), source: canonicalOf(doc), sourceFeature, sourceFace, sourceBody,
    sourceIndex: 8, referenceIndex: reference.index, referenceFeature: reference.feature, referenceFace, referenceBody: reference.body,
    originalSweepFeature: featureId(doc.nodes, 1), prior: { ...prior, cap: first.faces[0] } };
}

type Review = NonNullable<ReturnType<typeof pairedTiltedCapProposal>>;
type OppositeReview = NonNullable<ReturnType<typeof pairedTiltedOppositeCapProposal>>;

function owner(brep: Brep, body: string, feature: string, name: string) {
  const [face, second] = brep.faces.filter(candidate => candidate.name === name);
  if (!face || second) return;
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane') return;
  return { body, feature, face: name, faceId: face.id, bodySha256: digestOf(brep), plane };
}

function joinCharts(brep: Brep, feature: string) {
  const owners = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face.name] as const)));
  const byEdge = new Map<string, Brep['coedges'][number][]>();
  for (const use of brep.coedges) {
    let incidents = byEdge.get(use.edge);
    if (!incidents) { incidents = []; byEdge.set(use.edge, incidents); }
    incidents.push(use);
  }
  const joins = [['lead', 'first'], ['first', 'line'], ['line', 'second'], ['second', 'tail']].map(group =>
    brep.edges.flatMap(edge => {
      const uses = byEdge.get(edge.id);
      if (uses?.length !== 2 || !uses.every(use => use.pcurve) ||
        !group.every(piece => uses.some(use => owners.get(use.loop)?.startsWith(`${feature}.${piece}.`)))) return [];
      return [{ edge, uses }];
    }));
  if (joins.every(group => group.length === 12)) return joins.flat();
}

function capBoundaryDigest(brep: Brep, name: string) {
  const face = brep.faces.find(candidate => candidate.name === name);
  if (!face) return;
  const loops = brep.loops.filter(loop => face.loops.includes(loop.id));
  const uses = brep.coedges.filter(use => face.loops.includes(use.loop));
  const edgeIds = new Set(uses.map(use => use.edge));
  const edges = brep.edges.filter(edge => edgeIds.has(edge.id));
  const vertexIds = new Set(edges.flatMap(edge => edge.vertices));
  const vertices = brep.vertices.filter(vertex => vertexIds.has(vertex.id));
  return digestOf({ face, loops, uses, edges, vertices });
}

/** Bind the native candidate that both image orientations and inspection will use. */
function reviewedPairedTiltedCapEvidence(base: StudioDoc, preview: StudioDoc, review: Review | OppositeReview) {
  const chained = 'prior' in review ? review : undefined;
  const sourceIndex = chained?.sourceIndex ?? 1, referenceIndex = chained?.referenceIndex ?? 4;
  const originalSweepFeature = chained?.originalSweepFeature ?? review.sourceFeature;
  if (canonicalOf(base) !== review.source || preview.nodes.length !== base.nodes.length + 1 ||
    canonical(preview.nodes.slice(0, -1)) !== canonical(base.nodes)) return;
  const index = base.nodes.length, edit = preview.nodes[index];
  if (edit.kind !== 'replace-face' || canonical(edit.parent) !== canonical(solid(sourceIndex)) ||
    edit.faces[0] !== review.sourceFace || canonical(edit.target.body) !== canonical(solid(referenceIndex)) ||
    edit.target.feature !== review.referenceFeature || edit.target.face !== review.referenceFace) return;
  const candidateFeature = featureId(preview.nodes, index), candidateBody = bodyKeyFor(preview.nodes, index, 'solid');
  const retainedDonors = { [review.referenceBody]: solid(referenceIndex),
    ...(chained ? { [chained.prior.body]: solid(chained.prior.index) } : {}) };
  if (canonical(preview.outputs) !== canonical({ [candidateBody]: solid(index), ...retainedDonors })) return;
  try {
    const original = partBreps(base), edited = partBreps(preview);
    const stock = original.find(part => part.key === review.sourceBody)?.brep;
    const donor = original.find(part => part.key === review.referenceBody)?.brep;
    const result = edited.find(part => part.key === candidateBody)?.brep;
    const donorAfter = edited.find(part => part.key === review.referenceBody)?.brep;
    if (!stock || !donor || !result || !donorAfter || digestOf(donorAfter) !== digestOf(donor)) return;
    const source = owner(stock, review.sourceBody, review.sourceFeature, review.sourceFace);
    const reference = owner(donor, review.referenceBody, review.referenceFeature, review.referenceFace);
    const candidate = owner(result, candidateBody, candidateFeature, review.sourceFace);
    if (!source || !reference || !candidate || source.faceId !== candidate.faceId ||
      len(cross(candidate.plane.n, reference.plane.n)) > 1e-9 ||
      Math.abs(dot(sub(candidate.plane.o, reference.plane.o), reference.plane.n)) > CadNumericPolicy.linearTolerance) return;
    const report = checkBrep(result, { strict: true });
    const beforeJoins = joinCharts(stock, originalSweepFeature), afterJoins = joinCharts(result, originalSweepFeature);
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 2 || !beforeJoins || !afterJoins ||
      digestOf(beforeJoins) !== digestOf(afterJoins)) return;
    const cap = result.faces.find(face => face.id === candidate.faceId)!;
    const apertures = result.loops.filter(loop => cap.loops.includes(loop.id) && loop.kind === 'inner')
      .map(loop => ({ loop: loop.id, edges: result.coedges.filter(use => use.loop === loop.id).map(use => use.edge) }));
    if (apertures.length !== 2 || apertures.some(loop => loop.edges.length !== 4)) return;
    const before = brepMassProperties(stock, 1).volume, after = brepMassProperties(result, 1).volume;
    if (!(after > 0 && after < before)) return;
    const replacement = { source, reference, candidate, apertures,
      joins: afterJoins.map(join => join.edge.id), volume: { before, after, delta: after - before } };
    if (!chained) return { brep: result, replacement };
    const first = chained.prior;
    const firstDonor = original.find(part => part.key === first.body)?.brep;
    const firstDonorAfter = edited.find(part => part.key === first.body)?.brep;
    const firstCap = owner(stock, review.sourceBody, review.sourceFeature, first.cap);
    const beforeBoundarySha256 = capBoundaryDigest(stock, first.cap), afterBoundarySha256 = capBoundaryDigest(result, first.cap);
    if (!firstDonor || !firstDonorAfter || digestOf(firstDonor) !== digestOf(firstDonorAfter) || !firstCap ||
        !beforeBoundarySha256 || beforeBoundarySha256 !== afterBoundarySha256) return;
    const firstReference = owner(firstDonor, first.body, first.feature, first.face);
    if (!firstReference) return;
    return { brep: result, replacement, prior: { cap: firstCap, reference: firstReference, beforeBoundarySha256, afterBoundarySha256 } };
  } catch { return; }
}

export function reviewedPairedTiltedOutletEvidence(base: StudioDoc, preview: StudioDoc, review: Review & { end: 'end' }) {
  const result = reviewedPairedTiltedCapEvidence(base, preview, review);
  if (result) return { brep: result.brep, pairedTiltedOutletReplacement: result.replacement };
}

export function reviewedPairedTiltedInletEvidence(base: StudioDoc, preview: StudioDoc, review: Review & { end: 'start' }) {
  const result = reviewedPairedTiltedCapEvidence(base, preview, review);
  if (result) return { brep: result.brep, pairedTiltedInletReplacement: result.replacement };
}

export function reviewedPairedTiltedOppositeCapEvidence(base: StudioDoc, preview: StudioDoc, review: OppositeReview) {
  const result = reviewedPairedTiltedCapEvidence(base, preview, review);
  if (result?.prior) return { brep: result.brep, pairedTiltedOppositeCapReplacement: {
    ...result.replacement, originalSweepFeature: review.originalSweepFeature, prior: result.prior,
  } };
}

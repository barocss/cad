import { brepMassProperties, CadNumericPolicy, checkBrep, faceGeometry, type Brep } from '@barocss/cad';
import { isPairedFiveSpanCapPlaneSource, type StudioDoc } from '../engine/doc';
import { partBreps } from '../engine/evaluate';
import { bodyKeyFor, featureId } from '../engine/ids';
import type { Proposal } from '../engine/schema/proposals';
import { cross, dot, len, sub } from '../engine/vec3';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, canonicalOf, revisionOf } from '../util/revision';

const solid = (node: number) => ({ node, side: 'solid' as const });

/** Only an original native cap and detached donor from the admitted Replace face recipe. */
function pairedTiltedCapProposal<End extends 'start' | 'end'>(doc: StudioDoc, proposal: Proposal, end: End) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1 || doc.nodes.length !== 5 || doc.direct ||
    doc.instances?.length || doc.nodes.some(node => node.suppressed || node.held !== undefined)) return;
  const [{ tool, args }] = proposal.ops;
  const [, sweep, donorSketch, donor, placement] = doc.nodes;
  if (tool !== 'run_command' || !isObj(args) || Object.keys(args).sort().join(',') !== 'command,expectedRevision,faces' ||
    args.command !== 'replace-face' || args.expectedRevision !== revisionOf(doc) ||
    !Array.isArray(args.faces) || args.faces.length !== 2 || sweep.kind !== 'sweep-curve' || sweep.sketch !== 0 ||
    donorSketch.kind !== 'sketch' || donorSketch.profile !== 'rectangle' || !donorSketch.plane ||
    donorSketch.holes?.length || donorSketch.regions?.length || donor.kind !== 'extrude' || donor.sketch !== 2 ||
    placement.kind !== 'translate' || canonical(placement.parent) !== canonical(solid(3))) return;
  const sourceFeature = featureId(doc.nodes, 1), referenceFeature = featureId(doc.nodes, 4);
  const donorFeature = featureId(doc.nodes, 3), sourceFace = `${sourceFeature}.${end}`;
  if (args.faces[0] !== sourceFace || !isPairedFiveSpanCapPlaneSource(doc.nodes, 1, sourceFace)) return;
  const referenceFace = args.faces[1];
  if (referenceFace !== `${donorFeature}.bottom` && referenceFace !== `${donorFeature}.top`) return;
  const sourceBody = bodyKeyFor(doc.nodes, 1, 'solid'), referenceBody = bodyKeyFor(doc.nodes, 4, 'solid');
  if (canonical(doc.outputs) !== canonical({ [sourceBody]: solid(1), [referenceBody]: solid(4) })) return;
  return { end, revision: digestOf(proposal), source: canonicalOf(doc), sourceFeature, sourceFace, sourceBody,
    referenceFeature, referenceFace, referenceBody };
}

export const pairedTiltedOutletProposal = (doc: StudioDoc, proposal: Proposal) => pairedTiltedCapProposal(doc, proposal, 'end');
export const pairedTiltedInletProposal = (doc: StudioDoc, proposal: Proposal) => pairedTiltedCapProposal(doc, proposal, 'start');

type Review = NonNullable<ReturnType<typeof pairedTiltedCapProposal>>;

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

/** Bind the native candidate that both image orientations and inspection will use. */
function reviewedPairedTiltedCapEvidence(base: StudioDoc, preview: StudioDoc, review: Review) {
  if (canonicalOf(base) !== review.source || preview.nodes.length !== base.nodes.length + 1 ||
    canonical(preview.nodes.slice(0, -1)) !== canonical(base.nodes)) return;
  const index = base.nodes.length, edit = preview.nodes[index];
  if (edit.kind !== 'replace-face' || canonical(edit.parent) !== canonical(solid(1)) ||
    edit.faces[0] !== review.sourceFace || canonical(edit.target.body) !== canonical(solid(4)) ||
    edit.target.feature !== review.referenceFeature || edit.target.face !== review.referenceFace) return;
  const candidateFeature = featureId(preview.nodes, index), candidateBody = bodyKeyFor(preview.nodes, index, 'solid');
  if (canonical(preview.outputs) !== canonical({ [candidateBody]: solid(index), [review.referenceBody]: solid(4) })) return;
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
    const beforeJoins = joinCharts(stock, review.sourceFeature), afterJoins = joinCharts(result, review.sourceFeature);
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 2 || !beforeJoins || !afterJoins ||
      digestOf(beforeJoins) !== digestOf(afterJoins)) return;
    const cap = result.faces.find(face => face.id === candidate.faceId)!;
    const apertures = result.loops.filter(loop => cap.loops.includes(loop.id) && loop.kind === 'inner')
      .map(loop => ({ loop: loop.id, edges: result.coedges.filter(use => use.loop === loop.id).map(use => use.edge) }));
    if (apertures.length !== 2 || apertures.some(loop => loop.edges.length !== 4)) return;
    const before = brepMassProperties(stock, 1).volume, after = brepMassProperties(result, 1).volume;
    if (!(after > 0 && after < before)) return;
    return { brep: result, replacement: { source, reference, candidate, apertures,
      joins: afterJoins.map(join => join.edge.id), volume: { before, after, delta: after - before } } };
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

import type { Brep } from '@barocss/cad';
import { bodyKey, isPairedElbowInletOffsetSource, isPairedElbowOutletOffsetSource, withNode, type BodyRef, type StudioDoc } from '../engine/doc';
import { partBreps, type BodyResult } from '../engine/evaluate';
import { featureId } from '../engine/ids';
import { captureSignatures } from '../engine/references';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, canonicalOf, revisionOf } from '../util/revision';
import { pairedElbowInletOffsetEvidence, pairedElbowOutletOffsetEvidence } from './pairedElbowOutletOffsetEvidence';
import { pairedDuctSection } from './rectangularDuctProposalReview';
import { directInspectionRevision, sweepSourceRevision } from './sweepSource';

type SourceRail = { path: string; pathRevision: string; directRevision: string };
type OutletEvidence = {
  brep: Brep;
  pairedElbowOutletOffset: NonNullable<ReturnType<typeof pairedElbowOutletOffsetEvidence>> &
    { sourceBody: string; body: string; sourceRail?: SourceRail };
};
type InletEvidence = {
  brep: Brep;
  pairedElbowInletOffset: NonNullable<ReturnType<typeof pairedElbowInletOffsetEvidence>> &
    { sourceBody: string; body: string; sourceRail?: SourceRail };
};

function scope(doc: StudioDoc, inlet: boolean) {
  if (doc.nodes.length !== 2 || doc.instances?.length) return;
  const [rail] = doc.direct?.objects ?? [];
  if (doc.direct && (doc.direct.objects.length !== 1 || !rail || rail.hidden || rail.trims?.length ||
    typeof doc.direct.sources[rail.source] !== 'string')) return;
  const [sketch, sweep] = doc.nodes, section = pairedDuctSection(sketch);
  if (!section || sweep?.kind !== 'sweep-curve') return;
  // The image verifier currently has the five- and seven-pole outlet proofs.
  if (!inlet && ![5, 7].includes(sweep.path.controlPoints.length)) return;
  const face = `${featureId(doc.nodes, 1)}.${inlet ? 'start' : 'end'}`;
  if (!(inlet ? isPairedElbowInletOffsetSource : isPairedElbowOutletOffsetSource)(doc.nodes, 1, face)) return;
  const parent: BodyRef = { node: 1, side: 'solid' }, body = bodyKey(parent, doc.nodes);
  if (canonical(doc.outputs) !== canonical({ [body]: parent })) return;
  return { section, path: sweep.path, face, parent, body, rail: rail?.id };
}

/** Bind one signed offset of an admitted original straight mouth before replaying geometry. */
function pairedElbowProposal(doc: StudioDoc, proposal: Proposal, inlet: boolean) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1) return;
  const [{ tool, args }] = proposal.ops;
  if (tool !== 'run_command' || !isObj(args) || args.command !== 'offset-face' ||
    Object.keys(args).sort().join(',') !== 'command,expectedRevision,faces,values' ||
    args.expectedRevision !== revisionOf(doc) || !isObj(args.values) ||
    Object.keys(args.values).join(',') !== 'd') return;
  const distance = args.values.d;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance === 0) return;
  const source = scope(doc, inlet);
  if (!source || !Array.isArray(args.faces) || args.faces.length !== 1 || args.faces[0] !== source.face) return;
  const directRevision = source.rail ? directInspectionRevision(doc) : undefined;
  return { revision: digestOf(directRevision ? { proposal, directRevision } : proposal), directRevision,
    sourceRevision: args.expectedRevision, source: canonicalOf(doc), distance };
}

/** Bind one signed offset of the original outlet, before replaying any geometry. */
export function pairedElbowOutletProposal(doc: StudioDoc, proposal: Proposal) {
  return pairedElbowProposal(doc, proposal, false);
}

/** The inlet proposal stays bounded to the original paired seven-point line–arc–line source. */
export function pairedElbowInletProposal(doc: StudioDoc, proposal: Proposal) {
  return pairedElbowProposal(doc, proposal, true);
}

async function reviewedPairedElbowEvidence<E extends object>(base: StudioDoc, bodies: readonly BodyResult[], candidate: StudioDoc,
  edit: NonNullable<ReturnType<typeof pairedElbowOutletProposal>>, inlet: boolean,
  evidenceOf: (original: Brep, candidate: Brep, path: Parameters<typeof pairedElbowOutletOffsetEvidence>[2],
    section: Parameters<typeof pairedElbowOutletOffsetEvidence>[3], distance: number) => E | undefined):
    Promise<{ brep: Brep; detail: E & { sourceBody: string; body: string; sourceRail?: SourceRail } } | { error: string } | undefined> {
  const source = scope(base, inlet);
  if (!source || edit.source !== canonicalOf(base) || edit.sourceRevision !== revisionOf(base) ||
    canonical(candidate.direct) !== canonical(base.direct)) return;
  const directRevision = source.rail ? directInspectionRevision(base) : undefined;
  if (directRevision !== edit.directRevision) return;
  const { parent, face, path, section } = source, { distance } = edit;
  const expected = captureSignatures(withNode(base, { kind: 'offset-face', parent, faces: [face], distance }), bodies);
  if (canonicalOf(candidate) !== canonicalOf(expected) || candidate.nextId !== expected.nextId) return;
  let sourceRail: SourceRail | undefined;
  if (source.rail && directRevision) {
    const read = await sweepSourceRevision(base, source.rail);
    if ('error' in read || read.revision !== digestOf(path))
      return { error: 'The retained Direct rail does not match the path copied into the Sweep.' };
    sourceRail = { path: source.rail, pathRevision: read.revision, directRevision };
  }
  try {
    const original = partBreps(base), output = partBreps(candidate);
    const body = bodyKey({ node: base.nodes.length, side: 'solid' }, candidate.nodes);
    if (original.length !== 1 || original[0].key !== source.body || output.length !== 1 || output[0].key !== body) return;
    const { brep } = output[0];
    const evidence = evidenceOf(original[0].brep, brep, path, section, distance);
    if (evidence) return { brep, detail: { sourceBody: source.body, body, ...evidence, ...(sourceRail ? { sourceRail } : {}) } };
  } catch { return; }
}

export async function reviewedPairedElbowOutletEvidence(base: StudioDoc, bodies: readonly BodyResult[], candidate: StudioDoc,
  edit: NonNullable<ReturnType<typeof pairedElbowOutletProposal>>): Promise<OutletEvidence | { error: string } | undefined> {
  const reviewed = await reviewedPairedElbowEvidence(base, bodies, candidate, edit, false, pairedElbowOutletOffsetEvidence);
  if (!reviewed || 'error' in reviewed) return reviewed;
  return { brep: reviewed.brep, pairedElbowOutletOffset: reviewed.detail };
}

export async function reviewedPairedElbowInletEvidence(base: StudioDoc, bodies: readonly BodyResult[], candidate: StudioDoc,
  edit: NonNullable<ReturnType<typeof pairedElbowInletProposal>>): Promise<InletEvidence | { error: string } | undefined> {
  const reviewed = await reviewedPairedElbowEvidence(base, bodies, candidate, edit, true, pairedElbowInletOffsetEvidence);
  if (!reviewed || 'error' in reviewed) return reviewed;
  return { brep: reviewed.brep, pairedElbowInletOffset: reviewed.detail };
}

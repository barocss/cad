import { bodyKey, isPairedElbowOutletOffsetSource, withNode, type BodyRef, type StudioDoc } from '../engine/doc';
import { partBreps, type BodyResult } from '../engine/evaluate';
import { featureId } from '../engine/ids';
import { captureSignatures } from '../engine/references';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, canonicalOf, revisionOf } from '../util/revision';
import { pairedElbowOutletOffsetEvidence } from './pairedElbowOutletOffsetEvidence';
import { pairedDuctSection } from './rectangularDuctProposalReview';

function scope(doc: StudioDoc) {
  if (doc.nodes.length !== 2 || doc.instances?.length || doc.direct) return;
  const [sketch, sweep] = doc.nodes, section = pairedDuctSection(sketch);
  if (!section || sweep?.kind !== 'sweep-curve') return;
  const face = `${featureId(doc.nodes, 1)}.end`;
  if (!isPairedElbowOutletOffsetSource(doc.nodes, 1, face)) return;
  const parent: BodyRef = { node: 1, side: 'solid' }, body = bodyKey(parent, doc.nodes);
  if (canonical(doc.outputs) !== canonical({ [body]: parent })) return;
  return { section, path: sweep.path, face, parent, body };
}

/** Bind one signed offset of the original outlet, before replaying any geometry. */
export function pairedElbowOutletProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1) return;
  const [{ tool, args }] = proposal.ops;
  if (tool !== 'run_command' || !isObj(args) || args.command !== 'offset-face' ||
    Object.keys(args).sort().join(',') !== 'command,expectedRevision,faces,values' ||
    args.expectedRevision !== revisionOf(doc) || !isObj(args.values) ||
    Object.keys(args.values).join(',') !== 'd') return;
  const distance = args.values.d;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance === 0) return;
  const source = scope(doc);
  if (!source || !Array.isArray(args.faces) || args.faces.length !== 1 || args.faces[0] !== source.face) return;
  return { revision: digestOf(proposal), sourceRevision: args.expectedRevision, source: canonicalOf(doc), distance };
}

export function reviewedPairedElbowOutletEvidence(base: StudioDoc, bodies: readonly BodyResult[], candidate: StudioDoc,
  edit: NonNullable<ReturnType<typeof pairedElbowOutletProposal>>) {
  const source = scope(base);
  if (!source || edit.source !== canonicalOf(base) || edit.sourceRevision !== revisionOf(base)) return;
  const { parent, face, path, section } = source, { distance } = edit;
  const expected = captureSignatures(withNode(base, { kind: 'offset-face', parent, faces: [face], distance }), bodies);
  if (canonicalOf(candidate) !== canonicalOf(expected) || candidate.nextId !== expected.nextId) return;
  try {
    const original = partBreps(base), output = partBreps(candidate);
    const body = bodyKey({ node: base.nodes.length, side: 'solid' }, candidate.nodes);
    if (original.length !== 1 || original[0].key !== source.body || output.length !== 1 || output[0].key !== body) return;
    const { brep } = output[0];
    const evidence = pairedElbowOutletOffsetEvidence(original[0].brep, brep, path, section, distance);
    if (evidence) return { brep, pairedElbowOutletOffset: { sourceBody: source.body, body, ...evidence } };
  } catch { return; }
}

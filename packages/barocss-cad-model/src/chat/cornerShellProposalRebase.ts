import type { StudioDoc } from '../engine/doc';
import { partBreps } from '../engine/evaluate';
import { featureId } from '../engine/ids';
import type { Op, Proposal } from '../engine/schema/proposals';
import { requirementEvidenceRevision } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, revisionOf } from '../util/revision';

export const REBASED_SHELL_APPROVAL = 'rebased Shell openings';

/** Only compare a visible root source that still owns each of the three original opening names. */
function originalStock(doc: StudioDoc, openings: readonly string[]) {
  if (doc.instances?.length || doc.direct) return;
  try {
    const outputs = partBreps(doc);
    if (openings.some(name => outputs.flatMap(output => output.brep.faces.filter(face => face.name === name)).length !== 1)) return;
    const stock = outputs.find(output => openings.every(name => output.brep.faces.some(face => face.name === name)));
    if (!stock || doc.bodies?.[stock.key]?.hidden || stock.brep.faces.length !== 6 || stock.brep.source.family !== 'prismatic-solid') return;
    const feature = doc.nodes.find(node => node.id === stock.brep.source.id);
    if (feature?.kind !== 'extrude') return;
    const sketch = doc.nodes[feature.sketch];
    if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle') return;
    return { stock, feature, sketch };
  } catch {
    return;
  }
}

/** Renew one three-opening Shell pin only after the user has retained the exact stock in this document's Undo history. */
export function rebindReviewedCornerShell(doc: StudioDoc, proposal: Proposal, history: readonly StudioDoc[]):
  { op: Op } | { error: string } | undefined {
  if (proposal.status !== 'open' || proposal.ops.length !== 1 || proposal.merge || proposal.follow_up_repair) return;
  const [op] = proposal.ops, args = op.args;
  if (op.tool !== 'run_command' || !isObj(args) || args.command !== 'shell' || !isObj(args.values) || args.values.wallMode !== 'per-face'
    || Object.keys(args).sort().join(',') !== 'command,expectedRevision,faces,values'
    || !Array.isArray(args.faces) || args.faces.length !== 3 || !args.faces.every(name => typeof name === 'string')
    || new Set(args.faces).size !== 3 || typeof args.expectedRevision !== 'string') return;
  const currentRevision = revisionOf(doc);
  if (args.expectedRevision === currentRevision) return;
  const base = proposal.base_evidence_revision && history.find(previous =>
    requirementEvidenceRevision(previous) === proposal.base_evidence_revision && revisionOf(previous) === args.expectedRevision);
  if (!base || canonical(proposal.orders) !== canonical([base.nodes.map((_, i) => featureId(base.nodes, i))]))
    return { error: 'The original Shell review is missing from this document’s Undo history. Make a new proposal on the current model.' };
  const before = originalStock(base, args.faces), now = originalStock(doc, args.faces);
  if (!before || !now || canonical(before) !== canonical(now))
    return { error: 'The original Shell stock changed or its three faces are no longer available. Make a new proposal on the current model.' };
  return { op: { ...op, args: { ...args, expectedRevision: currentRevision } } };
}

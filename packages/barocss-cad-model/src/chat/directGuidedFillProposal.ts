import { loadDirect } from '../engine/directModule';
import type { Op } from '../engine/schema/proposals';
import { isObj } from '../util/guards';
import { directInspectionRevision } from './sweepSource';
import { accept, fail, type CallOptions, type ChatState, type Evaluate } from './toolKit';

export const DIRECT_GUIDED_FILL_COMMAND = {
  command: 'direct-guided-fill',
  label: 'Guided Fill',
  hint: 'Use inside proposals.propose. A user reviews and approves the open surface in Studio.',
  selection: 'Pass five distinct visible Direct IDs and direct_revision from query.summary as expectedRevision.',
  values: {
    seam: 'Straight boundary at the G1 seam', first: 'First quadratic shoulder boundary',
    second: 'Second quadratic shoulder boundary', guide: 'Cubic interior guide', donor: 'Adjacent planar Direct surface',
  },
};

export const isDirectGuidedFillOperation = (op: Op) => op.tool === 'run_command' && op.args?.command === DIRECT_GUIDED_FILL_COMMAND.command;

export async function proposeDirectGuidedFillCommand(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate, options: CallOptions) {
  if (!options.proposal || state.partOf)
    return fail(state, 'Propose Guided Fill in the base part for user approval in Studio.', { code: 'needs_approval' });

  const { expectedRevision, values } = args;
  const invalid = () => fail(state, 'Use five distinct Direct IDs as values.seam, first, second, guide and donor, with direct_revision from query.summary as expectedRevision.', { code: 'DIRECT_GUIDED_FILL_INPUT' });
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)
    || !isObj(values) || Object.keys(values).length !== 5
    || args.faces !== undefined || args.edges !== undefined || args.bodies !== undefined || args.point !== undefined)
    return invalid();

  const { seam, first, second, guide, donor } = values;
  if (typeof seam !== 'string' || !seam || typeof first !== 'string' || !first || typeof second !== 'string' || !second
    || typeof guide !== 'string' || !guide || typeof donor !== 'string' || !donor || new Set([seam, first, second, guide, donor]).size !== 5)
    return invalid();
  const revision = directInspectionRevision(state.doc);
  if (expectedRevision !== revision)
    return fail(state, 'The Direct inputs changed. Read query.summary again and make a new proposal.', { code: 'DIRECT_GUIDED_FILL_STALE', revision });

  const { direct } = state.doc;
  if (!direct) return fail(state, 'Use visible Direct curves and a surface from query.summary.', { code: 'DIRECT_GUIDED_FILL_SOURCE' });
  const { directOps } = await loadDirect();
  let next;
  try { next = directOps.fillGuidedJunction(direct, [seam, first, second, guide], seam, guide, donor); }
  catch (error) {
    return fail(state, error instanceof Error ? error.message : 'These sources could not form an open Guided Fill.', { code: 'DIRECT_GUIDED_FILL_GEOMETRY' });
  }
  return accept(state, { ...state.doc, direct: next }, evaluate, options, `Add an open Guided Fill at seam ${seam} with guide ${guide}`);
}

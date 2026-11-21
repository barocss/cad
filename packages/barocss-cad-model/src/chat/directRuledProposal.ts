import { loadDirect } from '../engine/directModule';
import type { Op, Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { directInspectionRevision } from './sweepSource';
import { accept, fail, type ChatState, type Evaluate, type CallOptions } from './toolKit';

export const DIRECT_RULED_COMMAND = {
  command: 'direct-ruled',
  label: 'Ruled surface',
  hint: 'Use features.command only inside proposals.propose. A user reviews and accepts the sheet in Studio.',
  selection: 'Pass two distinct visible Direct curve IDs in values and use direct_revision from query.summary as expectedRevision. Do not pass face, edge, body or point selections.',
  values: { first: 'ID of the first Direct rail (v = 0)', second: 'ID of the second Direct rail (v = 1)' },
};

export const isDirectRuledOperation = (op: Op) => op.tool === 'run_command' && op.args?.command === DIRECT_RULED_COMMAND.command;

export function directReviewRevision(proposal: Proposal): string | undefined {
  if (proposal.status === 'open' && proposal.ops.length && proposal.ops.every(isDirectRuledOperation)) return digestOf(proposal);
}

export async function proposeDirectRuledCommand(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate, options: CallOptions) {
  if (!options.proposal || state.partOf)
    return fail(state, 'Propose the Ruled surface in the base part for user approval in Studio.', { code: 'needs_approval' });

  const { expectedRevision, values } = args;
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)
    || !isObj(values) || Object.keys(values).length !== 2
    || typeof values.first !== 'string' || !values.first || typeof values.second !== 'string' || !values.second
    || values.first === values.second || args.faces !== undefined || args.edges !== undefined
    || args.bodies !== undefined || args.point !== undefined)
    return fail(state, 'Use two distinct Direct curve IDs as values.first and values.second, with direct_revision from query.summary as expectedRevision.', { code: 'DIRECT_RULED_INPUT' });

  const revision = directInspectionRevision(state.doc);
  if (revision !== expectedRevision)
    return fail(state, 'The Direct inputs changed. Read query.summary again and make a new proposal.', { code: 'DIRECT_RULED_STALE', revision });

  const { direct } = state.doc, { first, second } = values;
  const sourceError = () => fail(state, 'Each rail must be a unique visible Direct curve from query.summary.', { code: 'DIRECT_RULED_SOURCE' });
  if (!direct) return sourceError();
  const rails = [first, second].map(id => direct.objects.filter(object => object.id === id));
  if (rails.some(matches => matches.length !== 1 || matches[0].hidden)) return sourceError();
  const { directOps, geometryOf } = await loadDirect();
  try {
    if (rails.some(([object]) => geometryOf(direct, object).kind !== 'curve')) return sourceError();
  } catch { return sourceError(); }

  let ruled;
  try { ruled = directOps.ruledSurface(direct, first, second); }
  catch (error) {
    return fail(state, error instanceof Error ? error.message : 'These rails could not form an exact Ruled surface.', { code: 'DIRECT_RULED_GEOMETRY' });
  }
  return accept(state, { ...state.doc, direct: ruled }, evaluate, options, `Add a Ruled surface between ${first} and ${second}`);
}

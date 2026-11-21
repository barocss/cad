import { thickenCommand } from '../app/thickenCommand';
import { loadDirect } from '../engine/directModule';
import type { Op } from '../engine/schema/proposals';
import { isObj } from '../util/guards';
import { directInspectionRevision } from './sweepSource';
import { accept, fail, type CallOptions, type ChatState, type Evaluate } from './toolKit';

export const DIRECT_THICKEN_COMMAND = {
  command: 'direct-thicken',
  label: 'Thicken',
  hint: 'Use features.command inside proposals.propose for Studio approval. The body copies the source at the reviewed revision.',
  selection: 'Use the ID of one visible whole Direct surface in values and pass direct_revision from query.summary as expectedRevision.',
  values: { surface: 'Direct surface ID', t: 'positive thickness in mm', side: 'normal (default), reverse, or both' },
};

export const DIRECT_SNAPSHOT_APPROVAL = 'Direct surface snapshot';
export const isDirectThickenOperation = (op: Op) => op.tool === 'run_command' && op.args?.command === DIRECT_THICKEN_COMMAND.command;

export async function proposeDirectThickenCommand(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate, options: CallOptions) {
  if (!options.proposal || state.partOf)
    return fail(state, 'Propose Direct Thicken in the base part for user approval in Studio.', { code: 'needs_approval' });

  const { expectedRevision, values } = args;
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)
    || !isObj(values) || Object.keys(values).some(key => key !== 'surface' && key !== 't' && key !== 'side')
    || typeof values.surface !== 'string' || !values.surface || typeof values.t !== 'number' || !Number.isFinite(values.t)
    || values.t <= 0 || values.t > 10000
    || (values.side !== undefined && values.side !== 'normal' && values.side !== 'reverse' && values.side !== 'both')
    || args.faces !== undefined || args.edges !== undefined || args.bodies !== undefined || args.point !== undefined)
    return fail(state, 'Use values.surface, positive thickness values.t in mm, optional values.side, and direct_revision from query.summary as expectedRevision.', { code: 'DIRECT_THICKEN_INPUT' });

  const { doc, bodies } = state, { surface, t, side } = values;
  const revision = directInspectionRevision(doc);
  if (revision !== expectedRevision)
    return fail(state, 'The Direct inputs changed. Read query.summary again and make a new proposal.', { code: 'DIRECT_THICKEN_STALE', revision });

  const matches = doc.direct?.objects.filter(object => object.id === surface);
  if (matches?.length !== 1 || matches[0].hidden)
    return fail(state, 'Use a unique visible Direct surface ID from query.summary.', { code: 'DIRECT_THICKEN_SOURCE' });

  await loadDirect();
  let next;
  try {
    next = thickenCommand.build!({ doc, bodies, direct: [surface], selection: { bodies: [], faces: [], edges: [] } },
      { t, side: side ?? 'normal' });
  } catch (error) {
    return fail(state, error instanceof Error ? error.message : 'The source surface could not be copied.', { code: 'DIRECT_THICKEN_SOURCE' });
  }
  return accept(state, next, evaluate, options, `Thicken ${matches[0].name}`, { source: surface, thickness: t, side: side ?? 'normal' });
}

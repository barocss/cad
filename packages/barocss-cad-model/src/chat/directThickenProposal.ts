import { thickenCommand } from '../app/thickenCommand';
import { loadDirect } from '../engine/directModule';
import type { Op } from '../engine/schema/proposals';
import { isObj } from '../util/guards';
import { ruledFromVisibleRails } from './directRuledProposal';
import { directInspectionRevision } from './sweepSource';
import { accept, fail, type CallOptions, type ChatState, type Evaluate } from './toolKit';

export const DIRECT_THICKEN_COMMAND = {
  command: 'direct-thicken',
  label: 'Thicken',
  hint: 'Use inside proposals.propose for Studio approval.',
  selection: 'Pass direct_revision from query.summary and either a visible surface ID or two ordered visible rail IDs.',
  values: { surface: 'Whole Direct surface ID; omit with rails', first: 'First Direct rail (v = 0); omit with surface',
    second: 'Distinct second Direct rail (v = 1); omit with surface', t: 'positive thickness in mm', side: 'normal (default), reverse, or both',
    mode: 'sampled (default), exact-planar for a whole convex coplanar bilinear sheet, or exact-cylinder for a certified upright circular sector or two-quarter half-cylinder' },
};

export const DIRECT_SNAPSHOT_APPROVAL = 'Direct surface snapshot';
export const isDirectThickenOperation = (op: Op) => op.tool === 'run_command' && op.args?.command === DIRECT_THICKEN_COMMAND.command;
export const isRuledThickenOperation = (op: Op) => isDirectThickenOperation(op) && isObj(op.args?.values) && typeof op.args.values.first === 'string';

export async function proposeDirectThickenCommand(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate, options: CallOptions) {
  if (!options.proposal || state.partOf)
    return fail(state, 'Propose Direct Thicken in the base part for user approval in Studio.', { code: 'needs_approval' });

  const { expectedRevision, values } = args;
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)
    || !isObj(values) || Object.keys(values).some(key => !['surface', 'first', 'second', 't', 'side', 'mode'].includes(key))
    || typeof values.t !== 'number' || !Number.isFinite(values.t)
    || values.t <= 0 || values.t > 10000
    || (values.side !== undefined && values.side !== 'normal' && values.side !== 'reverse' && values.side !== 'both')
    || (values.mode !== undefined && values.mode !== 'sampled' && values.mode !== 'exact-planar' && values.mode !== 'exact-cylinder')
    || args.faces !== undefined || args.edges !== undefined || args.bodies !== undefined || args.point !== undefined)
    return fail(state, 'Use positive thickness values.t in mm and direct_revision from query.summary as expectedRevision. See describe for the source options.', { code: 'DIRECT_THICKEN_INPUT' });

  const { bodies } = state, { surface, first, second, t, side = 'normal', mode = 'sampled' } = values;
  const railPair = typeof first === 'string' && !!first && typeof second === 'string' && !!second && first !== second && !Object.hasOwn(values, 'surface');
  if (!railPair && (typeof surface !== 'string' || !surface || Object.hasOwn(values, 'first') || Object.hasOwn(values, 'second')))
    return fail(state, 'Use either values.surface or two distinct Direct rail IDs in values.first and values.second.', { code: 'DIRECT_THICKEN_INPUT' });
  const revision = directInspectionRevision(state.doc);
  if (revision !== expectedRevision)
    return fail(state, 'The Direct inputs changed. Read query.summary again and make a new proposal.', { code: 'DIRECT_THICKEN_STALE', revision });

  let doc = state.doc, surfaceId = surface;
  if (railPair) {
    try {
      const ruled = await ruledFromVisibleRails(doc.direct, first, second);
      const added = ruled?.objects.slice(doc.direct?.objects.length ?? 0);
      if (!ruled || added?.length !== 1)
        return fail(state, 'Use two unique visible Direct rail IDs from query.summary.', { code: 'DIRECT_THICKEN_SOURCE' });
      surfaceId = added[0].id;
      doc = { ...doc, direct: ruled };
    } catch (error) {
      return fail(state, error instanceof Error ? error.message : 'These rails could not form an exact Ruled surface.', { code: 'DIRECT_THICKEN_SOURCE' });
    }
  }
  const matches = doc.direct?.objects.filter(object => object.id === surfaceId);
  if (matches?.length !== 1 || matches[0].hidden)
    return fail(state, 'Use a unique visible Direct surface ID from query.summary.', { code: 'DIRECT_THICKEN_SOURCE' });

  await loadDirect();
  let next;
  try {
    next = thickenCommand.build!({ doc, bodies, direct: [matches[0].id], selection: { bodies: [], faces: [], edges: [] } },
      { t, side, mode });
  } catch (error) {
    return fail(state, error instanceof Error ? error.message : 'The source surface could not be copied.', { code: 'DIRECT_THICKEN_SOURCE' });
  }
  const what = railPair ? `Add and thicken a Ruled surface between ${first} and ${second}` : `Thicken ${matches[0].name}`;
  return accept(state, next, evaluate, options, what, { source: matches[0].id, thickness: t, side, mode });
}

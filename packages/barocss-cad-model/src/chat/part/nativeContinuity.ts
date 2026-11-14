import { readEdgeContinuity } from '../../engine/edgeContinuity';
import { digestOf } from '../../util/digest';
import { fail, json, type ChatState, type PartHandler, type ToolOutcome } from '../toolKit';

const revisionOf = (state: ChatState, body: string) => digestOf([state.doc, body]);
const bodyKey = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const readResult = (state: ChatState, content: Record<string, unknown>, summary: string): ToolOutcome =>
  ({ state, changed: false, isError: false, summary, content: json(content) });

export const NATIVE_CONTINUITY_HANDLERS: Record<string, PartHandler> = {
  list_native_joints: async (state, args) => {
    const body = bodyKey(args.body);
    if (!body) return fail(state, 'Use a base body key from query.summary.');
    const result = readEdgeContinuity(state.doc, body, { kind: 'list' });
    if ('error' in result) return fail(state, result.error);
    return readResult(state, { body, revision: revisionOf(state, body), edges: result.edges }, 'Read native joints');
  },

  measure_edge_curvature: async (state, { body: value, edgeId, expectedRevision }) => {
    const body = bodyKey(value);
    if (!body) return fail(state, 'Use a base body key from query.summary.');
    if (typeof edgeId !== 'string' || !edgeId.trim()) return fail(state, 'Use a native edge ID from query.native_joints.');
    const revision = revisionOf(state, body);
    if (expectedRevision !== revision) return fail(state, 'The model or base body changed. Run query.native_joints again.');
    const result = readEdgeContinuity(state.doc, body, { kind: 'curve', edgeId });
    if ('error' in result) return fail(state, result.error);
    return readResult(state, { body, revision, ...result.curve }, 'Measured native curve curvature');
  },

  measure_edge_continuity: async (state, { body: value, edgeId, expectedRevision, curvature }) => {
    const body = bodyKey(value);
    if (!body) return fail(state, 'Use a base body key from query.summary.');
    if (typeof edgeId !== 'string' || !edgeId.trim()) return fail(state, 'Use a native edge ID from query.native_joints.');
    if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) {
      return fail(state, 'Set expectedRevision to the revision from query.native_joints.');
    }
    if (curvature !== undefined && typeof curvature !== 'boolean') return fail(state, 'curvature must be a boolean.');
    const revision = revisionOf(state, body);
    if (expectedRevision !== revision) return fail(state, 'The model or base body changed. Run query.native_joints again.');
    const result = readEdgeContinuity(state.doc, body, { kind: 'measure', edgeId, curvature });
    if ('error' in result) return fail(state, result.error);
    const measurement = { body, revision, ...result.measurement };
    if (measurement.status === 'unsupported') {
      return fail(state, `Cannot measure this native joint (${measurement.reason}).`, measurement);
    }
    return readResult(state, { ...measurement, unit: 'degrees' }, 'Measured native edge continuity');
  },
};

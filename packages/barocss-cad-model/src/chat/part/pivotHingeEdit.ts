import type { Ctx } from '../../app/commands';
import { editSavedPivotFaceCommand, savedPivotStock } from '../../app/draftEdit';
import { prefixDoc, type StudioDoc } from '../../engine/doc';
import { rememberedEvaluate } from '../../engine/evalMemo';
import type { EvalResult } from '../../engine/evaluate';
import { bodyKeyFor } from '../../engine/ids';
import { isRefusal } from '../../engine/refusal';
import { accept, fail, type CallOptions, type ChatState, type Evaluate } from '../toolKit';

export const savedPivotHingeKey = 'hingeEdge';

/** Discovery and edit use the original stock, including any Move before the pivot. */
export async function readSavedPivotHinge(state: ChatState, index: number, evaluate: Evaluate) {
  const { doc, bodies, partOf } = state;
  const parent = !partOf && savedPivotStock(doc, index);
  if (!parent) return;
  let result: EvalResult | null;
  try { result = await rememberedEvaluate(evaluate)(prefixDoc(doc, index)); }
  catch { return; }
  if (!result?.ok) return;
  const key = bodyKeyFor(doc.nodes, parent.node, parent.side);
  const matches = result.bodies.filter(body => body.key === key && body.ref?.node === parent.node && body.ref.side === parent.side);
  if (matches.length !== 1) return;
  const cmd = editSavedPivotFaceCommand(doc, index, matches[0]);
  const ctx: Ctx = { doc, bodies, selection: { bodies: [], faces: [], edges: [] } };
  const field = cmd?.fields?.(ctx).find(field => field.key === savedPivotHingeKey);
  const values = cmd?.defaults?.(ctx);
  if (field?.kind !== 'choice' || !values || !cmd?.build) return;
  return { ctx, field, values, build: cmd.build };
}

export async function editSavedPivotHinge(state: ChatState, index: number, hinge: unknown, evaluate: Evaluate, options: CallOptions) {
  if (typeof hinge !== 'string' || !hinge)
    return fail(state, 'Use a fixed-edge name from query.edit_fields.', { code: 'EDIT_INPUT' });
  const edit = await readSavedPivotHinge(state, index, evaluate);
  if (!edit) return fail(state, 'Choose a saved base-part Pivot face with an available original stock face and fixed edge.',
    { code: 'BAD_REFERENCE', kept: 'the part is unchanged' });
  let next: StudioDoc;
  try { next = edit.build(edit.ctx, { ...edit.values, [savedPivotHingeKey]: hinge }); }
  catch (error) {
    if (isRefusal(error, 'BAD_REFERENCE')) return fail(state, error.message, { code: error.code, kept: 'the part is unchanged' });
    throw error;
  }
  if (next === state.doc) return fail(state, 'The saved Pivot face already has this fixed edge.', { code: 'EDIT_INPUT' });
  return accept(state, next, evaluate, options, `replaced the fixed edge of Pivot face ${index} with ${hinge}`);
}

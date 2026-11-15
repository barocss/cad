import assert from 'node:assert/strict';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { receivePersonRowFiles } from '../src/engine/rowFiles';
import { loadPersonRows } from '../src/chat/rows';
import { acceptProposal, runTool } from '../src/chat/tools';
import { drawingInputs } from '../src/chat/drawing';
import { defaultDrawing, readDrawing } from '../src/drawing/types';
import { applySuggestion, type ToleranceSuggestion } from '../src/drawing/tolerance';
import { fixAll, type SheetInputs } from '../src/drawing/issues';

/** Existing #613 plate and supplied fastener rows, through the real local Auto-dimension proposal. */
export async function toleranceLabelFixture(rowText: string, pinned = true) {
  const rows = receivePersonRowFiles('0123456789abcdef01234567', [{ name: 'fastener-sizes.json', text: rowText, turn: 1 }], 1);
  const loaded = loadPersonRows(withNode(rectanglePart(100, 40, 10), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [20, 12], radius: 3.3, pattern: { count: 4, step: [20, 0] } }), 'fastener-sizes', rows.files[0].id, undefined, rows);
  assert.ok('doc' in loaded);
  const doc: StudioDoc = pinned ? { ...loaded.doc, drawing: { ...defaultDrawing(), orientation: 'x+', sheet: 'A4', scale: 0.5 } } : loaded.doc;
  const evaluate = async (input: StudioDoc) => evaluatePart(input, 1), result = await evaluate(doc); assert.ok(result.ok);
  const proposed = await runTool({ doc, bodies: result.bodies }, 'propose', { title: 'Automatic drawing', plan: 'Lay out and dimension the existing plate.', ops: [{ tool: 'auto_dimension', args: {} }] }, evaluate);
  assert.ok(!proposed.isError, proposed.content);
  const accepted = await acceptProposal(proposed.state, 'P1', evaluate); assert.ok(!('error' in accepted));
  const initial: StudioDoc = { ...accepted.state.doc, drawing: { ...readDrawing(accepted.state.doc.drawing), tolerancing: 'geometric' } };
  const inputs = drawingInputs(initial); assert.ok(typeof inputs !== 'string');
  return { initial, inputs };
}

/** The previous acceptance pipeline, for an explicit five-collision counterfactual, not a UI before-state. */
export function toleranceLegacyMoves(inputs: SheetInputs, accepted: readonly ToleranceSuggestion[]) {
  const settings = accepted.reduce((current, suggestion) => applySuggestion(current, suggestion), inputs.settings);
  return fixAll({ ...inputs, settings }, 40, fix => fix.kind === 'move' || fix.kind === 'move-note').settings;
}

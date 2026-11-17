// The user's bearing rows (R12c.4, D158): catalogue rows of envelopes and abutment values, each citing its source or
// flagged an estimate — none built in. A row a bearing uses stays (remove the bearing first).
import { bearingRowProblem, type BearingRow } from '@barocss/cad';
import type { StudioDoc } from './doc';
import { editRows } from './rowEdits';

/** A placed child inherits this row unless its own same-id row shadows it for
 * the whole branch. Hidden/suppressed authored uses remain protected, as at root. */
function bearingUsesRow(doc: StudioDoc, id: string, seen = new Set<StudioDoc>()): boolean {
  if (seen.has(doc)) return false;
  seen.add(doc);
  if (doc.nodes.some(n => n.kind === 'bearing' && n.row === id)) return true;
  return (doc.instances ?? []).some(i => !i.doc.bearings?.rows.some(r => r.id === id) && bearingUsesRow(i.doc, id, seen));
}

/** Rows added (each checked; one with an id held already replaces it) and removed by id. */
export function editBearingRows(doc: StudioDoc, add: readonly unknown[], remove: readonly string[] = []): { doc: StudioDoc } | { error: string } {
  const r = editRows<BearingRow>(doc.bearings?.rows ?? [], add, remove, { problem: bearingRowProblem, noun: 'bearing row',
    used: { by: id => bearingUsesRow(doc, id), text: 'is used by a bearing: remove the bearing first' } });
  return 'error' in r ? r : { doc: { ...doc, bearings: { version: 1, rows: r.rows } } };
}

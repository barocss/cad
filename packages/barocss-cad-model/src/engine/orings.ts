// The user's O-ring rows (R12c.5, D159): each an ID and a cross-section citing its source or flagged an estimate — none
// built in. A row a gland uses stays (remove the gland first).
import { oringRowProblem, type ORingRow } from '@barocss/cad';
import type { StudioDoc } from './doc';
import { editRows } from './rowEdits';

/** Descendants inherit this row until a local same-ID row owns the branch. */
function glandUsesRow(doc: StudioDoc, id: string, seen = new Set<StudioDoc>()): boolean {
  if (seen.has(doc)) return false;
  seen.add(doc);
  if (doc.nodes.some(n => n.kind === 'oring-gland' && n.ring === id)) return true;
  return (doc.instances ?? []).some(i => !i.doc.orings?.rows.some(r => r.id === id) && glandUsesRow(i.doc, id, seen));
}

/** Rows added (each checked; one with an id held already replaces it) and removed by id. */
export function editORingRows(doc: StudioDoc, add: readonly unknown[], remove: readonly string[] = []): { doc: StudioDoc } | { error: string } {
  const r = editRows<ORingRow>(doc.orings?.rows ?? [], add, remove, { problem: oringRowProblem, noun: 'O-ring row',
    used: { by: id => glandUsesRow(doc, id), text: 'is used by a gland: remove the gland first' } });
  return 'error' in r ? r : { doc: { ...doc, orings: { version: 1, rows: r.rows } } };
}

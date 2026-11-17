// The user's connector rows (R12c.7, D162): an opening, a mating body and a keep-out, each row citing its source or
// flagged an estimate — none built in. A row an opening uses stays (remove the opening first).
import { connectorRowProblem, type ConnectorRow } from '@barocss/cad';
import type { StudioDoc } from './doc';
import { editRows } from './rowEdits';
import { inheritedRowUsed } from './rowUsage';

/** Rows added (each checked; one with an id held already replaces it) and removed by id. */
export function editConnectorRows(doc: StudioDoc, add: readonly unknown[], remove: readonly string[] = []): { doc: StudioDoc } | { error: string } {
  const r = editRows<ConnectorRow>(doc.connectors?.rows ?? [], add, remove, { problem: connectorRowProblem, noun: 'connector row',
    used: { by: id => inheritedRowUsed(doc, id, (d, key) => d.nodes.some(n => n.kind === 'connector-opening' && n.row === key), (d, key) => !!d.connectors?.rows.some(r => r.id === key)), text: 'is used by an opening: remove it first' } });
  return 'error' in r ? r : { doc: { ...doc, connectors: { version: 1, rows: r.rows } } };
}

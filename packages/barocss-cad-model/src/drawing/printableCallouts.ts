import type { Sheet } from './sheet';

export interface PrintedCallout {
  id: string;
  view: string;
  kind: 'diameter' | 'radius';
  lines: string[];
}

/** Only resolved dimension marks actually printed on this sheet can supply callout text. */
export function printableCallouts(sheet: Sheet): PrintedCallout[] {
  const kinds = new Map<string, 'diameter' | 'radius'>();
  for (const r of sheet.dimensions) {
    if (r.ok && (r.kind === 'diameter' || r.kind === 'radius'))
      kinds.set(JSON.stringify([r.dim.id, r.dim.view]), r.kind);
  }
  return sheet.groups.flatMap(group => {
    if (group.role !== 'dimension' || !group.id || !group.view) return [];
    const kind = kinds.get(JSON.stringify([group.id, group.view]));
    if (!kind) return [];
    const lines = group.marks.flatMap(mark => mark.kind === 'text' ? [mark.text] : []);
    return lines.length ? [{ id: group.id, view: group.view, kind, lines }] : [];
  });
}

import { useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { readDrawing } from '@barocss/cad-model/drawing/types';
import type { DrawingSettings, DrawingTable } from '@barocss/cad-model/drawing/types';
import { addFitList, fitListScopeProblem, moveFitList, removeFitList } from './fitListSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function Position({ table, settings, onChange }: { table: DrawingTable; settings: DrawingSettings; onChange(next: DrawingSettings): boolean }) {
  const [draft, setDraft] = useState<{ owner: DrawingSettings; x: string; y: string } | null>(null);
  const current = draft?.owner === settings ? draft : null;
  const x = current?.x ?? String(table.at?.[0] ?? ''), y = current?.y ?? String(table.at?.[1] ?? '');
  const next = moveFitList(settings, table.id, x, y);
  return <div>
    <div>{table.id}: {table.at ? 'Explicit sheet position' : 'Automatic position above the title block'}</div>
    <label> X (mm)<Input aria-label={`Fit list ${table.id} X (mm)`} value={x} onChange={e => setDraft({ owner: settings, x: e.target.value, y })} /></label>
    <label> Y (mm)<Input aria-label={`Fit list ${table.id} Y (mm)`} value={y} onChange={e => setDraft({ owner: settings, x, y: e.target.value })} /></label>
    <Button variant="ghost" disabled={!next || next === settings} onClick={() => { if (next && onChange(next)) setDraft(null); }}>Move fit list {table.id}</Button>
    <Button variant="ghost" onClick={() => onChange(removeFitList(settings, table.id))}>Remove fit list {table.id}</Button>
  </div>;
}
export function FitListControls({ settings, sourceDoc, onChange }: { settings: DrawingSettings; sourceDoc: StudioDoc; onChange(next: DrawingSettings): boolean }) {
  const problem = fitListScopeProblem(readDrawing(sourceDoc.drawing)) ?? (sourceDoc.instances?.length ? 'Fit dimension lists do not support documents with placed instances.' : null), lists = settings.tables?.filter(t => t.from === 'fits') ?? [];
  return <details aria-label="Fit dimension lists">
    <summary>Fit dimension lists</summary>
    <p>Current single-sheet base-part ordinary diameter dimensions with fit classes. Rows are dimensions, not part or hole quantities. User tables are not manufacturing approval.</p>
    {problem && <p role="status">{problem}</p>}
    <Button variant="ghost" disabled={!!problem || !!lists.length} onClick={() => onChange(addFitList(settings))}>Add fit dimension list</Button>
    {lists.map(t => <Position key={t.id} table={t} settings={settings} onChange={onChange} />)}
  </details>;
}

import { useMemo, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BomPanelData } from '@barocss/cad-model/bom/bom';
import { designBriefNotes, designBriefNotesCsv } from '@barocss/cad-model/bom/designBriefNotes';
import { Button } from '@/components/ui/button';
import { downloadBytes } from './files';

/** Read-only, explicit consumer of existing design intent. No note authoring or approval promotion. */
export function BomBriefNotes({ doc, data, name, isCurrent, onError }: {
  doc: StudioDoc; data: BomPanelData; name: string; isCurrent(): boolean;
  onError(title: string, message: string): void;
}) {
  const [consent, setConsent] = useState<{ doc: StudioDoc; data: BomPanelData; name: string } | null>(null);
  const included = consent?.doc === doc && consent.data === data && consent.name === name;
  const result = useMemo(() => included ? designBriefNotes(doc, data) : null, [included, doc, data]);
  const exportNotes = () => {
    if (!included || !isCurrent()) return;
    const output = designBriefNotesCsv(doc, data);
    if (!output.ok) { onError('Could not export design-brief notes', output.error); return; }
    if (isCurrent()) downloadBytes(new TextEncoder().encode(output.text), `${name} design-brief notes.csv`, 'text/csv');
  };
  return <section aria-label="Design-brief notes" className="mt-2">
    <label className="flex items-center gap-1.5"><input type="checkbox" aria-label="Include design-brief notes" checked={included}
      onChange={e => { if (isCurrent()) setConsent(e.currentTarget.checked ? { doc, data, name } : null); }} />Include design-brief notes</label>
    {included && <>
      <p className="muted small">Existing design intent only, not verified part instructions or manufacturing approval. Notes belong to the part definition; occurrence IDs identify each recipient. This session option does not change the document.</p>
      {result && !result.ok && <p role="alert">{result.error}</p>}
      {result?.ok && <>
        {result.lines.map(line => <div key={line.itemNo} aria-label={`Design-brief notes item ${line.itemNo}`} className="mt-2">
          <strong>Item {line.itemNo}{line.groups.length > 1 ? ' — Different notes' : ''}</strong>
          {line.groups.map((group, index) => <div key={index} className="mt-1">
            <div className="mono">Occurrences: {group.parts.join(', ')}</div>
            {group.state === 'note' && group.field ? <>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{group.field.value || '(Empty note)'}</div>
              <div className="muted small">Basis: {group.field.basis}</div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Source: {group.field.source ?? 'Not recorded'}</div>
              {group.field.why !== undefined && <div>Reason: {group.field.why}</div>}
              <div className="muted small">Confirmation: {group.field.confirmed ? `Recorded by ${group.field.confirmed.by} at ${group.field.confirmed.at}` : 'Not recorded'}</div>
              <div className="muted small">Statement verification: {group.field.said ?? 'Not recorded'}</div>
            </> : <div>{group.state === 'absent' ? 'No design-brief note' : 'Invalid design-brief note; not interpreted'}</div>}
          </div>)}
        </div>)}
        {result.excluded.map((line, index) => <p key={index} className="muted small">Excluded item {line.itemNo} ({line.parts.join(', ')}): {line.reason}</p>)}
        {!result.lines.length && <p>No supported design-brief notes rows.</p>}
      </>}
      <Button variant="ghost" aria-label="Export design-brief notes" disabled={!result?.ok} onClick={exportNotes}>Export design-brief notes</Button>
    </>}
  </section>;
}

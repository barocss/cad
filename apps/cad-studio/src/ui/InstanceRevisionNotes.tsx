import { useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { readInstanceRevisionNotes } from '../state/instanceRevisionNotes';
import { Button } from '@/components/ui/button';

/** Read-only, opt-in view of the selected definition's note text. Never confirms or merges a Field. */
export function InstanceRevisionNotes({ doc, id }: { doc: StudioDoc; id: string }) {
  const owner = doc.instances?.find(instance => instance.id === id);
  const pending = owner?.part ? doc.pendingParts?.[owner.part.id] : undefined;
  const [shown, setShown] = useState<{ doc: StudioDoc; id: string; owner: typeof owner; pending: typeof pending } | null>(null);
  const open = shown?.doc === doc && shown.id === id && shown.owner === owner && shown.pending === pending;
  // Drop prior consent rather than letting Undo or a later selection resurrect it.
  if (shown && !open) setShown(null);
  const comparison = readInstanceRevisionNotes(doc, id);
  if (!comparison) return null;
  if (!comparison.ok) return <p className="muted small">Note comparison unavailable: {comparison.error}</p>;
  const labels = { same: 'Note text unchanged.', added: 'Note text added.', removed: 'Note text removed.', changed: 'Note text changed.' };
  return <section aria-label="Revision note comparison" className="small">
    <Button variant="ghost" aria-expanded={open} onClick={() => setShown(open ? null : { doc, id, owner, pending })}>
      {open ? 'Hide note comparison' : 'Compare design-brief notes'}
    </Button>
    {open && <>
      <p>Definition {comparison.definitionId} · {comparison.sharedCount} occurrence{comparison.sharedCount === 1 ? '' : 's'}. Note text and recorded status only, not a complete revision comparison.</p>
      <p>{labels[comparison.textChange]} {comparison.metadataChanged ? 'Note metadata also differs; source quotes and other metadata are not displayed.' : ''}</p>
      {(['current', 'offered'] as const).map(side => {
        const note = comparison[side];
        return <section key={side} aria-label={`${side === 'current' ? 'Current' : 'Offered'} revision note`}>
          <b>{side === 'current' ? 'Current' : 'Offered'} · Rev {side === 'current' ? comparison.currentRevision : comparison.offeredRevision}</b>
          <p className="whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>{note.text ?? 'No design-brief note recorded.'}</p>
          {note.basis !== null && <p className="muted">Basis: {note.basis}. {note.confirmed ? 'Stored user-confirmation record present.' : 'No stored user-confirmation record.'}</p>}
        </section>;
      })}
      <p className="muted">Design intent only, not manufacturing approval. Viewing does not confirm notes or accept a revision. Source quotes, reasoning and other brief fields are not shown.</p>
    </>}
  </section>;
}

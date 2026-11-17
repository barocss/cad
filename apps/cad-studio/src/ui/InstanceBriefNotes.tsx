import { useLayoutEffect, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { badValue } from '@barocss/cad-model/chat/brief';
import { clearInstanceBriefNote, createNoteEditSession, editInstanceBriefNote, instanceNoteScope } from '../state/instanceBriefNotes';
import { Button } from '@/components/ui/button';
export function InstanceBriefNotes({ doc, id, blocked, commit, onError }: {
    doc: StudioDoc;
    id: string;
    blocked: boolean;
    commit(next: StudioDoc): boolean;
    onError(message: string): void;
}) {
    const scope = instanceNoteScope(doc, id);
    const [session] = useState(createNoteEditSession);
    const [draft, setDraft] = useState({ doc, id, open: false, token: null as object | null, text: scope.ok ? scope.text : '' });
    const current = draft.doc === doc && draft.id === id;
    if (!current) {
        session.end();
        setDraft({ doc, id, open: false, token: null, text: scope.ok ? scope.text : '' });
    }
    const live = useRef({ doc, id, blocked, mounted: true });
    live.current = { doc, id, blocked, mounted: live.current.mounted };
    useLayoutEffect(() => { live.current.mounted = true; return () => { live.current.mounted = false; session.end(); }; }, [session]);
    const open = current && draft.open;
    const reset = () => { session.end(); setDraft({ doc, id, open: false, token: null, text: scope.ok ? scope.text : '' }); };
    const submit = (action: 'save' | 'clear') => session.run(draft.token, () => {
        if (!live.current.mounted || live.current.doc !== doc || live.current.id !== id || live.current.blocked || !current || !open)
            return;
        const result = action === 'clear' ? clearInstanceBriefNote(doc, id) : editInstanceBriefNote(doc, id, draft.text, new Date().toISOString());
        if (!result.ok) {
            onError(result.error);
            return;
        }
        if (!result.changed || commit(result.doc))
            reset();
    });
    return <section aria-label="Definition design-brief notes" className="render-section">
  <div className="card-title">DESIGN-BRIEF NOTES</div>
  <p className="muted small">Design intent only, not manufacturing approval. Saved on the part definition.</p>
  {!scope.ok ? <p role="status" className="muted small">{scope.error}</p> : <>
   <p className="muted small">Applies to {scope.owner.part ? `definition ${scope.owner.part.id} (Rev ${scope.owner.part.rev}; saving changes its revision)` : 'this independent definition'}: {scope.members.map(i => `${i.name} (${i.id})`).join(', ')}.</p>
   {open ? <>
    <label>Definition notes<textarea aria-label="Definition notes" value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') {
                e.preventDefault();
                reset();
            } }}/></label>
    <p className="muted small">1–500 characters. Save records your explicit confirmation of this text; it does not approve the part for manufacture.</p>
    {badValue('notes', draft.text) && <p role="alert">Enter 1–500 characters; use Clear note to explicitly remove the saved note.</p>}
    <p className="muted small">Clear note removes the saved note and its source/confirmation metadata, discards this draft, and leaves other brief fields unchanged.</p>
    <div className="row"><Button disabled={blocked || !!badValue('notes', draft.text) || draft.text === scope.text} onClick={() => submit('save')}>Save notes</Button><Button variant="ghost" disabled={blocked || !scope.owner.doc.brief?.notes} onClick={() => submit('clear')}>Clear note</Button><Button variant="ghost" onClick={reset}>Cancel notes</Button></div>
   </> : <><p className="small whitespace-pre-wrap">{scope.text || 'No design-brief notes recorded.'}</p><Button disabled={blocked} variant="ghost" onClick={() => setDraft({ doc, id, open: true, token: session.begin(), text: scope.text })}>Edit notes</Button></>}
  </>}
 </section>;
}

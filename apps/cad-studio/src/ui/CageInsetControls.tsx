import type { CageEditor } from '../subd/useCageEditor';
import { CONTROL, FIELD } from './panelStyles';
import { Button } from '@/components/ui/button';
export function CageInsetControls({ editor }: { editor: CageEditor }) {
  const draft = editor.insetDraft;
  if (!draft) return null;
  return <div className="space-y-2" role="group" aria-label="Inset face preview">
    <div className="muted small">One planar convex quad. Outer boundary and its creases stay unchanged; new inner edges are smooth. Apply selects the inner face for Extrude.</div>
    <label className={FIELD}><span>Inset mm</span><input className={CONTROL} aria-label="Inset distance mm" type="number" step="0.1" min="0" value={draft.value} onChange={e => editor.previewInset(e.target.value)} /></label>
    <div className="muted small">Cage distance, not final smooth-surface wall thickness. Every preview replaces the previous one. Mirror-seam faces are not supported.</div>
    {draft.error ? <div className="warn" role="status">{draft.error}</div> : !editor.insetReady && <div className="muted small" role="status">{editor.loopStatus}</div>}
    <div className="flex gap-1"><Button variant="ghost" onClick={editor.cancelInset}>Cancel inset preview</Button><Button disabled={!editor.insetReady} onClick={editor.applyInset}>Apply inset</Button></div>
  </div>;
}

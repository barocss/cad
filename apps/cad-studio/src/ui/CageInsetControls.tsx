import type { CageEditor } from '../subd/useCageEditor';
import { CONTROL, FIELD } from './panelStyles';
import { Button } from '@/components/ui/button';
export function CageInsetControls({ editor }: { editor: CageEditor }) {
  const draft = editor.insetDraft;
  if (!draft) return null;
  return <div className="space-y-2" role="group" aria-label={draft.base.sel.faces.length > 1 ? 'Inset region preview' : 'Inset face preview'}>
    <label className={FIELD}><span>Inset mm</span><input className={CONTROL} aria-label="Inset distance mm" type="number" step="0.1" min="0" value={draft.value} onChange={e => editor.previewInset(e.target.value)} /></label>
    <div className="muted small">Distance is measured on the control cage. Apply keeps the inner faces selected for Extrude.</div>
    {draft.error ? <div className="warn" role="status">{draft.error}</div> : !editor.insetReady && <div className="muted small" role="status">{editor.loopStatus}</div>}
    <div className="flex gap-1"><Button variant="ghost" onClick={editor.cancelInset}>Cancel inset preview</Button><Button disabled={!editor.insetReady} onClick={editor.applyInset}>Apply inset</Button></div>
  </div>;
}

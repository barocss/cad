import { cageProportionalWeights } from '@barocss/cad-model/subd/cageProportional';
import type { CageEditor } from '../subd/useCageEditor';
import { CONTROL, FIELD } from './panelStyles';
export function CageProportionalControls({ editor }: { editor: CageEditor }) {
  const draft = editor.transformDraft;
  if (!draft || draft.input.kind !== 'move') return null;
  const input = draft.input, enabled = !!input.proportional;
  let affected: { id: number; weight: number }[] | null = null;
  if (enabled) { try { affected = cageProportionalWeights(draft.base, Number(input.radius)).flatMap((weight, id) => weight > 0 ? [{ id, weight }] : []); } catch { /* Exact error is displayed by the transform preview. */ } }
  return <div className="space-y-1">
    <label className="flex items-center gap-2"><input type="checkbox" aria-label="Connected proportional move" checked={enabled} disabled={draft.base.mode !== 'vertex'} onChange={e => editor.previewTransform({ ...input, proportional: e.target.checked, radius: input.radius ?? '10', frame: 'world' })} />Connected proportional move</label>
    {draft.base.mode !== 'vertex' && <div className="muted small">Proportional move needs vertex seeds. Cancel and pick vertices first.</div>}
    {enabled && <>
      <label className={FIELD}><span>Graph radius mm</span><input className={CONTROL} aria-label="Proportional graph radius mm" type="number" min="0" step="1" value={input.radius ?? ''} onChange={e => editor.previewTransform({ ...input, radius: e.target.value })} /></label>
      <div className="muted small">Baseline cage edge-length shortest distance, smoothstep falloff. Creases are not barriers; disconnected shells stay fixed. Not screen distance or smooth-surface geodesics.</div>
      {draft.base.mirror && <div className="muted small">Distances use the stored half-cage. Mirror seam stays constrained.</div>}
      {affected && <details className="muted small"><summary aria-label="Proportional affected vertices">{affected.length} vertices with nonzero weight</summary><div className="max-h-24 overflow-auto" aria-label="Proportional vertex weights">{affected.map(({ id, weight }) => <div key={id}>v{id}: {Number(weight.toPrecision(5))}</div>)}</div></details>}
    </>}
  </div>;
}

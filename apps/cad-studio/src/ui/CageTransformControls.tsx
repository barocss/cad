import { CageProportionalControls } from './CageProportionalControls';
import { cageLocalDirection, type CageLocalFrame } from '@barocss/cad-model/subd/cageLocalDirection';
import type { CageEditor } from '../subd/useCageEditor';
import { selectedVertices } from '@barocss/cad-model/subd/cageEdit';
import { CONTROL, FIELD } from './panelStyles';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

export function CageTransformControls({ editor }: { editor: CageEditor }) {
  const draft = editor.transformDraft;
  if (!draft) return null;
  const input = draft.input, rotate = input.kind === 'rotate', move = input.kind === 'move';
  const frame = input.frame ?? 'world';
  let direction: readonly number[] | null = null;
  if ((move || rotate) && frame !== 'world') { try { direction = cageLocalDirection(draft.base, frame); } catch { /* The draft error below explains the refusal. */ } }
  return <div className="space-y-2" role="group" aria-label="Selection transform preview">
    <div className="muted small">{move ? 'Baseline direction translation (mm)' : rotate ? 'Baseline-axis rotation (degrees)' : 'Uniform scale (ratio)'} {input.proportional ? 'of vertex seeds and their connected weighted neighbourhood.' : 'of picked cage elements only.'} Every preview starts from the same original coordinates.</div>
    {(move || rotate) && <label className={FIELD}><span>{move ? 'Move frame' : 'Rotation frame'}</span><NativeSelect className={CONTROL} aria-label={move ? "Translation frame" : "Rotation frame"} disabled={!!input.proportional} value={frame} onChange={e => editor.previewTransform({ ...input, frame: e.target.value as 'world' | CageLocalFrame })}><option value="world">World axis</option><option value="edge">Single edge tangent</option><option value="face">Single quad normal</option><option value="face-u">Single quad U</option><option value="face-v">Single quad V</option></NativeSelect></label>}
    {move && <CageProportionalControls editor={editor} />}
    {(move || rotate) && frame !== 'world' && <div className="muted small">{frame === 'edge' ? 'One edge only: positive follows lower to higher vertex ID.' : frame === 'face' ? 'One planar convex quad only: positive follows face winding.' : 'One planar convex quad only: U follows the lowest vertex ID to its winding successor. V = normal × U.'} Direction is fixed from the original cage, not the smooth surface.</div>}
    {direction && <div className="muted small" aria-label={move ? "Translation unit direction" : "Rotation unit axis"}>Unit direction: ({direction.map(v => Number(v.toFixed(4))).join(', ')})</div>}
    {((rotate || move) && frame === 'world') && <label className={FIELD}><span>World axis</span><NativeSelect className={CONTROL} aria-label={move ? "Translation world axis" : "Rotation world axis"} value={input.axis} onChange={e => editor.previewTransform({ ...input, axis: Number(e.target.value) as 0 | 1 | 2 })}><option value="0">X</option><option value="1">Y</option><option value="2">Z</option></NativeSelect></label>}
    <label className={FIELD}><span>{move ? 'Distance mm' : rotate ? 'Angle °' : 'Scale ratio'}</span><input className={CONTROL} aria-label={move ? 'Selection distance mm' : rotate ? 'Selection angle degrees' : 'Selection scale ratio'} type="number" step={move || rotate ? '1' : '0.05'} value={input.value} onChange={e => editor.previewTransform({ ...input, value: e.target.value })} /></label>
    {!move && <label className={FIELD}><span>Pivot</span><NativeSelect className={CONTROL} aria-label="Selection pivot" value={input.pivot} onChange={e => editor.previewTransform({ ...input, pivot: e.target.value as 'centre' | 'vertex' })}><option value="centre">Selection centre</option><option value="vertex">Cage vertex</option></NativeSelect></label>}
    {!move && input.pivot === 'vertex' && <label className={FIELD}><span>Vertex ID</span><input className={CONTROL} aria-label="Pivot cage vertex" type="number" step="1" min="0" value={input.vertex} onChange={e => editor.previewTransform({ ...input, vertex: e.target.value })} /></label>}
    <div className="muted small">Picked vertex IDs: {selectedVertices(draft.base).join(', ')}</div>
    {draft.pivot && <div className="muted small" aria-label="Transform pivot coordinates">Pivot: ({draft.pivot.map(v => Number(v.toFixed(3))).join(', ')}) mm</div>}
    {draft.base.mirror && <div className="muted small">Mirror seam stays on its plane. This constrained edit is not a rigid transform of the whole shape.</div>}
    {draft.error ? <div className="warn" role="status">{draft.error}</div> : !editor.transformReady && <div className="muted small" role="status">{editor.loopStatus}</div>}
    <div className="flex gap-1"><Button variant="ghost" onClick={editor.cancelTransform}>Cancel transform preview</Button><Button disabled={!editor.transformReady} onClick={editor.applyTransform}>Apply transform</Button></div>
  </div>;
}

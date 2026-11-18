import { useState } from 'react';
import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import { Button } from '@/components/ui/button';

/** Explicit, atomic static-assembly changes; constrained placement and mate editing stay single-owner. */
export function SelectedInstancesPanel({ doc, instances, moveBlocked, onGround, onTranslate, onRotate }: {
  doc: StudioDoc; moveBlocked: string | null; instances: readonly PartInstance[]; onGround(on: boolean): void; onTranslate(delta: readonly number[]): boolean; onRotate(value: {axis: 'X' | 'Y' | 'Z'; angle: number; pivot: readonly number[]}): boolean;
}) {
  const selection = JSON.stringify(instances.map(i => i.id));
  const [draft, setDraft] = useState({ doc, selection, moveBlocked, values: ['0', '0', '0'] });
  const current = draft.doc === doc && draft.selection === selection && draft.moveBlocked === moveBlocked;
  if (!current) setDraft({ doc, selection, moveBlocked, values: ['0', '0', '0'] });
  const values = current ? draft.values : ['0', '0', '0'];
  const delta = values.map(Number), valid = values.every(v => v.trim() !== '') && delta.every(Number.isFinite);
  const clear = () => setDraft({ doc, selection, moveBlocked, values: ['0', '0', '0'] });
  const fixed = instances.filter(i => i.grounded).length;
  return <aside className="card props" aria-label="Selected placed parts">
    <div className="card-title">SELECTED PARTS · {instances.length}</div>
    <p className="small">{fixed} fixed · {instances.length - fixed} free</p>
    <p className="small muted">Ctrl/Cmd-click part rows to add or remove a selection. Changes apply to all selected parts together.</p>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Button variant="ghost" disabled={fixed === instances.length} onClick={() => onGround(true)}>Fix selected in place</Button>
      <Button variant="ghost" disabled={fixed === 0} onClick={() => onGround(false)}>Unfix selected</Button>
    </div>
    <div className="card-title" style={{ marginTop: 12 }}>MOVE TOGETHER · WORLD MM</div>
    <p className="small muted">Offset free visible parts equally, keeping their relative positions. Fixed, mated, patterned, cut or jointed parts are not moved.</p>
    {(['X', 'Y', 'Z'] as const).map((axis, k) => <label className="kv" key={axis}>{axis}
      <input aria-label={`Selected parts offset ${axis}`} disabled={!!moveBlocked} type="text" inputMode="decimal" value={values[k]}
        onChange={e => setDraft({ doc, selection, moveBlocked, values: values.map((v, j) => j === k ? e.target.value : v) })}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); clear(); } }} />
    </label>)}
    {moveBlocked && <p role="status" className="small muted">{moveBlocked}</p>}
    {!valid && <p role="alert" className="small">Enter finite X, Y and Z offsets in mm.</p>}
    <Button variant="ghost" disabled={!!moveBlocked || !current || !valid || delta.every(v => v === 0)} onClick={() => {
      if (!moveBlocked && current && valid && onTranslate(delta)) clear();
    }}>Move selected parts</Button>
    <GroupRotation doc={doc} selection={selection} blocked={moveBlocked} onRotate={onRotate} />
  </aside>;
}

/** Rotation drafts belong to this document, selection and editing context only. */
function GroupRotation({doc,selection,blocked,onRotate}: {
  doc: StudioDoc; selection: string; blocked: string | null;
  onRotate(value: {axis: 'X' | 'Y' | 'Z'; angle: number; pivot: readonly number[]}): boolean;
}) {
  const defaults = {axis: 'Z' as 'X' | 'Y' | 'Z', angle: '0', pivot: ['0','0','0']};
  const [draft,setDraft] = useState({doc,selection,blocked,...defaults});
  const current = draft.doc === doc && draft.selection === selection && draft.blocked === blocked;
  const clear = () => setDraft({doc,selection,blocked,...defaults});
  if (!current) clear();
  const value = current ? draft : defaults, angle = Number(value.angle), pivot = value.pivot.map(Number);
  const valid = [value.angle,...value.pivot].every(v=>v.trim() !== '') && Number.isFinite(angle) && pivot.every(Number.isFinite);
  const escape = (e: React.KeyboardEvent) => {e.stopPropagation();if(e.key === 'Escape'){e.preventDefault();clear();}};
  return <section aria-label="Rotate selected parts together">
    <div className="card-title" style={{marginTop:12}}>ROTATE TOGETHER · WORLD</div>
    <p className="small muted">Rotate positions and orientations around one explicit world pivot, not each part’s centre. The same free-part restrictions as Move apply. One Undo restores the group.</p>
    <label className="kv">Axis<select aria-label="Selected parts rotation axis" disabled={!!blocked} value={value.axis} onChange={e=>setDraft({...draft,axis:e.target.value as 'X'|'Y'|'Z'})} onKeyDown={escape}>
      {['X','Y','Z'].map(axis=><option key={axis}>{axis}</option>)}
    </select></label>
    <label className="kv">Angle °<input aria-label="Selected parts rotation angle" type="text" inputMode="decimal" disabled={!!blocked} value={value.angle} onChange={e=>setDraft({...draft,angle:e.target.value})} onKeyDown={escape}/></label>
    {(['X','Y','Z'] as const).map((axis,k)=><label className="kv" key={axis}>Pivot {axis} mm<input aria-label={`Selected parts pivot ${axis}`} type="text" inputMode="decimal" disabled={!!blocked} value={value.pivot[k]} onChange={e=>setDraft({...draft,pivot:value.pivot.map((v,j)=>j===k?e.target.value:v)})} onKeyDown={escape}/></label>)}
    {!valid && <p className="small" role="alert">Enter a finite angle in degrees and world pivot coordinates in mm.</p>}
    <Button variant="ghost" disabled={!!blocked || !current || !valid || angle % 360 === 0} onClick={()=>{if(!blocked && current && valid && onRotate({axis:value.axis,angle,pivot}))clear();}}>Rotate selected parts</Button>
  </section>;
}

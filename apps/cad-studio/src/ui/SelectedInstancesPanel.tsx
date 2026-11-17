import { useState } from 'react';
import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import { Button } from '@/components/ui/button';

/** Explicit, atomic static-assembly changes; constrained placement and mate editing stay single-owner. */
export function SelectedInstancesPanel({ doc, instances, moveBlocked, onGround, onTranslate }: {
  doc: StudioDoc; moveBlocked: string | null; instances: readonly PartInstance[]; onGround(on: boolean): void; onTranslate(delta: readonly number[]): boolean;
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
  </aside>;
}

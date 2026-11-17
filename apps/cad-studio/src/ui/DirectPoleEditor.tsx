import { useState } from 'react';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { CONTROL, FIELD } from './panelStyles';
export type PolePatch = { xMM?: number; yMM?: number; zMM?: number; weight?: number };
export type PoleControls = { selected: string | null; select(key: string | null): void; edit(key: string, patch: PolePatch): void };
export type PoleRow = { key: string; label: string; point: readonly number[]; weight: number };
/** Selection belongs to the viewport owner; numeric drafts belong to this exact source and row. */
export function DirectPoleEditor({ direct, id, rows, controls }: { direct: DirectGeometry; id: string; rows: PoleRow[]; controls: PoleControls }) {
  const row = rows.find(r => r.key === controls.selected);
  return <div className="render-section">
    <div className="card-title">CONTROL POINT</div>
    <label className={FIELD}><span>Point</span><NativeSelect className={CONTROL} aria-label="Control point" value={row?.key ?? ''} onChange={e => controls.select(e.target.value || null)}>
      <option value="">Select a control point</option>{rows.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
    </NativeSelect></label>
    {row && <PoleFields direct={direct} id={id} row={row} onEdit={patch => controls.edit(row.key, patch)} />}
  </div>;
}
function PoleFields({ direct, id, row, onEdit }: { direct: DirectGeometry; id: string; row: PoleRow; onEdit(patch: PolePatch): void }) {
  return <>{(['xMM', 'yMM', 'zMM', 'weight'] as const).map((field, i) => <PoleInput key={field} direct={direct} owner={`${id}:${row.key}`} label={i < 3 ? 'XYZ'[i] : 'Weight'} value={i < 3 ? row.point[i] : row.weight} positive={field === 'weight'} onEdit={value => onEdit({ [field]: value })} />)}</>;
}
function PoleInput({ direct, owner, label, value, positive, onEdit }: { direct: DirectGeometry; owner: string; label: string; value: number; positive: boolean; onEdit(value: number): void }) {
  const [draft, setDraft] = useState({ direct, owner, text: String(value), error: false });
  const current = draft.direct === direct && draft.owner === owner;
  if (!current) setDraft({ direct, owner, text: String(value), error: false });
  const text = current ? draft.text : String(value), error = current && draft.error;
  const set = (text: string, error = false) => setDraft({ direct, owner, text, error });
  const apply = () => { const n = Number(text); if (!text.trim() || !Number.isFinite(n) || (positive && n <= 0)) { set(text, true); return; } set(text); if (n !== value) onEdit(n); };
  const errorId = `pole-input-${encodeURIComponent(owner)}-${label}`;
  return <><label className={FIELD}><span>{label}</span><Input type="number" step="any" className="w-24" aria-label={label} value={text} aria-invalid={error || undefined} aria-describedby={error ? errorId : undefined}
    onChange={e => set(e.target.value)} onBlur={apply} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); set(String(value)); } }} /></label>
    {error && <span id={errorId} role="alert" className="warn small">{positive ? 'Enter a positive weight.' : 'Enter a finite coordinate.'} Not applied; saved {label.toLowerCase()} is {value}.</span>}</>;
}

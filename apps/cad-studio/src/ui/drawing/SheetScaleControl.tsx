import { useState } from 'react';
import { SCALES, scaleLabel } from '@barocss/cad-model/drawing/views';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { CONTROL, FIELD } from './sheetShared';

/** Paper : model ratio. Bound the result to the existing continuation-sheet file contract. */
export function sheetRatioScale(paper: string, model: string): number | null {
  if (!paper.trim() || !model.trim()) return null;
  const p = Number(paper), m = Number(model), scale = p / m;
  return Number.isFinite(p) && Number.isFinite(m) && p > 0 && m > 0 && Number.isFinite(scale) && scale > 0 && scale <= 1000 ? scale : null;
}

/** A draft is owned by the actual document/sheet settings, never its displayed numeric value. */
export function SheetScaleControl({ owner, value, automatic, onChange, label = 'Scale', target = 'sheet', automaticValue = 'auto', automaticLabel = 'Auto' }: { automaticValue?: string; automaticLabel?: string; label?: string; target?: string; owner: object; value?: number; automatic?: number; onChange(scale: number | undefined): boolean }) {
  const [draft, setDraft] = useState<{ owner: object; paper: string; model: string; error: boolean } | null>(null);
  const current = draft?.owner === owner ? draft : null;
  const apply = () => {
    if (!current) return;
    const scale = sheetRatioScale(current.paper, current.model);
    if (scale === null) { setDraft({ ...current, error: true }); return; }
    if (scale === value || onChange(scale)) setDraft(null);
  };
  return <>
    <label className={FIELD}><span>{label}</span><NativeSelect className={CONTROL} aria-label={label} value={value ?? automaticValue} onChange={e => { if (onChange(e.target.value === automaticValue ? undefined : Number(e.target.value))) setDraft(null); }}>
      <option value={automaticValue}>{automaticLabel}{automatic !== undefined && value === undefined ? ` (${scaleLabel(automatic)})` : ''}</option>
      {value !== undefined && !SCALES.includes(value) && <option value={value}>{value}:1 (custom)</option>}
      {SCALES.map(s => <option key={s} value={s}>{scaleLabel(s)}</option>)}
    </NativeSelect></label>
    {!current ? <Button size="xs" variant="ghost" aria-label={`Set custom ${target} scale`} onClick={() => { const s = value ?? automatic ?? 1; setDraft({ owner, paper: String(s), model: '1', error: false }); }}>Custom scale…</Button>
      : <div aria-label={`Custom ${target} scale`} className="flex flex-col gap-1" onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(null); }
        if (e.key === 'Enter') { e.preventDefault(); apply(); }
      }}>
        <div className="text-[11px]">Paper : model (1 : 4 makes the drawing one quarter size)</div>
        <div className="flex items-center gap-1">
          <Input className="min-w-0 w-20" type="text" inputMode="decimal" aria-label={`${label} paper ratio`} value={current.paper} aria-invalid={current.error} onChange={e => setDraft({ ...current, paper: e.target.value, error: false })} />
          <span>:</span><Input className="min-w-0 w-20" type="text" inputMode="decimal" aria-label={`${label} model ratio`} value={current.model} aria-invalid={current.error} onChange={e => setDraft({ ...current, model: e.target.value, error: false })} />
        </div>
        <div className="flex gap-1"><Button size="xs" aria-label={`Apply custom ${target} scale`} onClick={apply}>Apply</Button><Button size="xs" variant="ghost" aria-label={`Cancel custom ${target} scale`} onClick={() => setDraft(null)}>Cancel</Button></div>
        {current.error && <div role="status">Enter positive finite ratios with a paper/model scale above 0 and at most 1000.</div>}
      </div>}
  </>;
}

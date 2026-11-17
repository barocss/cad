import { useLayoutEffect, useRef, useState } from 'react';
import type { DrawingDetail } from '@barocss/cad-model/drawing/detail';
import { resetDetailPaperPosition } from './detailPaperPosition';
import type { DetailCropFields } from './detailCropEdit';
// The drawing's detail views (CG5, DR-1): each with its letter and parent, its scale (Auto: the smallest standard scale at
// least twice the sheet's) and a remove button. A detail is added with the Detail view tool (E) on the sheet; dragged by
// its drawing to move it.
import type { SheetLayout } from '@barocss/cad-model/drawing/views';
import { SheetScaleControl } from './SheetScaleControl';
import type { Sheet } from '@barocss/cad-model/drawing/sheet';
import type { DrawingSettings } from '@barocss/cad-model/drawing/types';
import { detailScale } from '@barocss/cad-model/drawing/detail';
import { Icon } from '../atoms';
import { CONTROL, FIELD } from './sheetShared';
import { Button } from '@/components/ui/button';

const parentName = (view: string) => view.startsWith('section:') ? `section ${view.slice(8)}–${view.slice(8)}` : `${view} view`;

export function DetailsList({ settings, sheet, layout, onChange, onRemove, crop }: { settings: DrawingSettings; sheet: Sheet | null; layout: SheetLayout | null; onChange(next: DrawingSettings): void; onRemove(id: string): void; crop: { owner: object; ready: boolean; annotated: ReadonlySet<string>; apply(detail: DrawingDetail, fields: DetailCropFields, owner: object): string | null } }) {
  const list = settings.details ?? [];
  if (!list.length) return null;
  const set = (next: DrawingSettings['details']) => { const rest = { ...settings }; delete rest.details; onChange(next?.length ? { ...rest, details: next } : rest); };
  return <>
    <div className="card-title">DETAILS</div>
    {list.map(d => {
      const shown = sheet?.details?.find(x => x.id === d.id), missing = sheet?.detailsMissing?.find(x => x.id === d.id);
      return <div key={d.id} className={FIELD} style={{ flexWrap: 'wrap' }} aria-label={`Detail ${d.id}`}>
        <span>Detail {d.id} · {parentName(d.view)}</span>
        <SheetScaleControl owner={settings} label={`Detail ${d.id} scale`} target={`detail ${d.id}`} value={d.scale}
          automatic={layout ? detailScale(d, layout.scale) : undefined} onChange={scale => {
            set(list.map(x => { if (x.id !== d.id) return x; const rest = { ...x }; delete rest.scale; return scale === undefined ? rest : { ...rest, scale }; }));
            return true;
          }} />
        <Button variant="ghost" size="xs" aria-label={`Remove detail ${d.id}`} title={`Remove detail ${d.id}`} onClick={() => onRemove(d.id)}><Icon name="close" small /></Button>
        <Button variant="ghost" size="xs" aria-label={`Reset detail ${d.id} paper position`} disabled={!d.at}
          title="Automatically place this detail on its assigned sheet. Preserves its crop, scale and annotations; does not shrink it if there is no room."
          onClick={() => onChange(resetDetailPaperPosition(settings, d))}>Auto-place</Button>
        <DetailCropEditor detail={d} crop={crop} />
        {!shown && missing && <div className="empty" style={{ color: 'var(--warn)' }}>{missing.why === 'parent' ? `Its ${parentName(d.view)} is not on the sheet.` : missing.why === 'room' ? 'No free room on the sheet for it.' : 'Its circle holds no line of the part.'}</div>}
      </div>;
    })}
  </>;
}


function DetailCropEditor({ detail, crop }: { detail: DrawingDetail; crop: {
  owner: object; ready: boolean; annotated: ReadonlySet<string>;
  apply(detail: DrawingDetail, fields: DetailCropFields, owner: object): string | null;
} }) {
  const [draft, setDraft] = useState<{ owner: object; fields: DetailCropFields; error: string | null } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<object | null>(null);
  useLayoutEffect(() => {
    if (returnFocus.current === crop.owner) opener.current?.focus({ preventScroll: true });
    returnFocus.current = null;
  });
  const cancel = () => { returnFocus.current = crop.owner; setDraft(null); };
  const current = draft?.owner === crop.owner ? draft : null;
  const locked = crop.annotated.has(detail.id);
  const reason = locked ? 'Remove dimensions and geometric controls before editing this crop. Existing empty-detail Move recovery remains available.'
    : !crop.ready ? 'Wait for the current drawing before editing its crop.' : undefined;
  if (!current) return <div style={{ flexBasis: '100%', minWidth: 0 }}>
    <Button ref={opener} variant="ghost" size="xs" aria-label={`Edit detail ${detail.id} crop`} disabled={!!reason} title={reason}
      onClick={() => setDraft({ owner: crop.owner, fields: { x: String(detail.center[0]), y: String(detail.center[1]), radius: String(detail.radius) }, error: null })}>Edit crop</Button>
    {reason && <div className="empty">{locked ? 'Crop locked by dimensions or geometric controls. Scale and paper position remain editable.' : reason}</div>}
  </div>;
  return <div style={{ flexBasis: '100%', minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }} aria-label={`Detail ${detail.id} crop editor`} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  }}>
    <div style={{ flexBasis: '100%' }}>Crop on the parent view · model mm (not paper position)</div>
    {([['x', 'center X'], ['y', 'center Y'], ['radius', 'radius']] as const).map(([key, label]) => <label key={key} style={{ flex: '1 1 100px', minWidth: 0 }}>
      {label} (model mm)
      <input style={{ width: '100%', maxWidth: '100%', minWidth: 0 }} className={CONTROL} type="text" inputMode="decimal" aria-label={`Detail ${detail.id} ${label} (model mm)`}
        value={current.fields[key]} onChange={e => setDraft({ ...current, fields: { ...current.fields, [key]: e.target.value }, error: null })} />
    </label>)}
    <Button size="xs" aria-label={`Apply detail ${detail.id} crop`} disabled={!!reason} onClick={() => {
      const error = crop.apply(detail, current.fields, current.owner);
      if (error) setDraft({ ...current, error }); else setDraft(null);
    }}>Apply</Button>
    <Button variant="ghost" size="xs" aria-label={`Cancel detail ${detail.id} crop`} onClick={cancel}>Cancel</Button>
    {current.error && <div role="status">{current.error}</div>}
  </div>;
}

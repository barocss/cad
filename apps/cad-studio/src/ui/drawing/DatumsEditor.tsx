// DR-6b first slice: explicit face datum features. A missing selection never falls back to another face.
import { useState } from 'react';
import { checkDatumOptions } from '@barocss/cad-model/drawing/datums';
import { withManufacturingDrawing } from '@barocss/cad-model/drawing/options';
import type { DrawingDatum, DrawingSettings, DrawingViews, SectionViewId } from '@barocss/cad-model/drawing/types';
import { CONTROL, FIELD } from './sheetShared';
import { nextFaceDatumIdentity } from './datumIdentity';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

export function DatumsEditor({ settings, allDatums, availableViews, views, scale, onChange, onRefused }: { settings: DrawingSettings; allDatums: readonly DrawingDatum[]; availableViews: readonly SectionViewId[]; views: DrawingViews | null; scale: number; onChange(next: DrawingSettings): void; onRefused(message: string): void }) {
  const [face, setFace] = useState(''), [view, setView] = useState<SectionViewId>('top');
  const datums = settings.datums ?? [], pr = views?.[view];
  const faces = (views?.faces ?? []).filter(f => f.points.length && views!.faces!.filter(other => other.name === f.name).length === 1);
  const viewAvailable = availableViews.includes(view);
  const chosen = faces.find(f => f.name === face), identity = nextFaceDatumIdentity(allDatums);
  const commit = (rows: NonNullable<DrawingSettings['datums']>) => {
    const args = { datums: rows }, why = checkDatumOptions(args)[0];
    if (why) onRefused(why.message); else onChange(withManufacturingDrawing(settings, args));
  };
  return <details aria-label="Datum features"><summary>Datum features ({datums.length})</summary>
    {datums.map((d, index) => <div className={FIELD} key={`${index}:${d.id}`}><span className="min-w-0 break-words">Datum {d.letter}: {d.face ? d.face.face : d.edge.edge}</span><Button variant="ghost" size="xs" aria-label={`Remove datum ${d.letter}`} onClick={() => commit(datums.filter((_, i) => i !== index))}>Remove</Button></div>)}
    <label className={FIELD}><span>View</span><NativeSelect className={CONTROL} aria-label="Datum annotation view" value={view} onChange={e => setView(e.target.value as SectionViewId)}>
      {(['front', 'top', 'right'] as const).map(v => <option key={v} value={v}>{v}{availableViews.includes(v) ? '' : ' (not shown on this sheet)'}</option>)}
    </NativeSelect></label>
    <label className={FIELD}><span>Face</span><NativeSelect className={`${CONTROL} max-w-40`} aria-label="Datum face" value={chosen?.name ?? ''} onChange={e => setFace(e.target.value)}>
      <option value="">Select a face</option>{faces.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
    </NativeSelect></label>
    {!viewAvailable && <p className="text-[11px]" role="status">Choose a view shown on this sheet to add a datum. Existing datums keep their own views.</p>}
    <Button variant="ghost" aria-label="Add face datum" disabled={!chosen || !pr || !identity || !viewAvailable} onClick={() => {
      if (!chosen || !pr || !identity || !viewAvailable) return;
      commit([...datums, { ...identity, view, face: { face: chosen.name, near: [...chosen.points[0]] }, place: [pr.min[0] - 10 / scale, pr.max[1] + 10 / scale] }]);
    }}>Add face datum {identity?.letter ?? ''}</Button>
    {!!datums.length && <Button variant="ghost" size="xs" aria-label="Clear datum features" onClick={() => commit([])}>Clear datum features</Button>}
  </details>;
}

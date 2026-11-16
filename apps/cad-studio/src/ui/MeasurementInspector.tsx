import { useState, type Dispatch, type SetStateAction } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { CONTROL, FIELD } from './panelStyles';
import { orderedInterference, type InterferenceOrder } from './interferenceOrder';
import { fmt, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DisplayMesh } from '@barocss/cad-model/engine/mesh';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Selection } from '@barocss/cad-model/app/commands';
import { measureItem, type measureBetween, type MeasurePick } from '@barocss/cad-model/app/measure';
import { bodyName, lookOf } from '@barocss/cad-model/app/bodies';
import { Button } from '@/components/ui/button';
import { ToolIconButton } from '@/components/ui/tool-button';
import { Icon } from './atoms';
import { measurePickHint, type MeasurePickFilter } from './measurePickHint';
import { measureQuantityText } from './quantityText';
import { measureSecondaryText, useMeasureSecondaryUnit } from './measureSecondaryUnits';
import { measureAxesBasis } from '../app/measureProvenance';
import type { MeasureTarget } from '../app/measureTargets';
import type { InterferenceReport } from '../app/checkInterference';
interface MeasurementInspectorProps { pickFilter: MeasurePickFilter; targets: MeasureTarget[]; items: ({ pick: MeasurePick; mesh: DisplayMesh } | null)[]; measured: ReturnType<typeof measureBetween> | null; approximateDistance?: boolean; onClose(): void; onPin?(): void }
export function MeasurementInspector({ pickFilter, targets, items, measured, approximateDistance, onClose, onPin }: MeasurementInspectorProps) {
  const secondary = useMeasureSecondaryUnit();
  const extra = (value: number, dimension: 'length' | 'area' = 'length') => {
    const text = secondary.unit === 'inch' ? measureSecondaryText(value, dimension) : null;
    return text ? ` (${text})` : '';
  };
  return <aside className="card props" aria-label="Measurement" tabIndex={-1} aria-keyshortcuts="Alt+M">
        <div className="card-title">MEASURE <ToolIconButton size="tiny" aria-label="Done measuring" data-tip="Done measuring" data-tip-key="Esc" data-tip-focus="" onClick={onClose}><Icon name="close" small /></ToolIconButton></div>
        <div className="muted small">Alt+M · focus measurement details</div>
        <label className={FIELD}><span>Secondary units</span><NativeSelect className={CONTROL} aria-label="Measure secondary units" value={secondary.unit}
          onChange={event => secondary.set(event.target.value === 'inch' ? 'inch' : 'none')}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}
          onKeyUp={event => event.stopPropagation()}>
          <option value="none">None</option><option value="inch">inch</option>
        </NativeSelect></label>
        {!secondary.persistent && <div className="empty" role="status" aria-label="Measure unit preference">Secondary units apply to this session only; browser storage is unavailable.</div>}
        {targets.map((target, k) => {
          const item = items[k], slot = k ? 'To' : 'From';
          if (!item) return <div key={k} className="measure-item empty" role="status">{slot} · {target.label} ({target.occurrence ? target.occurrence.id + '/' : ''}{target.body}) is unavailable. Select a new {slot} target. {measurePickHint(pickFilter, k ? 'to' : 'from')}</div>;
          const it = measureItem(item.mesh, item.pick);
          return <div key={k} className="measure-item">
          <div className="kv">{slot} <b>{it.label}</b></div>
          <div className="kv">Body <b>{target.label} ({target.occurrence ? target.occurrence.id + '/' : ''}{target.body})</b></div>
          {it.length !== undefined && <div className="kv">Length <b>{measureQuantityText(it.length, 2)} mm{extra(it.length)}</b></div>}
          {it.area !== undefined && <div className="kv">Area <b>{measureQuantityText(it.area, 2)} mm²{it.areaBasis === 'display mesh' ? ' (mesh)' : ''}{extra(it.area, 'area')}</b></div>}
          {it.radius !== undefined && <div className="kv">Radius <b>{measureQuantityText(it.radius, 3)} mm{extra(it.radius)}</b></div>}
        </div>; })}
        {measured && <>
          <div className="card-title" style={{ marginTop: 10 }}>BETWEEN</div>
          <div className="kv">Distance <b>{measureQuantityText(measured.distance, 3)} mm{approximateDistance ? ' (mesh approximation)' : ''}{extra(measured.distance)}</b></div>
          {measured.normalDistance !== undefined && <div className="kv">Normal distance <b>{measureQuantityText(measured.normalDistance, 3)} mm{extra(measured.normalDistance)}</b></div>}
          {measured.angle !== undefined && <div className="kv">Angle <b>{measureQuantityText(measured.angle, 2)}°</b></div>}
          {measured.axes && <div className="kv" aria-label="Axes">Axes <b>{measured.axes.coaxial ? 'coaxial' : `${measureQuantityText(measured.axes.angle, 3)}° apart, ${measureQuantityText(measured.axes.offset, 3)} mm off${extra(measured.axes.offset)}`} <span className="muted">({measureAxesBasis})</span></b></div>}
          <div className="kv">ΔX ΔY ΔZ <b>{measured.b.map((v, k) => measureQuantityText(v - measured.a[k], 2)).join(', ')} mm{secondary.unit === 'inch' && ` (${measured.b.map((v, k) => measureSecondaryText(v - measured.a[k]) ?? 'unavailable').join(', ')})`}</b></div>
        </>}
        {onPin && <Button size="sm" variant="ghost" data-measure-focus onClick={onPin}>Pin measurement</Button>}
        {!items.some(item => !item) && <div className="empty">{targets.length < 2 ? measurePickHint(pickFilter, targets.length ? 'to' : 'from') : 'Click again to start over.'}</div>}
      </aside>;
}

export function PinnedMeasurement({ distance, onClear }: { distance: number | null; onClear(): void }) {
  return <aside className="card props" aria-label="Pinned measurement" tabIndex={-1} aria-keyshortcuts="Alt+M">
    <div className="card-title">PINNED MEASUREMENT <ToolIconButton size="tiny" data-measure-focus aria-label="Clear pinned measurement" onClick={onClear}><Icon name="close" small /></ToolIconButton></div>
    <div className="muted small">Alt+M · focus measurement details</div>
    {distance === null ? <div className="empty" role="status">Measurement unavailable.</div>
      : <div className="kv">Normal distance <b>{measureQuantityText(distance, 3)} mm</b></div>}
  </aside>;
}

export type InterferenceResult = InterferenceReport | 'busy';
interface InterferenceInspectorProps { doc: StudioDoc; bodies: BodyResult[]; clashes: InterferenceResult; setClashes(value: null): void; setSelection: Dispatch<SetStateAction<Selection>> }
export function InterferenceInspector({ doc, bodies, clashes, setClashes, setSelection }: InterferenceInspectorProps) {
  return <aside className="card props" aria-label="Interference">
    <div className="card-title">INTERFERENCE <ToolIconButton size="tiny" aria-label="Close interference" onClick={() => setClashes(null)}><Icon name="close" small /></ToolIconButton></div>
    {clashes === 'busy' ? <div className="empty">Checking…</div>
      : <InterferenceResults doc={doc} bodies={bodies} clashes={clashes} setSelection={setSelection} />}
  </aside>;
}

/** Report display owns its transient ordering, not calculation or selection authority. */
function InterferenceResults({ doc, bodies, clashes, setSelection }: Omit<InterferenceInspectorProps, 'clashes' | 'setClashes'> & { clashes: InterferenceReport }) {
  const [state, setState] = useState<{ report: InterferenceReport; order: InterferenceOrder }>({ report: clashes, order: 'original' });
  const order = state.report === clashes ? state.order : 'original';
  if (state.report !== clashes) setState({ report: clashes, order: 'original' });
  const names = bodies.map(body => bodyName(doc, body));
  const label = (index: number, key: string) => {
    const name = names[index];
    return name === undefined ? key : names.indexOf(name) === names.lastIndexOf(name) ? name : `${name} (${key})`;
  };
  const pair = ({ a, b, volume }: { a: string; b: string; volume?: number }) => {
    const ia = bodies.findIndex(body => body.key === a), ib = bodies.findIndex(body => body.key === b);
    return <button type="button" key={JSON.stringify([a, b])} className="ol clash" disabled={ia < 0 || ib < 0}
      onClick={() => setSelection({ faces: [], edges: [], bodies: [ia, ib] })}>
      <Icon name="warning" small />{label(ia, a)}{volume === undefined ? ' and ' : ' ∩ '}{label(ib, b)}
      {volume !== undefined && <span className="muted"> · {fmt(Math.round(volume * 10) / 10)} mm³</span>}
    </button>;
  };
  return <>
    <label className={FIELD}><span>Order</span><NativeSelect className={CONTROL} aria-label="Interference order" value={order}
      onChange={event => setState({ report: clashes, order: event.target.value as InterferenceOrder })}>
      <option value="original">Original order</option><option value="largest">Largest volume first</option><option value="smallest">Smallest volume first</option>
    </NativeSelect></label>
          <div aria-label="Interference check scope" className="empty">
            <div>{clashes.scope === 'all' ? 'All base bodies' : 'Selected base bodies'} · {clashes.checked.length} bodies · {clashes.pairs} {clashes.pairs === 1 ? 'pair' : 'pairs'}</div>
            <ul>{clashes.checked.map(key => {
              const index = bodies.findIndex(body => body.key === key);
              return <li key={key}>{label(index, key)}{index >= 0 && lookOf(doc, bodies[index]).hidden ? ' · hidden (included)' : ''}</li>;
            })}</ul>
            <div>Results belong to this check. Changing selection does not rerun it.</div>
            {clashes.scope === 'all' && <div>Select at least two bodies to check only that selection.</div>}
          </div>
          {!clashes.failures.length && !clashes.clashes.length && <div className="empty">No bodies overlap.</div>}
          {!!clashes.failures.length && <div className="empty">
            {clashes.failures.length === clashes.pairs ? 'Interference check failed.' : 'Interference check incomplete.'}
            {' '}{clashes.failures.length} {clashes.failures.length === 1 ? 'pair' : 'pairs'} could not be checked.
          </div>}
          {orderedInterference(clashes.clashes, order).map(pair)}
          {clashes.failures.map(failure => <div key={JSON.stringify([failure.a, failure.b])}>
            {pair(failure)}
            <div className="empty">{failure.error.detail || failure.error.hint || failure.error.title}</div>
          </div>)}
  </>;
}

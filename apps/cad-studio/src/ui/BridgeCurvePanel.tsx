import type { BridgeContinuity, BridgeEnd } from '@barocss/cad-model/engine/bridgeCurve';
import type { useBridgeCurve } from '../app/useBridgeCurve';
import { CONTROL, FIELD } from './panelStyles';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

export function BridgeCurvePanel({ bridge }: { bridge: ReturnType<typeof useBridgeCurve> }) {
  const { shown, available } = bridge;
  if (!available) return null;
  if (!shown) return <aside className="card props"><Button variant="ghost" onClick={() => void bridge.begin()}>Bridge curve</Button></aside>;
  return <aside className="card props" aria-label="Bridge curve"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); bridge.cancel(); } }}>
    <div className="card-title">BRIDGE CURVE</div>
    {shown.status === 'loading' && <p role="status" className="muted small">Reading native curves…</p>}
    {shown.status === 'refused' && <p role="alert" className="warn small">{shown.error}</p>}
    {shown.status === 'ready' && <>
      {([0, 1] as const).map(index => {
        const label = index ? 'Second endpoint' : 'First endpoint';
        return <label key={label} className={FIELD}><span>{label} · {shown.inputs[index].name}</span>
          <NativeSelect className={CONTROL} aria-label={label} value={shown.ends[index]}
            onChange={event => bridge.changeEnd(index, event.target.value as BridgeEnd)}>
            <option value="start">Start</option><option value="end">End</option>
          </NativeSelect>
        </label>;
      })}
      <label className={FIELD}><span>Continuity</span>
        <NativeSelect className={CONTROL} aria-label="Bridge continuity" value={shown.continuity}
          onChange={event => bridge.changeContinuity(event.target.value as BridgeContinuity)}>
          <option value="G0">G0 · Position</option><option value="G1">G1 · Tangent</option>
        </NativeSelect>
      </label>
      {bridge.ends && <div className="muted small" aria-label="Bridge endpoint coordinates">
        {bridge.ends.map(point => `(${point.map(value => Number(value.toFixed(3))).join(', ')})`).join(' → ')} mm
      </div>}
      {bridge.error && <p role="alert" className="warn small">{bridge.error}</p>}
      <p className="muted small">Snapshot of the selected endpoints.</p>
    </>}
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" onClick={bridge.cancel}>Cancel</Button>
      {shown.status === 'ready' && <Button size="sm" onClick={bridge.apply} disabled={!bridge.preview.length}>Apply</Button>}
    </div>
  </aside>;
}

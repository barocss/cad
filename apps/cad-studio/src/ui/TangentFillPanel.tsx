import type { useTangentFill } from '../app/useTangentFill';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { CONTROL, FIELD } from './panelStyles';

export function TangentFillPanel({ tool }: { tool: ReturnType<typeof useTangentFill> }) {
  if (!tool.picks) return null;
  if (!tool.shown) return <aside className="card props"><Button variant="ghost" onClick={tool.begin}>Tangent Fill</Button></aside>;
  return <aside className="card props" aria-label="Tangent Fill"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); tool.cancel(); } }}>
    <div className="card-title">TANGENT FILL</div>
    <div className="kv">Adjacent surface <b>{tool.picks.donor.name}</b></div>
    <label className={FIELD}><span>G1 seam</span>
      <NativeSelect className={CONTROL} aria-label="G1 seam" value={tool.seam} onChange={event => tool.setSeam(event.target.value)}>
        <option value="">Choose a boundary</option>
        {tool.picks.curves.map(curve => <option key={curve.id} value={curve.id}>{curve.name}</option>)}
      </NativeSelect>
    </label>
    {tool.error && <p role="alert" className="warn small">{tool.error}</p>}
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" onClick={tool.cancel}>Cancel</Button>
      <Button size="sm" onClick={tool.apply} disabled={!tool.preview.length}>Apply</Button>
    </div>
  </aside>;
}

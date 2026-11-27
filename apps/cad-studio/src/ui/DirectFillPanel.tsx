import type { useDirectFill } from '../app/useDirectFill';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { CONTROL, FIELD } from './panelStyles';

export function DirectFillPanel({ tool }: { tool: ReturnType<typeof useDirectFill> }) {
  if (!tool.picks) return null;
  if (!tool.shown) return <aside className="card props">
    <Button variant="ghost" onClick={() => tool.begin('tangent')}>Tangent Fill</Button>
    <Button variant="ghost" onClick={() => tool.begin('guided')}>Guided Fill</Button>
  </aside>;
  const guided = tool.mode === 'guided', name = guided ? 'Guided Fill' : 'Tangent Fill';
  const sides = tool.picks.curves.filter(curve => curve.id !== tool.seam && curve.id !== tool.guide);
  return <aside className="card props" aria-label={name}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); tool.cancel(); } }}>
    <div className="card-title">{name.toUpperCase()}</div>
    <div className="kv">Adjacent surface <b>{tool.picks.donor.name}</b></div>
    <label className={FIELD}><span>G1 seam</span>
      <NativeSelect className={CONTROL} aria-label="G1 seam" value={tool.seam} onChange={event => tool.setSeam(event.target.value)}>
        <option value="">Choose a boundary</option>
        {tool.picks.curves.map(curve => <option key={curve.id} value={curve.id}>{curve.name}</option>)}
      </NativeSelect>
    </label>
    {guided && <label className={FIELD}><span>Interior guide</span>
      <NativeSelect className={CONTROL} aria-label="Interior guide" value={tool.guide} onChange={event => tool.setGuide(event.target.value)}>
        <option value="">Choose a guide</option>
        {tool.picks.curves.filter(curve => curve.id !== tool.seam)
          .map(curve => <option key={curve.id} value={curve.id}>{curve.name}</option>)}
      </NativeSelect>
    </label>}
    {guided && tool.preview.length > 0 && <>
      <div className="kv">G0 boundaries <b>{sides.map(side => side.name).join(', ')}</b></div>
      <p className="muted small">Open surface</p>
    </>}
    {tool.error && <p role="alert" className="warn small">{tool.error}</p>}
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" onClick={tool.cancel}>Cancel</Button>
      <Button size="sm" onClick={tool.apply} disabled={!tool.preview.length}>Apply</Button>
    </div>
  </aside>;
}

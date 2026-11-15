import { curvatureReadout } from './curvatureReadout';
import type { CurvatureCombControls } from '../app/useEdgeCurvature';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

const scales = [1, 2, 4, 8, 16, 32, 64];

export function EdgeCurvature({ overlay, error, pending, show, clear, setScale, kind = 'edge' }: CurvatureCombControls & { kind?: 'edge' | 'curve' }) {
  const label = kind === 'edge' ? 'Edge curvature' : 'Curve curvature';
  return <section aria-label={label} className="mt-2 space-y-1">
    <Button size="xs" variant="outline" aria-disabled={pending || undefined} aria-busy={pending || undefined} aria-pressed={!!overlay} onClick={() => { if (!pending) { if (overlay) clear(); else void show(); } }}>
      {pending ? 'Measuring…' : overlay ? (overlay.measurement.maximum === 0 ? 'Clear curvature' : 'Hide curvature comb') : 'Show curvature comb'}
    </Button>
    <div role="status" aria-label={label + ' result'}>
      {error && <div className="empty">{error}</div>}
      {overlay && <div className="kv"><span>Sampled {kind} curvature</span>
        <b>{curvatureReadout(overlay.measurement.minimum, overlay.measurement.maximum)} mm⁻¹</b></div>}
    </div>
    {overlay && overlay.measurement.maximum > 0 && <label className="field"><span>Comb scale (mm²)</span>
      <NativeSelect aria-label="Comb scale (mm²)" value={overlay.scale} onChange={event => setScale(Number(event.target.value))}>
        {scales.map(scale => <option key={scale} value={scale}>{scale}</option>)}
      </NativeSelect>
    </label>}
  </section>;
}

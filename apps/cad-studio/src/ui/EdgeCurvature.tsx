import type { useEdgeCurvature } from '../app/useEdgeCurvature';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

const scales = [1, 2, 4, 8, 16, 32, 64];
const format = (n: number) => Number(n.toPrecision(7));

export function EdgeCurvature({ overlay, error, pending, show, clear, setScale }: ReturnType<typeof useEdgeCurvature>) {
  return <section aria-label="Edge curvature" className="mt-2 space-y-1">
    <Button size="xs" variant="outline" disabled={pending} aria-pressed={!!overlay} onClick={() => overlay ? clear() : void show()}>
      {pending ? 'Measuring…' : overlay ? 'Hide curvature comb' : 'Show curvature comb'}
    </Button>
    <div role="status" aria-label="Edge curvature result">
      {error && <div className="empty">{error}</div>}
      {overlay && <div className="kv"><span>Sampled edge curvature</span>
        <b>{format(overlay.measurement.minimum)} – {format(overlay.measurement.maximum)} mm⁻¹</b></div>}
    </div>
    {overlay && overlay.measurement.maximum > 0 && <label className="field"><span>Comb scale (mm²)</span>
      <NativeSelect aria-label="Comb scale (mm²)" value={overlay.scale} onChange={event => setScale(Number(event.target.value))}>
        {scales.map(scale => <option key={scale} value={scale}>{scale}</option>)}
      </NativeSelect>
    </label>}
  </section>;
}

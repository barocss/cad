import { useMemo } from 'react';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import { ruledMidpointNormal } from './ruledMidpointNormal';
import { Button } from '@/components/ui/button';

export function TwoCurveRoles({ direct, ids, onSelect }: { direct: DirectGeometry; ids: [string, string]; onSelect?(ids: string[]): void }) {
  const [a, b] = ids;
  const normal = useMemo(() => ruledMidpointNormal(direct, a, b), [direct, a, b]);
  const names = ids.map(id => direct.objects.find(object => object.id === id)?.name ?? id);
  return <>
    <div className="kv gap-2"><span>Sweep profile / Ruled first</span><b className="min-w-0 break-all">{names[0]}</b></div>
    <div className="kv gap-2"><span>Sweep path / Ruled second</span><b className="min-w-0 break-all">{names[1]}</b></div>
    {onSelect && <Button variant="ghost" aria-label="Swap curve order" onClick={() => onSelect([b, a])}>Swap curve order</Button>}
    <div className="muted small" role="status" aria-label="Ruled surface direction">
      {normal ? <>Ruled midpoint normal: ({normal.map(value => Math.abs(value) < .0005 ? '0' : value.toFixed(3)).join(', ')}). Along the normal thickens toward this direction here. Direction may vary across a curved surface.</>
        : <>Ruled midpoint normal unavailable. No direction is inferred; inspect a valid surface before choosing a Thicken side.</>}
    </div>
  </>;
}

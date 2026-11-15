import { useMemo } from 'react';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import { ruledEndpointCorrespondence } from './ruledEndpointCorrespondence';
import { ruledMidpointNormal } from './ruledMidpointNormal';
import { Button } from '@/components/ui/button';

export function TwoCurveRoles({ direct, ids, onSelect }: { direct: DirectGeometry; ids: [string, string]; onSelect?(ids: string[]): void }) {
  const [a, b] = ids;
  const normal = useMemo(() => ruledMidpointNormal(direct, a, b), [direct, a, b]);
  const correspondence = useMemo(() => ruledEndpointCorrespondence(direct, [a, b]), [direct, a, b]);
  const names = ids.map(id => direct.objects.find(object => object.id === id)?.name ?? id);
  return <>
    <div className="kv gap-2"><span>Sweep profile / Ruled first</span><b className="min-w-0 break-all">{names[0]}</b></div>
    <div className="kv gap-2"><span>Sweep path / Ruled second</span><b className="min-w-0 break-all">{names[1]}</b></div>
    {correspondence && <div className="muted small" aria-label="Ruled endpoint correspondence">
      <p>Ruled connects start to start and end to end.</p>
      {correspondence.ends.map(([start, end], index) => <p key={index}>{index === 0 ? 'First' : 'Second'}: ({start.map(v => Number(v.toFixed(3))).join(', ')}) → ({end.map(v => Number(v.toFixed(3))).join(', ')}) mm</p>)}
      {correspondence.crossedStraightPair && <p role="status">These straight curves run in opposite directions: their endpoint connections may cross and fold the surface. Select one curve alone and use Reverse, then select the matching-direction pair. Swapping the pair does not reverse either curve.</p>}
    </div>}
    {onSelect && <Button variant="ghost" aria-label="Swap curve order" onClick={() => onSelect([b, a])}>Swap curve order</Button>}
    <div className="muted small" role="status" aria-label="Ruled surface direction">
      {normal ? <>Ruled midpoint normal: ({normal.map(value => Math.abs(value) < .0005 ? '0' : value.toFixed(3)).join(', ')}). Along the normal thickens toward this direction here. Direction may vary across a curved surface.</>
        : <>Ruled midpoint normal unavailable. No direction is inferred; inspect a valid surface before choosing a Thicken side.</>}
    </div>
  </>;
}

import { useMemo } from 'react';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import { joinEndpointGuidance } from './joinEndpointGuidance';
import { ruledEndpointCorrespondence } from './ruledEndpointCorrespondence';
import { ruledMidpointNormal } from './ruledMidpointNormal';
import { Button } from '@/components/ui/button';

export function TwoCurveRoles({ direct, ids, onSelect }: { direct: DirectGeometry; ids: [string, string]; onSelect?(ids: string[]): void }) {
  const [a, b] = ids;
  const normal = useMemo(() => ruledMidpointNormal(direct, a, b), [direct, a, b]);
  const correspondence = useMemo(() => ruledEndpointCorrespondence(direct, [a, b]), [direct, a, b]);
  const join = useMemo(() => joinEndpointGuidance(direct, [a, b]), [direct, a, b]);
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
    <div id="direct-join-endpoints" role="group" aria-label="Join endpoints" className="muted small">
      {join ? <>
        <p>First end · {names[0]} [{a}]: ({join.firstEnd.map(String).join(', ')}) mm</p>
        <p>Second start · {names[1]} [{b}]: ({join.secondStart.map(String).join(', ')}) mm</p>
        <p>Gap: {String(join.gap)} mm. Join requires exact endpoint equality; no snapping.</p>
        {join.firstDegree !== join.secondDegree && <p role="status">Join requires the same native degree. First: {join.firstDegree}; Second: {join.secondDegree}. Swapping the order does not resolve this mismatch.</p>}
        {join.firstDegree === join.secondDegree && !join.matches && join.reverseMatches && <p role="status">The endpoints match in the opposite order. {onSelect ? 'Use Swap curve order, then try Join.' : 'Select the second curve first, then the first curve, and try Join.'}</p>}
      </> : <p>Join endpoints unavailable.</p>}
    </div>
  </>;
}

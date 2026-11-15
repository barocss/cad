import { tappedHoleReadout } from './tappedHoleReadout';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import { namedHoleEntry } from '@barocss/cad-model/app/holeEntry';

type Hole = Extract<ModelNode, { kind: 'hole' }>;

export function HoleHistoryInputs({ hole, doc, index, drillDiameter }: { hole: Hole; doc?: StudioDoc; index: number; drillDiameter?: string | number }) {
  const axis = (hole.axis ?? 'z').toUpperCase();
  const side = hole.side ?? (hole.face ? doc && namedHoleEntry(doc, index)?.side : 'max');
  const thread = hole.thread ? tappedHoleReadout(hole.thread, drillDiameter, doc?.fastenerSizes?.rows) : null;
  return <div role="group" aria-label="Hole placement">
    <div className="field"><span>Entry face</span><span>{hole.face ?? `Body end ${side === 'min' ? '−' : '+'}${axis}`}</span></div>
    <div className="field"><span>Drill direction</span><span>{side === undefined ? `Along ${axis} from entry face` : (side === 'min' ? '+' : '−') + axis}</span></div>
    <div className="field"><span>Ends</span><span>{hole.depth === undefined ? 'Through' : 'To a depth'}</span></div>
    {hole.thread && <div className="field"><span>Thread</span><span>{hole.thread} · Cosmetic{thread && <><br /><span>{thread.drill}</span><br /><span>{thread.comparison}</span></>}</span></div>}
  </div>;
}

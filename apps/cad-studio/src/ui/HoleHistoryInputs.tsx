import { tappedHoleReadout } from './tappedHoleReadout';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import { namedHoleEntry } from '@barocss/cad-model/app/holeEntry';

type Hole = Extract<ModelNode, { kind: 'hole' }>;

export function HoleHistoryInputs({ hole, doc, index, drillDiameter, editableEnds = false }: { hole: Hole; doc?: StudioDoc; index: number; drillDiameter?: string | number; editableEnds?: boolean }) {
  const axis = (hole.axis ?? 'z').toUpperCase();
  const side = hole.side ?? (hole.face ? doc && namedHoleEntry(doc, index)?.side : 'max');
  const thread = hole.thread ? tappedHoleReadout(hole.thread, drillDiameter, doc?.fastenerSizes?.rows) : null;
  return <div role="group" aria-label="Hole placement">
    <div className="field"><span>Entry face</span><span>{hole.face ?? `Body end ${side === 'min' ? '−' : '+'}${axis}`}</span></div>
    <div className="field"><span>Drill direction</span><span>{side === undefined ? `Along ${axis} from entry face` : (side === 'min' ? '+' : '−') + axis}</span></div>
    {!editableEnds && <div className="field"><span>Ends</span><span>{hole.depth === undefined ? 'Through' : 'To a depth'}</span></div>}
    {editableEnds && <p className="small" role="note">End changes are available for this final ordinary hole with numeric dimensions. Switching to a depth starts at 6 mm; check Depth before Apply.</p>}
    {hole.thread && <p className="small">Selecting a different Thread also sets Diameter to its loaded tap drill. A bound Diameter must be unbound first. The thread remains cosmetic.</p>}
    {hole.thread && <div className="field"><span>Thread</span><span>{hole.thread} · Cosmetic{thread && <><br /><span>{thread.drill}</span><br /><span>{thread.comparison}</span></>}</span></div>}
  </div>;
}

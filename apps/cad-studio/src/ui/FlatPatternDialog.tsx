// A sheet-metal body's flat pattern (R12.2, D117): drawn to scale — its outline, each bend's centre line dashed (up and
// down in two colours) with its note — and exported as DXF (2000 or R12) through the kernel's flat document and writer.
// O16: its actions on shadcn's Button and NativeSelect; the box is the studio's.
import { useState } from 'react';
import { flatPatternDxf, writeDxf, type DxfVersion, type FlatPattern } from '@barocss/cad';
import { flatLoopPath } from './flatPatternPath';
import { downloadBytes } from './files';
import { Icon } from './atoms';
import { CONTROL } from './panelStyles';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

const f2 = (v: number) => String(Math.round(v * 1000) / 1000);
export interface FlatBendAction {
  featureId: string; bend: FlatPattern['bends'][number]; disabled: boolean; radiusSource: string; ruleSource: string;
  onEdit: () => void; onEditRules: () => void;
}

export function FlatPatternDialog({ flat, name, onClose, onEditSharedRules, bendActions = [] }: { flat: FlatPattern; name: string; onClose: () => void; onEditSharedRules?: () => void; bendActions?: readonly FlatBendAction[] }) {
  const [version, setVersion] = useState<DxfVersion>('AC1015');
  const [w, h] = flat.box.max, m = Math.max(w, h) * 0.06 + 2;
  const exportDxf = () => downloadBytes(writeDxf(flatPatternDxf(flat), { version }).bytes, `${name}-flat.dxf`, 'image/vnd.dxf');
  return <div className="toast card recovery flat-pattern" role="dialog" aria-label="Flat pattern">
    <Icon name="straighten" className="accent" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="toast-title">Flat pattern · {name}</div>
      <div className="toast-hint">{f2(w)} × {f2(h)} mm · {flat.bends.length} bend{flat.bends.length === 1 ? '' : 's'} · T {f2(flat.thickness)} mm, K {flat.kFactor} · seen from {flat.fixedFace}</div>
      {onEditSharedRules && <div className="toast-hint">All bends use this profile’s shared thickness, inner radius and K-factor or bend table.
        <Button variant="ghost" onClick={onEditSharedRules}>Edit shared sheet rules</Button>
      </div>}
      {bendActions.length > 0 && <div aria-label="Flange bend sources">
        {bendActions.map(action => <div className="toast-hint" key={action.featureId} aria-label={`Bend source ${action.featureId}`}>
          <span>{action.featureId} · Radius: {action.radiusSource} · {action.ruleSource}</span>
          <Button variant="ghost" disabled={action.disabled} onClick={action.onEdit} aria-label={`Open Flange ${action.featureId} in History`}>Open in History</Button>
          <Button variant="ghost" disabled={action.disabled} onClick={action.onEditRules} aria-label={`Open sheet rules for ${action.featureId} in History`}>Open sheet rules in History</Button>
        </div>)}
      </div>}
      <svg aria-label="Flat pattern drawing" viewBox={`${f2(-m)} ${f2(-m)} ${f2(w + 2 * m)} ${f2(h + 2 * m)}`} style={{ width: '100%', maxHeight: '55vh', margin: '8px 0', background: 'var(--surface-2, transparent)' }}>
        <path d={flat.loops.map(l => flatLoopPath(l.segments, h)).join('')} fillRule="evenodd" fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={Math.max(w, h) / 400} />
        {flat.bends.map((b, k) => {
          const owner = bendActions.find(action => action.bend === b);
          const [p, q] = b.centre, up = b.direction === 'up', mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          return <g key={k} aria-label={owner ? `Bend ${b.direction}, Flange ${owner.featureId}` : `Bend ${b.direction}`}>
            <line x1={f2(p[0])} y1={f2(h - p[1])} x2={f2(q[0])} y2={f2(h - q[1])} stroke={up ? '#3fb950' : '#f85149'} strokeWidth={Math.max(w, h) / 400} strokeDasharray={`${f2(Math.max(w, h) / 80)} ${f2(Math.max(w, h) / 160)}`} />
            <text x={f2(mid[0])} y={f2(h - mid[1])} fontSize={f2(Math.max(w, h) / 40)} textAnchor="middle" fill={up ? '#3fb950' : '#f85149'} dy="-0.4em">{`${owner ? owner.featureId + ' · ' : ''}${b.direction.toUpperCase()} ${+b.angle.toFixed(2)}° R${+b.radius.toFixed(3)}`}</text>
          </g>;
        })}
      </svg>
      <div className="flex flex-wrap gap-1">
        <Button variant="default" aria-label="Export flat DXF" onClick={exportDxf} title="The flat at true size in mm: OUTLINE, BEND_UP, BEND_DOWN (dashed) and BEND_NOTES layers">DXF</Button>
        <NativeSelect className={CONTROL} aria-label="Flat DXF version" value={version} onChange={e => setVersion(e.target.value as DxfVersion)} title="DXF 2000, or R12 for older programs">
          <option value="AC1015">2000</option><option value="AC1009">R12</option>
        </NativeSelect>
        <Button variant="ghost" aria-label="Close the flat pattern" onClick={onClose}>Close</Button>
      </div>
    </div>
  </div>;
}

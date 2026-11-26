// A sheet-metal body's flat pattern (R12.2, D117; D2026 #199 DXF roles & bend/included angles):
// drawn to scale — outer/inner cut contours, optional dashed bend centerlines and notes — and exported
// as DXF (2000 or R12) through the kernel's flat document and writer without mutating document state or Undo.
import { useState } from 'react';
import {
  bendAllowance, bendDeduction, flatPatternDxf, includedBendAngle, writeDxf,
  type DxfVersion, type FlatPattern, type FlatPatternDxfOptions, type FlatPatternDxfProfile,
} from '@barocss/cad';
import { flatLoopPath } from './flatPatternPath';
import { downloadBytes } from './files';
import { Icon } from './atoms';
import { CONTROL, TICK } from './panelStyles';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

const f2 = (v: number) => String(Math.round(v * 1000) / 1000);
const fDeg = (v: number) => String(+v.toFixed(2));

export interface FlatBendAction {
  featureId: string;
  bend: FlatPattern['bends'][number];
  disabled: boolean;
  radiusSource: string;
  ruleSource: string;
  onEdit: () => void;
  onEditRules: () => void;
}

export interface FlatPatternDialogProps {
  flat: FlatPattern;
  name: string;
  onClose: () => void;
  onEditSharedRules?: () => void;
  bendActions?: readonly FlatBendAction[];
}

export function FlatPatternDialog({ flat, name, onClose, onEditSharedRules, bendActions = [] }: FlatPatternDialogProps) {
  const [version, setVersion] = useState<DxfVersion>('AC1015');
  const [profile, setProfile] = useState<FlatPatternDxfProfile>('default');
  const [includeBendLines, setIncludeBendLines] = useState<boolean>(true);
  const [includeBendNotes, setIncludeBendNotes] = useState<boolean>(true);
  const [includeIncludedAngle, setIncludeIncludedAngle] = useState<boolean>(false);

  const [w, h] = flat.box.max, m = Math.max(w, h) * 0.06 + 2;
  const isCutOnly = profile === 'cut-only';
  const showBendLines = !isCutOnly && includeBendLines;
  const showBendNotes = !isCutOnly && includeBendNotes;

  const onProfileChange = (next: FlatPatternDxfProfile) => {
    setProfile(next);
    if (next === 'cut-only') {
      setIncludeBendLines(false);
      setIncludeBendNotes(false);
      setIncludeIncludedAngle(false);
    } else if (next === 'shop') {
      setIncludeBendLines(true);
      setIncludeBendNotes(true);
      setIncludeIncludedAngle(true);
    } else {
      setIncludeBendLines(true);
      setIncludeBendNotes(true);
      setIncludeIncludedAngle(false);
    }
  };

  const dxfOptions = (): FlatPatternDxfOptions => {
    if (profile === 'cut-only') return { profile: 'cut-only' };
    if (profile === 'default' && includeBendLines && includeBendNotes && !includeIncludedAngle) return {};
    return {
      profile,
      includeBendLines,
      includeBendNotes,
      includeIncludedAngle,
    };
  };

  const exportDxf = () => {
    const suffix = profile === 'default' ? '' : `-${profile}`;
    downloadBytes(writeDxf(flatPatternDxf(flat, dxfOptions()), { version }).bytes, `${name}-flat${suffix}.dxf`, 'image/vnd.dxf');
  };

  return <div className="toast card recovery flat-pattern" role="dialog" aria-label="Flat pattern">
    <Icon name="straighten" className="accent" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="toast-title">Flat pattern · {name}</div>
      <div className="toast-hint">{f2(w)} × {f2(h)} mm · {flat.bends.length} bend{flat.bends.length === 1 ? '' : 's'} · T {f2(flat.thickness)} mm, K {flat.kFactor ?? 'by bend table'} · seen from {flat.fixedFace}</div>
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
      <svg aria-label="Flat pattern drawing" viewBox={`${f2(-m)} ${f2(-m)} ${f2(w + 2 * m)} ${f2(h + 2 * m)}`} style={{ width: '100%', maxHeight: '42vh', margin: '8px 0', background: 'var(--surface-2, transparent)' }}>
        <path d={flat.loops.map(l => flatLoopPath(l.segments, h)).join('')} fillRule="evenodd" fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={Math.max(w, h) / 400} />
        {flat.bends.map((b, k) => {
          const owner = bendActions.find(action => action.bend === b);
          const [p, q] = b.centre, up = b.direction === 'up', mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          const incl = typeof b.includedAngle === 'number' ? b.includedAngle : includedBendAngle(b.angle);
          const noteText = includeIncludedAngle
            ? `${owner ? owner.featureId + ' · ' : ''}${b.direction.toUpperCase()} BEND ${fDeg(b.angle)}° (INCL ${fDeg(incl)}°) R${f2(b.radius)}`
            : `${owner ? owner.featureId + ' · ' : ''}${b.direction.toUpperCase()} ${fDeg(b.angle)}° R${f2(b.radius)}`;
          return <g key={k} aria-label={owner ? `Bend ${b.direction}, Flange ${owner.featureId}` : `Bend ${b.direction}`}>
            {showBendLines && <line x1={f2(p[0])} y1={f2(h - p[1])} x2={f2(q[0])} y2={f2(h - q[1])} stroke={up ? '#3fb950' : '#f85149'} strokeWidth={Math.max(w, h) / 400} strokeDasharray={`${f2(Math.max(w, h) / 80)} ${f2(Math.max(w, h) / 160)}`} />}
            {showBendNotes && <text x={f2(mid[0])} y={f2(h - mid[1])} fontSize={f2(Math.max(w, h) / 42)} textAnchor="middle" fill={up ? '#3fb950' : '#f85149'} dy="-0.4em">{noteText}</text>}
          </g>;
        })}
      </svg>
      {flat.bends.length > 0 && (
        <div role="list" aria-label="Flat bend angles" style={{ marginBottom: 6, fontSize: 11, opacity: 0.9 }}>
          {flat.bends.map((b, k) => {
            const th = b.angle * Math.PI / 180;
            const incl = typeof b.includedAngle === 'number' ? b.includedAngle : includedBendAngle(b.angle);
            const ba = bendAllowance(th, b.radius, flat.thickness, b.kFactor);
            const bd = bendDeduction(th, b.radius, flat.thickness, b.kFactor);
            return (
              <div key={k} role="listitem" data-bend-row={b.name}>
                <b>{b.name}</b> · {b.direction.toUpperCase()} · Bend {fDeg(b.angle)}° · Included {fDeg(incl)}° · R{f2(b.radius)} · K {f2(b.kFactor)} · BA {f2(ba)} · BD {f2(bd)}
                {b.table ? ` · ${b.table.table} row ${b.table.rows.join(', ')}${b.table.estimate ? ' (estimate)' : ''}` : ''}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 6 }}>
        <NativeSelect
          className={CONTROL}
          aria-label="Flat DXF profile"
          value={profile}
          onChange={e => onProfileChange(e.target.value as FlatPatternDxfProfile)}
          title="Default keeps legacy OUTLINE; Shop separates OUTER_CUT / INNER_CUT + bend/included angles; Cut-only omits bend lines and notes"
        >
          <option value="default">Default (OUTLINE)</option>
          <option value="shop">Shop (OUTER/INNER + Incl)</option>
          <option value="cut-only">Cut-only (no bends/notes)</option>
        </NativeSelect>
        <label className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap cursor-pointer">
          <input type="checkbox" className={TICK} aria-label="Include bend lines" checked={showBendLines} disabled={isCutOnly} onChange={e => setIncludeBendLines(e.target.checked)} />
          <span>Bend lines</span>
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap cursor-pointer">
          <input type="checkbox" className={TICK} aria-label="Include bend notes" checked={showBendNotes} disabled={isCutOnly} onChange={e => setIncludeBendNotes(e.target.checked)} />
          <span>Bend notes</span>
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap cursor-pointer">
          <input type="checkbox" className={TICK} aria-label="Include included angle" checked={includeIncludedAngle} disabled={isCutOnly || !includeBendNotes} onChange={e => setIncludeIncludedAngle(e.target.checked)} />
          <span>Included angle</span>
        </label>
      </div>
      <div className="toast-hint" role="note" aria-label="Flat DXF role boundary" style={{ marginBottom: 6 }}>
        Bend angle = rotation from flat; Included angle = 180° − bend angle. DXF cut layers (OUTER_CUT / INNER_CUT) and entity order are descriptive only — not a CAM toolpath guarantee.
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="default" aria-label="Export flat DXF" onClick={exportDxf} title="Export flat DXF in mm using the selected profile and options">DXF</Button>
        <NativeSelect className={CONTROL} aria-label="Flat DXF version" value={version} onChange={e => setVersion(e.target.value as DxfVersion)} title="DXF 2000, or R12 for older programs">
          <option value="AC1015">2000</option><option value="AC1009">R12</option>
        </NativeSelect>
        <Button variant="ghost" aria-label="Close the flat pattern" onClick={onClose}>Close</Button>
      </div>
    </div>
  </div>;
}

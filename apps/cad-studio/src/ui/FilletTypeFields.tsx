import type { FilletSection } from '@barocss/cad-model/engine/doc';
import { FILLET_TYPES, type FilletType, type RadiusMode } from '../app/filletFamily';
import { NativeSelect } from '@/components/ui/native-select';
export function FilletTypeFields({ type, mode, section, fixed = false, hideSection = false, onType, onMode }: { type: FilletType; mode?: RadiusMode; section?: FilletSection; fixed?: boolean; hideSection?: boolean; onType?(type: FilletType): void; onMode?(mode: RadiusMode): void }) {
  if (fixed) return <>
    <div className="field" role="group" aria-label="Fillet type"><span>Type</span><span>{FILLET_TYPES.find(item => item.value === type)!.label}</span></div>
    {type === 'edge' && mode && <div className="field" role="group" aria-label="Fillet radius mode"><span>Radius mode</span><span>{mode === 'varying' ? 'Varying' : 'Constant'}</span></div>}
    {type === 'edge' && !hideSection && <div className="field" role="group" aria-label="Fillet section"><span>Section</span><span>{section?.kind === 'conic' ? 'Conic' : section?.kind === 'g2' ? 'Curvature (G2)' : 'Circular'}</span></div>}
  </>;
  return <><label className="field"><span>Type</span><NativeSelect aria-label="Fillet type" value={type} disabled={fixed} onKeyDown={e => { if (e.key === 'Enter') e.stopPropagation(); }} onChange={e => onType?.(e.target.value as FilletType)}>{FILLET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect></label>
    {type === 'edge' && mode && <label className="field"><span>Radius mode</span><NativeSelect aria-label="Fillet radius mode" value={mode} disabled={fixed} onKeyDown={e => { if (e.key === 'Enter') e.stopPropagation(); }} onChange={e => onMode?.(e.target.value as RadiusMode)}><option value="constant">Constant</option><option value="varying">Varying</option></NativeSelect></label>}</>;
}

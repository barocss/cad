import { curveDomain, evaluateCurve, validateCurve, type Curve } from '@barocss/cad';
import { fmt, type ModelNode } from '@barocss/cad-model/engine/doc';
import { sweepRepresentationLabel } from '@barocss/cad-model/app/profileCommands';
import { resolveSketchDims } from '@barocss/cad-model/sketch/reopen';

interface Props {
  sweep: Extract<ModelNode, { kind: 'sweep-curve' }>;
  profile: ModelNode | undefined;
  parameters: Record<string, number>;
}

function profileLabel({ sweep, profile, parameters }: Props): string {
  if (profile?.kind !== 'sketch' && profile?.kind !== 'driven-sketch') return 'Unavailable';
  const name = `Sketch ${sweep.sketch + 1}`;
  if (profile.kind !== 'sketch' || profile.profile !== 'circle') return name;
  try {
    const resolved = resolveSketchDims(profile, parameters);
    if (resolved.profile === 'circle' && typeof resolved.radius === 'number' && Number.isFinite(resolved.radius)) {
      return `${name} · Ø${fmt(2 * resolved.radius)} mm`;
    }
  } catch { return `${name} · Diameter unavailable`; }
  return name;
}

function pathEnds(path: Props['sweep']['path']) {
  try {
    const curve: Curve = { ...path, kind: 'curve', id: 'sweep-history-path' };
    validateCurve(curve);
    return curveDomain(curve).map(t => `${evaluateCurve(curve, t).map(fmt).join(', ')} mm`);
  } catch { return null; }
}

export function SweepHistoryInputs(props: Props) {
  const { sweep } = props;
  const ends = pathEnds(sweep.path);
  return <div role="group" aria-label="Sweep inputs">
    <div className="field"><span>Profile</span><span>{profileLabel(props)}</span></div>
    <div className="field"><span>Path</span><span className="min-w-0 break-all" tabIndex={0} title={sweep.name} aria-label={`Path: ${sweep.name}`}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Delete') event.stopPropagation(); }}>{sweep.name} · {sweep.routeBundleMember ? 'Linked route' : 'Copied'}</span></div>
    {sweep.mode && <div className="field"><span>Representation</span><span>{sweepRepresentationLabel(sweep.mode)}</span></div>}
    {ends && <>
      <div className="field"><span>Start</span><span>{ends[0]}</span></div>
      <div className="field"><span>End</span><span>{ends[1]}</span></div>
    </>}
    {!ends && <div className="field"><span>Endpoints</span><span>Unavailable</span></div>}
  </div>;
}

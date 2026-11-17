import { useEffect, useState, type ReactNode } from 'react';
import { curveLength, curvePlaneCrossings, directOps, domainsOf, geometryOf, surfaceIntersection, type DirectGeometry } from '@barocss/cad-model/engine/direct';
import { SEW_TOLERANCE_LABEL } from '@barocss/cad-model/engine/sew';
import { directThickenGuidance } from './directThickenGuidance';
import { inspectSurfacePoint, surfaceIsoScope } from './surfaceInspection';
import { DirectPoleEditor, type PoleControls } from './DirectPoleEditor';
import { TwoCurveRoles } from './TwoCurveRoles';
import { curveAnalysisError, inspectCurvePoint } from './curveAnalysisError';
import { sewTrimBlockers } from './sewTrimBlockers';
import { parseSewToleranceInput } from './sewToleranceInput';
import { CONTROL, FIELD } from './panelStyles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

/**
 * The tools for selected direct curves and surfaces: one curve (split, knot, trim, reverse, poles), two
 * curves (join, ruled surface, sweep), one surface (split, region, iso-curve, reverse, knot, degree,
 * poles). Each tool is one undoable edit; a refusal comes back as a message. O16: the contents on shadcn (Button,
 * Input, NativeSelect, FIELD); the shell (its title and Hide) is the studio's.
 */
export function DirectPanel({ direct, selected, onChange, onSelect, onError, onHide, onThicken, onSew, poleControls, children }: {
  direct: DirectGeometry; selected: string[]; poleControls?: PoleControls;
  children?: ReactNode;
  onChange(next: DirectGeometry, select?: string[]): void;
  onSelect?(ids: string[]): void;
  onError(message: string): void;
  onHide(ids: string[]): void;
  /** A surface thickened into a body of the part. */
  onThicken?(id: string, thickness: number, side: 'normal' | 'reverse' | 'both'): void;
  /** Surfaces sewn along their edges into one closed body of the part (`tolerance` mm; 0: the kernel's own). */
  onSew?(ids: string[], tolerance: number): void;
}) {
  const [gap, setGap] = useState('0'), [keep, setKeep] = useState<'outside' | 'inside'>('outside');
  const sewGap = parseSewToleranceInput(gap);
  const objs = selected.map(id => direct.objects.find(o => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o);
  const trimBlockers = sewTrimBlockers(objs);
  const geoms = objs.map(o => { try { return geometryOf(direct, o); } catch { return null; } });
  const run = (op: () => DirectGeometry, select?: (next: DirectGeometry) => string[]) => {
    try { const next = op(); onChange(next, select?.(next)); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };
  /** The objects an operation added (to select them). */
  const added = (next: DirectGeometry) => next.objects.slice(direct.objects.length).map(o => o.id);
  if (!objs.length) return null;
  const one = objs.length === 1 ? objs[0] : null, g = one ? geoms[0] : null;
  const curves = geoms.every(x => x?.kind === 'curve');
  return (
    <aside className="card props direct-panel" aria-label="Direct geometry">
      <div className="card-title">{one ? (g?.kind === 'surface' ? 'SURFACE' : 'CURVE') : `${objs.length} OBJECTS`}
        <button className="ghost tiny" onClick={() => onHide(selected)}>Hide</button></div>
      {one ? <Rename key={one.id} direct={direct} id={one.id} name={one.name} onRename={n => run(() => directOps.rename(direct, one.id, n))} />
        : objs.map(o => <div key={o.id} className="kv">Name <b>{o.name}</b></div>)}
      {one && g?.kind === 'curve' && children}
      <Transform onMove={by => run(() => directOps.move(direct, selected, by))} onRotate={(axis, deg) => run(() => directOps.rotate(direct, selected, axis, deg))}
        onScale={k => run(() => directOps.scale(direct, selected, k))} onDuplicate={() => run(() => directOps.duplicate(direct, selected), added)}
        onStretch={k => run(() => directOps.stretch(direct, selected, k))} onShear={(a, b, k) => run(() => directOps.shear(direct, selected, a, b, k))} />
      {one && g?.kind === 'curve' && <CurveTools id={one.id} direct={direct} run={run} added={added} />}
      {one && g?.kind === 'surface' && <SurfaceTools id={one.id} direct={direct} run={run} added={added} onThicken={onThicken} />}
      {one && g && poleControls && <DirectPoleEditor direct={direct} id={one.id} controls={poleControls} rows={g.kind === 'curve' ? g.controlPoints.map((point, i) => ({ key: String(i), label: `P${i}`, point, weight: g.weights[i] })) : g.controlPoints.flatMap((row, i) => row.map((point, j) => ({ key: `${i},${j}`, label: `P${i},${j}`, point, weight: g.weights[i][j] })))} />}
      {objs.length >= 3 && curves && <div className="render-section [&>[data-slot=button]]:self-start">
        <div className="card-title" style={{ marginTop: 8 }}>{objs.length} CURVES</div>
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" title="A surface through the curves in the order they were picked" onClick={() => run(() => directOps.loft(direct, selected), added)}>Loft</Button>
          {objs.length === 4 && <Button variant="ghost" aria-label="Fill the loop" title="A surface filling the loop the four curves make (a Coons patch)" onClick={() => run(() => directOps.fill(direct, selected), added)}>Fill</Button>}
        </div>
      </div>}
      {objs.length === 2 && geoms.some(x => x?.kind === 'surface') && geoms.some(x => x?.kind === 'curve') && (() => {
        const s = selected[geoms.findIndex(x => x?.kind === 'surface')], c = selected[geoms.findIndex(x => x?.kind === 'curve')];
        return <div className="render-section [&>[data-slot=button]]:self-start">
          <div className="card-title" style={{ marginTop: 8 }}>TRIM</div>
          <label className={FIELD}><span>Keep</span><NativeSelect className={CONTROL} aria-label="Trim keeps" value={keep} onChange={e => setKeep(e.target.value as typeof keep)}>
            <option value="outside">Outside the loop (a hole)</option><option value="inside">Inside the loop</option></NativeSelect></label>
          <Button variant="ghost" aria-label="Trim by the curve" title="Project the closed curve onto the surface and cut along it; the surface itself stays whole underneath" onClick={() => run(() => directOps.trimByCurve(direct, s, c, keep), () => [s])}>Trim by the curve</Button>
        </div>;
      })()}
      {objs.length >= 2 && onSew && geoms.every(x => x?.kind === 'surface') && <div className="render-section [&>[data-slot=button]]:self-start">
        <div className="card-title" style={{ marginTop: 8 }}>SEW</div>
        <label className={FIELD}><span>{SEW_TOLERANCE_LABEL}</span>
          <Input type="number" step="any" min={0} aria-label={SEW_TOLERANCE_LABEL} value={gap}
            aria-invalid={sewGap === null} aria-describedby={sewGap === null ? 'direct-sew-tolerance-error' : undefined}
            onChange={event => setGap(event.target.value)} /></label>
        {sewGap === null && <p id="direct-sew-tolerance-error" role="status" className="muted small">Enter a non-negative tolerance, or 0 for automatic.</p>}
        {trimBlockers.length > 0 && <div id="direct-sew-trims" role="status" className="muted small">
          <p>Sew uses whole support surfaces. These selected surfaces are trimmed:</p>
          <ul>{trimBlockers.map(object => <li key={object.id} className="break-all">{object.position}. {object.name}</li>)}</ul>
          <p>Select each surface separately to inspect its trims. Untrim removes all trim boundaries, including openings, and restores the whole surface. Only use Untrim if that is intended.</p>
        </div>}
        <Button variant="ghost" aria-describedby={trimBlockers.length ? 'direct-sew-trims' : undefined} aria-label="Sew into a body" title="Join the surfaces along matching edges. Use 0 for automatic tolerance." disabled={sewGap === null || trimBlockers.length > 0} onClick={() => { if (sewGap !== null && trimBlockers.length === 0) onSew(selected, sewGap); }}>Sew into a body</Button>
      </div>}
      {objs.length === 2 && geoms.every(x => x?.kind === 'surface') && <div className="render-section [&>[data-slot=button]]:self-start">
        <div className="card-title" style={{ marginTop: 8 }}>TWO SURFACES</div>
        <Button variant="ghost" aria-label="Intersect the surfaces" title="The curves where the two surfaces meet" onClick={() => run(() => surfaceIntersection(direct, selected[0], selected[1]).direct, added)}>Intersection curves</Button>
      </div>}
      {objs.length === 2 && curves && <div className="render-section [&>[data-slot=button]]:self-start">
        <div className="card-title" style={{ marginTop: 8 }}>TWO CURVES</div>
        <TwoCurveRoles direct={direct} ids={[selected[0], selected[1]]} onSelect={onSelect} />
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" aria-describedby="direct-join-endpoints" onClick={() => run(() => directOps.joinCurves(direct, selected[0], selected[1]), added)}>Join</Button>
          <Button variant="ghost" onClick={() => run(() => directOps.ruledSurface(direct, selected[0], selected[1]), added)}>Ruled surface</Button>
          <Button variant="ghost" title="The first curve swept along the second" onClick={() => run(() => directOps.sweep(direct, selected[0], selected[1]), added)}>Sweep</Button>
          <Button variant="ghost" title="A surface through both curves" onClick={() => run(() => directOps.loft(direct, selected), added)}>Loft</Button>
        </div>
      </div>}
    </aside>
  );
}

type Run = (op: () => DirectGeometry, select?: (next: DirectGeometry) => string[]) => void;

/** A number box; lazy ones report on Enter or when left (an edit each, not one per keystroke). */
function NumberField({ label, value, onChange, lazy }: { label: string; value: number; onChange(v: number): void; lazy?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const report = (t: string) => { const v = Number(t); if (t.trim() !== '' && Number.isFinite(v) && (!lazy || v !== value)) onChange(v); };
  return <label className={FIELD}><span>{label}</span><Input type="number" step="any" className="w-24" aria-label={label} value={text}
    onChange={e => { setText(e.target.value); if (!lazy) report(e.target.value); }}
    onBlur={() => { if (lazy) report(text); }} onKeyDown={e => { if (lazy && e.key === 'Enter') report(text); }} /></label>;
}

function CurveTools({ id, direct, run, added }: { id: string; direct: DirectGeometry; run: Run; added: (n: DirectGeometry) => string[] }) {
  const dom = domainsOf(direct, id), t = dom.kind === 'curve' ? dom.t : [0, 1] as [number, number];
  const mid = (t[0] + t[1]) / 2;
  const [at, setAt] = useState(mid), [from, setFrom] = useState(t[0]), [to, setTo] = useState(t[1]), [tol, setTol] = useState(0.01), [poles, setPoles] = useState(6);
  useEffect(() => { setAt(mid); setFrom(t[0]); setTo(t[1]); }, [id, t[0], t[1]]);
  const g = geometryOf(direct, direct.objects.find(o => o.id === id)!);
  return <div className="render-section [&>[data-slot=button]]:self-start">
    <div className="kv">Degree <b>{g.kind === 'curve' ? g.degree : ''}</b></div>
    <div className="kv">Domain <b>{t.map(v => Math.round(v * 1e4) / 1e4).join(' … ')}</b></div>
    <div className="kv">Length <b>{fmtNum(curveLength(direct, id), 4)} mm</b></div>
    {g.kind === 'curve' && (() => { const a = g.controlPoints[0], b = g.controlPoints[g.controlPoints.length - 1], chord = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = curveLength(direct, id);
      return <div className="kv">Chord <b>{fmtNum(chord, 4)} mm{chord > 1e-9 ? ` · length ${fmtNum(L / chord, 4)}×` : ' · closed'}</b></div>; })()}
    <NumberField label="At t" value={at} onChange={setAt} />
    <Analysis formatError={curveAnalysisError} run={() => { const a = inspectCurvePoint(direct, id, at); return [['Point', a.point.map(v => fmtNum(v, 3)).join(', ')], ['Radius', a.radiusNote ?? (a.radius === null ? 'straight' : `${fmtNum(a.radius, 4)} mm`)]]; }} />
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" onClick={() => run(() => directOps.splitCurve(direct, id, at), added)}>Split</Button>
      <Button variant="ghost" onClick={() => run(() => directOps.insertCurveKnot(direct, id, at))}>Insert knot</Button>
      <Button variant="ghost" onClick={() => run(() => directOps.reverseCurve(direct, id), added)}>Reverse</Button>
      <Button variant="ghost" onClick={() => run(() => directOps.elevateCurveDegree(direct, id))}>Raise degree</Button>
    </div>
    <NumberField label="From t" value={from} onChange={setFrom} />
    <NumberField label="To t" value={to} onChange={setTo} />
    <Button variant="ghost" onClick={() => run(() => directOps.curveInterval(direct, id, from, to))}>Trim to interval</Button>
    <div className="card-title" style={{ marginTop: 8 }}>SIMPLIFY</div>
    <NumberField label="Within mm" value={tol} onChange={setTol} />
    <Button variant="ghost" aria-label="Remove the knot" title="Take out the knot nearest t, if the curve moves no more than the tolerance" onClick={() => run(() => directOps.removeCurveKnot(direct, id, at, tol), added)}>Remove knot near t</Button>
    <NumberField label="Poles" value={poles} onChange={setPoles} />
    <Button variant="ghost" aria-label="Refit the curve" title="Fit the curve again with this many poles (least squares, cubic): its name says the largest gap" onClick={() => run(() => directOps.refitCurve(direct, id, poles), added)}>Refit</Button>
    <Crossings id={id} direct={direct} />
  </div>;
}

/** Where the curve crosses a plane square to X, Y or Z, at a value. */
function Crossings({ id, direct }: { id: string; direct: DirectGeometry }) {
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('z'), [at, setAt] = useState(0);
  const [read, setRead] = useState<{
    direct: DirectGeometry; id: string; axis: typeof axis; at: number;
    found: ReturnType<typeof curvePlaneCrossings> | null; note: string | null;
  } | null>(null);
  const current = read && read.direct === direct && read.id === id && read.axis === axis && read.at === at ? read : null;
  // Hide old answers on this render, then discard them so Undo cannot revive them.
  // Plane inputs stay independent of the immutable geometry snapshot.
  if (read && !current) setRead(null);
  const found = current?.found, note = current?.note;
  return <>
    <div className="card-title" style={{ marginTop: 8 }}>CROSSINGS</div>
    <label className={FIELD}><span>Plane</span><NativeSelect className={CONTROL} aria-label="Crossing plane" value={axis} onChange={e => setAxis(e.target.value as 'x' | 'y' | 'z')}><option value="x">X =</option><option value="y">Y =</option><option value="z">Z =</option></NativeSelect></label>
    <NumberField label="At" value={at} onChange={setAt} />
    <Button variant="ghost" aria-label="Find crossings" onClick={() => {
      const owner = { direct, id, axis, at };
      try { setRead({ ...owner, found: curvePlaneCrossings(direct, id, axis, at), note: null }); }
      catch (e) { setRead({ ...owner, found: null, note: e instanceof Error ? e.message : String(e) }); }
    }}>Find crossings</Button>
    {note && !found && <div className="muted small">{note}</div>}
    {found && (found.length ? found.map((c, k) => <div key={k} className="kv" aria-label="Crossing">t {fmtNum(c.t, 5)} <b>{c.point.map(v => fmtNum(v, 3)).join(', ')}</b></div>) : <div className="muted small">The curve does not cross {axis.toUpperCase()} = {at}.</div>)}
  </>;
}

function SurfaceTools({ id, direct, run, added, onThicken }: { id: string; direct: DirectGeometry; run: Run; added: (n: DirectGeometry) => string[]; onThicken?(id: string, thickness: number, side: 'normal' | 'reverse' | 'both'): void }) {
  const [wallText, setWallText] = useSurfaceDraft(direct, id, 'thickness', '2');
  const wall = surfaceParameter(wallText), wallErrorId = `direct-thickness-${encodeURIComponent(id)}`;
  const thickenScope = directThickenGuidance(direct.objects.find(o => o.id === id)!), thickenScopeId = `direct-thicken-scope-${encodeURIComponent(id)}`;
  const [wallSide, setWallSide] = useState<'normal' | 'reverse' | 'both'>('normal');
  const [edge, setEdge] = useState<'u-min' | 'u-max' | 'v-min' | 'v-max'>('u-max');
  const [reachText, setReachText] = useSurfaceDraft(direct, id, 'extend-distance', '5');
  const reachValue = surfaceParameter(reachText), reach = reachValue !== null && reachValue > 0 ? reachValue : null;
  const reachErrorId = `direct-extend-distance-${encodeURIComponent(id)}`;
  const dom = domainsOf(direct, id), u = dom.kind === 'surface' ? dom.u : [0, 1] as [number, number], v = dom.kind === 'surface' ? dom.v : [0, 1] as [number, number];
  const [axis, setAxis] = useState<'u' | 'v'>('u');
  const range = axis === 'u' ? u : v, mid = (range[0] + range[1]) / 2;
  const [atText, setAtText] = useSurfaceDraft(direct, id, `split-${axis}-${range.join(',')}`, String(mid));
  const at = surfaceParameter(atText), splitAllowed = at !== null && at > range[0] && at < range[1];
  const regionScope = `region-${u.join(',')}-${v.join(',')}`;
  const uFrom = useSurfaceDraft(direct, id, `${regionScope}-u-from`, String(u[0]));
  const uTo = useSurfaceDraft(direct, id, `${regionScope}-u-to`, String(u[1]));
  const vFrom = useSurfaceDraft(direct, id, `${regionScope}-v-from`, String(v[0]));
  const vTo = useSurfaceDraft(direct, id, `${regionScope}-v-to`, String(v[1]));
  const regionDrafts = [uFrom, uTo, vFrom, vTo], box = regionDrafts.map(([value]) => surfaceParameter(value));
  const regionFinite = box.every(value => value !== null), regionErrorId = `direct-region-${encodeURIComponent(id)}`;
  const g = geometryOf(direct, direct.objects.find(o => o.id === id)!), trims = direct.objects.find(o => o.id === id)?.trims?.length ?? 0;
  return <div className="render-section [&>[data-slot=button]]:self-start">
    {g.kind === 'surface' && <div className="kv">Degree <b>{g.degreeU} × {g.degreeV}</b></div>}
    {!!trims && <div className="kv">Trimmed <b>{trims} loop{trims > 1 ? 's' : ''}</b> <Button variant="ghost" size="xs" aria-label="Untrim" title="Take the trims off: the whole surface again" onClick={() => run(() => directOps.untrim(direct, id))}>Untrim</Button></div>}
    <div className="kv">Domain <b>u {u.map(x => Math.round(x * 1e4) / 1e4).join('…')} · v {v.map(x => Math.round(x * 1e4) / 1e4).join('…')}</b></div>
    <label className={FIELD}><span>Direction</span><NativeSelect className={CONTROL} aria-label="Surface direction" value={axis} onChange={e => setAxis(e.target.value as 'u' | 'v')}><option value="u">U</option><option value="v">V</option></NativeSelect></label>
    <p role="note" aria-label="Iso-curve scope" id={`direct-iso-scope-${encodeURIComponent(id)}`} className="muted small">{surfaceIsoScope(trims > 0)}</p>
    <SurfaceParameter label={`At ${axis}`} axis={axis} range={range} value={atText} onChange={setAtText} split descriptionId={`direct-split-${encodeURIComponent(id)}-${axis}`} />
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" disabled={!splitAllowed} onClick={() => { if (splitAllowed && at !== null) run(() => directOps.splitSurface(direct, id, axis, at), added); }}>Split</Button>
      <Button variant="ghost" aria-describedby={`direct-iso-scope-${encodeURIComponent(id)}`} disabled={at === null} onClick={() => { if (at !== null) run(() => directOps.isoCurve(direct, id, axis, at), added); }}>Iso-curve</Button>
      <Button variant="ghost" disabled={at === null} onClick={() => { if (at !== null) run(() => directOps.insertSurfaceKnot(direct, id, axis, at)); }}>Insert knot</Button>
      <Button variant="ghost" onClick={() => run(() => directOps.elevateDegree(direct, id, axis))}>Raise degree</Button>
      <Button variant="ghost" onClick={() => run(() => directOps.reverseSurface(direct, id, axis), added)}>Reverse</Button>
    </div>
    <SurfacePoint id={id} direct={direct} u={u} v={v} />
    <div className="card-title" style={{ marginTop: 8 }}>EXTEND</div>
    <label className={FIELD}><span>Edge</span><NativeSelect className={CONTROL} aria-label="Extend edge" value={edge} onChange={e => setEdge(e.target.value as typeof edge)}>
      <option value="u-max">u end</option><option value="u-min">u start</option><option value="v-max">v end</option><option value="v-min">v start</option></NativeSelect></label>
    <label className={FIELD}><span>Extend by</span><Input type="number" step="any" className="w-24" aria-label="Extend by" value={reachText}
      aria-invalid={reach === null || undefined} aria-describedby={reach === null ? reachErrorId : undefined} onChange={event => setReachText(event.target.value)} /></label>
    {reach === null && <span id={reachErrorId} role="status" className="warn small">Enter a finite positive extension distance.</span>}
    <Button variant="ghost" aria-label="Extend the surface" title="Run the surface on past the edge, straight along its tangent there" disabled={reach === null} aria-describedby={reach === null ? reachErrorId : undefined} onClick={() => { if (reach !== null) run(() => directOps.extendSurface(direct, id, edge, reach), added); }}>Extend</Button>
    {onThicken && <>
      <div className="card-title" style={{ marginTop: 8 }}>THICKEN</div>
      <p role="note" aria-label="Thicken source scope" id={thickenScopeId} className="muted small">{thickenScope.text}</p>
      <label className={FIELD}><span>Thickness</span><Input type="number" step="any" className="w-24" aria-label="Thickness" value={wallText}
        aria-invalid={wall === null || undefined} aria-describedby={wall === null ? wallErrorId : undefined} onChange={event => setWallText(event.target.value)} /></label>
      {wall === null && <span id={wallErrorId} role="status" className="warn small">Enter a finite thickness.</span>}
      <label className={FIELD}><span>Side</span><NativeSelect className={CONTROL} aria-label="Thicken side" value={wallSide} onChange={e => setWallSide(e.target.value as typeof wallSide)}>
        <option value="normal">Along the normal</option><option value="reverse">Against it</option><option value="both">Half each way</option></NativeSelect></label>
      <Button variant="ghost" aria-label="Thicken into a body" disabled={wall === null || thickenScope.blocked} aria-describedby={[thickenScopeId, ...(wall === null ? [wallErrorId] : [])].join(' ')} onClick={() => { if (wall !== null && !thickenScope.blocked) onThicken(id, wall, wallSide); }}>Thicken into a body</Button>
    </>}
    <div className="card-title" style={{ marginTop: 8 }}>REGION</div>
    {(['u from', 'u to', 'v from', 'v to'] as const).map((label, k) => <label key={label} className={FIELD}><span>{label}</span><Input type="number" step="any" className="w-24" aria-label={label} value={regionDrafts[k][0]}
      aria-invalid={box[k] === null || undefined} aria-describedby={box[k] === null ? regionErrorId : undefined} onChange={event => regionDrafts[k][1](event.target.value)} /></label>)}
    {!regionFinite && <span id={regionErrorId} role="status" className="warn small">Enter finite values for all four region bounds.</span>}
    <Button variant="ghost" disabled={!regionFinite} aria-describedby={!regionFinite ? regionErrorId : undefined} onClick={() => {
      const [a, b, c, d] = box;
      if (a !== null && b !== null && c !== null && d !== null) run(() => directOps.surfaceRegion(direct, id, [a, b], [c, d]), added);
    }}>Extract region</Button>
  </div>;
}

const fmtNum = (v: number, digits: number) => String(Math.round(v * 10 ** digits) / 10 ** digits);

/** Values of a query at the current inputs, or why it has none there. */
function Analysis({ run, formatError }: { run(): [string, string][]; formatError?(error: unknown): string }) {
  let rows: [string, string][];
  try { rows = run(); } catch (e) { return <div className="muted small">{formatError ? formatError(e) : e instanceof Error ? e.message : String(e)}</div>; }
  return <>{rows.map(([k, v]) => <div key={k} className="kv">{k} <b>{v}</b></div>)}</>;
}

/** Raw surface parameters are owned by the selected geometry and its native domain. */
function useSurfaceDraft(direct: DirectGeometry, id: string, scope: string, initial: string): [string, (text: string) => void] {
  const key = JSON.stringify([id, scope]);
  const [draft, setDraft] = useState({ direct, key, text: initial });
  const current = draft.direct === direct && draft.key === key;
  if (!current) setDraft({ direct, key, text: initial });
  // Derive the reset value now, before an old measurement or action can render.
  return [current ? draft.text : initial, text => setDraft({ direct, key, text })];
}
const surfaceParameter = (text: string): number | null => text.trim() && Number.isFinite(Number(text)) ? Number(text) : null;

function SurfaceParameter({ label, axis, range, value, onChange, split = false, descriptionId }: {
  label: string; axis: 'u' | 'v'; range: [number, number]; value: string; onChange(text: string): void; split?: boolean; descriptionId: string;
}) {
  const number = surfaceParameter(value), invalid = number === null || (split ? number <= range[0] || number >= range[1] : number < range[0] || number > range[1]);
  return <>
    <label className={FIELD}><span>{label}</span><Input type="number" step="any" className="w-24" aria-label={label} value={value} min={range[0]} max={range[1]}
      aria-invalid={invalid || undefined} aria-describedby={descriptionId} onChange={event => onChange(event.target.value)} /></label>
    <span id={descriptionId} role={invalid ? 'status' : undefined} className={invalid ? 'warn small' : 'muted small'}>{split
      ? `Split requires ${range[0]} < ${axis} < ${range[1]} (endpoints excluded).`
      : `Enter a finite ${axis} from ${range[0]} to ${range[1]} (inclusive).`}</span>
  </>;
}

/** A surface at (u, v): point, normal and curvatures, only inside its native domain. */
function SurfacePoint({ id, direct, u, v }: { id: string; direct: DirectGeometry; u: [number, number]; v: [number, number] }) {
  const scope = `${u.join(',')}:${v.join(',')}`;
  const [uText, setUText] = useSurfaceDraft(direct, id, `inspect-u-${scope}`, String((u[0] + u[1]) / 2));
  const [vText, setVText] = useSurfaceDraft(direct, id, `inspect-v-${scope}`, String((v[0] + v[1]) / 2));
  const atU = surfaceParameter(uText), atV = surfaceParameter(vText);
  const valid = atU !== null && atV !== null && atU >= u[0] && atU <= u[1] && atV >= v[0] && atV <= v[1];
  return <>
    <div className="card-title" style={{ marginTop: 8 }}>AT (U, V)</div>
    <SurfaceParameter label="u" axis="u" range={u} value={uText} onChange={setUText} descriptionId={`direct-inspect-${encodeURIComponent(id)}-u`} />
    <SurfaceParameter label="v" axis="v" range={v} value={vText} onChange={setVText} descriptionId={`direct-inspect-${encodeURIComponent(id)}-v`} />
    {valid && <Analysis run={() => { const a = inspectSurfacePoint(direct, id, atU, atV); return [['Region', a.region], ['Point', a.point.map(x => fmtNum(x, 3)).join(', ')], ['Normal', a.normal.map(x => fmtNum(x, 4)).join(', ')], ['Mean curvature', `${fmtNum(a.mean, 6)} /mm`], ['Gaussian', `${fmtNum(a.gaussian, 8)} /mm²`]]; }} />}
  </>;
}

function Rename({ direct, id, name, onRename }: { direct: DirectGeometry; id: string; name: string; onRename(n: string): void }) {
  const [text, setText] = useSurfaceDraft(direct, id, 'object-name', name);
  return <label className={FIELD}><span>Name</span><Input className={CONTROL} aria-label="Object name" value={text} onChange={e => setText(e.target.value)}
    onBlur={() => { if (text.trim() && text.trim() !== name.trim()) onRename(text); }} onKeyDown={e => { if (e.key === 'Enter' && text.trim() && text.trim() !== name.trim()) onRename(text); }} /></label>;
}

/** Move by a vector, turn about an axis through the centre, scale about the centre, or duplicate. */
type Ax = 'x' | 'y' | 'z';
function Transform({ onMove, onRotate, onScale, onDuplicate, onStretch, onShear }: { onMove(by: [number, number, number]): void; onRotate(axis: Ax, deg: number): void; onScale(k: number): void; onDuplicate(): void; onStretch(k: [number, number, number]): void; onShear(along: Ax, by: Ax, k: number): void }) {
  const [st, setSt] = useState<[number, number, number]>([1, 1, 2]), [along, setAlong] = useState<Ax>('x'), [byAx, setByAx] = useState<Ax>('z'), [sk, setSk] = useState(0.5);
  const axisPick = (label: string, v: Ax, set: (a: Ax) => void) => <label className={FIELD}><span>{label}</span><NativeSelect className={CONTROL} aria-label={label} value={v} onChange={e => set(e.target.value as Ax)}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></NativeSelect></label>;
  const [by, setBy] = useState<[number, number, number]>([0, 0, 10]);
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('z'), [deg, setDeg] = useState(90), [k, setK] = useState(2);
  return <div className="render-section [&>[data-slot=button]]:self-start">
    <div className="card-title" style={{ marginTop: 8 }}>TRANSFORM</div>
    {(['ΔX', 'ΔY', 'ΔZ'] as const).map((l, i) => <NumberField key={l} label={l} value={by[i]} onChange={x => setBy(b => b.map((y, j) => j === i ? x : y) as typeof b)} />)}
    <Button variant="ghost" onClick={() => onMove(by)}>Move</Button>
    <label className={FIELD}><span>Axis</span><NativeSelect className={CONTROL} aria-label="Rotation axis" value={axis} onChange={e => setAxis(e.target.value as 'x' | 'y' | 'z')}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></NativeSelect></label>
    <NumberField label="Angle °" value={deg} onChange={setDeg} />
    <Button variant="ghost" onClick={() => onRotate(axis, deg)}>Rotate</Button>
    <NumberField label="Factor" value={k} onChange={setK} />
    <div className="flex flex-wrap gap-1"><Button variant="ghost" onClick={() => onScale(k)}>Scale</Button><Button variant="ghost" aria-describedby="direct-duplicate-relationship" onClick={onDuplicate}>Duplicate</Button></div>
    <p id="direct-duplicate-relationship" role="note" aria-label="Duplicate relationship" className="muted small">Creates independent copies in the same position and selects them. Moving a copy or editing its control points does not update the original.</p>
    {(['× X', '× Y', '× Z'] as const).map((l, i) => <NumberField key={l} label={l} value={st[i]} onChange={x => setSt(b => b.map((y, j) => j === i ? x : y) as typeof b)} />)}
    <Button variant="ghost" onClick={() => onStretch(st)}>Stretch</Button>
    {axisPick('Shear moves', along, setAlong)}{axisPick('by', byAx, setByAx)}
    <NumberField label="Shear factor" value={sk} onChange={setSk} />
    <Button variant="ghost" onClick={() => onShear(along, byAx, sk)}>Shear</Button>
  </div>;
}

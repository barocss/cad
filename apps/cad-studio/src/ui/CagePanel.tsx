// R8.2 (D81): the cage editor's panel — mode, Box/Smooth, the operations on the selection, the mirror, what the
// validation flags, the session's undo, and Done / Cancel. O16: its operations, fields and actions on shadcn (Button,
// NativeSelect, FIELD); the Pick and Show toggles stay the studio's segmented buttons.
import type { CageEditor } from '../subd/useCageEditor';
import { cageBoundaryReadiness, selectedCageEdges, selectedVertices, selectionCentre, validationOf, type CageMode, type CageOp } from '@barocss/cad-model/subd/cageEdit';
import { CONTROL, FIELD } from './panelStyles';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

const activeStyle = { background: 'var(--accent)', color: 'var(--accent-ink)' };
const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]';

const OPS: { op: CageOp; label: string; key?: string; tip: string }[] = [
  { op: 'extrude', label: 'Extrude', key: 'E', tip: 'The picked faces (or boundary edges) out as a new region. Move it with the gizmo before Done, or use Cage Undo. Shift-drag also extrudes' },
  { op: 'insert-loop', label: 'Insert loop', key: 'L', tip: 'An edge loop across the ring through the picked edge, at its middle' },
  { op: 'select-loop', label: 'Loop', tip: 'The picked edge’s whole loop (double-click an edge)' },
  { op: 'select-ring', label: 'Ring', tip: 'The picked edge’s ring (Alt-double-click an edge)' },
  { op: 'bridge', label: 'Bridge', key: 'B', tip: 'Quads between two picked boundary loops (or chains) of as many edges' },
  { op: 'fill', label: 'Fill', key: 'F', tip: 'One face over the hole the picked boundary edges go round' },
  { op: 'weld', label: 'Weld', key: 'W', tip: 'The picked vertices merged at their middle' },
  { op: 'weld-near', label: 'Weld near', tip: 'Picked vertices within 0.01 mm of each other merged' },
  { op: 'crease', label: 'Crease', key: 'C', tip: 'The picked edges (or the picked faces’ sides) made sharp' },
  { op: 'uncrease', label: 'Smooth edges', tip: 'Creases off on the picked edges' },
  { op: 'delete', label: 'Delete', key: '⌫', tip: 'The picked faces removed (a hole; Fill closes it)' },
];

export function CagePanel({ editor, name }: { editor: CageEditor; name: string }) {
  const s = editor.session; if (!s) return null;
  const v = validationOf(s), n = s.sel.vertices.length + s.sel.edges.length + s.sel.faces.length;
  const centre = selectionCentre(s);
  const pickedEdges = selectedCageEdges(s), sharpCount = pickedEdges.filter(edge => edge.sharp).length;
  const what = s.sel.faces.length ? `${s.sel.faces.length} face${s.sel.faces.length === 1 ? '' : 's'}` : s.sel.edges.length ? `${s.sel.edges.length} edge${s.sel.edges.length === 1 ? '' : 's'}` : s.sel.vertices.length ? `${s.sel.vertices.length} vertex${s.sel.vertices.length === 1 ? '' : 'es'}` : 'nothing';
  return <aside className="card props cage-panel" aria-label="Cage editor">
    <div className="card-title">CAGE · {name}</div>
    <div className="seg" role="group" aria-label="Pick">{(['vertex', 'edge', 'face'] as CageMode[]).map((m, i) =>
      <button key={m} className={focusClass} style={s.mode === m ? activeStyle : undefined} aria-pressed={s.mode === m} data-tip={`${m[0].toUpperCase()}${m.slice(1)}s`} data-tip-desc={`Key ${i + 1}`} onClick={() => editor.setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>
    <div className="seg" role="group" aria-label="Next overlapping pick">{(['front', 'back'] as const).map(depth =>
      <button key={depth} className={focusClass} aria-pressed={editor.pickDepth === depth} style={editor.pickDepth === depth ? activeStyle : undefined} onClick={() => editor.setPickDepth(depth)}>{depth === 'front' ? 'Front candidate' : 'Back candidate'}</button>)}</div>
    <div className="muted small">Next pick among overlapping candidates. Existing selection stays unchanged; click again after changing depth or view.</div>
    <div className="seg" role="group" aria-label="Show">
      <button className={focusClass} style={!s.smooth ? activeStyle : undefined} aria-pressed={!s.smooth} data-tip="Box" data-tip-desc="The cage as it is (Tab)" onClick={() => s.smooth && editor.toggleSmooth()}>Box</button>
      <button className={focusClass} style={s.smooth ? activeStyle : undefined} aria-pressed={s.smooth} data-tip="Smooth" data-tip-desc="The limit surface (Tab)" onClick={() => !s.smooth && editor.toggleSmooth()}>Smooth</button></div>
    <div className={FIELD}><span>Picked</span> <b aria-label="Picked">{what}</b></div>
    {centre && <div className="muted small" aria-label="Picked cage centre">Picked centre: ({centre.map(value => Number(value.toFixed(3))).join(', ')}) mm</div>}
    {pickedEdges.length > 0 && <details className="small" aria-label="Picked edge creases">
      <summary className={focusClass}>Picked edges: {sharpCount} sharp · {pickedEdges.length - sharpCount} smooth</summary>
      <ul className="max-h-24 overflow-y-auto" aria-label="Individual picked edges">{pickedEdges.map(({ edge, centre: midpoint, sharp }) =>
        <li key={edge.join(':')}>Edge {edge.join('–')}: <b>{sharp ? 'Sharp' : 'Smooth'}</b> · ({midpoint.map(value => Number(value.toFixed(3))).join(', ')}) mm</li>)}</ul>
    </details>}
    <div className="cage-ops">{OPS.map(o => {
      const readiness = o.op === 'fill' || o.op === 'bridge' ? cageBoundaryReadiness(s, o.op) : o.op === 'weld-near' ? { ok: selectedVertices(s).length >= 2, reason: selectedVertices(s).length < 2 ? 'Pick at least two vertices (or edges/faces containing them) before Weld near.' : 'Merge picked vertices within 0.01 mm.' } : null;
      const blocked = readiness ? !readiness.ok : !n && o.op !== 'weld-near';
      return <Button key={o.op} variant="ghost" aria-label={o.label} data-tip={o.label + (o.key ? ` (${o.key})` : '')} data-tip-desc={o.tip}
        data-tip-off={readiness && !readiness.ok ? readiness.reason : undefined} data-tip-focus={readiness ? true : undefined}
        aria-description={readiness?.reason} aria-disabled={readiness ? blocked : undefined} className={readiness && blocked ? 'opacity-50 cursor-not-allowed' : undefined}
        onClick={() => { if (!blocked) editor.op(o.op); }} disabled={!readiness && blocked}>{o.label}</Button>;
    })}</div>
    <label className={FIELD}><span>Mirror</span><NativeSelect className={CONTROL} aria-label="Mirror" value={s.mirror ?? ''} onChange={e => editor.op(e.target.value ? `mirror-${e.target.value}` as CageOp : 'mirror-off')}>
      <option value="">None</option><option value="x">Across X</option><option value="y">Across Y</option><option value="z">Across Z</option></NativeSelect></label>
    <div className="muted small" aria-label="Mirror source and replacement">Mirror keeps the positive side of the chosen axis and replaces the negative side with its reflection. Vertices on the mirror plane stay on it. Cage Undo restores the previous shape; Cancel discards this edit.</div>
    <CageChecks validation={v} faces={s.cage.faces.length} previewMs={editor.previewMs} />
    <div className="flex items-center gap-1 pt-1">
      <Button variant="ghost" aria-label="Undo cage step" disabled={!s.undo.length} onClick={editor.undo}>Undo</Button>
      <Button variant="ghost" aria-label="Redo cage step" disabled={!s.redo.length} onClick={editor.redo}>Redo</Button>
      <span className="flex-1" />
      <Button variant="ghost" aria-label="Cancel cage edit" onClick={editor.cancel}>Cancel</Button>
      <Button variant="default" aria-label="Done editing cage" data-tip="Done" data-tip-desc="Apply this cage only after its current evaluation succeeds" data-tip-off={!editor.doneReadiness.ok ? editor.doneReadiness.reason : undefined} data-tip-focus aria-description={editor.doneReadiness.reason} aria-disabled={!editor.doneReadiness.ok} className={!editor.doneReadiness.ok ? 'opacity-50' : undefined} onClick={editor.done}>Done</Button>
    </div>
  </aside>;
}


export function CageChecks({ validation: v, faces, previewMs }: {
  validation: ReturnType<typeof validationOf>; faces: number; previewMs: number | null;
}) {
  const active = [v.ngons.length ? `${v.ngons.length} n-gons (tinted)` : '',
    v.boundaryEdges.length ? `${v.boundaryEdges.length} open edges` : '',
    v.darts.length ? `${v.darts.length} darts` : ''].filter(Boolean).join(' · ');
  return <div className="cage-checks" aria-label="Cage checks">
    {!v.valid && <div className="warn" role="status">Not a manifold: {v.nonManifoldEdges.length} edges, {v.nonManifoldVertices.length} vertices (red)</div>}
    {active && <div className="muted small" role="status">{active}</div>}
    <details>
      <summary className={focusClass}>Cage details</summary>
      <div className="muted small">{v.poles.length} poles (ringed: G1 caps there) · {v.ngons.length} n-gons (tinted) · {v.boundaryEdges.length} open edges{v.darts.length ? ` · ${v.darts.length} darts` : ''} · {faces} faces</div>
      {previewMs !== null && <div className="muted small" aria-label="Preview time">Preview {previewMs.toFixed(1)} ms</div>}
    </details>
  </div>;
}

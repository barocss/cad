import { CageInsetControls } from './CageInsetControls';
import { CageTransformControls } from './CageTransformControls';
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
const focusSlideRatio = (input: HTMLInputElement | null) => { input?.focus(); };
const EDGE_DRAG_FRAMES = [{ value: 'edge', label: 'Edge tangent' }] as const;
const FACE_DRAG_FRAMES = [
  { value: 'face', label: 'Face normal' },
  { value: 'face-u', label: 'Face U' },
  { value: 'face-v', label: 'Face V' },
] as const;
const ROTATE_DRAG_FRAMES = [...EDGE_DRAG_FRAMES, ...FACE_DRAG_FRAMES];

const OPS: { op: CageOp; label: string; key?: string; tip: string }[] = [
  { op: 'extrude', label: 'Extrude', key: 'E', tip: 'The picked faces (or boundary edges) out as a new region. Move it with the gizmo before Done, or use Cage Undo. Shift-drag also extrudes' },
  { op: 'insert-loop', label: 'Insert loop', key: 'L', tip: 'An edge loop across the ring through the picked edge, with a ratio preview before applying' },
  { op: 'select-loop', label: 'Loop', tip: 'The picked edge’s whole loop (double-click an edge)' },
  { op: 'select-grow', label: 'Grow', tip: 'Add one topological neighbour step in the current pick mode' },
  { op: 'select-shrink', label: 'Shrink', tip: 'Remove picked elements touching unpicked neighbours. Open borders do not count as unpicked neighbours; fully selected components stay selected' },
  { op: 'select-linked', label: 'Linked', tip: 'Select each connected component containing a picked element, including across creases' },
  { op: 'select-path', label: 'Shortest path', tip: 'Pick two vertices (Shift-click the second). Select their minimum edge-count path in Edge mode. Ties follow lower vertex IDs; crosses creases' },
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
  const { previewActive, loopDraft, dragging, dragSettings } = editor;
  const slide = loopDraft?.kind === 'slide' ? loopDraft : null;
  const ratioLabel = slide ? 'Slide ratio' : 'Loop ratio';
  const insetLabel = s.sel.faces.length > 1 ? 'Inset region' : 'Inset face';
  const pickedEdges = selectedCageEdges(s), sharpCount = pickedEdges.filter(edge => edge.sharp).length;
  const localFrames = s.mode === 'edge' ? EDGE_DRAG_FRAMES : FACE_DRAG_FRAMES;
  const chosenFrame = localFrames.find(frame => frame.value === dragSettings.dragFrame);
  const pivot = dragSettings.pivot;
  const pivotTool = dragSettings.tool === 'rotate' ? 'Rotate' : 'Scale';
  const rotation = dragSettings.rotation;
  const what = s.sel.faces.length ? `${s.sel.faces.length} face${s.sel.faces.length === 1 ? '' : 's'}` : s.sel.edges.length ? `${s.sel.edges.length} edge${s.sel.edges.length === 1 ? '' : 's'}` : s.sel.vertices.length ? `${s.sel.vertices.length} vertex${s.sel.vertices.length === 1 ? '' : 'es'}` : 'nothing';
  return <aside className="card props cage-panel" aria-label="Cage editor">
    <div className="card-title">CAGE · {name}</div>
    <fieldset disabled={previewActive} className="contents">
    <div className="seg" role="group" aria-label="Pick">{(['vertex', 'edge', 'face'] as CageMode[]).map((m, i) =>
      <button key={m} className={focusClass} style={s.mode === m ? activeStyle : undefined} aria-pressed={s.mode === m} data-tip={`${m[0].toUpperCase()}${m.slice(1)}s`} data-tip-desc={`Key ${i + 1}`} onClick={() => editor.setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>
    <div className="seg" role="group" aria-label="Next overlapping pick">{(['front', 'back'] as const).map(depth =>
      <button key={depth} className={focusClass} aria-pressed={editor.pickDepth === depth} style={editor.pickDepth === depth ? activeStyle : undefined} onClick={() => editor.setPickDepth(depth)}>{depth === 'front' ? 'Front candidate' : 'Back candidate'}</button>)}</div>
    <div className="muted small">Next pick among overlapping candidates. Existing selection stays unchanged; click again after changing depth or view.</div>
    <div className="seg" role="group" aria-label="Show">
      <button className={focusClass} style={!s.smooth ? activeStyle : undefined} aria-pressed={!s.smooth} data-tip="Box" data-tip-desc="The cage as it is (Tab)" onClick={() => s.smooth && editor.toggleSmooth()}>Box</button>
      <button className={focusClass} style={s.smooth ? activeStyle : undefined} aria-pressed={s.smooth} data-tip="Smooth" data-tip-desc="The limit surface (Tab)" onClick={() => !s.smooth && editor.toggleSmooth()}>Smooth</button></div>
    {!!n && <label className={FIELD}><span>Drag tool</span><NativeSelect className={CONTROL} aria-label="Cage drag tool" value={dragSettings.tool} disabled={dragging}
      onChange={event => dragSettings.setTool(event.target.value === 'scale' ? 'scale' : event.target.value === 'rotate' ? 'rotate' : 'move')}>
      <option value="move">Move</option><option value="rotate">Rotate</option><option value="scale">Uniform scale</option>
    </NativeSelect></label>}
    {!!n && dragSettings.tool === 'rotate' && <>
      <label className={FIELD}><span>Rotate frame</span><NativeSelect className={CONTROL} aria-label="Rotate drag frame" value={rotation.frame} disabled={dragging}
        onChange={event => rotation.setFrame(ROTATE_DRAG_FRAMES.find(frame => frame.value === event.target.value)?.value ?? 'world')}>
        <option value="world">World axes</option>
        {ROTATE_DRAG_FRAMES.map(frame => <option key={frame.value} value={frame.value}>{frame.label}</option>)}
      </NativeSelect></label>
      {rotation.reason && <div className="warn" role="status">{rotation.reason}.</div>}
    </>}
    {!!n && (dragSettings.tool === 'scale' || dragSettings.tool === 'rotate' && (rotation.frame === 'world' || rotation.frame === 'edge')) && <>
      <label className={FIELD}><span>Pivot</span><NativeSelect className={CONTROL} aria-label={`${pivotTool} drag pivot`} value={pivot.mode} disabled={dragging}
        onChange={event => pivot.setMode(event.target.value === 'vertex' ? 'vertex' : 'centre')}>
        <option value="centre">Selection centre</option><option value="vertex">Cage vertex</option>
      </NativeSelect></label>
      {pivot.mode === 'vertex' && <label className={FIELD}><span>Vertex ID</span><input className={CONTROL} type="number" min="0" step="1"
        aria-label={`${pivotTool} drag vertex ID`} aria-invalid={!!pivot.reason} value={pivot.vertex} disabled={dragging}
        onChange={event => pivot.setVertex(event.target.value)} /></label>}
      {pivot.reason && <div className="warn" role="status">{pivot.reason}</div>}
    </>}
    {dragSettings.tool === 'move' && s.mode === 'vertex' && <div className="space-y-1">
      <label className="flex items-center gap-2"><input type="checkbox" checked={dragSettings.enabled} disabled={dragging} onChange={e => dragSettings.setEnabled(e.target.checked)} />Connected proportional drag</label>
      {dragSettings.enabled && <label className={FIELD}><span>Drag graph radius mm</span><input className={CONTROL} type="number" min="0" step="1" value={dragSettings.radius} disabled={dragging} aria-invalid={!dragSettings.radiusValid} onChange={e => dragSettings.setRadius(e.target.value)} /></label>}
      {dragSettings.enabled && !dragSettings.radiusValid && <div className="warn" role="status">Enter a radius greater than 0 mm.</div>}
    </div>}
    {dragSettings.tool === 'move' && s.mode !== 'vertex' && <>
      <label className={FIELD}><span>Drag frame</span><NativeSelect className={CONTROL} aria-label="Drag frame" value={dragSettings.dragFrame} disabled={dragging}
        onChange={event => dragSettings.setDragFrame(localFrames.find(frame => frame.value === event.target.value)?.value ?? 'world')}>
        <option value="world">World axes</option>
        {localFrames.map(frame => <option key={frame.value} value={frame.value}>{frame.label}</option>)}
      </NativeSelect></label>
      {chosenFrame && dragSettings.frameReason && <div className="warn" role="status">{chosenFrame.label}: {dragSettings.frameReason}.</div>}
    </>}
    <div className={FIELD}><span>Picked</span> <b aria-label="Picked">{what}</b></div>
    {centre && <div className="muted small" aria-label="Picked cage centre">Picked centre: ({centre.map(value => Number(value.toFixed(3))).join(', ')}) mm</div>}
    {pickedEdges.length > 0 && <details className="small" aria-label="Picked edge creases">
      <summary className={focusClass}>Picked edges: {sharpCount} sharp · {pickedEdges.length - sharpCount} smooth</summary>
      <ul className="max-h-24 overflow-y-auto" aria-label="Individual picked edges">{pickedEdges.map(({ edge, centre: midpoint, sharp }) =>
        <li key={edge.join(':')}>Edge {edge.join('–')}: <b>{sharp ? 'Sharp' : 'Smooth'}</b> · ({midpoint.map(value => Number(value.toFixed(3))).join(', ')}) mm</li>)}</ul>
    </details>}
    <div className="cage-ops">{OPS.map(o => {
      const readiness = o.op === 'select-path' ? { ok: s.mode === 'vertex' && s.sel.vertices.length === 2, reason: 'Pick exactly two vertices (Shift-click the second). Select the fewest-edge path, not the shortest distance.' } : o.op === 'fill' || o.op === 'bridge' ? cageBoundaryReadiness(s, o.op) : o.op === 'weld-near' ? { ok: selectedVertices(s).length >= 2, reason: selectedVertices(s).length < 2 ? 'Pick at least two vertices (or edges/faces containing them) before Weld near.' : 'Merge picked vertices within 0.01 mm.' } : null;
      const blocked = readiness ? !readiness.ok : !n && o.op !== 'weld-near';
      return <Button key={o.op} variant="ghost" aria-label={o.label} data-tip={o.label + (o.key ? ` (${o.key})` : '')} data-tip-desc={o.tip}
        data-tip-off={readiness && !readiness.ok ? readiness.reason : undefined} data-tip-focus={readiness ? true : undefined}
        aria-description={readiness?.reason} aria-disabled={readiness ? blocked : undefined} className={readiness && blocked ? 'opacity-50 cursor-not-allowed' : undefined}
        onClick={() => { if (!blocked) editor.op(o.op); }} disabled={!readiness && blocked}>{o.label}</Button>;
    })}</div>
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" disabled={s.mode !== 'edge' || !s.sel.edges.length} data-tip="Slide loop" data-tip-desc="Move a selected edge loop along its adjacent edges" onClick={editor.beginSlide}>Slide loop</Button>
      <Button variant="ghost" disabled={s.mode !== 'face' || !s.sel.faces.length} data-tip={insetLabel} data-tip-desc="Inset the outer boundary of a convex, planar quad region" onClick={() => editor.previewInset('1')}>{insetLabel}</Button>
      <Button variant="ghost" disabled={!n} onClick={() => editor.previewTransform({ kind: 'move', axis: 2, value: '0', pivot: 'centre', vertex: '' })}>Move selection</Button>
      <Button variant="ghost" disabled={!n} onClick={() => editor.previewTransform({ kind: 'rotate', axis: 2, value: '0', pivot: 'centre', vertex: '' })}>Rotate selection</Button>
      <Button variant="ghost" disabled={!n} onClick={() => editor.previewTransform({ kind: 'scale', axis: 2, value: '1', pivot: 'centre', vertex: '' })}>Scale selection</Button>
    </div>
    <label className={FIELD}><span>Mirror</span><NativeSelect className={CONTROL} aria-label="Mirror" value={s.mirror ?? ''} onChange={e => editor.op(e.target.value ? `mirror-${e.target.value}` as CageOp : 'mirror-off')}>
      <option value="">None</option><option value="x">Across X</option><option value="y">Across Y</option><option value="z">Across Z</option></NativeSelect></label>
    <div className="muted small" aria-label="Mirror source and replacement">Mirror keeps the positive side of the chosen axis and replaces the negative side with its reflection. Vertices on the mirror plane stay on it. Cage Undo restores the previous shape; Cancel discards this edit.</div>
    </fieldset>
    {loopDraft && <div className="space-y-2" role="group" aria-label={slide ? 'Slide loop preview' : 'Insert loop preview'}>
      {slide
        ? <div className="muted small" aria-label="Slide directions">Edge {slide.directions.anchor.join('–')} · + toward {slide.directions.positive.join('–')} · − toward {slide.directions.negative.join('–')}</div>
        : <div className="muted small">Seed edge {loopDraft.base.sel.edges[0]?.join(' → ')}. Ratio 0 is the first vertex; 1 is the second. Ratios are not millimetres.</div>}
      <label className={FIELD}><span>{ratioLabel}</span><input ref={slide ? focusSlideRatio : undefined} className={CONTROL} aria-label={ratioLabel} type="number" step="0.05" min={slide ? '-1' : '0'} max="1" value={loopDraft.value} onChange={e => editor.previewLoop(e.target.value)} /></label>
      {!slide && <div className="muted small">Preview replaces the previous preview. Apply inserts one loop; Cancel restores the cage and selection.</div>}
      {loopDraft.error ? <div role="status" className="warn">{loopDraft.error}</div> : !editor.loopReady && <div role="status" className="muted small">{editor.loopStatus}</div>}
      <div className="flex gap-1"><Button variant="ghost" onClick={editor.cancelLoop}>{slide ? 'Cancel slide preview' : 'Cancel loop preview'}</Button><Button disabled={!editor.loopReady} onClick={editor.applyLoop}>{slide ? 'Apply slide' : 'Apply loop'}</Button></div>
    </div>}
    <CageInsetControls editor={editor} />
    <CageTransformControls editor={editor} />
    <CageChecks validation={v} faces={s.cage.faces.length} previewMs={editor.previewMs} />
    <div className="flex items-center gap-1 pt-1">
      <Button variant="ghost" aria-label="Undo cage step" disabled={previewActive || !s.undo.length} onClick={editor.undo}>Undo</Button>
      <Button variant="ghost" aria-label="Redo cage step" disabled={previewActive || !s.redo.length} onClick={editor.redo}>Redo</Button>
      <span className="flex-1" />
      <Button variant="ghost" aria-label="Cancel cage edit" onClick={editor.cancel}>Cancel</Button>
      <Button variant="default" aria-label="Done editing cage" data-tip="Done" data-tip-desc="Apply this cage only after its current evaluation succeeds" data-tip-off={!editor.doneReadiness.ok ? editor.doneReadiness.reason : undefined} data-tip-focus aria-description={editor.doneReadiness.reason} aria-disabled={!editor.doneReadiness.ok} disabled={!!slide || dragging} className={!editor.doneReadiness.ok ? 'opacity-50' : undefined} onClick={editor.done}>Done</Button>
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

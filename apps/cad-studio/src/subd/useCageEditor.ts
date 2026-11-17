import { updateSubdCage } from '@barocss/cad-model/subd/cageProvenance';
// R8.2 (D81): the cage editor in the App — a session on one subd node: its overlay, picking, the gizmo (Shift held
// as a drag starts: extrude), the body shown (while dragged: the quick limit preview; after: the exact body, built
// once per step), the keys (1 2 3 modes, Tab Box/Smooth, ⌘Z the session's undo, Enter Done, Esc Cancel), and Done
// writing the node once (one step of the document's undo; the timeline keeps its one feature).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioDoc, ModelNode } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { triangleMesh, type Vec3 } from '@barocss/cad-model/engine/mesh';
import { refOf } from '@barocss/cad-model/app/bodyRef';
import type { TransformGizmo } from '../viewport/gizmo';
import type { CageOverlay } from '../viewport/Viewport';
import { commitDrag, dragged, fullCage, previewTriangles, redoSession, runOp, select, selectionCentre, startSession, undoSession, validationOf, type CageHit, type CageMode, type CageOp, type CageSession } from '@barocss/cad-model/subd/cageEdit';
import { mirrorCage } from '@barocss/cad';
import { Lanes } from '../engine/lanes';
import { cageDoneReadiness, type CageBuildReceipt } from './cageCommitReadiness';
import { previewCageTransform, type CageTransformInput } from './cageTransformDraft';
import { previewCageLoop } from './cageLoopDraft';
import { cageBeginPolicy } from './cageBeginPolicy';

/** The cage's exact build: one lane, each step's build replacing the last. */
const CAGE_LANE = 'cage';
export interface CageEditor {
  readonly session: CageSession | null;
  readonly transformDraft: { base: CageSession; input: CageTransformInput; error: string | null; pivot: readonly [number, number, number] | null } | null;
  readonly transformReady: boolean;
  previewTransform(input: CageTransformInput): void; applyTransform(): void; cancelTransform(): void;
  readonly loopDraft: { base: CageSession; value: string; error: string | null } | null;
  readonly loopReady: boolean;
  readonly loopStatus: string;
  previewLoop(value: string): void; applyLoop(): void; cancelLoop(): void;
  readonly doneReadiness: { ok: boolean; reason: string };
  begin(node: number, discardCurrent?: boolean): boolean;
  overlay: CageOverlay | null;
  pickDepth: 'front' | 'back';
  setPickDepth(depth: 'front' | 'back'): void;
  onPick(hit: CageHit | null, additive: boolean, grow?: 'loop' | 'ring'): void;
  gizmo: TransformGizmo | null;
  /** The bodies to show: the edited node's body replaced by the preview or the exact body of the session's cage. */
  shown(bodies: BodyResult[]): BodyResult[];
  setMode(m: CageMode): void; toggleSmooth(): void; op(o: CageOp): void; undo(): void; redo(): void; done(): void; cancel(): void;
  /** A key while editing: handled (true) or not. */
  onKey(e: KeyboardEvent): boolean;
  /** Milliseconds the last preview took (drag frames), for the panel. */
  previewMs: number | null;
}

export function useCageEditor(doc: StudioDoc, preview: (d: StudioDoc) => Promise<EvalResult>, commit: (next: StudioDoc) => void, fail: (title: string, hint: string) => void): CageEditor {
  const [session, setSession] = useState<CageSession | null>(null);
  const [loopDraft, setLoopDraft] = useState<{ base: CageSession; value: string; error: string | null } | null>(null);
  const [transformDraft, setTransformDraft] = useState<CageEditor['transformDraft']>(null);
  const previewActive = !!loopDraft || !!transformDraft;
  const [pickDepth, setPickDepth] = useState<'front' | 'back'>('front');
  const [drag, setDrag] = useState<{ delta: Vec3; extrude: boolean } | null>(null);
  const [exact, setExact] = useState<{ of: CageSession; doc: StudioDoc; bodies: BodyResult[] } | null>(null);
  const [buildReceipt, setBuildReceipt] = useState<CageBuildReceipt<CageSession, StudioDoc> | null>(null);
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  const shift = useRef(false);
  const sessionId = useRef(0);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shift.current = true; }, up = (e: KeyboardEvent) => { if (e.key === 'Shift') shift.current = false; };
    addEventListener('keydown', down); addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  }, []);
  const withCage = useCallback((s: CageSession): StudioDoc => ({ ...doc, nodes: doc.nodes.map((node, i) => i === s.node && node.kind === 'subd' ? updateSubdCage(node, s.cage, s.mirror ?? undefined) : node) }), [doc]);
  // The exact body after each step (not while dragged): the kernel's build of the document with the session's cage.
  // (R4b: on its O9 lane — a newer step's build, or the session gone, makes an older reply stale, never shown.)
  const lanes = useMemo(() => new Lanes(), []);
  useEffect(() => {
    if (!session || drag) return;
    let cancelled = false;
    setBuildReceipt({ session, doc, status: 'pending' });
    void lanes.run(CAGE_LANE, { revision: session.undo.length, source: `n${session.node}` }, () => preview(withCage(session))).then(r => {
      if (cancelled || r.stale) return;
      if (r.result.ok) {
        setExact({ of: session, doc, bodies: r.result.bodies });
        setBuildReceipt({ session, doc, status: 'success' });
      } else {
        setBuildReceipt({ session, doc, status: 'error', reason: `${r.result.error.title}. ${r.result.error.hint} Adjust the cage or use Cage Undo. After Extrude, move the new boundary with the gizmo before Done. The draft has not been applied.` });
      }
    }).catch(error => {
      if (!cancelled) setBuildReceipt({ session, doc, status: 'error', reason: `${error instanceof Error ? error.message : String(error)}. Adjust the cage or use Cage Undo; the draft has not been applied.` });
    });
    return () => { cancelled = true; lanes.cancel(CAGE_LANE); };
  }, [session, doc, drag, withCage, preview, lanes]);

  // The node the session began on. The part changed under it (a new part, a file opened, the agent's edit): the
  // session ends with nothing written, and says so — Done would write over the change (D84).
  const from = useRef<ModelNode | null>(null);
  useEffect(() => {
    if (!session || doc.nodes[session.node] === from.current) return;
    setLoopDraft(null); setTransformDraft(null); setSession(null); setExact(null); setBuildReceipt(null); setDrag(null); from.current = null;
    fail('Cage edit ended', 'The part changed while its cage was being edited; nothing was written. Edit the cage again.');
  }, [doc, session, fail]);

  const begin = useCallback((node: number, discardCurrent = false) => {
    const n = doc.nodes[node];
    const policy = cageBeginPolicy(node, n, session, from.current, discardCurrent);
    if (policy === 'refuse' || n?.kind !== 'subd') return false;
    if (policy === 'keep') return true;
    from.current = n;
    sessionId.current++; setPickDepth('front'); setLoopDraft(null); setTransformDraft(null);
    setSession(startSession(node, n.cage, n.mirror)); setDrag(null); setExact(null); setBuildReceipt(null); return true;
  }, [doc.nodes, session]);
  const guard = useCallback((f: (s: CageSession) => CageSession) => setSession(s => {
    if (!s || previewActive) return s;
    try { return f(s); } catch (e) { fail('Not done', e instanceof Error ? e.message.replace(/^SubD: /, '') : String(e)); return s; }
  }), [fail, previewActive]);

  const previewLoop = useCallback((value: string) => {
    const base = loopDraft?.base ?? session;
    if (!base || drag || transformDraft) return;
    const result = previewCageLoop(base, value);
    setLoopDraft({ base, value, error: result.error }); setSession(result.session);
  }, [loopDraft, session, drag, transformDraft]);
  const cancelLoop = useCallback(() => { if (loopDraft) { setSession(loopDraft.base); setLoopDraft(null); } }, [loopDraft]);
  const applyLoop = useCallback(() => {
    if (loopDraft && !loopDraft.error && cageDoneReadiness(session, doc, !!drag, buildReceipt).ok) setLoopDraft(null);
  }, [loopDraft, session, doc, drag, buildReceipt]);

  const previewTransform = useCallback((input: CageTransformInput) => {
    const base = transformDraft?.base ?? session;
    if (!base || drag || loopDraft) return;
    const result = previewCageTransform(base, input);
    setTransformDraft({ base, input, error: result.error, pivot: result.pivot }); setSession(result.session);
  }, [transformDraft, session, drag, loopDraft]);
  const cancelTransform = useCallback(() => { if (transformDraft) { setSession(transformDraft.base); setTransformDraft(null); } }, [transformDraft]);
  const applyTransform = useCallback(() => {
    if (transformDraft && !transformDraft.error && cageDoneReadiness(session, doc, !!drag, buildReceipt).ok) setTransformDraft(null);
  }, [transformDraft, session, doc, drag, buildReceipt]);

  // (The session as it would be with the drag so far: one object per session and drag, so what derives from it is computed once.)
  const live = useMemo(() => session && drag ? (() => { try { return { ...session, ...dragged(session, drag.delta, drag.extrude) }; } catch { return session; } })() : session, [session, drag]);
  // (A move keeps the topology: the session's validation stands; an extrusion's is the dragged cage's.)
  const baseValidation = useMemo(() => session ? validationOf(session) : null, [session]);
  const overlay = useMemo((): CageOverlay | null => live ? { cage: live.cage, mode: live.mode, pickDepth, sel: live.sel, validation: drag?.extrude ? validationOf(live) : baseValidation!, mirrored: live.mirror ? (() => { const full = mirrorCage(live.cage, live.mirror); return { positions: [...full.positions], faces: full.faces.slice(live.cage.faces.length).map(f => [...f]) } as never; })() : null } : null, [live, drag, baseValidation, pickDepth]);

  // The body while dragged, or in Box mode: triangles straight from the cage (or its quick limit preview).
  const quick = useMemo(() => {
    if (!live || (!drag && live.smooth && (exact?.of === session && exact.doc === doc))) return null;
    const t0 = performance.now(), t = previewTriangles(fullCage(live), live.smooth), mesh = triangleMesh(t.positions, t.indices, t.normals, `n${live.node}.cage`);
    return { mesh, ms: performance.now() - t0 };
  }, [live, drag, exact, session, doc]);
  useEffect(() => { if (quick) setPreviewMs(ms => ms !== null && Math.abs(ms - quick.ms) < 0.05 ? ms : quick.ms); }, [quick]);
  const shown = useCallback((bodies: BodyResult[]): BodyResult[] => {
    if (!session) return bodies;
    if (quick) return bodies.map(b => refOf(b).node === session.node ? { ...b, mesh: quick.mesh } : b);
    return (exact?.of === session && exact.doc === doc) ? exact.bodies : bodies;
  }, [session, quick, exact, doc]);

  const centre = live ? selectionCentre(session!) : null;
  const gizmo: TransformGizmo | null = session && centre && !previewActive ? {
    sessionKey: `cage:${sessionId.current}`,
    onCancel: () => setDrag(null),
    origin: [centre[0] + (drag?.delta[0] ?? 0), centre[1] + (drag?.delta[1] ?? 0), centre[2] + (drag?.delta[2] ?? 0)], move: [0, 1, 2],
    onMove: (delta, done) => {
      // (Shift held as the drag starts: the selection extruded, then moved.)
      const extrude = drag?.extrude ?? shift.current;
      if (!done) { setDrag({ delta, extrude }); return; }
      setDrag(null); guard(s => commitDrag(s, delta, extrude));
    },
  } : null;

  const doneReadiness = previewActive ? { ok: false, reason: 'Apply or cancel the cage preview first.' } : cageDoneReadiness(session, doc, !!drag, buildReceipt);
  const done = useCallback(() => {
    if (!session) return;
    if (previewActive) { fail('Cage preview active', 'Apply or cancel the cage preview first.'); return; }
    if (doc.nodes[session.node] !== from.current) { fail('Cage edit changed', 'The source changed; cancel this draft and edit the current cage again.'); return; }
    const readiness = cageDoneReadiness(session, doc, !!drag, buildReceipt);
    if (!readiness.ok) { fail('Cage not applied', readiness.reason); return; }
    const v = validationOf(session);
    if (!v.valid) { fail('The cage is not a manifold', `${v.nonManifoldEdges.length} edges and ${v.nonManifoldVertices.length} vertices are marked red: undo, or weld or delete them.`); return; }
    // (The session ends before the document changes: the change is its own.)
    setLoopDraft(null); setTransformDraft(null); setSession(null); setExact(null); setBuildReceipt(null); setDrag(null); from.current = null;
    if (session.undo.length) commit(withCage(session));
  }, [session, doc, drag, buildReceipt, commit, withCage, fail, previewActive]);
  const cancel = useCallback(() => { setLoopDraft(null); setTransformDraft(null); setSession(null); setExact(null); setBuildReceipt(null); setDrag(null); from.current = null; }, []);
  const onKey = useCallback((e: KeyboardEvent): boolean => {
    if (!session) return false;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
    if (previewActive) {
      if (e.key === 'Escape') { e.preventDefault(); if (loopDraft) cancelLoop(); else cancelTransform(); return true; }
      if (typing && !((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's')) return false;
      e.preventDefault(); return true;
    }
    if (typing) return false;
    if (e.key === 'Enter') { e.preventDefault(); done(); return true; }
    // (Esc clears the pick; with nothing picked it leaves — but not by throwing steps away: those need Cancel or Done, D84.)
    if (e.key === 'Escape') {
      if (session.sel.vertices.length || session.sel.edges.length || session.sel.faces.length) setSession(s => s && { ...s, sel: { vertices: [], edges: [], faces: [] } });
      else if (session.undo.length) fail('Still editing the cage', `${session.undo.length} step${session.undo.length === 1 ? '' : 's'} not written: Done keeps them, Cancel drops them.`);
      else cancel();
      return true;
    }
    if (e.key === 'Tab') { e.preventDefault(); setSession(s => s && { ...s, smooth: !s.smooth }); return true; }
    const mode = ({ '1': 'vertex', '2': 'edge', '3': 'face' } as const)[e.key as '1' | '2' | '3'];
    if (mode) { setSession(s => s && (s.mode === mode ? s : { ...s, mode, sel: { vertices: [], edges: [], faces: [] } })); return true; }
    const op = ({ e: 'extrude', l: 'insert-loop', b: 'bridge', f: 'fill', w: 'weld', c: 'crease', Delete: 'delete', Backspace: 'delete' } as Record<string, CageOp>)[e.key];
    if (op && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (op === 'insert-loop') previewLoop('0.5'); else guard(s => runOp(s, op)); return true; }
    return false;
  }, [session, done, cancel, guard, fail, previewActive, loopDraft, cancelLoop, cancelTransform, previewLoop]);

  return {
    session, transformDraft, transformReady: !!transformDraft && !transformDraft.error && cageDoneReadiness(session, doc, !!drag, buildReceipt).ok, previewTransform, applyTransform, cancelTransform, loopDraft, loopStatus: cageDoneReadiness(session, doc, !!drag, buildReceipt).reason, loopReady: !!loopDraft && !loopDraft.error && cageDoneReadiness(session, doc, !!drag, buildReceipt).ok, previewLoop, applyLoop, cancelLoop, doneReadiness, begin, overlay, gizmo, shown, previewMs, pickDepth, setPickDepth,
    onPick: (hit, additive, grow) => guard(s => select(s, hit, additive, grow)),
    setMode: m => setSession(s => s && (previewActive ? s : s.mode === m ? s : { ...s, mode: m, sel: { vertices: [], edges: [], faces: [] } })),
    toggleSmooth: () => setSession(s => s && (previewActive ? s : { ...s, smooth: !s.smooth })),
    op: o => { if (previewActive) return; if (o === 'insert-loop') previewLoop('0.5'); else guard(s => runOp(s, o)); },
    undo: () => setSession(s => s && (previewActive ? s : undoSession(s))), redo: () => setSession(s => s && (previewActive ? s : redoSession(s))),
    done, cancel, onKey,
  };
}

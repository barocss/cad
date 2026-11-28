import { ownedHistoryFilletHandle, historyFilletCanPatch, type HistoryFilletReceipt } from '../state/historyFilletRadiusReceipt';
import { commandFieldLabel } from '../app/commandFieldLabel';
import { draggedScaleFactor } from './draggedScaleFactor';
import { captureScalarDraft as captureCommandScalarDraft } from './filletScalarDraft';
import { useMemo, useRef, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { fmt, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import { patchValues, refOf, selectedBodies, type Ctx, type Selection, type Values } from '@barocss/cad-model/app/commands';
import { editCommand, featureOfPick } from '@barocss/cad-model/app/editCommand';
import { OFFSET_FACE_EDIT } from '@barocss/cad-model/app/offsetFaceEdit';
import { moveBodyIndex, moveVertexPair } from '@barocss/cad-model/app/moveCommand';
import { rotateBodyIndex } from '@barocss/cad-model/app/rotateCommand';
import type { Active } from '../app/commandState';
import type { FeatureHandle, ScalarHandleDraft, TransformGizmo } from './gizmo';
import { alignMove, previewMatrix } from '@barocss/cad-model/assembly/drag';
type BodyDrag = { matrix: Float64Array; settling: boolean } | null;
interface CommandGizmoOptions {
  model: { doc: StudioDoc; evaluated: StudioDoc; bodies: BodyResult[]; selection: Selection; marker: number | null; editNode: number | null };
  command: { active: Active | null; readActive?():Active|null; ctx: Ctx; setActive: Dispatch<SetStateAction<Active | null>>; handleDrag: RefObject<{ key: string; lastOk: number; wall: number; bad: number | null; want: number; step: number; dragging: boolean } | null>; previewFor: RefObject<string | null> };
  context: { sketch: object | null; rendering: boolean; drawing: boolean; measure: readonly unknown[] | null; assemblyDraft: object | null; instanceCount: number; snapStep: number };
  historyFillet?: { receipt?: HistoryFilletReceipt; eligible: boolean; pending?: Exclude<FeatureHandle['historyFilletProofPending'], true> };
  splitSource?: { evidence: Ctx['splitSourceBounds']; canStart(evidence: Ctx['splitSourceBounds']): boolean };
  drag: { bodyDrag: BodyDrag; setBodyDrag: Dispatch<SetStateAction<BodyDrag>> };
  retireScalarDraft(): void;
}
/** Command gizmos and dimension handles share the original drag refs and central command store. */
export function useCommandGizmos({ model, command, context, drag, splitSource, historyFillet, retireScalarDraft }: CommandGizmoOptions) {
  const { doc, evaluated, bodies, selection, marker, editNode } = model;
  const { active, readActive, ctx, setActive, handleDrag, previewFor } = command;
  const { sketch, rendering, drawing, measure, assemblyDraft, instanceCount, snapStep } = context;
  const { bodyDrag, setBodyDrag } = drag;
  // Move and Rotate gizmos on the selected body: while dragged it follows at once (a renderer transform
  // of the evaluated body); let go, the kernel preview of the values runs.
  const dragFrom = useRef<Values | null>(null);
  const scaleBodies = active?.cmd.id === 'scale' ? selectedBodies(active.ctx.selection) : [];
  const cmdBody = active?.cmd.id === 'move' ? moveBodyIndex(active.ctx) : active?.cmd.id === 'rotate' ? rotateBodyIndex(active.ctx)
    : scaleBodies.length === 1 ? scaleBodies[0] : undefined;
  const gizmo: TransformGizmo | null = active && cmdBody !== undefined && bodies[cmdBody] ? (() => {
    const { min, max } = bodies[cmdBody].mesh.bounds, values = active.values;
    const begin = () => dragFrom.current ?? (dragFrom.current = values);
    const show = (next: Values, matrix: Float64Array, done: boolean) => {
      setBodyDrag({ matrix, settling: done });
      setActive(a => a && { ...a, values: patchValues(a.cmd, a.ctx, a.values, next), preview: 'busy' });
      if (done) dragFrom.current = null;
    };
    if (active.cmd.id === 'move') {
      const v: Vec3 = [Number(values.x), Number(values.y), Number(values.z)];
      const point = moveVertexPair(active.ctx)?.[0].at ?? [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, max[2]];
      return { origin: [point[0] + v[0], point[1] + v[1], point[2] + v[2]], move: [0, 1, 2],
        onMove: (delta, done) => {
          const from = begin(), raw: Vec3 = [Number(from.x) + delta[0], Number(from.y) + delta[1], Number(from.z) + delta[2]];
          // Lined up with the other bodies' sides and middles when it comes close (2 % of its size, at least 1 mm).
          const size = Math.max(...[0, 1, 2].map(k => max[k] - min[k])), others = bodies.filter((_, i) => i !== cmdBody).map(b => b.mesh.bounds);
          const next = alignMove({ min, max }, others, raw, delta.map(v => v !== 0), Math.max(1, size * 0.02)).move;
          show({ x: next[0], y: next[1], z: next[2] }, previewMatrix({ kind: 'move', delta: next }), done);
        } };
    }
    if (active.cmd.id === 'scale') {
      // Scale: the cubes grow or shrink the body about the pivot (its centre by default).
      const pivot: Vec3 = [Number(values.px), Number(values.py), Number(values.pz)];
      return { origin: pivot, scale: true,
        onScale: (factor, done) => {
          const from = begin(), k = draggedScaleFactor(Number(from.factor), factor), m = new Float64Array(16);
          m[0] = m[5] = m[10] = k; m[15] = 1; m[12] = pivot[0] * (1 - k); m[13] = pivot[1] * (1 - k); m[14] = pivot[2] * (1 - k);
          show({ factor: k }, m, done);
        } };
    }
    // Rotate: about the pivot, in 15° steps (Shift: 1°).
    const pivot: Vec3 = [Number(values.px), Number(values.py), Number(values.pz)];
    return { origin: pivot, turn: [0, 1, 2],
      onTurn: (axis, degrees, done) => {
        const from = begin(), name = 'xyz'[axis], angle = from.axis === name ? Number(from.angle) + degrees : degrees;
        show({ axis: name, angle }, previewMatrix({ kind: 'turn', axis, degrees: angle, centre: pivot }), done);
      } };
  })() : null;
  // The active command's dimension handles: dragging one sets that value (the preview follows).
  // With nothing running, the selected body's feature (or the one open in the feature editor) offers its
  // dimensions as handles: dragging one starts editing that feature.
  const idleEdit = useMemo(() => {
    if (active || sketch || rendering || drawing || measure || assemblyDraft || instanceCount) return null;
    // The feature open in the editor, else the one the picked face or edge comes from, else the body's last.
    const one = selectedBodies(selection), index = editNode ?? featureOfPick(selection, bodies, evaluated.nodes) ?? (one.length === 1 && bodies[one[0]] ? refOf(bodies[one[0]]).node : null);
    return index === null || (marker !== null && index >= marker) ? null : editCommand(index, evaluated.nodes, doc);
  }, [active, sketch, rendering, drawing, measure, assemblyDraft, instanceCount, selection, editNode, bodies, evaluated.nodes, doc, marker]);
  const idleCtx = splitSource?.evidence ? { ...ctx, splitSourceBounds: splitSource.evidence } : ctx;
  const handleCmd = active?.cmd ?? idleEdit, handleValues = active ? active.values : idleEdit?.defaults?.(idleCtx) ?? {}, handleCtx = active?.ctx ?? idleCtx;
  const evidence = handleCtx.splitSourceBounds;
  const canUseHandle = () => evidence ? evidence.isCurrent() && !!splitSource?.canStart(evidence)
    : active ? active.ownsSource?.() !== false : true;
  // (None while a new shape is still being placed: the click that places it must not grab one.)
  const handles: FeatureHandle[] = handleCmd?.handles && canUseHandle() && !sketch && !active?.placing ? handleCmd.handles(handleCtx, handleValues).flatMap(h => {
    const fields = handleCmd.fields?.(handleCtx, handleValues) ?? [], field = fields.find(f => f.key === h.key), value = Number(handleValues[h.key]);
    if (!field || !Number.isFinite(value)) return [];
    // (Lengths follow the grid step: half of it for half-step arrows; angles and counts keep their own.)
    const step = h.arc || h.unit !== undefined ? h.step ?? 1 : Math.max(0.001, (h.step ?? 1) * (snapStep || 0.01)), snap = (start: number, mm: number) => Math.min(h.max ?? Infinity, Math.max(h.min ?? -Infinity, Math.round((start + mm * (h.scale ?? 1)) / step) * step));
    const pair = h.pair, value2 = pair ? Number(handleValues[pair.key]) : NaN;
    const label = commandFieldLabel(handleCmd.id, active?.fillet, field.key, field.label);
    const savedOffset = handleCmd.id === OFFSET_FACE_EDIT;
    if (savedOffset && (!active?.historyOffsetDistance || !readActive)) return [];
    const history = readActive ? ownedHistoryFilletHandle(historyFillet?.receipt, handleCmd, handleCtx, h, active) : undefined;
    if (active?.historyFilletRadius && !history) return [];
    const newFilletRadius = active && handleCmd.id === 'fillet' && h.key === 'radius' && !h.arc && !pair;
    const worldAngle = !!h.arc?.worldPlane && !!active && !!readActive;
    const waitForHistoryProof = !active && historyFillet?.eligible && !history && handleCmd.id==='edit' && h.key==='r' && !h.arc && !h.pair;
    const canPatch = (now: Active | null) => {
      if (history) return historyFilletCanPatch(history, handleCmd, handleCtx, now, active);
      if (savedOffset) return now?.cmd === handleCmd && now.ctx === handleCtx && now.historyOffsetDistance === true &&
        now.ownsSource === active?.ownsSource && now.ownsSource?.() === true && now.values.offsetMode !== 'to-plane';
      if (worldAngle) return now?.cmd === handleCmd && now.ctx === handleCtx && now.ownsSource?.() !== false;
      return true;
    };
    const canWrite = () => canUseHandle() && (!(history || savedOffset || worldAngle) || (!!readActive && canPatch(readActive())));
    if (pair && !Number.isFinite(value2)) return [];
    const frame = history?.frame ?? h;
    const captureScalarDraft = (history || newFilletRadius || worldAngle) && readActive ? () => {
      if (!canWrite()) return;
      return captureCommandScalarDraft({
        before: readActive(), read: readActive, readWall: () => handleDrag.current, retire: retireScalarDraft,
        owns: current => canPatch(current) && current.cmd === handleCmd && current.ctx === handleCtx,
        restore: (current, next) => setActive(running => running === current ? next : running),
      });
    } : undefined;
    return [{ id: pair ? `${h.key}+${pair.key}` : h.key, at: frame.at, dir: frame.dir, label: pair ? label.replace(/ \w$/, '') : label, value, screenOffset: h.screenOffset, ...(h.arc ? { arc: h.arc } : {}),
      ...(pair ? { plane: { dir2: pair.dir, value2, toValue2: snap } } : {}),
      ...(history ? { scalarDragSession: history } :
        active && (savedOffset || newFilletRadius || worldAngle) ? { scalarDragSession: active.ctx } : {}),
      ...(captureScalarDraft ? { captureScalarDraft } : {}),
      ...(waitForHistoryProof ? { historyFilletProofPending: historyFillet?.pending ?? true as const } : {}),
      toValue: snap,
      format: (v: number) => h.arc ? `${fmt(v)}°` : h.unit !== undefined ? `${fmt(v)}${h.unit ? ' ' + h.unit : ''}` : `${fmt(v)} mm`,
      unit: h.arc ? '°' : h.unit ?? 'mm', owner: handleCmd, editing: !!active, ...(!active ? { shiftPick: true as const } : {}),
      // (A typed value, as the HUD's: no drag bound, the preview follows.)
      onType: (v: number) => { if (!canWrite()) return; handleDrag.current = null;
        setActive(a => a && canPatch(a)
          ? { ...a, values: patchValues(a.cmd, a.ctx, a.values, { [h.key]: v }), preview: 'busy' } : a);
      },
      onDrag: (v: number, done: boolean, v2?: number, draft?: ScalarHandleDraft) => {
        if (!canWrite()) return;
        if (worldAngle) {
          handleDrag.current = null;
          setActive(a => {
            if (!a || !canPatch(a) || a.values[h.key] === v) return a;
            const values = patchValues(a.cmd, a.ctx, a.values, { [h.key]: v });
            if (!done) draft?.remember(values);
            return { ...a, values, preview: 'busy' };
          });
          return;
        }
        if (pair) {
          // (Both coordinates at once; a refused spot shows as the preview's error, no wall.)
          handleDrag.current = null;
          const patch = { [h.key]: v, [pair.key]: v2 ?? value2 };
          setActive(a => a ? (a.values[h.key] === patch[h.key] && a.values[pair.key] === patch[pair.key] ? a : { ...a, values: patchValues(a.cmd, a.ctx, a.values, patch), preview: 'busy' }) : { cmd: handleCmd, values: patchValues(handleCmd, handleCtx, handleValues, patch), preview: 'busy', ctx: { ...handleCtx }, ...(evidence ? { ownsSource: evidence.isCurrent } : {}) });
          return;
        }
        let hd = handleDrag.current;
        if (!hd || hd.key !== h.key || !hd.dragging) hd = handleDrag.current = { key: h.key, lastOk: value, wall: 0, bad: null, want: v, step, dragging: true };
        hd.want = v;
        // At or past the nearest value that failed: held at the last good one (those between are still tried).
        // A value strictly between them is a bisect step in flight: it stays shown until its answer arrives.
        if (hd.bad !== null && (v - hd.bad) * hd.wall >= 0) {
          const cur = Number(active?.values[h.key]);
          v = Number.isFinite(cur) && (cur - hd.lastOk) * hd.wall > 0 && (hd.bad - cur) * hd.wall > 0 ? cur : hd.lastOk;
        }
        if (done) hd.dragging = false;
        // An idle handle opens its feature's edit as the drag starts.
        setActive(a => {
          if (!canPatch(a)) return a;
          const next: Active = a ? (a.values[h.key] !== v ? { ...a, values: patchValues(a.cmd, a.ctx, a.values, { [h.key]: v }), preview: 'busy' } : a)
            : { cmd: handleCmd, values: patchValues(handleCmd, handleCtx, handleValues, { [h.key]: v }), preview: 'busy',
              ctx: history ? handleCtx : { ...handleCtx }, ...(history ? {historyFilletRadius:true as const,ownsSource:history.isCurrent} : evidence ? { ownsSource: evidence.isCurrent } : {}) };
          if (next.values !== a?.values && !done) draft?.remember(next.values, hd);
          return next;
        });
      } }];
  }) : [];
  const settleDrag = () => { if (bodyDrag?.settling && active && previewFor.current === JSON.stringify(active.values)) setBodyDrag(null); };
  const resetDrag = () => { setBodyDrag(null); dragFrom.current = null; handleDrag.current = null; };
  return { gizmo, handles, cmdBody, settleDrag, resetDrag };
}

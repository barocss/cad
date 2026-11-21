import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import { cageLocalDirection, type CageLocalFrame } from '@barocss/cad-model/subd/cageLocalDirection';
import {
  commitCageProportionalDrag, commitDrag, dragged, planCageProportionalDrag, previewCageProportionalDrag,
  selectionCentre, transformCageSelection, type CageProportionalDragPlan, type CageSession,
} from '@barocss/cad-model/subd/cageEdit';
import type { Axis3, TransformGizmo } from '../viewport/gizmo';
import { cageTransformPivot, type CagePivotMode } from './cageTransformDraft';

type CageDragOwner = { doc: StudioDoc; base: CageSession };
type CageDrag = {
  owner: CageDragOwner;
  pointerId: number;
  extrude: boolean;
  plan: CageProportionalDragPlan | null;
  pivot: Vec3 | null;
};
const DEFAULT_RADIUS = '10';
type CageDragFrame = 'world' | CageLocalFrame;
type CageDragTool = 'move' | 'scale' | 'rotate';
type CageDragTransform = { kind: 'scale'; factor: number } | { kind: 'rotate'; axis: Axis3; degrees: number };
const LOCAL_AXIS_LABEL: Record<CageLocalFrame, string> = { edge: 'T', face: 'N', 'face-u': 'U', 'face-v': 'V' };
type PivotVertexInput = { value: string; cage: CageSession['cage'] };

function currentPivotVertex(input: PivotVertexInput, cage: CageSession['cage'], point: Vec3): boolean {
  if (input.cage === cage) return true;
  const before = input.cage;
  const offset = 3 * Number(input.value);
  return before.positions.length === cage.positions.length && before.faces.length === cage.faces.length
    && point.every((value, i) => value === before.positions[offset + i])
    && before.faces.every((face, i) => face.length === cage.faces[i].length
      && face.every((id, j) => id === cage.faces[i][j]));
}

export function useCageGizmo(
  session: CageSession | null, doc: StudioDoc, available: boolean,
  setSession: (update: (current: CageSession | null) => CageSession | null) => void,
  fail: (title: string, hint: string) => void,
) {
  const [tool, setTool] = useState<CageDragTool>('move');
  const [pivotMode, setPivotMode] = useState<CagePivotMode>('centre');
  const [pivotVertex, setPivotVertex] = useState<PivotVertexInput | null>(null);
  const pivot = useMemo(() => {
    if (tool === 'move' || !session) return null;
    const mode = tool === 'scale' ? pivotMode : 'centre';
    try {
      const at = cageTransformPivot(session, mode, pivotVertex?.value ?? '');
      // Cage operations can renumber vertices even when the old number stays in range.
      if (mode === 'vertex' && pivotVertex && !currentPivotVertex(pivotVertex, session.cage, at)) {
        return { reason: 'The cage changed. Enter the pivot vertex again.' };
      }
      return { at };
    } catch (error) {
      return { reason: error instanceof Error ? error.message : String(error) };
    }
  }, [tool, session, pivotMode, pivotVertex]);
  const [dragFrame, setDragFrame] = useState<CageDragFrame>('world');
  const frameMode = tool === 'move' && session?.mode === (dragFrame === 'edge' ? 'edge' : 'face') ? dragFrame : 'world';
  const local = useMemo(() => {
    if (!session || frameMode === 'world') return null;
    try {
      const direction = cageLocalDirection(session, frameMode);
      return { moveAlong: { direction, label: LOCAL_AXIS_LABEL[frameMode] } };
    } catch (error) {
      return { reason: error instanceof Error ? error.message.replace(/^SubD: local direction: /, '') : String(error) };
    }
  }, [session, frameMode]);
  const owner = useMemo(() => available && session && (tool === 'move' || pivot?.at) && (frameMode === 'world' || local?.moveAlong)
    ? { doc, base: session, moveAlong: local?.moveAlong, pivot: pivot?.at ?? null, tool }
    : null, [available, session, doc, frameMode, local, tool, pivot]);
  const ownerNow = useRef(owner);
  const held = useRef<CageDrag | null>(null);
  const [frame, setFrame] = useState<{ gesture: CageDrag; delta?: Vec3; transform?: CageDragTransform } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const radiusMM = radius.trim() ? Number(radius) : NaN;
  const radiusValid = Number.isFinite(radiusMM) && radiusMM > 0;

  const isDragging = useCallback(() => held.current !== null, []);
  const cancel = useCallback(() => { held.current = null; setFrame(null); }, []);
  const reset = useCallback(() => {
    cancel();
    setTool('move'); setPivotMode('centre'); setPivotVertex(null);
    setDragFrame('world'); setEnabled(false); setRadius(DEFAULT_RADIUS);
  }, [cancel]);
  useLayoutEffect(() => {
    ownerNow.current = owner;
    if (held.current && held.current.owner !== owner) cancel();
    return () => { ownerNow.current = null; };
  }, [owner, cancel]);

  const active = frame && frame.gesture.owner === owner ? frame : null;
  const live = useMemo(() => {
    if (!active) return session;
    const { plan, extrude, pivot, owner: { base } } = active.gesture;
    try {
      if (pivot && active.transform) return transformCageSelection(base, { ...active.transform, pivot });
      if (!active.delta) return session;
      return plan ? previewCageProportionalDrag(plan, active.delta) : { ...base, ...dragged(base, active.delta, extrude) };
    } catch { return base; }
  }, [session, active]);

  let gizmo: TransformGizmo | null = null;
  const centre = owner && selectionCentre(owner.base);
  if (owner && centre) {
    // Viewport retains this gizmo's callbacks from the press through release.
    let gesture: CageDrag | null = null;
    const delta = active?.delta;
    const updateTransform = (transform: CageDragTransform, done: boolean, pointerId?: number) => {
      if (transform.kind !== owner.tool || !gesture?.pivot || held.current !== gesture
        || gesture.pointerId !== pointerId || ownerNow.current !== owner) return;
      if (!done) { setFrame({ gesture, transform }); return; }
      const { pivot } = gesture;
      cancel();
      try {
        const next = transformCageSelection(owner.base, { ...transform, pivot });
        setSession(current => current === owner.base ? next : current);
      } catch (error) {
        fail('Not done', error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error));
      }
    };
    gizmo = {
      sessionKey: owner,
      cancelOnEscape: true,
      origin: owner.pivot ?? ((active?.gesture.plan || active?.delta && owner.moveAlong) && live ? selectionCentre(live) ?? centre
        : [centre[0] + (delta?.[0] ?? 0), centre[1] + (delta?.[1] ?? 0), centre[2] + (delta?.[2] ?? 0)]),
      ...(owner.tool === 'rotate' ? { turn: [0, 1, 2] } : owner.tool === 'scale' ? { scale: true }
        : owner.moveAlong ? { moveAlong: owner.moveAlong } : { move: [0, 1, 2] }),
      onStart: (pointerId, shiftKey) => {
        if (ownerNow.current !== owner || held.current) return;
        try {
          const weighted = !owner.pivot && enabled && owner.base.mode === 'vertex';
          const plan = weighted ? planCageProportionalDrag(owner.base, radiusMM) : null;
          gesture = { owner, pointerId, pivot: owner.pivot,
            extrude: !owner.pivot && !owner.moveAlong && shiftKey && owner.base.mode !== 'vertex', plan };
          held.current = gesture;
          setFrame({ gesture });
        } catch (error) {
          fail('Cannot start proportional drag', error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error));
        }
      },
      onCancel: pointerId => {
        if (gesture && held.current === gesture && gesture.pointerId === pointerId) cancel();
      },
      onMove: (total, done, pointerId) => {
        if (!gesture || gesture.pivot || held.current !== gesture || gesture.pointerId !== pointerId || ownerNow.current !== owner) return;
        if (!done) { setFrame({ gesture, delta: total }); return; }
        const { plan, extrude } = gesture;
        cancel();
        try {
          const next = plan ? commitCageProportionalDrag(plan, total) : commitDrag(owner.base, total, extrude);
          setSession(current => current === owner.base ? next : current);
        } catch (error) {
          fail('Not done', error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error));
        }
      },
      onScale: (factor, done, pointerId) => updateTransform({ kind: 'scale', factor }, done, pointerId),
      onTurn: (axis, degrees, done, pointerId) => updateTransform({ kind: 'rotate', axis, degrees }, done, pointerId),
    };
  }

  return {
    gizmo, live, dragging: !!active, extruding: !!active?.delta && active.gesture.extrude, isDragging, cancel, reset,
    influence: active?.gesture.plan?.weights,
    settings: {
      enabled, radius, radiusValid, tool, dragFrame: frameMode, frameReason: local?.reason,
      setTool: (next: CageDragTool) => { if (!isDragging()) setTool(next); },
      scalePivot: {
        mode: pivotMode, vertex: pivotVertex?.value ?? '', reason: tool === 'scale' ? pivot?.reason : undefined,
        setMode: (next: CagePivotMode) => { if (!isDragging()) setPivotMode(next); },
        setVertex: (next: string) => { if (!isDragging() && session) setPivotVertex({ value: next, cage: session.cage }); },
      },
      setDragFrame: (next: CageDragFrame) => { if (!isDragging()) setDragFrame(next); },
      setEnabled: (next: boolean) => { if (!isDragging()) setEnabled(next); },
      setRadius: (next: string) => { if (!isDragging()) setRadius(next); },
    },
  };
}

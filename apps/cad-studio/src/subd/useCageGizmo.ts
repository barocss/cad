import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import {
  commitCageProportionalDrag, commitDrag, dragged, planCageProportionalDrag, previewCageProportionalDrag,
  selectionCentre, type CageProportionalDragPlan, type CageSession,
} from '@barocss/cad-model/subd/cageEdit';
import type { TransformGizmo } from '../viewport/gizmo';

type CageDragOwner = { doc: StudioDoc; base: CageSession };
type CageDrag = {
  owner: CageDragOwner;
  pointerId: number;
  extrude: boolean;
  plan: CageProportionalDragPlan | null;
};
const DEFAULT_RADIUS = '10';

export function useCageGizmo(
  session: CageSession | null, doc: StudioDoc, available: boolean,
  setSession: (update: (current: CageSession | null) => CageSession | null) => void,
  fail: (title: string, hint: string) => void,
) {
  const owner = useMemo(() => available && session ? { doc, base: session } : null, [available, session, doc]);
  const ownerNow = useRef(owner);
  const held = useRef<CageDrag | null>(null);
  const [frame, setFrame] = useState<{ gesture: CageDrag; delta: Vec3 | null } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const radiusMM = radius.trim() ? Number(radius) : NaN;
  const radiusValid = Number.isFinite(radiusMM) && radiusMM > 0;

  const isDragging = useCallback(() => held.current !== null, []);
  const cancel = useCallback(() => { held.current = null; setFrame(null); }, []);
  const reset = useCallback(() => { cancel(); setEnabled(false); setRadius(DEFAULT_RADIUS); }, [cancel]);
  useLayoutEffect(() => {
    ownerNow.current = owner;
    if (held.current && held.current.owner !== owner) cancel();
    return () => { ownerNow.current = null; };
  }, [owner, cancel]);

  const active = frame && frame.gesture.owner === owner ? frame : null;
  const live = useMemo(() => {
    if (!active?.delta) return session;
    const { plan, extrude, owner: { base } } = active.gesture;
    try {
      return plan ? previewCageProportionalDrag(plan, active.delta) : { ...base, ...dragged(base, active.delta, extrude) };
    } catch { return base; }
  }, [session, active]);

  let gizmo: TransformGizmo | null = null;
  const centre = owner && selectionCentre(owner.base);
  if (owner && centre) {
    // Viewport retains this gizmo's callbacks from the press through release.
    let gesture: CageDrag | null = null;
    const delta = active?.delta;
    gizmo = {
      sessionKey: owner,
      cancelOnEscape: true,
      origin: active?.gesture.plan && live ? selectionCentre(live) ?? centre
        : [centre[0] + (delta?.[0] ?? 0), centre[1] + (delta?.[1] ?? 0), centre[2] + (delta?.[2] ?? 0)],
      move: [0, 1, 2],
      onStart: (pointerId, shiftKey) => {
        if (ownerNow.current !== owner || held.current) return;
        try {
          const weighted = enabled && owner.base.mode === 'vertex';
          const plan = weighted ? planCageProportionalDrag(owner.base, radiusMM) : null;
          gesture = { owner, pointerId, extrude: shiftKey && owner.base.mode !== 'vertex', plan };
          held.current = gesture;
          setFrame({ gesture, delta: null });
        } catch (error) {
          fail('Cannot start proportional drag', error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error));
        }
      },
      onCancel: pointerId => {
        if (gesture && held.current === gesture && gesture.pointerId === pointerId) cancel();
      },
      onMove: (total, done, pointerId) => {
        if (!gesture || held.current !== gesture || gesture.pointerId !== pointerId || ownerNow.current !== owner) return;
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
    };
  }

  return {
    gizmo, live, dragging: !!active, extruding: !!active?.delta && active.gesture.extrude, isDragging, cancel, reset,
    influence: active?.gesture.plan?.weights,
    settings: {
      enabled, radius, radiusValid,
      setEnabled: (next: boolean) => { if (!isDragging()) setEnabled(next); },
      setRadius: (next: string) => { if (!isDragging()) setRadius(next); },
    },
  };
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { alignMove, gizmoAxes, movedInstance, previewMatrix, turnedInstance, type InstanceDrag } from '@barocss/cad-model/assembly/drag';
import type { Freedom } from '@barocss/cad-model/assembly/mates';
import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import type { TransformGizmo } from '../viewport/gizmo';

type Gesture = { owner: string; pointerId: number };
type Preview = { id: string; key: string; drag: InstanceDrag } & (
  { settling: false; gesture: Gesture } | { settling: true; documentSession: object; accepted: PartInstance }
);

interface Options {
  doc: StudioDoc;
  selectedId: string | undefined | null;
  enabled: boolean;
  bodies: readonly BodyResult[];
  instanceBodies: ReadonlyMap<string, { key: string; bodies: readonly BodyResult[] }>;
  freedom: Readonly<Record<string, Freedom>>;
  documentSession: object;
  open: object;
  sourceCurrent(): boolean;
  commit(instances: PartInstance[]): boolean;
}

let instanceGizmoSession = 0;

// Preview a selected occurrence in world axes. A release commits through the normal assembly edit.
export function useInstanceGizmo({
  doc, selectedId, enabled, bodies, instanceBodies, freedom, documentSession, open, sourceCurrent, commit,
}: Options) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const gestureNow = useRef<Gesture | null>(null);

  const selected = enabled && selectedId ? doc.instances?.find(instance => instance.id === selectedId) : undefined;
  // A generated occurrence follows its pattern seed.
  const axes = selected && !selected.pattern ? gizmoAxes(selected, freedom[selected.id]) : null;
  const entry = selected && instanceBodies.get(selected.id);
  const key = entry?.bodies.length ? entry.key : undefined;
  const canMove = !!axes?.move.length;
  const canTurn = !!axes?.turn.length;
  const owner = useMemo(() => selected && key !== undefined && (canMove || canTurn)
    ? `instance-placement:${++instanceGizmoSession}` : null,
  [doc, selected, key, canMove, canTurn, documentSession, open]);
  const ownerNow = useRef<string | null>(null);

  const instDrag = preview && (preview.settling
    ? preview.documentSession === documentSession && doc.instances?.includes(preview.accepted) && instanceBodies.get(preview.id)?.key === preview.key
    : preview.gesture.owner === owner) ? preview : null;

  useLayoutEffect(() => {
    ownerNow.current = owner;
    if (gestureNow.current?.owner !== owner) gestureNow.current = null;
    return () => { ownerNow.current = null; };
  }, [owner]);

  useEffect(() => {
    if (preview && !instDrag) {
      setPreview(current => current === preview ? null : current);
      return;
    }
    if (!instDrag?.settling) return;
    // The mates can put the part back without producing a different mesh key.
    const timer = setTimeout(() => setPreview(current => current === instDrag ? null : current), 3000);
    return () => clearTimeout(timer);
  }, [preview, instDrag]);

  const instancePreview = useMemo(() => instDrag
    ? { id: instDrag.id, matrix: previewMatrix(instDrag.drag) } : null, [instDrag]);

  if (!owner || !selected || !axes || !entry) return { instDrag, instancePreview, gizmo: null };

  const bounds = entry.bodies.map(body => body.mesh.bounds);
  const min = [0, 1, 2].map(axis => Math.min(...bounds.map(box => box.min[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...bounds.map(box => box.max[axis])));
  const centre = min.map((value, axis) => (value + max[axis]) / 2) as Vec3;
  const delta = instDrag?.id === selected.id && instDrag.drag.kind === 'move' ? instDrag.drag.delta : [0, 0, 0];

  const cancel = (gesture: Gesture) => {
    gestureNow.current = null;
    setPreview(current => current && !current.settling && current.gesture === gesture ? null : current);
  };
  const held = (pointerId?: number) => {
    const gesture = gestureNow.current;
    if (!gesture || gesture.owner !== owner || (pointerId !== undefined && pointerId !== gesture.pointerId)) return null;
    if (ownerNow.current !== owner || !sourceCurrent()) {
      cancel(gesture);
      return null;
    }
    return gesture;
  };
  const place = (gesture: Gesture, drag: InstanceDrag, done: boolean) => {
    const placement = { id: selected.id, key: entry.key, drag };
    if (!done) {
      setPreview({ ...placement, settling: false, gesture });
      return;
    }
    cancel(gesture);
    if (drag.kind === 'move' ? drag.delta.every(value => value === 0) : drag.degrees === 0) return;
    const next = drag.kind === 'move' ? movedInstance(selected, drag.delta)
      : turnedInstance(selected, drag.axis, drag.degrees, drag.centre);
    if (commit((doc.instances ?? []).map(instance => instance.id === selected.id ? next : instance))) {
      setPreview({ ...placement, settling: true, documentSession, accepted: next });
    }
  };
  const gizmo: TransformGizmo = {
    sessionKey: owner,
    origin: [centre[0] + delta[0], centre[1] + delta[1], centre[2] + delta[2]],
    move: axes.move,
    turn: axes.turn,
    onStart: pointerId => {
      if (ownerNow.current !== owner || !sourceCurrent()) return;
      gestureNow.current = { owner, pointerId };
      setPreview(null);
    },
    onCancel: pointerId => {
      const gesture = gestureNow.current;
      if (gesture?.owner === owner && gesture.pointerId === pointerId) cancel(gesture);
    },
    onMove: (raw, done, pointerId) => {
      const gesture = held(pointerId);
      if (!gesture) return;
      const others = [
        ...bodies.map(body => body.mesh.bounds),
        ...[...instanceBodies].filter(([id]) => id !== selected.id).flatMap(([, part]) => part.bodies.map(body => body.mesh.bounds)),
      ];
      const tolerance = Math.max(1, Math.max(...max.map((value, axis) => value - min[axis])) * 0.02);
      const delta = alignMove({ min, max }, others, raw, raw.map(value => value !== 0), tolerance).move;
      place(gesture, { kind: 'move', delta }, done);
    },
    onTurn: (axis, degrees, done) => {
      const gesture = held();
      if (!gesture) return;
      place(gesture, { kind: 'turn', axis, degrees, centre }, done);
    },
  };
  return { instDrag, instancePreview, gizmo };
}

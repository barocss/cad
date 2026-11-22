import { useRef, type PointerEvent } from 'react';
import { arcOf, type P2 } from '@barocss/cad-model/sketch/profile';
import type { Polygon } from '@barocss/cad-model/sketch/rules';
import { prepareSavedSketchCorner } from '../sketch/cornerDraft';
import type { ConstraintInspection, ConstraintInspectionStore } from '../sketch/constraintInspection';

type CornerDraft = Extract<ConstraintInspection, { target: 'corner' }>;
type Press = { id: number; origin: P2; value: number; before: CornerDraft; latest: CornerDraft };

export function SketchFilletRadiusHandle({ draft, source, store, project, pointUnderPointer }: {
  draft: CornerDraft; source: Polygon; store: ConstraintInspectionStore; project(point: P2): P2;
  pointUnderPointer(event: { clientX: number; clientY: number }): P2 | null;
}) {
  const press = useRef<Press | null>(null);
  const edge = draft.corners[0];
  const radius = source.radii?.[edge], bulge = source.bulges?.[edge];
  if (draft.operation !== 'resize-fillet' || !radius || !bulge) return null;
  const arc = arcOf(source.points[edge], source.points[(edge + 1) % source.points.length], bulge);
  const angle = arc.start + arc.sweep / 2;
  const direction: P2 = [Math.cos(angle), Math.sin(angle)];
  // As an orthogonal Fillet grows by one mm, its midpoint retreats from the fixed corner by sqrt(2) - 1 mm.
  const growth = Math.SQRT2 - 1;
  const position = (value: number) => project([
    arc.center[0] + (radius - (value - radius) * growth) * direction[0],
    arc.center[1] + (radius - (value - radius) * growth) * direction[1],
  ]);
  const displayed = 'shape' in draft.result ? draft.result.shape.radii?.[edge] ?? radius : radius;
  const at = position(displayed), next = position(displayed + 1);
  if (![...at, ...next].every(Number.isFinite) || Math.hypot(next[0] - at[0], next[1] - at[1]) < 0.1) return null;

  const preview = (current: CornerDraft, start: number, steps: number) => {
    const text = String(steps ? Number((start + steps / 10).toPrecision(15)) : start);
    if (current.value === text) return current;
    const result = prepareSavedSketchCorner(current.owner, source, current.doc,
      { edge, operation: 'resize-fillet', value: radius }, text);
    const update = { ...current, input: 'pointer' as const, value: text, result };
    store.set(update);
    return update;
  };
  const cancel = (event: PointerEvent<HTMLButtonElement>) => {
    const held = press.current;
    if (held?.id !== event.pointerId) return;
    press.current = null;
    if (store.get() === held.latest) store.set(held.before);
  };

  return <button type="button" className="sk-fillet-radius-handle" aria-label="Fillet radius handle"
    title="Drag Fillet radius" data-sketch-action style={{ left: at[0], top: at[1] }}
    onPointerDown={event => {
      if (event.button !== 0 || press.current || store.get() !== draft) return;
      const origin = pointUnderPointer(event);
      if (!origin) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      press.current = { id: event.pointerId, origin, value: displayed, before: draft, latest: draft };
    }}
    onPointerMove={event => {
      const held = press.current;
      if (held?.id !== event.pointerId || store.get() !== held.latest) return;
      const point = pointUnderPointer(event);
      if (!point) return;
      const delta = -((point[0] - held.origin[0]) * direction[0] + (point[1] - held.origin[1]) * direction[1]) / growth;
      if (Number.isFinite(delta)) {
        const steps = Math.round(delta * 10);
        if (!steps && held.latest === held.before) return;
        held.latest = preview(held.latest, held.value, steps);
      }
    }}
    onPointerUp={event => { if (press.current?.id === event.pointerId) press.current = null; }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={event => {
      const steps = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0;
      if (!steps || store.get() !== draft) return;
      event.preventDefault();
      event.stopPropagation();
      preview(draft, displayed, steps);
    }} />;
}

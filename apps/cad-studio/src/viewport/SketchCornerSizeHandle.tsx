import { useRef, type PointerEvent } from 'react';
import { arcOf, type P2 } from '@barocss/cad-model/sketch/profile';
import type { Polygon } from '@barocss/cad-model/sketch/rules';
import { prepareSavedSketchCorners, type SavedSketchCorners } from '../sketch/cornerDraft';
import type { ConstraintInspection, ConstraintInspectionStore } from '../sketch/constraintInspection';

type CornerDraft = Extract<ConstraintInspection, { target: 'corner' }>;
type Press = { id: number; origin: P2; value: number; before: CornerDraft; latest: CornerDraft };
type SizeOperation = SavedSketchCorners['operation'];

function savedSize(shape: Polygon, edge: number, operation: SizeOperation): number | undefined {
  if (operation === 'resize-fillet') return shape.radii?.[edge];
  const diagonal = shape.lengths?.[edge];
  return diagonal === undefined ? undefined : diagonal / Math.SQRT2;
}

function midpointTravel(source: Polygon, edge: number, operation: SizeOperation, size: number): { midpoint: P2; step: P2 } | null {
  const n = source.points.length;
  const a = source.points[edge], b = source.points[(edge + 1) % n];
  const bulge = source.bulges?.[edge];
  if (operation === 'resize-fillet') {
    if (!bulge) return null;
    const arc = arcOf(a, b, bulge);
    const angle = arc.start + arc.sweep / 2;
    const x = Math.cos(angle), y = Math.sin(angle);
    // The orthogonal Fillet midpoint moves away from its fixed corner as the radius grows.
    const growth = 1 - Math.SQRT2;
    return { midpoint: [arc.center[0] + size * x, arc.center[1] + size * y], step: [growth * x, growth * y] };
  }
  const previous = source.points[(edge - 1 + n) % n], next = source.points[(edge + 2) % n];
  const incoming: P2 = [a[0] - previous[0], a[1] - previous[1]];
  const outgoing: P2 = [next[0] - b[0], next[1] - b[1]];
  const inLength = Math.hypot(...incoming), outLength = Math.hypot(...outgoing);
  if (!inLength || !outLength || bulge) return null;
  // Each bevel end moves by the added setback along its own straight carrier.
  return { midpoint: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    step: [(outgoing[0] / outLength - incoming[0] / inLength) / 2,
      (outgoing[1] / outLength - incoming[1] / inLength) / 2] };
}

export function SketchCornerSizeHandle({ draft, source, store, project, pointUnderPointer }: {
  draft: CornerDraft; source: Polygon; store: ConstraintInspectionStore; project(point: P2): P2;
  pointUnderPointer(event: { clientX: number; clientY: number }): P2 | null;
}) {
  const press = useRef<Press | null>(null);
  const resize = draft.resize;
  if (!resize) return null;
  const [edge] = resize.edges;
  const { operation } = resize;
  const size = savedSize(source, edge, operation);
  if (!size) return null;
  const frame = midpointTravel(source, edge, operation, size);
  if (!frame) return null;
  const { midpoint, step } = frame;
  const position = (value: number) => project([
    midpoint[0] + (value - size) * step[0],
    midpoint[1] + (value - size) * step[1],
  ]);
  const displayed = 'shape' in draft.result ? savedSize(draft.result.shape, edge, operation) ?? size : size;
  const at = position(displayed), next = position(displayed + 1);
  if (![...at, ...next].every(Number.isFinite) || Math.hypot(next[0] - at[0], next[1] - at[1]) < 0.1) return null;

  const preview = (current: CornerDraft, start: number, steps: number) => {
    const text = String(steps ? Number((start + steps / 10).toPrecision(15)) : start);
    if (current.value === text) return current;
    const result = prepareSavedSketchCorners(current.owner, source, current.doc, resize, text);
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

  const label = operation === 'resize-fillet' ? 'Fillet radius' : 'Chamfer setback';
  return <button type="button" className="sk-corner-size-handle" aria-label={label + ' handle'}
    title={'Drag ' + label} data-sketch-action style={{ left: at[0], top: at[1] }}
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
      const delta = ((point[0] - held.origin[0]) * step[0] + (point[1] - held.origin[1]) * step[1]) /
        (step[0] ** 2 + step[1] ** 2);
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

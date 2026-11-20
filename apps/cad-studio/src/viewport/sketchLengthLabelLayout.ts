import { useLayoutEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react';
import type { Polygon } from '@barocss/cad-model/sketch/rules';
import type { SketchState } from '@barocss/cad-model/sketch/types';

type XY = [number, number];
type LabelPointer = PointerEvent<SVGGElement>;

export interface SketchLengthLabel {
  shape: Polygon;
  index: number;
  normal: XY;
  pixelsPerMillimeter: number;
  automatic: number;
}

interface Press {
  pointerId: number;
  target: SVGGElement;
  label: SketchLengthLabel;
  start: XY;
  initial: number | undefined;
  preview: number | undefined;
  moved: boolean;
}

/** A viewport-only layout for one sketch editing session. Offsets are in millimetres. */
function createSketchLengthLabelLayout(redraw: () => void) {
  const offsets = new Map<string, number>();
  // An unfinished document may have local outlines before they receive side IDs.
  // The H/V record survives dimension edits but changes with outline topology.
  const localOffsets = new WeakMap<object, Map<number, number>>();
  const clicks = new WeakMap<SVGGElement, { moved: boolean; blocked: boolean }>();
  let press: Press | null = null;

  function read({ shape, index }: SketchLengthLabel) {
    const id = shape.ids?.[index];
    return id ? offsets.get(id) : localOffsets.get(shape.hv ?? shape)?.get(index);
  }

  function write({ shape, index }: SketchLengthLabel, offset: number | undefined) {
    const id = shape.ids?.[index];
    if (id) {
      if (offset === undefined) offsets.delete(id);
      else offsets.set(id, offset);
    } else {
      const owner = shape.hv ?? shape;
      if (offset === undefined) localOffsets.get(owner)?.delete(index);
      else {
        const positions = localOffsets.get(owner) ?? new Map<number, number>();
        positions.set(index, offset);
        localOffsets.set(owner, positions);
      }
    }
  }

  function update(event: LabelPointer, active: Press) {
    const dx = event.clientX - active.start[0], dy = event.clientY - active.start[1];
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    active.moved = true;
    const { automatic, normal, pixelsPerMillimeter } = active.label;
    const travel = dx * normal[0] + dy * normal[1];
    const offset = Math.abs(travel) < 0.01 ? active.initial : (active.initial ?? automatic) + travel / pixelsPerMillimeter;
    if (offset === active.preview || (offset !== undefined && !Number.isFinite(offset))) return;
    active.preview = offset;
    redraw();
  }

  function end(active: Press, cancelled: boolean) {
    const state = clicks.get(active.target) ?? { moved: false, blocked: false };
    state.moved = active.moved || cancelled;
    clicks.set(active.target, state);
    press = null;
    if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
    if (cancelled && active.target.isConnected && active.preview !== active.initial) redraw();
  }

  return {
    position(label: SketchLengthLabel) {
      return press?.label.shape === label.shape && press.label.index === label.index ? press.preview : read(label);
    },
    reset(label: SketchLengthLabel) {
      write(label, undefined);
      redraw();
    },
    cancel() {
      if (!press) return false;
      end(press, true);
      return true;
    },
    handlers(label: SketchLengthLabel, select: () => void, edit: () => void) {
      return {
        onPointerDown(event: LabelPointer) {
          event.stopPropagation();
          event.preventDefault();
          if (event.button !== 0 || !event.isPrimary || press) return;
          const target = event.currentTarget;
          target.setPointerCapture(event.pointerId);
          const initial = read(label);
          press = { pointerId: event.pointerId, target, label, start: [event.clientX, event.clientY], initial, preview: initial, moved: false };
        },
        onPointerMove(event: LabelPointer) {
          if (press?.pointerId === event.pointerId) update(event, press);
        },
        onPointerUp(event: LabelPointer) {
          if (press?.pointerId !== event.pointerId) return;
          const active = press;
          update(event, active);
          if (active.moved && active.initial !== active.preview) write(active.label, active.preview);
          end(active, false);
          if (!active.moved) select();
        },
        onPointerCancel(event: LabelPointer) {
          if (press?.pointerId === event.pointerId) end(press, true);
        },
        onLostPointerCapture(event: LabelPointer) {
          if (press?.pointerId === event.pointerId) end(press, true);
        },
        onClick(event: MouseEvent<SVGGElement>) {
          const state = clicks.get(event.currentTarget);
          if (state) state.blocked = state.moved || (event.detail > 1 && state.blocked);
        },
        onDoubleClick(event: MouseEvent<SVGGElement>) {
          event.stopPropagation();
          if (!clicks.get(event.currentTarget)?.blocked) edit();
        },
      };
    },
  };
}

export type SketchLengthLabelLayout = ReturnType<typeof createSketchLengthLabelLayout>;

export function useSketchLengthLabelLayout(sketch: SketchState | null, redraw: () => void): SketchLengthLabelLayout {
  const { plane, editNode, shape, tool, editDim } = sketch ?? {};
  // Each start or reopen creates a plane object. Its identity spans draft changes.
  const layout = useMemo(() => createSketchLengthLabelLayout(redraw), [redraw, plane, editNode]);
  const activeLayout = useRef(layout);
  useLayoutEffect(() => {
    activeLayout.current = layout;
    // A changed interaction owner cancels the pointer without saving its preview.
    return () => { layout.cancel(); };
  }, [layout, shape, tool, editDim]);

  useLayoutEffect(() => {
    let consumedEscape = false;
    const cancel = () => { activeLayout.current.cancel(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!event.repeat) consumedEscape = activeLayout.current.cancel();
      if (!consumedEscape) return;
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    // Register before Studio's passive Escape handlers. Keep the order on sketch changes.
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', cancel);
    };
  }, []);

  return layout;
}

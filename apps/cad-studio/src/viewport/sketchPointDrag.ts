import type { P2 } from '@barocss/cad-model/sketch/profile';
import type { Polygon } from '@barocss/cad-model/sketch/rules';
import { canDragOutlinePoint, dragOutlinePoint } from '@barocss/cad-model/sketch/pointDrag';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { snapTo } from './gizmo';

export function pointDragOutline(sketch: SketchState | null) {
  if (sketch?.tool !== 'select' || sketch.editDim || sketch.association || sketch.base || sketch.band ||
    sketch.anchor?.face?.linkSource || sketch.done?.some(shape => !shape.construction)) return null;
  return canDragOutlinePoint(sketch.shape) ? sketch.shape : null;
}

export interface SketchPointPress {
  owner: SketchState;
  outline: Polygon;
  point: number;
  pointer: number;
  frame: string;
  pixel: P2;
  at: P2;
  active: boolean;
  target?: P2;
  last?: Polygon;
}

export function advanceSketchPointPress(press: SketchPointPress, pixel: P2, at: P2, step: number, fine: boolean) {
  if (!press.active && Math.hypot(pixel[0] - press.pixel[0], pixel[1] - press.pixel[1]) <= 5) return;
  press.active = true;
  const grid = fine ? Math.max(0.001, step / 10) : Math.max(0.001, step);
  const from = press.outline.points[press.point];
  const target: P2 = [from[0] + snapTo(at[0] - press.at[0], grid), from[1] + snapTo(at[1] - press.at[1], grid)];
  if (press.target?.[0] === target[0] && press.target[1] === target[1]) return;
  press.target = target;
  if (target[0] === from[0] && target[1] === from[1]) { press.last = undefined; return; }
  const next = dragOutlinePoint(press.outline, press.point, target);
  if (next) press.last = next === press.outline ? undefined : next;
}

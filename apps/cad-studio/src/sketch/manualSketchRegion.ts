import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { arcOf } from '@barocss/cad-model/sketch/profile';
import { bandLoops } from '@barocss/cad-model/sketch/band';
import { sketchRegion, draftShapeOrder } from '../app/sketchControls';
type P2 = [number, number];
type Bounds = [P2, P2];
const TAU = 2 * Math.PI;
const positiveAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;
function include(bounds: Bounds, point: P2): void {
  if (!point.every(Number.isFinite)) return;
  for (const axis of [0, 1]) { bounds[0][axis] = Math.min(bounds[0][axis], point[axis]); bounds[1][axis] = Math.max(bounds[1][axis], point[axis]); }
}
function circle(bounds: Bounds, center: P2, radius: number): void {
  if (!Number.isFinite(radius)) return;
  const r = Math.abs(radius);
  include(bounds, [center[0] - r, center[1] - r]); include(bounds, [center[0] + r, center[1] + r]);
}
function shapeBounds(bounds: Bounds, shape: SketchShape): void {
  switch (shape.kind) {
    case 'rectangle': include(bounds, shape.a); include(bounds, shape.b); break;
    case 'circle': circle(bounds, shape.c, shape.r); break;
    case 'slot': circle(bounds, shape.a, shape.r); circle(bounds, shape.b, shape.r); break;
    // Polynomial Bezier curves stay within their control hull. This is a conservative framing bound, not a geometry measurement.
    case 'bezier': for (const point of shape.poles) include(bounds, point); break;
    case 'polygon': {
      for (const point of shape.points) include(bounds, point);
      for (const attached of shape.circles ?? []) circle(bounds, attached.c, attached.r);
      const n = shape.points.length;
      for (let i = 0; i < (shape.closed ? n : n - 1); i++) {
        const bulge = shape.bulges?.[i] ?? 0, a = shape.points[i], b = shape.points[(i + 1) % n];
        if (!bulge || !Number.isFinite(bulge) || !a.every(Number.isFinite) || !b.every(Number.isFinite) || (a[0] === b[0] && a[1] === b[1])) continue;
        const arc = arcOf(a, b, bulge);
        for (let quarter = 0; quarter < 4; quarter++) {
          const angle = quarter * Math.PI / 2;
          const swept = positiveAngle(arc.sweep < 0 ? arc.start - angle : angle - arc.start);
          if (swept <= Math.abs(arc.sweep) + 1e-12)
            include(bounds, [arc.center[0] + arc.radius * Math.cos(angle), arc.center[1] + arc.radius * Math.sin(angle)]);
        }
      }
    }
  }
}
/** Manual recovery includes the current draft; automatic reopen framing intentionally keeps its prior contract. */
export function manualSketchRegion(bodies: BodyResult[], sketch: SketchState, parameters: Readonly<Record<string, number>> = {}): Bounds {
  const bounds = sketchRegion(bodies, sketch.plane), shapes = draftShapeOrder(sketch);
  for (const shape of shapes) if (!shape.construction || !sketch.hideConstruction) shapeBounds(bounds, shape);
  if (sketch.band) {
    const band = bandLoops(shapes, sketch.band, parameters);
    if (!('error' in band)) for (const loop of [band.outer, ...(band.hole ? [band.hole] : [])]) {
      for (const segment of loop) {
        const [x, y] = segment.start;
        if (typeof x !== 'number' || typeof y !== 'number') continue;
        include(bounds, [x, y]);
        // Band arcs use their source circles as conservative bounds, also covering seam extrema.
        if (segment.kind === 'arc') {
          const [cx, cy] = segment.center;
          if (typeof cx === 'number' && typeof cy === 'number') circle(bounds, [cx, cy], Math.hypot(x - cx, y - cy));
        }
      }
    }
  }
  return bounds;
}

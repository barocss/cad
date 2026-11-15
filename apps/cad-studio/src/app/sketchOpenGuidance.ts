import type { SketchShape } from '@barocss/cad-model/sketch/types';
type Polygon = Extract<SketchShape, { kind: 'polygon' }>;
/** Mirrors the existing Line/Arc pointer closure threshold; not a geometry validity test. */
export function openChainGuidance(shape: Polygon, tool?: string): string {
  if (shape.pending) return 'Move to bend the arc, click to place it';
  const canClose = shape.points.length >= 2 && (shape.points.length >= 3 || tool === 'arc' || shape.bulges?.some(Boolean));
  return canClose ? 'Open profile · click the first point to close' : 'Open profile · add the next point';
}
/** Same unfinished material-chain eligibility as Finish; one location reports actions and endpoints. */
export function openChainFinishGuidance(shapes: readonly SketchShape[]): string {
  const chains = shapes.filter((shape): shape is Polygon => shape.kind === 'polygon' && !shape.construction
    && shape.points.length >= 2 && (!shape.closed || !!shape.pending));
  return chains.map((shape, index) => {
    const first = shape.points[0].join(', '), last = shape.points[shape.points.length - 1].join(', ');
    const action = shape.pending ? 'Place the last arc or trim'
      : shape.points.length < 3 && !shape.bulges?.some(Boolean) ? 'Add another point before closing, close with an arc, or trim'
        : 'Close or trim';
    return `${action} the open chain${chains.length > 1 ? ` ${index + 1}` : ''} from (${first}) to (${last}) mm.`;
  }).join(' ');
}

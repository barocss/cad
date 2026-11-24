import { isViewId, type DrawingDimension, type XY } from '@barocss/cad-model/drawing/types';
import type { Sheet } from '@barocss/cad-model/drawing/sheet';

type LinearDimension = Extract<DrawingDimension, { kind: 'linear' }>;
export type DrawingDimensionPair = readonly [LinearDimension, LinearDimension];

/** Require two distinct current annotations in the same ordinary view. */
export function drawingDimensionPair(local: readonly DrawingDimension[], whole: readonly DrawingDimension[],
  ids: readonly [string, string], resolved: (dimension: LinearDimension) => boolean): DrawingDimensionPair | undefined {
  if (ids[0] === ids[1]) return;
  const [a, b] = ids.map(id => local.find(dimension => dimension.id === id));
  if (a?.kind !== 'linear' || b?.kind !== 'linear' || a.orient === 'aligned' || a.orient !== b.orient ||
      a.view !== b.view || !isViewId(a.view) || ids.some(id => whole.filter(dimension => dimension.id === id).length !== 1) ||
      !resolved(a) || !resolved(b)) return;
  return [a, b];
}

const dimensionPairPaperAxis = (pair: DrawingDimensionPair) => pair[0].orient === 'horizontal' ? 1 : 0;

export function dimensionPairPaperDelta(pair: DrawingDimensionPair, start: XY, current: XY): number {
  const axis = dimensionPairPaperAxis(pair);
  return Math.round((current[axis] - start[axis]) * 10) / 10;
}

/** Apply one paper-space delta to both authored placements without changing their orientation. */
export function moveDrawingDimensionPair(dimensions: DrawingDimension[], pair: DrawingDimensionPair,
  scale: number, paperDelta: number): DrawingDimension[] {
  if (!paperDelta || !Number.isFinite(paperDelta) || !Number.isFinite(scale) || scale <= 0 ||
      pair.some(dimension => !dimensions.includes(dimension))) return dimensions;
  const axis = dimensionPairPaperAxis(pair), delta = (axis === 1 ? -paperDelta : paperDelta) / scale;
  if (pair.some(dimension => !Number.isFinite(dimension.place[axis] + delta))) return dimensions;
  return dimensions.map(dimension => {
    if (dimension !== pair[0] && dimension !== pair[1]) return dimension;
    const place: [number, number] = [...dimension.place];
    place[axis] += delta;
    return { ...dimension, place };
  });
}

/** The sheet can clear short labels automatically. Commit only the paper move the user can see. */
export function dimensionPairLabelsMoved(before: Sheet, after: Sheet, pair: DrawingDimensionPair, paperDelta: number): boolean {
  const axis = dimensionPairPaperAxis(pair), tolerance = 1e-7;
  const groups = before.groups.filter(group => group.role === 'dimension');
  const rendered = new Map(after.groups.filter(group => group.role === 'dimension').map(group => [group.id, group]));
  if (groups.length !== rendered.size || pair.some(dimension => !groups.some(group => group.id === dimension.id))) return false;
  return groups.every(group => {
    const texts = group.marks.filter(mark => mark.kind === 'text');
    const moved = rendered.get(group.id)?.marks.filter(mark => mark.kind === 'text');
    const selected = pair.some(dimension => dimension.id === group.id);
    return !!moved && moved.length === texts.length && (!selected || texts.length > 0) &&
      texts.every((mark, i) => mark.text === moved[i].text && mark.angle === moved[i].angle &&
        mark.at.every((value, k) => Math.abs(moved[i].at[k] - value - (selected && k === axis ? paperDelta : 0)) < tolerance));
  });
}

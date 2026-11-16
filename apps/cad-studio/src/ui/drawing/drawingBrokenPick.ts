import type { BrepProjection } from '@barocss/cad';
import { clipProjectionOutside, type ViewBreak } from '@barocss/cad-model/drawing/breaks';
import { edgeAt, type SnapPoint } from '@barocss/cad-model/drawing/dimensions';
import type { XY } from '@barocss/cad-model/drawing/types';

/** Strict interior only: the two drawn band boundaries remain eligible. */
export const insideDrawingBreak = (at: XY, breaks: readonly ViewBreak[] = []): boolean =>
  breaks.some(b => at[b.axis] > b.from && at[b.axis] < b.to);

/** Also used by Angle's near-endpoint fallback, which must not bypass the displayed break. */
export function drawingBrokenEdgeAt(pr: BrepProjection, at: XY, tolerance: number, breaks: readonly ViewBreak[] = []) {
  if (insideDrawingBreak(at, breaks)) return null;
  return edgeAt(breaks.length ? clipProjectionOutside(pr, breaks) : pr, at, tolerance);
}

/** Keep original references; clipping contributes hit-test ink, never newly invented snap endpoints. */
export function drawingBrokenPick(pr: BrepProjection, snaps: readonly SnapPoint[], at: XY,
  snapTolerance: number, edgeTolerance: number, breaks: readonly ViewBreak[] = []) {
  if (insideDrawingBreak(at, breaks)) return { snap: null, edge: null };
  let snap: SnapPoint | null = null, best = snapTolerance;
  for (const candidate of snaps) {
    if (insideDrawingBreak(candidate.at, breaks)) continue;
    const distance = Math.hypot(candidate.at[0] - at[0], candidate.at[1] - at[1]);
    if (distance < best) { best = distance; snap = candidate; }
  }
  return { snap, edge: snap ? null : drawingBrokenEdgeAt(pr, at, edgeTolerance, breaks) };
}

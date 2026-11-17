import type { SketchState } from '@barocss/cad-model/sketch/types';
import { sketchCutInputs } from '../app/sketchControls';

/** Read-only disclosure of the existing cut-input policy, not a crossing test. */
export function TrimBoundaryGuidance({ sketch }: { sketch: SketchState }) {
  if (sketch.tool !== 'trim') return null;
  const { protectedShapes } = sketchCutInputs(sketch);
  // Bézier has no pieces in Model trim.ts; a polygon needs at least one piece.
  const boundary = protectedShapes && [...protectedShapes].some(shape => shape.kind !== 'bezier'
    && (shape.kind !== 'polygon' || shape.points.length >= 2));
  return boundary ? <p className="muted small" role="status" aria-label="Hidden construction trimming boundaries">
    Hidden construction can still act as trimming boundaries for click and drag Trim. Use Show construction to inspect those boundaries.
  </p> : null;
}

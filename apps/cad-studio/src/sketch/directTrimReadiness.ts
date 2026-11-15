import type { SketchState } from '@barocss/cad-model/sketch/types';
import { sketchCutInputs } from '../app/sketchControls';

/** The existing direct-trim storage boundary, not a promise that native Trim will succeed. */
export function directTrimRestriction(active: SketchState): string | null {
  return active.editNode !== undefined || sketchCutInputs(active).shapes.some(shape => shape.ids?.length)
    ? 'Direct Trim requires a new sketch without stored edge IDs.' : null;
}

/** Keep the owned scan, occurrence and mounted action on native refusal. */
export function applyOverlaidTrim(next: SketchState, trim: (next: SketchState) => boolean, clear: () => void): void {
  if (trim(next)) clear();
}

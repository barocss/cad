import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchState } from '@barocss/cad-model/sketch/types';

/** A recovery action cannot follow an edited, replaced or re-opened draft. */
export function ownsEllipseAxesRecovery(receipt: { doc: StudioDoc; draft: SketchState } | undefined,
  doc: StudioDoc, draft: SketchState | null): boolean {
  return !!receipt && receipt.doc === doc && receipt.draft === draft;
}

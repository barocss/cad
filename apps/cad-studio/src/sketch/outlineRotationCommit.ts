import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';

/** Read live ownership at action time, including changes not rendered by React yet. */
export function commitOutlineRotation(owner: SketchState, doc: StudioDoc, candidate: SketchShape,
  current: { doc: StudioDoc; rendered: SketchState | null; liveShape: SketchShape | null; generation: number; renderedGeneration: number },
  commit: (shape: SketchShape) => void): boolean {
  if (current.doc !== doc || current.rendered !== owner || current.liveShape !== owner.shape
    || current.generation !== current.renderedGeneration) return false;
  if (candidate !== owner.shape) commit(candidate);
  return true;
}

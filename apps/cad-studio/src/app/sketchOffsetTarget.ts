import { shapeNode } from '@barocss/cad-model/sketch/loops';
import type { SketchState } from '../viewport/Viewport';
import { draftShapeOrder } from './sketchControls';

/** The existing offset target: active closed shape, otherwise the latest completed closed outline. */
export function sketchOffsetTarget(sketch: SketchState) {
  const shape = sketch.shape && shapeNode(sketch.shape) ? sketch.shape
    : [...(sketch.done ?? [])].reverse().find(candidate => !candidate.construction && shapeNode(candidate));
  return shape ? { shape, index: draftShapeOrder(sketch).indexOf(shape) } : null;
}
export function sketchOffsetReadiness(sketch: SketchState, linkedInsetAvailable: boolean) {
  const target = sketchOffsetTarget(sketch);
  const canLinkInset = linkedInsetAvailable && !sketch.association && !sketch.shape && !sketch.done?.length;
  return { target, canLinkInset, showDistance: !!target || canLinkInset };
}

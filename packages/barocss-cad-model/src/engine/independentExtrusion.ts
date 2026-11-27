import type { StudioDoc } from './doc';

export function independentExtrusionProfile(doc: StudioDoc, sketchIndex: number): 'rectangle' | 'circle' | undefined {
  const extrudeIndex = sketchIndex + 1;
  const sketch = doc.nodes[sketchIndex], extrude = doc.nodes[extrudeIndex];
  if (sketch?.kind !== 'sketch' || (sketch.profile !== 'rectangle' && sketch.profile !== 'circle') || sketch.suppressed || sketch.held
    || sketch.on || sketch.plane || sketch.association || sketch.pocketFloor || sketch.outline
    || sketch.regions?.length || sketch.holes?.length || sketch.holeOutlines?.length
    || extrude?.kind !== 'extrude' || extrude.sketch !== sketchIndex || extrude.suppressed || extrude.held
    || extrude.draft !== undefined || extrude.from !== undefined || extrude.cutDepth !== undefined
    || typeof extrude.height !== 'number' || !Number.isFinite(extrude.height) || extrude.height <= 0) return;
  const dimensions = sketch.profile === 'rectangle' ? [...sketch.min, ...sketch.max] : [...sketch.center, sketch.radius];
  if (!dimensions.every(n => typeof n === 'number' && Number.isFinite(n))
    || (sketch.profile === 'circle' && !(Number(sketch.radius) > 0))) return;
  return sketch.profile;
}

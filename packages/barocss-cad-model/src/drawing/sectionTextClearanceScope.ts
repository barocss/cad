import type { StudioDoc } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { boughtOf } from '../engine/elements';
import type { DrawingSettings } from './types';
import { drawingScopeOf, drawsMadeOnly } from './scope';

/** Source admission only: inspect the original document before drawingDocument removes instances. */
export function sectionTextClearanceSource(source: StudioDoc, settings: DrawingSettings): boolean {
  try {
    const scope = drawingScopeOf(settings);
    return scope.kind === 'part' && scope.part === undefined && scope.body === undefined
      && !source.instances?.length && drawsMadeOnly(settings);
  } catch { return false; }
}
/** Transient SVG-only eligibility. Unknown native cardinality/ownership never means one made body. */
export function sectionTextClearanceScope(source: StudioDoc, evaluated: StudioDoc, settings: DrawingSettings,
  bodies: readonly Pick<BodyResult, 'ref' | 'family' | 'topology' | 'element'>[] | undefined): boolean {
  if (!sectionTextClearanceSource(source, settings) || evaluated.instances?.length || bodies?.length !== 1) return false;
  const body = bodies[0], index = body.ref?.node;
  if (index === undefined || !Number.isInteger(index) || index < 0 || body.family === 'mesh'
    || body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1 || body.topology.openShells !== 0 || body.topology.boundaryEdges !== 0) return false;
  const node = evaluated.nodes[index];
  return !!node && !boughtOf(node, body.element).bought;
}

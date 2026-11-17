import { analyzeSurface, geometryOf, type DirectGeometry } from '@barocss/cad-model/engine/direct';
import { kept } from '@barocss/cad-model/engine/trim';

/** Inspector classification only: the display's stored UV loops, not a topology certificate.
 * No retained result: every read belongs to the supplied current immutable source. */
export function inspectSurfacePoint(direct: DirectGeometry, id: string, u: number, v: number) {
  // Preserve the native analysis/domain refusal and its support-surface numbers.
  const analysis = analyzeSurface(direct, id, u, v);
  const objects = direct.objects.filter(object => object.id === id);
  if (objects.length !== 1) throw new Error('Select one current surface to inspect.');
  const object = objects[0], geometry = geometryOf(direct, object);
  if (geometry.kind !== 'surface') throw new Error('Select one current surface to inspect.');
  const loops = object.trims ?? [];
  const region = !loops.length ? 'Untrimmed support surface'
    : kept(loops, geometry, u, v) ? 'Remaining surface (stored trim loops; boundary included)'
      : 'Removed region of support surface (stored trim loops)';
  return { ...analysis, region };
}

export function surfaceIsoScope(trimmed: boolean): string {
  return trimmed ? 'Iso-curve uses the whole support surface; stored trim loops are not applied.'
    : 'Iso-curve uses the whole untrimmed support surface.';
}

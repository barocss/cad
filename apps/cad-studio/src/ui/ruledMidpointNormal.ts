import { analyzeSurface, directOps, domainsOf, type DirectGeometry } from '@barocss/cad-model/engine/direct';

/** A read-only preview of one point, not a global orientation or Thicken admission claim. */
export function ruledMidpointNormal(direct: DirectGeometry, first: string, second: string): readonly number[] | null {
  try {
    const preview = directOps.ruledSurface(direct, first, second), object = preview.objects.at(-1)!;
    const domain = domainsOf(preview, object.id);
    if (domain.kind !== 'surface') return null;
    return analyzeSurface(preview, object.id, (domain.u[0] + domain.u[1]) / 2, (domain.v[0] + domain.v[1]) / 2).normal;
  } catch { return null; }
}

import type { DisplayFace } from '@barocss/cad-model/engine/mesh';
/** Display native planar support, not the tessellator's curved-chart classification. */
export function selectedFaceGeometry(face: DisplayFace, fresh: boolean) {
  if (!fresh) return { label: 'Unknown', normal: undefined };
  const normal = face.exact?.kind === 'plane' ? face.exact.n : face.kind === 'plane' ? face.normal : undefined;
  if (normal && normal.length === 3 && normal.every(Number.isFinite) && Math.hypot(...normal) > 0)
    return { label: 'Planar', normal };
  return { label: normal ? 'Unknown' : 'Curved', normal: undefined };
}

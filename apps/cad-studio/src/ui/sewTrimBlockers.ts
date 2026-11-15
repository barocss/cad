import type { DirectGeometry } from '@barocss/cad-model/engine/direct';

/** UI guidance only; the model remains the authority for Sew admission. */
export function sewTrimBlockers(objects: DirectGeometry['objects']) {
  return objects.flatMap((object, index) => object.trims && object.trims.length > 0
    ? [{ id: object.id, name: object.name, position: index + 1 }] : []);
}

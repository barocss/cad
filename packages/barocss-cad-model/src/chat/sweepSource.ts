import type { Curve } from '@barocss/cad';
import { sweepPath } from '../app/profileCommands';
import type { StudioDoc } from '../engine/doc';
import type { DirectGeometry, DirectObject } from '../engine/direct';
import { loadDirect } from '../engine/directModule';
import { digestOf } from '../util/digest';

function curveRevision(geometry: Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>) {
  const { degree, knots, controlPoints, weights } = geometry;
  return digestOf({ degree, knots, controlPoints, weights });
}

export async function visibleSweepCurves(direct: DirectGeometry | undefined) {
  if (!direct?.objects.length) return [];
  const { geometryOf } = await loadDirect(), unique = new Map<string, DirectObject | null>();
  for (const object of direct.objects) unique.set(object.id, unique.has(object.id) ? null : object);
  return [...unique.values()].flatMap(object => {
    if (!object || object.hidden) return [];
    try {
      const geometry = geometryOf(direct, object);
      return geometry.kind === 'curve' ? [{ id: object.id, name: object.name, revision: curveRevision(geometry) }] : [];
    } catch { return []; }
  });
}

export async function sweepSourceRevision(doc: StudioDoc, id: string): Promise<{ error: string } | { revision: string }> {
  await loadDirect();
  const source = sweepPath(doc, [id]);
  return typeof source === 'string' ? { error: source } : { revision: curveRevision(source.path) };
}

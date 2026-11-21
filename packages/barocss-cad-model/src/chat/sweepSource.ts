import { surfaceDomain, type Curve } from '@barocss/cad';
import { sweepPath } from '../app/profileCommands';
import type { StudioDoc } from '../engine/doc';
import type { DirectGeometry, DirectObject } from '../engine/direct';
import { loadDirect } from '../engine/directModule';
import { digestOf } from '../util/digest';
import { revisionContent } from '../util/revision';

/** The read pin covers authored Direct sources and objects in addition to the usual part revision fields. */
export const directInspectionRevision = (doc: StudioDoc) => digestOf({ part: revisionContent(doc), direct: doc.direct });

function curveRevision(geometry: Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>) {
  const { degree, knots, controlPoints, weights } = geometry;
  return digestOf({ degree, knots, controlPoints, weights });
}

export async function visibleDirectGeometry(direct: DirectGeometry | undefined) {
  const curves: { id: string; name: string; revision: string }[] = [];
  const surfaces: { id: string; name: string; u: [number, number]; v: [number, number] }[] = [];
  if (!direct?.objects.length) return { curves, surfaces };
  const { geometryOf } = await loadDirect(), unique = new Map<string, DirectObject | null>();
  for (const object of direct.objects) unique.set(object.id, unique.has(object.id) ? null : object);
  for (const object of unique.values()) {
    if (!object || object.hidden) continue;
    const { id, name } = object;
    try {
      const geometry = geometryOf(direct, object);
      if (geometry.kind === 'curve') curves.push({ id, name, revision: curveRevision(geometry) });
      else if (!object.trims?.length) surfaces.push({ id, name, ...surfaceDomain(geometry) });
    } catch { /* An unreadable source cannot be offered as a target. */ }
  }
  return { curves, surfaces };
}

export async function sweepSourceRevision(doc: StudioDoc, id: string): Promise<{ error: string } | { revision: string }> {
  await loadDirect();
  const source = sweepPath(doc, [id]);
  return typeof source === 'string' ? { error: source } : { revision: curveRevision(source.path) };
}

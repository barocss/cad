import { CadPartError } from '@barocss/cad';
import { holeCentres, HOLE_PLANE, type StudioDoc } from './doc';
import { featureId } from './ids';
import type { FriendlyError } from './errors';

/** Enrich only a native miss owned by this evaluation's authored hole and exact expanded copy. */
export function holeMissLocation(doc: StudioDoc, cause: unknown, error: FriendlyError): FriendlyError {
  try { return ownedHoleMissLocation(doc, cause, error); } catch { return error; }
}
function ownedHoleMissLocation(doc: StudioDoc, cause: unknown, error: FriendlyError): FriendlyError {
  if (!(cause instanceof CadPartError) || cause.code !== 'SELECTION' || cause.details.category !== 'SELECTION' || !cause.feature) return error;
  const owners = doc.nodes.flatMap((node, index) => {
    if (node.kind !== 'hole' || node.suppressed || !Array.isArray(node.center) || node.center.length !== 2) return [];
    if (node.axis !== undefined && !['x', 'y', 'z'].includes(node.axis)) return [];
    const pattern = node.pattern;
    if (pattern && (!Number.isInteger(pattern.count) || pattern.count < 1 || pattern.count > 64
      || !('step' in pattern ? Array.isArray(pattern.step) && pattern.step.length === 2 && pattern.step.every(Number.isFinite)
        : Array.isArray(pattern.about) && pattern.about.length === 2 && pattern.about.every(Number.isFinite)))) return [];
    const centres = holeCentres(node.center.map(Number), node.pattern), root = featureId(doc.nodes, index), axis = node.axis ?? 'z';
    if (!centres.length || centres.some(c => c.some(v => !Number.isFinite(v)))) return [];
    return centres.flatMap((center, copy) => {
      const id = copy === centres.length - 1 ? root : `${root}_p${copy}`;
      if (cause.feature !== id || cause.message !== `${id}: the hole at (${center[0]}, ${center[1]}) along ${axis} misses the target`) return [];
      return [{ center, copy, count: centres.length, axis }];
    });
  });
  if (owners.length !== 1) return error;
  const { center, copy, count, axis } = owners[0], plane = HOLE_PLANE[axis];
  return { ...error, hint: `Hole ${copy + 1} of ${count} at ${plane[0].toUpperCase()} ${center[0]}, ${plane[1].toUpperCase()} ${center[1]} mm (along ${axis.toUpperCase()}) misses the body. Adjust Centre or pattern spacing. A hole may run off an edge as a notch, but it must cut material.` };
}

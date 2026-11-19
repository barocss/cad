import { validateCurve } from '@barocss/cad';
import { geometryOf, type DirectGeometry } from '@barocss/cad-model/engine/direct';

/** Read the exact authored endpoints compared by native Join, not an admission test. */
export function joinEndpointGuidance(direct: DirectGeometry, ids: [string, string]) {
  try {
    if (ids[0] === ids[1]) return null;
    const curves = ids.map(id => {
      const matches = direct.objects.filter(object => object.id === id);
      if (matches.length !== 1 || matches[0].hidden) throw new Error('Select two visible curves');
      const curve = geometryOf(direct, matches[0]);
      if (curve.kind !== 'curve') throw new Error('Expected curve');
      validateCurve(curve); // Native curves are open/clamped: endpoint poles are their endpoints.
      return curve;
    });
    const [first, second] = curves;
    const firstEnd = [...first.controlPoints.at(-1)!], secondStart = [...second.controlPoints[0]];
    const gap = Math.hypot(...firstEnd.map((value, axis) => value - secondStart[axis]));
    if (!Number.isFinite(gap)) return null;
    const same = (a: readonly number[], b: readonly number[]) => a.every((value, axis) => value === b[axis]);
    return { firstDegree: first.degree, secondDegree: second.degree, firstEnd, secondStart, gap, matches: same(firstEnd, secondStart),
      reverseMatches: same(second.controlPoints.at(-1)!, first.controlPoints[0]) };
  } catch { return null; }
}

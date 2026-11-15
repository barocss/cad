import { curveDomain, evaluateCurve } from '@barocss/cad';
import { geometryOf, type DirectGeometry } from '@barocss/cad-model/engine/direct';

/** Endpoint guidance is not a native admission test or a general self-intersection detector. */
export function ruledEndpointCorrespondence(direct: DirectGeometry, ids: [string, string]) {
  try {
    const curves = ids.map(id => geometryOf(direct, direct.objects.find(object => object.id === id)!));
    if (curves.some(curve => curve.kind !== 'curve')) return null;
    const ends = curves.map(curve => {
      if (curve.kind !== 'curve') throw new Error('Expected curve');
      const [a, b] = curveDomain(curve);
      return [evaluateCurve(curve, a), evaluateCurve(curve, b)];
    });
    const sub = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v - b[i]);
    const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
    const vectors = ends.map(([a, b]) => sub(b, a)), lengths = vectors.map(v => Math.hypot(...v));
    const tolerance = Math.max(1, ...lengths) * 1e-9;
    const straight = curves.every((curve, i) => {
      if (curve.kind !== 'curve' || lengths[i] <= tolerance) return false;
      let previous = -Infinity;
      return curve.controlPoints.every(point => {
        const delta = sub(point, ends[i][0]), t = dot(delta, vectors[i]) / lengths[i] ** 2;
        const off = Math.hypot(...delta.map((v, axis) => v - t * vectors[i][axis]));
        const valid = off <= tolerance && t >= previous && t >= -1e-9 && t <= 1 + 1e-9;
        previous = t; return valid;
      });
    });
    const opposed = straight && dot(vectors[0], vectors[1]) < 0
      && Math.hypot(...vectors[0].map((v, i) => v / lengths[0] + vectors[1][i] / lengths[1])) < 1e-9;
    const between = sub(ends[1][0], ends[0][0]), along = dot(between, vectors[0]) / lengths[0] ** 2;
    const separated = Math.hypot(...between.map((v, i) => v - along * vectors[0][i])) > tolerance;
    return { ends, crossedStraightPair: opposed && separated };
  } catch { return null; }
}

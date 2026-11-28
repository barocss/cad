import type { Curve } from '../types.js';

/** Sample a clamped quadratic with geometric-progression weights in its balanced parameter.
 * A Möbius map gives the parameters of the original curve without changing its coefficients. */
export function balancedQuadraticStations(curve: Curve, count: number): number[] | undefined {
  if (curve.degree !== 2 || curve.weights.length !== 3 || curve.knots.length !== 6) return;
  const [a, a1, a2, b, b1, b2] = curve.knots;
  if (a !== a1 || a !== a2 || b !== b1 || b !== b2 || !(a < b)) return;
  const [start, middle, end] = curve.weights;
  if (!(start > 0 && middle > 0 && end > 0) || start === end) return;
  const balancedMiddle = middle / Math.sqrt(start * end);
  // Do not use this spacing when the transformed middle weight can still compress the geometric samples.
  if (!(Math.abs(balancedMiddle - 1) <= 8 * Number.EPSILON)) return;
  const ratio = Math.sqrt(start / end), stations = [a];
  for (let i = 1; i < count - 1; i++) {
    const u = i / (count - 1), w = ratio * u;
    const station = a + (b - a) * (w / (1 - u + w));
    if (!(stations[stations.length - 1] < station && station < b)) return;
    stations.push(station);
  }
  stations.push(b);
  return stations;
}

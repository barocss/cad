import type { Curve } from '../types.js';

type QuadraticSource = Pick<Curve, 'degree' | 'knots' | 'weights'>;

/** Sample a clamped quadratic with geometric-progression weights in its balanced parameter.
 * A Möbius map gives the parameters of the original curve without changing its coefficients. */
function quadraticBalance(curve: QuadraticSource) {
  if (curve.degree !== 2 || curve.weights.length !== 3 || curve.knots.length !== 6) return;
  const [a, a1, a2, b, b1, b2] = curve.knots;
  if (a !== a1 || a !== a2 || b !== b1 || b !== b2 || !(a < b)) return;
  const [start, middle, end] = curve.weights;
  if (!(start > 0 && middle > 0 && end > 0) || start === end) return;
  const balancedMiddle = middle / Math.sqrt(start * end);
  // Do not use this spacing when the transformed middle weight can still compress the geometric samples.
  if (!(Math.abs(balancedMiddle - 1) <= 8 * Number.EPSILON)) return;
  return { a, b, ratio: Math.sqrt(start / end) };
}

export function balancedQuadraticStations(curve: QuadraticSource, count: number): number[] | undefined {
  const balance = quadraticBalance(curve);
  if (!balance) return;
  const { a, b, ratio } = balance, stations = [a];
  for (let i = 1; i < count - 1; i++) {
    const u = i / (count - 1), w = ratio * u;
    const station = a + (b - a) * (w / (1 - u + w));
    if (!(stations[stations.length - 1] < station && station < b)) return;
    stations.push(station);
  }
  stations.push(b);
  return stations;
}

/** Apply the same positive change of variable to a unit-interval integration rule. */
export function balancedQuadraticRule(curve: QuadraticSource, rule: { x: readonly number[]; w: readonly number[] }) {
  const balance = quadraticBalance(curve);
  if (!balance) return rule;
  const { a, b, ratio } = balance, x: number[] = [], w: number[] = [];
  let previous = a;
  for (const [i, node] of rule.x.entries()) {
    const numerator = ratio * node, denominator = 1 - node + numerator;
    const mapped = numerator / denominator, native = a + (b - a) * mapped;
    const weight = rule.w[i] * ratio / (denominator * denominator);
    if (!(previous < native && native < b && weight > 0 && Number.isFinite(weight))) return null;
    x.push(mapped);
    w.push(weight);
    previous = native;
  }
  return { x, w };
}

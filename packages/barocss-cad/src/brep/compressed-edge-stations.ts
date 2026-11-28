import { dist, dot, sub, unit } from '../core/vec3.js';
import type { Curve } from '../types.js';
import { balancedQuadraticStations } from './balanced-quadratic-stations.js';

const MAX_SPANS = 4;
const MAX_INTERVALS_PER_SPAN = 64;
const MIN_WEIGHT_SPREAD = 256;
const ROOT_STEPS = 64;
const MAX_CHORD_STATION_ERROR = 1e-8;

type ChordSource = Pick<Curve, 'degree' | 'knots' | 'weights' | 'controlPoints'>;
interface ChordSpan { a: number; b: number; weights: number[]; fractions: number[] }
export interface SpanRule { x: readonly number[]; w: readonly number[] }

function compressedChordSpans(curve: ChordSource): ChordSpan[] | undefined {
  const { degree, knots, weights, controlPoints } = curve;
  if ((degree !== 2 && degree !== 3)
    || weights.length !== controlPoints.length || weights.length > MAX_SPANS * degree + 1
    || knots.length !== weights.length + degree + 1) return;
  if (weights.some(weight => !(weight >= 1e-6 && weight <= 1e6))
    || Math.max(...weights) / Math.min(...weights) < MIN_WEIGHT_SPREAD) return;

  const spans = (weights.length - 1) / degree;
  if (!Number.isInteger(spans) || spans < 1 || (degree === 2 && spans === 1)) return;
  // Interior multiplicity equals degree. Each span already has its own Bernstein block.
  const domain: number[] = [];
  let start = 0;
  for (let span = 0; span <= spans; span++) {
    const size = span === 0 || span === spans ? degree + 1 : degree;
    const knot = knots[start];
    if (!Number.isFinite(knot) || (span > 0 && !(knot > domain[span - 1]))) return;
    for (let j = 1; j < size; j++) if (knots[start + j] !== knot) return;
    domain.push(knot);
    start += size;
  }
  const result: ChordSpan[] = [];
  for (let span = 0; span < spans; span++) {
    const first = span * degree, a = domain[span], b = domain[span + 1];
    const poles = controlPoints.slice(first, first + degree + 1), spanWeights = weights.slice(first, first + degree + 1);
    const end = poles[degree], start = poles[0], length = dist(start, end);
    if (!(length > 0 && Number.isFinite(length) && Number.isFinite(b - a))) return;
    const direction = unit(sub(end, start));
    const fractions = poles.map((point, i) => i === 0 ? 0 : i === degree ? 1 : dot(sub(point, start), direction) / length);
    if (fractions.some((fraction, i) => !Number.isFinite(fraction) || (i > 0 && fraction < fractions[i - 1]))) return;

    result.push({ a, b, weights: spanWeights, fractions });
  }
  return result;
}

/** Sample in the original domain. Chord fractions locate stations on positive, monotone Bézier spans. */
export function rationalEdgeStations(curve: Curve, count: number): number[] | undefined {
  const balanced = balancedQuadraticStations(curve, count);
  if (balanced) return balanced;
  if (count > MAX_INTERVALS_PER_SPAN + 1) return;
  const spans = compressedChordSpans(curve);
  if (!spans) return;
  const stations = [spans[0].a], intervals = Math.max(8, count - 1);
  for (const { a, b, weights, fractions } of spans) {
    for (let i = 1; i < intervals; i++) {
      const target = i / intervals;
      const u = parameterAtFraction(weights, fractions, target);
      const t = a + (b - a) * u;
      if (!(stations[stations.length - 1] < t && t < b)) return;
      stations.push(t);
    }
    stations.push(b);
  }
  return stations;
}

/** Map the quadrature rule of each individual span to its original native coordinate. */
export function compressedChordRules(curve: ChordSource, rule: SpanRule): SpanRule[] | null | undefined {
  const spans = compressedChordSpans(curve);
  if (!spans) return;
  const mapped: SpanRule[] = [];
  for (const { a, b, weights, fractions } of spans) {
    const x: number[] = [], w: number[] = [];
    let previous = a;
    for (let i = 0; i < rule.x.length; i++) {
      const u = parameterAtFraction(weights, fractions, rule.x[i]), t = a + (b - a) * u;
      if (!(previous < t && t < b)) return null;
      // Evaluate the Jacobian at the same represented parameter used by the native evaluator.
      const native = (t - a) / (b - a), weight = rule.w[i] * inverseChordDerivative(weights, fractions, native, rule.x[i]);
      if (!(weight > 0 && Number.isFinite(weight))) return null;
      x.push(u);
      w.push(weight);
      previous = t;
    }
    mapped.push({ x, w });
  }
  return mapped;
}

/** Pairwise expansion of the derivative avoids subtraction of two nearly equal moments. */
function inverseChordDerivative(weights: number[], fractions: number[], u: number, target: number): number {
  const degree = weights.length - 1, complement = 1 - u;
  const terms = weights.map((weight, i) => weight * u ** i * complement ** (degree - i)
    * (i === 0 || i === degree ? 1 : degree));
  const sum = terms.reduce((total, term) => total + term, 0);
  const moment = terms.reduce((total, term, i) => total + term * fractions[i], 0);
  if (!(Math.abs(moment / sum - target) <= MAX_CHORD_STATION_ERROR)) return NaN;
  let derivative = 0;
  for (let i = 0; i < terms.length; i++) for (let j = i + 1; j < terms.length; j++) {
    derivative += (j - i) * (fractions[j] - fractions[i]) * terms[i] * terms[j];
  }
  return u * complement * sum * sum / derivative;
}

function parameterAtFraction(weights: number[], fractions: number[], target: number): number {
  const degree = weights.length - 1;
  // Solve the homogeneous scalar equation using its Bernstein form. Ordered projections
  // and positive weights make the rational chord coordinate strictly increasing.
  const coefficients = weights.map((weight, i) => (fractions[i] - target) * weight
    * (i === 0 || i === degree ? 1 : degree));
  let lo = 0, hi = 1;
  for (let step = 0; step < ROOT_STEPS; step++) {
    const mid = lo + (hi - lo) / 2;
    if (mid === lo || mid === hi) break;
    let value = coefficients[degree];
    // Evaluate in the closer endpoint chart to avoid division by a small complement.
    if (mid <= 0.5) {
      const odds = mid / (1 - mid);
      for (let i = degree - 1; i >= 0; i--) value = value * odds + coefficients[i];
    } else {
      const odds = (1 - mid) / mid;
      value = coefficients[0];
      for (let i = 1; i <= degree; i++) value = value * odds + coefficients[i];
    }
    if (value < 0) lo = mid;
    else hi = mid;
  }
  return lo + (hi - lo) / 2;
}

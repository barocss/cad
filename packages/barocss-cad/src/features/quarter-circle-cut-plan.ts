import { CadNumericPolicy } from '../numeric-policy.js';
import type { Point } from '../types.js';
import type { RawNurbsPath } from './curve-cut-pattern.js';
import { cutLengthNumbers, type CurveCutPathPlan } from './quadratic-cut-plan.js';
import type { CutDyadic, QuadraticCutWork } from './quadratic-cut-arithmetic.js';

const FRACTION_BITS = 62;
const SCALE = 1n << BigInt(FRACTION_BITS);

// The alternating series at 0 ≤ angle ≤ π/2. Each term is rounded down in fixed point.
function coordinateAt(w: QuadraticCutWork, angle: bigint, degree: 1 | 2): CutDyadic {
  const square = w.times(angle, angle), scaleSquared = SCALE * SCALE;
  let term = degree === 1 ? angle : w.quotient(square, 2n * SCALE);
  let sum = term;
  for (let k = 1; k < 12; k++) {
    const power = degree + 2 * k;
    term = w.quotient(w.times(term, square), BigInt((power - 1) * power) * scaleSquared);
    sum = k % 2 ? w.minus(sum, term) : w.plus(sum, term);
  }
  return { n: sum, e: -FRACTION_BITS };
}

/** The canonical axis-aligned NURBS quarter arc authored by the exact XY arc builder. */
export function planQuarterCircleCut(path: RawNurbsPath, spacing: number, count: number, limit: number, w: QuadraticCutWork): CurveCutPathPlan {
  const { controlPoints: [start, corner, end], knots, weights } = path;
  const refuse = () => w.fail('CAPABILITY', 'a circular CUT path needs one canonical axis-aligned XY quarter arc');
  if (knots.some((knot, i) => knot !== (i < 3 ? 0 : 1)) || weights[0] !== 1 || weights[2] !== 1
      || corner[2] !== start[2] || end[2] !== start[2]) return refuse();
  const u = [0, 1].map(axis => w.sub(w.from(corner[axis]), w.from(start[axis])));
  const v = [0, 1].map(axis => w.sub(w.from(end[axis]), w.from(corner[axis])));
  const first = u[0].n !== 0n ? 0 : 1, second = 1 - first;
  const radius = w.magnitude(u[first]);
  const limitDyadic = w.from(limit);
  if (u[second].n !== 0n || v[first].n !== 0n || radius.n === 0n
      || w.cmp(radius, w.magnitude(v[second])) !== 0 || w.cmp(radius, limitDyadic) > 0) return refuse();

  // The binary64 middle weight differs from 1/√2 by < 2^-52. Denominator ≥ 1/2 bounds the
  // speed-integral deviation by 32R·2^-52, and the equal-arclength position deviation by 64R·2^-52.
  const sourceError = w.scale(radius, -46);
  const lower = w.sub(w.mul(radius, w.from(1.5707963267948963)), sourceError);
  const upper = w.add(w.mul(radius, w.from(1.5707963267948968)), sourceError);
  const pitch = w.from(spacing);
  const distanceAt = (index: number) => w.mul(pitch, { n: BigInt(index), e: 0 });
  const requested = distanceAt(count - 1);
  if (w.cmp(requested, upper) > 0) return w.fail('PARAMETER', 'last cut placement exceeds the open path length');
  if (w.cmp(requested, lower) > 0) return w.fail('PARAMETER', 'last cut placement is too close to the certified arc endpoint');

  // For angle < 2 the Taylor tails, fixed-point recurrences and argument truncation total < 256 units.
  const seriesError = w.scale(radius, 8 - FRACTION_BITS);
  const tolerance = w.scale(w.from(CadNumericPolicy.linearTolerance), -1);
  const publish = (value: CutDyadic) => {
    const offset = w.number(value);
    const roundoff = w.magnitude(w.sub(value, w.from(offset)));
    const error = w.add(w.add(sourceError, seriesError), roundoff);
    if (w.cmp(error, tolerance) > 0) return w.fail('CAPABILITY', 'circular CUT placement exceeds the linear error budget');
    if (w.cmp(w.add(w.magnitude(value), error), limitDyadic) > 0)
      return w.fail('PARAMETER', 'path cut pattern offsets must be within ±10000 mm');
    return offset;
  };
  const offsets: Point[] = [[0, 0, 0]];
  for (let index = 1; index < count; index++) {
    const distance = distanceAt(index);
    const angle = w.ratio(distance.n, radius.n, distance.e - radius.e + FRACTION_BITS, false);
    const offset: Point = [0, 0, 0];
    offset[first] = publish(w.mul(u[first], coordinateAt(w, angle, 1)));
    offset[second] = publish(w.mul(v[second], coordinateAt(w, angle, 2)));
    offsets.push(offset);
  }
  return { offsets, length: cutLengthNumbers(w, lower, upper) };
}

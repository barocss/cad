import { CadNumericPolicy, validateCurve, type Curve, type Point } from '@barocss/cad';
import { refusal } from './refusal';
import { add, len, scale, sub } from './vec3';

export type BridgeEnd = 'start' | 'end';
export type BridgeContinuity = 'G0' | 'G1';
export interface BridgePick { id: string; curve: Curve; end: BridgeEnd }

const copy = (point: Point): Point => [...point];
const inRange = (point: Point) => point.every(value => Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs);
const samePoint = (a: Point, b: Point) => a.every((value, axis) => value === b[axis]);

function lineEnds(pick: BridgePick): readonly [Point, Point] {
  if (!pick || typeof pick.id !== 'string' || !pick.id || (pick.end !== 'start' && pick.end !== 'end'))
    throw refusal('DIRECT_PICK', 'Bridge: choose a start or end of each of two distinct straight curves.');
  try { validateCurve(pick.curve); }
  catch { throw refusal('DIRECT_PICK', 'Bridge: each source must be a valid native curve.'); }
  const { degree, controlPoints, knots, weights } = pick.curve;
  const start = controlPoints[0], end = controlPoints.at(-1)!;
  if (samePoint(start, end)) throw refusal('DIRECT_PICK', 'Bridge: choose open segments; a closed source is selected.');
  // A positive-weight, clamped degree-one/two-pole curve has exactly this segment as its
  // locus, even with unequal weights. Studio also emits unit-weight quadratic lines
  // with this exact elevated middle pole. No sampled/tolerance-based straightness is used.
  const linear = degree === 1 && controlPoints.length === 2 && knots.length === 4;
  const quadratic = degree === 2 && controlPoints.length === 3 && knots.length === 6
    && weights.every(weight => weight === 1)
    && controlPoints[1].every((value, axis) => value === (controlPoints[0][axis] + controlPoints[2][axis]) / 2);
  if (!linear && !quadratic)
    throw refusal('DIRECT_PICK', 'Bridge: only a single native straight segment is supported.');
  if (!controlPoints.every(inRange) || !Number.isFinite(knots[degree + 1] - knots[degree]))
    throw refusal('DIRECT_PICK', 'Bridge: source coordinates and knot span must be within the native numeric range.');
  if (len(sub(end, start)) <= CadNumericPolicy.linearTolerance)
    throw refusal('DIRECT_PICK', 'Bridge: select segments longer than the modeling tolerance; a source is too small.');
  return [start, end];
}

/** Build a separate native bridge; the source curves and their parameter domains stay unchanged.
 * Tangents are unit traversal directions: out of the first source, then into the second source.
 * G1 is a single cubic Bézier with chord/3 handles, subject to stored-control rounding checks.
 */
export function buildBridgeCurve(first: BridgePick, second: BridgePick, continuity: BridgeContinuity): {
  curve: Curve; ends: readonly [Point, Point]; tangents: readonly [Point, Point];
} {
  if (continuity !== 'G0' && continuity !== 'G1')
    throw refusal('DIRECT_VALUE', 'Bridge: continuity must be G0 or G1.');
  const a = lineEnds(first), b = lineEnds(second);
  if (first.id === second.id
    || (samePoint(a[0], b[0]) && samePoint(a[1], b[1]))
    || (samePoint(a[0], b[1]) && samePoint(a[1], b[0])))
    throw refusal('DIRECT_PICK', 'Bridge: choose two distinct source segments; copies of the same segment are not supported.');
  const start = copy(a[first.end === 'start' ? 0 : 1]), end = copy(b[second.end === 'start' ? 0 : 1]);
  const chord = len(sub(end, start));
  if (chord <= CadNumericPolicy.linearTolerance)
    throw refusal('DIRECT_PICK', 'Bridge: the chosen endpoints coincide within the modeling tolerance.');
  const outgoing = sub(start, a[first.end === 'start' ? 1 : 0]);
  const arriving = sub(b[second.end === 'start' ? 1 : 0], end);
  const tangents: [Point, Point] = [scale(outgoing, 1 / len(outgoing)), scale(arriving, 1 / len(arriving))];
  let controlPoints: Point[] = [copy(start), copy(end)];
  if (continuity === 'G1') {
    const handle = chord / 3, firstOffset = scale(tangents[0], handle), secondOffset = scale(tangents[1], handle);
    const firstControl = add(start, firstOffset), secondControl = sub(end, secondOffset);
    // Refuse rounded-away or materially changed handles, rather than silently lose G1.
    const budget = handle * CadNumericPolicy.relativeComparison;
    if (![firstControl, secondControl].every(inRange)
      || len(sub(sub(firstControl, start), firstOffset)) > budget
      || len(sub(sub(end, secondControl), secondOffset)) > budget
      || len(sub(firstControl, start)) === 0 || len(sub(end, secondControl)) === 0)
      throw refusal('DIRECT_VALUE', 'Bridge: G1 controls cannot be represented within the native coordinate range and tangent tolerance.');
    controlPoints = [copy(start), firstControl, secondControl, copy(end)];
  }
  const curve: Curve = { kind: 'curve', id: 'bridge', degree: continuity === 'G0' ? 1 : 3,
    knots: continuity === 'G0' ? [0, 0, 1, 1] : [0, 0, 0, 0, 1, 1, 1, 1], controlPoints,
    weights: controlPoints.map(() => 1) };
  return { curve, ends: [start, end], tangents };
}

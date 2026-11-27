import { buildBezierCoonsSurface, CadNumericPolicy, editSurfaceControlNet, elevateBezierCurveDegree, validateSurface, type BezierCoonsBoundaries, type Curve, type Point, type Surface } from '@barocss/cad';
import { refusal } from './refusal';
import { add, cross, dot, len, scale, sub, unit } from './vec3';

const samePoint = (a: Point, b: Point) => a.every((value, axis) => value === b[axis]);
const ANGLE_BUDGET = CadNumericPolicy.relativeComparison / 2;
const choose = (n: number, k: number): number => {
  let value = 1;
  for (let i = 1; i <= k; i++) value = value * (n - i + 1) / i;
  return value;
};

/** One native elevation at a time, with the same coefficient arithmetic as Direct's degree command. */
function straightPoles(start: Point, end: Point, degree: number): Point[] {
  let curve: Curve = { kind: 'curve', id: 'seam', degree: 1, knots: [0, 0, 1, 1], controlPoints: [start, end], weights: [1, 1] };
  if (degree >= 2) curve = elevateBezierCurveDegree(curve, { targetDegree: 2 }).elevated;
  if (degree === 3) curve = elevateBezierCurveDegree(curve, { targetDegree: 3 }).elevated;
  return curve.controlPoints;
}

interface DonorPlane { origin: Point; normal: Point; inward: [Point, Point]; rounding: number }

function donorPlane(donor: Surface, bottom: Curve): DonorPlane {
  try { validateSurface(donor); }
  catch { throw refusal('DIRECT_PICK', 'Tangent Fill: choose a valid native donor surface.'); }
  if (donor.degreeU !== 1 || donor.degreeV !== 1 || donor.controlPoints.length !== 2 || donor.controlPoints.some(row => row.length !== 2)
    || donor.weights.some(row => row.some(weight => weight !== 1))
    || ![donor.knotsU, donor.knotsV].every(knots => knots.length === 4 && knots.every((value, i) => value === (i < 2 ? 0 : 1)))
    || donor.controlPoints.some(row => row.some(point => point.some(value => Math.abs(value) > CadNumericPolicy.coordinateAbs))))
    throw refusal('DIRECT_PICK', 'Tangent Fill: the donor must be one polynomial bilinear patch on [0,1].');
  const [[a, d], [b, c]] = donor.controlPoints, normal = unit(cross(sub(b, a), sub(d, a)));
  // This budget admits arithmetic rounding, not a modeling-tolerance fit of a curved donor.
  const size = Math.max(1, ...donor.controlPoints.flat().flat().map(Math.abs));
  const rounding = Math.min(CadNumericPolicy.linearTolerance, 64 * Number.EPSILON * size);
  if (len(cross(sub(b, a), sub(d, a))) <= CadNumericPolicy.linearTolerance * Math.max(len(sub(b, a)), len(sub(d, a)))
    || Math.abs(dot(normal, sub(c, a))) > rounding)
    throw refusal('DIRECT_PICK', 'Tangent Fill: the donor must be planar and nondegenerate.');
  // For a planar bilinear patch the signed Jacobian is affine. Positive corner values
  // therefore certify the complete donor, including concave and folded-patch refusals.
  const normals: Point[] = [];
  for (const [u, v] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const du = sub(v === 0 ? b : c, v === 0 ? a : d);
    const dv = sub(u === 0 ? d : c, u === 0 ? a : b);
    const area = cross(du, dv);
    normals.push(area);
    if (!(dot(normal, area) > CadNumericPolicy.linearTolerance * Math.max(len(du), len(dv))))
      throw refusal('DIRECT_PICK', 'Tangent Fill: the donor must be regular over its complete patch.');
  }
  const minimumArea = Math.min(...normals.map(value => dot(normal, value)));
  if (normals.some(value => len(sub(value, scale(normal, dot(normal, value)))) > minimumArea * ANGLE_BUDGET))
    throw refusal('DIRECT_PICK', 'Tangent Fill: the donor normal cannot retain a single plane within the angle tolerance.');
  const start = bottom.controlPoints[0], end = bottom.controlPoints.at(-1)!;
  const edges: [Point, Point, Point, Point][] = [[a, b, d, c], [d, c, a, b], [a, d, b, c], [b, c, a, d]];
  const matches: [Point, Point][] = [];
  for (const [p, q, insideP, insideQ] of edges) {
    if (samePoint(start, p) && samePoint(end, q)) matches.push([sub(insideP, p), sub(insideQ, q)]);
    if (samePoint(start, q) && samePoint(end, p)) matches.push([sub(insideQ, q), sub(insideP, p)]);
  }
  if (matches.length !== 1)
    throw refusal('DIRECT_PICK', 'Tangent Fill: the seam must match one entire donor edge exactly.');
  // Comparing all elevated coefficients rejects curves with the same endpoints but a different locus or speed.
  const forward = straightPoles(start, end, bottom.degree), reverse = straightPoles(end, start, bottom.degree).reverse();
  if (![forward, reverse].some(points => points.every((point, i) => samePoint(point, bottom.controlPoints[i]))))
    throw refusal('DIRECT_VALUE', 'Tangent Fill: the seam must have exact native straight-edge coefficients.');
  if (len(sub(end, start)) <= CadNumericPolicy.linearTolerance)
    throw refusal('DIRECT_VALUE', 'Tangent Fill: the seam is too short.');
  return { origin: a, normal, inward: matches[0], rounding };
}

/** Bernstein coefficients of Su(u,0) × Sv(u,0), not sampled normal estimates. */
function seamNormals(surface: Surface): Point[] {
  const p = surface.degreeU, q = surface.degreeV, net = surface.controlPoints;
  const along = net.slice(0, -1).map((row, i) => scale(sub(net[i + 1][0], row[0]), p));
  const across = net.map(row => scale(sub(row[1], row[0]), q));
  return Array.from({ length: 2 * p }, (_, k) => {
    let result: Point = [0, 0, 0];
    for (let i = 0; i < p; i++) {
      const j = k - i;
      if (j >= 0 && j <= p) result = add(result, scale(cross(along[i], across[j]), choose(p - 1, i) * choose(p, j) / choose(2 * p - 1, k)));
    }
    return result;
  });
}

/** Exact polynomial boundary construction with one planar G1 seam. No sewing or global fold certificate.
 * The donor is an unchanged whole bilinear patch. Original boundary coefficients are retained bit for bit.
 * Plane/normal residuals are bounded before publication; unsupported or ill-conditioned inputs refuse.
 */
export function buildPlanarTangentFill(boundaries: BezierCoonsBoundaries, donor: Surface, surfaceId: string): { surface: Surface; source: string } {
  let coons: ReturnType<typeof buildBezierCoonsSurface>;
  try { coons = buildBezierCoonsSurface(boundaries, { surfaceId }); }
  catch { throw refusal('DIRECT_VALUE', 'Tangent Fill: four exact polynomial Bezier sides with matching opposite degrees and shared corners are required.'); }
  const { bottom, left, right } = coons.boundaries, q = coons.surface.degreeV;
  if (q < 2) throw refusal('DIRECT_VALUE', 'Tangent Fill: side degree must be at least two.');
  const plane = donorPlane(donor, bottom), { normal, origin } = plane;
  const size = Math.max(1, ...coons.surface.controlPoints.flat().flat().map(Math.abs));
  const rounding = Math.min(CadNumericPolicy.linearTolerance, Math.max(plane.rounding, 64 * Number.EPSILON * size));
  const offPlane = (point: Point) => dot(normal, sub(point, origin));
  if (bottom.controlPoints.some(point => Math.abs(offPlane(point)) > rounding))
    throw refusal('DIRECT_VALUE', 'Tangent Fill: the complete seam must lie on the donor plane.');
  if ([left.controlPoints[1], right.controlPoints[1]].some(point => Math.abs(offPlane(point)) > rounding))
    throw refusal('DIRECT_VALUE', 'Tangent Fill: a fixed corner tangent conflicts with the donor plane.');
  const poleEdits = coons.surface.controlPoints.slice(1, -1).map((row, offset) => {
    const projected = sub(row[1], scale(normal, offPlane(row[1])));
    return { uIndex: offset + 1, vIndex: 1, xMM: projected[0], yMM: projected[1], zMM: projected[2] };
  });
  let made: { surface: Surface; source: string } = coons;
  try { if (poleEdits.length) made = editSurfaceControlNet(coons.surface, { poleEdits }); }
  catch { throw refusal('DIRECT_VALUE', 'Tangent Fill: projected controls cannot be stored without coefficient loss.'); }
  if (made.surface.controlPoints.some(row => Math.abs(offPlane(row[1])) > rounding))
    throw refusal('DIRECT_VALUE', 'Tangent Fill: stored controls cannot retain the donor tangent plane.');
  const tangent = sub(bottom.controlPoints.at(-1)!, bottom.controlPoints[0]);
  const transverse = unit(cross(normal, tangent));
  const donorSides = plane.inward.map(direction => dot(transverse, direction));
  if (donorSides.some(value => Math.abs(value) <= CadNumericPolicy.linearTolerance) || donorSides[0] * donorSides[1] <= 0)
    throw refusal('DIRECT_PICK', 'Tangent Fill: the donor has no consistent inward side at the seam.');
  const expectedSign = -Math.sign(donorSides[0]);
  const coefficients = seamNormals(made.surface);
  const alongScale = Math.max(...bottom.controlPoints.slice(0, -1).map((point, i) => len(scale(sub(bottom.controlPoints[i + 1], point), bottom.degree))));
  const acrossScale = Math.max(...made.surface.controlPoints.map(row => len(scale(sub(row[1], row[0]), q))));
  const floor = CadNumericPolicy.linearTolerance * Math.max(alongScale, acrossScale);
  const signed = coefficients.map(value => expectedSign * dot(normal, value));
  if (!signed.every(value => Number.isFinite(value) && value > floor))
    throw refusal('DIRECT_VALUE', 'Tangent Fill: the full seam must be regular and extend to the opposite side of the donor.');
  // A positive Bernstein hull bounds the denominator everywhere. This bounds the complete
  // stored normal field, including between samples, against the construction plane.
  const normalResidual = Math.max(...coefficients.map(value => len(sub(value, scale(normal, dot(normal, value))))));
  if (!(normalResidual <= Math.min(...signed) * ANGLE_BUDGET))
    throw refusal('DIRECT_VALUE', 'Tangent Fill: stored coefficients exceed the normal-angle tolerance.');
  return { surface: made.surface, source: made.source };
}

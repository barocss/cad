import { buildBrep, CadNumericPolicy, checkBrep, editSurfaceControlNet, lineCurve, validateCurve, validateSurface, type Brep, type Curve, type Point, type Surface } from '@barocss/cad';
import { isRefusal, refusal } from './refusal';
import { add, cross, dot, len, scale, sub, unit } from './vec3';

interface JunctionInput { seam: Curve; left: Curve; right: Curve; guide: Curve; donor: Surface; surfaceId: string }
interface Chart { origin: Point; x: Point; y: Point; normal: Point; height: number; shape: number; seam: Curve; left: Curve; right: Curve }
const TOL = CadNumericPolicy.linearTolerance;
const samePoint = (a: Point, b: Point) => a.every((value, i) => value === b[i]);
const fail = (message: string): never => { throw refusal('DIRECT_VALUE', `Guided Junction: ${message}`); };
const requireValue = (condition: boolean, message: string): void => { if (!condition) fail(message); };
const reverse = (curve: Curve): Curve => ({ ...curve, controlPoints: [...curve.controlPoints].reverse(), weights: [...curve.weights].reverse() });

/** Normalize only a single polynomial span's domain. The original controls are copied, never fitted. */
function polynomial(input: Curve, degrees: readonly number[], label: string): Curve {
  try { validateCurve(input); } catch { return fail(`${label} must be a valid native curve.`); }
  const count = input.degree + 1, first = input.knots[0], last = input.knots.at(-1)!;
  requireValue(degrees.includes(input.degree) && input.controlPoints.length === count && input.weights.every(value => value === 1)
    && input.knots.length === 2 * count && last > first && Number.isFinite(last - first)
    && input.knots.every((value, i) => value === (i < count ? first : last))
    && input.controlPoints.every(point => point.every(value => Math.abs(value) <= CadNumericPolicy.coordinateAbs)),
  `${label} needs one polynomial Bezier span of degree ${degrees.join(' or ')} within the coordinate range.`);
  return { ...input, knots: [...Array<number>(count).fill(0), ...Array<number>(count).fill(1)],
    controlPoints: input.controlPoints.map(point => [...point]), weights: [...input.weights] };
}

/** This budget admits binary64 arithmetic, not a modeling-tolerance fit of a different curve. */
function floatBudget(points: readonly Point[]): number {
  return Math.min(TOL / 16, 128 * Number.EPSILON * Math.max(1, ...points.flat().map(Math.abs)));
}
const near = (a: Point, b: Point, budget: number) => len(sub(a, b)) <= budget;

function donorInward(donor: Surface, start: Point, end: Point, budget: number, seamNormal: Point): [Point, Point] {
  try { validateSurface(donor); } catch { return fail('choose a valid native planar donor.'); }
  requireValue(donor.degreeU === 1 && donor.degreeV === 1 && donor.controlPoints.length === 2
    && donor.controlPoints.every(row => row.length === 2) && donor.weights.every(row => row.every(value => value === 1))
    && [donor.knotsU, donor.knotsV].every(knots => knots.length === 4 && knots[0] < knots[3]
      && Number.isFinite(knots[3] - knots[0]) && knots[0] === knots[1] && knots[2] === knots[3])
    && donor.controlPoints.every(row => row.every(point => point.every(value => Math.abs(value) <= CadNumericPolicy.coordinateAbs))),
  'the donor must be one whole polynomial bilinear planar surface.');
  const [[a, d], [b, c]] = donor.controlPoints;
  const normal = unit(cross(sub(b, a), sub(d, a)));
  requireValue(Math.abs(dot(normal, sub(c, a))) <= budget, 'the donor must be planar.');
  for (const [u, v] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const du = sub(v === 0 ? b : c, v === 0 ? a : d), dv = sub(u === 0 ? d : c, u === 0 ? a : b);
    const area = cross(du, dv), signed = dot(normal, area);
    requireValue(signed > TOL * Math.max(len(du), len(dv)), 'the donor must be regular, without a fold or overlap.');
    requireValue(len(sub(area, scale(normal, signed))) <= signed * CadNumericPolicy.relativeComparison / 8,
      'the stored donor cannot retain one tangent plane.');
    const seamSigned = dot(seamNormal, area);
    requireValue(len(sub(area, scale(seamNormal, seamSigned))) <= Math.abs(seamSigned) * CadNumericPolicy.relativeComparison / 8,
      'the full donor normal field must match the seam tangent plane.');
  }
  const matches: [Point, Point][] = [];
  for (const [p, q, insideP, insideQ] of [[a, b, d, c], [d, c, a, b], [a, d, b, c], [b, c, a, d]]) {
    if (samePoint(start, p) && samePoint(end, q)) matches.push([sub(insideP, p), sub(insideQ, q)]);
    if (samePoint(start, q) && samePoint(end, p)) matches.push([sub(insideQ, q), sub(insideP, p)]);
  }
  requireValue(matches.length === 1, 'the seam must match one entire unambiguous donor edge.');
  return matches[0];
}

/** Affine projected coordinates; nonzero determinant also rejects a collapsed triangle. */
function coordinates(origin: Point, x: Point, y: Point, normal: Point) {
  const determinant = dot(cross(x, y), normal), ux = scale(cross(y, normal), 1 / determinant), vy = scale(cross(normal, x), 1 / determinant);
  return (point: Point): Point => { const delta = sub(point, origin); return [dot(delta, ux), dot(delta, vy), dot(delta, normal)]; };
}
function world(chart: Pick<Chart, 'origin' | 'x' | 'y' | 'normal'>, u: number, v: number, z: number): Point {
  return add(add(chart.origin, scale(chart.x, u)), add(scale(chart.y, v), scale(chart.normal, z)));
}

function chartFor(seam: Curve, sides: readonly Curve[], guide: Curve, donor: Surface, budget: number): Chart {
  const a = seam.controlPoints[0], b = seam.controlPoints.at(-1)!, x = sub(b, a);
  requireValue(len(x) > TOL, 'the seam is too short.');
  const orientAt = (curve: Curve, point: Point): Curve | null => samePoint(curve.controlPoints[0], point) ? curve
    : samePoint(curve.controlPoints.at(-1)!, point) ? reverse(curve) : null;
  const starts = sides.map(side => orientAt(side, a)), ends = sides.map(side => orientAt(side, b));
  requireValue(starts.filter(Boolean).length === 1 && ends.filter(Boolean).length === 1 && starts.findIndex(Boolean) !== ends.findIndex(Boolean),
    'three distinct boundaries must form one unambiguous triangle.');
  const left = starts.find(Boolean)!, right = ends.find(Boolean)!, apex = left.controlPoints[2];
  requireValue(samePoint(apex, right.controlPoints[2]) && !samePoint(apex, a) && !samePoint(apex, b),
    'the two shoulder boundaries must share exactly one third corner.');
  const y = scale(sub(left.controlPoints[1], a), 2), area = cross(x, y), normal = unit(area);
  requireValue(len(area) > TOL * Math.max(len(x), len(y)), 'the triangle must be regular and have positive projected area.');
  const height = dot(sub(apex, add(a, y)), normal), basis = { origin: a, x, y, normal };
  requireValue(near(apex, world(basis, 0, 1, height), budget)
    && near(right.controlPoints[1], world(basis, .5, .5, 0), budget),
  'the shoulder controls must have the same quadratic rise and planar seam tangents.');
  requireValue(seam.controlPoints.every((point, i) => near(point, world(basis, i / seam.degree, 0, 0), budget)),
    'the seam must be a straight polynomial segment.');
  const inward = donorInward(donor, a, b, budget, normal), across = unit(cross(normal, x));
  requireValue(inward.every(direction => Math.abs(dot(normal, direction)) <= budget && dot(across, direction) < -TOL),
    'the donor must share the seam tangent plane and stay on the opposite side; overlap is refused.');
  const uv = coordinates(a, x, y, normal);
  const candidates: number[] = [];
  for (const curve of [guide, reverse(guide)]) {
    const first = uv(curve.controlPoints[0]), u = first[0], endV = 1 - u;
    if (!(u > 0 && endV > 0 && u * len(x) > TOL && endV * len(x) > TOL && endV * len(y) > TOL)) continue;
    const denominator = u * endV ** 3, z2 = uv(curve.controlPoints[2])[2];
    const shape = (3 * z2 - height * endV ** 2) / denominator;
    if (!Number.isFinite(shape)) continue;
    const heights = [0, 0, (height * endV ** 2 + shape * denominator) / 3, height * endV ** 2];
    if (curve.controlPoints.every((point, i) => near(point, world(basis, u, endV * i / 3, heights[i]), budget))) candidates.push(shape);
  }
  requireValue(candidates.length === 1, 'one connected, unambiguous cubic guide must run from inside the seam to the opposite shoulder, with constant projected U.');
  return { ...basis, height, shape: candidates[0], seam, left, right };
}

/** Bound the stored projected derivative coefficients, rather than infer regularity from a mesh. */
function certifyStoredSurface(surface: Surface, chart: Chart, budget: number): void {
  const uv = coordinates(chart.origin, chart.x, chart.y, chart.normal), net = surface.controlPoints;
  const projected = net.map(row => row.map(uv));
  // Projected map = identity + E. Each row sum of DE is < 1/8 on the entire
  // rectangle by the Bernstein convex hull. Its projection is injective there.
  let uError = 0, vError = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    if (i < 2) { const d = scale(sub(projected[i + 1][j], projected[i][j]), 2); uError = Math.max(uError, Math.abs(d[0] - 1), Math.abs(d[1])); }
    if (j < 3) { const d = scale(sub(projected[i][j + 1], projected[i][j]), 3); vError = Math.max(vError, Math.abs(d[0]), Math.abs(d[1] - 1)); }
  }
  requireValue(uError + vError <= CadNumericPolicy.relativeComparison / 8, 'the stored chart cannot retain a regular, nonoverlapping projection.');
  requireValue(net.every(row => Math.abs(dot(chart.normal, sub(row[0], chart.origin))) <= budget
    && Math.abs(dot(chart.normal, sub(row[1], chart.origin))) <= budget), 'the stored seam tangent controls leave the donor plane.');
  const along = net.slice(0, -1).map((row, i) => scale(sub(net[i + 1][0], row[0]), 2));
  const across = net.map(row => scale(sub(row[1], row[0]), 3));
  const choose2 = [1, 2, 1], choose3 = [1, 3, 3, 1];
  for (let k = 0; k < 4; k++) {
    let area: Point = [0, 0, 0];
    for (let i = 0; i < 2; i++) { const j = k - i; if (j >= 0 && j <= 2) area = add(area, scale(cross(along[i], across[j]), choose2[j] / choose3[k])); }
    const signed = dot(area, chart.normal);
    requireValue(signed > TOL * Math.max(...along.map(len), ...across.map(len))
      && len(sub(area, scale(chart.normal, signed))) <= signed * CadNumericPolicy.relativeComparison / 8,
    'the complete stored seam cannot retain regular G1 contact.');
  }
}

/** One bounded triangular open patch, with a real interior guide and one planar G1 seam.
 * S = origin + X*u + Y*v + N*(height*v² + shape*u*v²*(1-u-v)).
 * The rectangular support stays regular; the kept triangle is u>=0,v>=0,u+v<=1.
 * Returned native topology is an independent sheet, not persistent sewing to the donor.
 */
export function buildGuidedJunction(input: JunctionInput): { surface: Surface; source: string; brep: Brep } {
  try { validateSurface(input.donor); } catch { return fail('choose a valid native planar donor.'); }
  const seam = polynomial(input.seam, [1, 2, 3], 'The seam'), left = polynomial(input.left, [2], 'Each shoulder'), right = polynomial(input.right, [2], 'Each shoulder'), guide = polynomial(input.guide, [3], 'The guide');
  const budget = floatBudget([...seam.controlPoints, ...left.controlPoints, ...right.controlPoints, ...guide.controlPoints, ...input.donor.controlPoints.flat()]);
  const charts: Chart[] = [], errors: Error[] = [];
  for (const oriented of [seam, reverse(seam)]) {
    try { charts.push(chartFor(oriented, [left, right], guide, input.donor, budget)); }
    catch (error) { if (!isRefusal(error)) throw error; errors.push(error); }
  }
  if (!charts.length) throw errors.find(error => /guide/.test(error.message)) ?? errors[0];
  requireValue(charts.length === 1, 'the selected guide and boundaries have ambiguous roles.');
  const chart = charts[0], { height: h, shape: b } = chart;
  const heights = [[0, 0, h / 3, h], [0, 0, h / 3 + b / 6, h], [0, 0, h / 3, h - b]];
  const candidate: Surface = { kind: 'surface', id: input.surfaceId, degreeU: 2, degreeV: 3,
    knotsU: [0, 0, 0, 1, 1, 1], knotsV: [0, 0, 0, 0, 1, 1, 1, 1],
    controlPoints: heights.map((row, i) => row.map((z, j) => world(chart, i / 2, j / 3, z))), weights: heights.map(row => row.map(() => 1)) };
  // The native control editor supplies the full round-trip source writer and verifies
  // compilation preserves every accepted coefficient, including signed zero.
  let made: ReturnType<typeof editSurfaceControlNet>;
  try { made = editSurfaceControlNet(candidate, { poleEdits: [{ uIndex: 0, vIndex: 0, xMM: candidate.controlPoints[0][0][0] }] }); }
  catch { return fail('the accepted support cannot be stored within the native coordinate range without coefficient loss.'); }
  certifyStoredSurface(made.surface, chart, budget);
  const brep = buildBrep({ source: { family: 'guided-junction', id: input.surfaceId }, tolerance: TOL,
    vertices: [{ id: 'a', point: chart.seam.controlPoints[0] }, { id: 'b', point: chart.seam.controlPoints.at(-1)! }, { id: 'c', point: chart.left.controlPoints[2] }],
    edges: [{ id: 'seam', curve: chart.seam, vertices: ['a', 'b'] }, { id: 'right', curve: chart.right, vertices: ['b', 'c'] }, { id: 'left', curve: chart.left, vertices: ['a', 'c'] }],
    bodies: [{ id: 'patch', kind: 'sheet', shells: [{ id: 'shell', closed: false, faces: [{ id: 'face', surface: made.surface, sense: 'forward', loops: [{ kind: 'outer', uses: [
      { edge: 'seam', sense: 'forward', pcurve: lineCurve('uv_seam', [0, 0, 0], [1, 0, 0]) },
      { edge: 'right', sense: 'forward', pcurve: lineCurve('uv_right', [1, 0, 0], [0, 1, 0]) },
      { edge: 'left', sense: 'reversed', pcurve: lineCurve('uv_left', [0, 0, 0], [0, 1, 0]) },
    ] }] }] }] }] });
  const report = checkBrep(brep, { strict: true, pcurveSamples: 33 });
  requireValue(report.valid, 'the native open patch does not retain its original boundary curves and trim charts.');
  return { surface: made.surface, source: made.source, brep };
}

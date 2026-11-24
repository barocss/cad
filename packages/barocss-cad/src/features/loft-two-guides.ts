import { BrepError, buildBrep, lineCurve, type Brep, type BrepFaceInput, type BrepLoopInput } from '../brep/brep-core.js';
import { solidMassFromIntegrals, type MassProperties } from '../brep/solid-mass.js';
import { gauss } from '../core/quadrature.js';
import { transferNativeMassBasis } from '../internal/native-si-mass-state.js';
import { registerTwoGuideLoftDisplay } from '../internal/two-guide-loft-display.js';
import type { Curve, Point } from '../types.js';
import { capSurface, ExtrudedProfileLimits, type ProfileSegmentInput, type XY } from './extruded-profile-solid.js';
import { admitLoftCommonFrame, loftFrameLocal, loftFramePoint, placeLoftInFrame } from './loft-common-frame.js';
import type { LoftInput, LoftQuadraticGuide, LoftSectionInput } from './loft.js';
import { twoGuideRectangle } from './loft-two-guide-rectangle.js';
import { threeSectionTwoGuideLoft } from './loft-three-section-two-guides.js';

const linearKnots = [0, 0, 1, 1], quadraticKnots = [0, 0, 0, 1, 1, 1], cubicKnots = [0, 0, 0, 0, 1, 1, 1, 1];
const corners = [0, 1, 2, 3], G5 = gauss(5), G7 = gauss(7);
const limit = ExtrudedProfileLimits.coordinateMM;
const fail = (reason: string): never => { throw new BrepError('INPUT', `loft: two guides ${reason}`); };
const pointInRange = (value: unknown): value is Point => Array.isArray(value) && value.length === 3
  && [0, 1, 2].every(i => typeof value[i] === 'number' && Number.isFinite(value[i]) && Math.abs(value[i]) <= limit);

function guideControls(value: unknown, index: number): [Point, Point, Point] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`require a quadratic Bézier for guide ${index}`);
  const guide = value as Record<string, unknown>, points = guide.controlPoints;
  if (Object.keys(guide).length !== 2 || !Object.hasOwn(guide, 'kind') || !Object.hasOwn(guide, 'controlPoints') || guide.kind !== 'quadratic-bezier'
    || !Array.isArray(points) || points.length !== 3 || !Array.from(points).every(pointInRange))
    return fail(`require guide ${index} to be a quadratic Bézier with three finite control points within ±${limit} mm`);
  return points as [Point, Point, Point];
}

function middleControl(value: unknown, index: number, start: Point, end: Point): Point {
  const points = guideControls(value, index);
  if (!start.every((x, i) => x === points[0][i]) || !end.every((x, i) => x === points[2][i]))
    return fail(`require guide ${index} endpoints to exactly match the ${index === 1 ? 'min X' : 'max X'}, min Y corners of both sections`);
  if (points[1][2] !== (start[2] + end[2]) / 2) return fail(`require the middle control of guide ${index} to lie on the section midplane`);
  return [...points[1]] as Point;
}

/** The four upright curves share the same affine height. Each slice is a rectangle with a linearly varying aspect ratio. */
export function twoGuideLoftSolid(input: LoftInput): { brep: Brep; mass: (density: number) => MassProperties } {
  if (!Array.isArray(input.guides) || input.guides.length !== 2) return fail('require exactly two quadratic Béziers');
  if (Object.hasOwn(input, 'guide')) return fail('cannot be combined with the single guide');
  if (input.smooth !== undefined && input.smooth !== false) return fail('require ruled sections');
  if (!Array.isArray(input.sections) || (input.sections.length !== 2 && input.sections.length !== 3))
    return fail('require two or three sections');
  const three = input.sections.length === 3;
  if (!input.sections.some(section => section && Object.hasOwn(section, 'frame')))
    return three ? threeSectionTwoGuideLoft(input, buildTwoGuideLoft, guideControls, fail) : buildTwoGuideLoft(input, input.guides);

  const frames = Array.from(input.sections, section => {
    const frame = section?.frame;
    if (!frame || Object.hasOwn(section, 'z') || !pointInRange(frame.origin) || !pointInRange(frame.xAxis) || !pointInRange(frame.yAxis))
      return fail(three ? 'require finite frames on all three sections and no z heights' : 'require finite frames on both sections and no z heights');
    return { origin: frame.origin, u: frame.xAxis, v: frame.yAxis };
  });
  const common = admitLoftCommonFrame(frames, fail);
  const upper = frames[three ? 2 : 1], height = loftFrameLocal(common, upper.origin)[2];
  if (three ? !(height / 2 >= ExtrudedProfileLimits.minimumLengthMM) : !(height >= ExtrudedProfileLimits.minimumLengthMM))
    return fail(three ? 'require three separated heights in increasing order' : 'require two separated heights in increasing order');
  // Three sections retain only the exact pure-normal midpoint and endpoint. Do not
  // treat a floating transverse projection of a normal displacement as a real shift.
  if (three && (!loftFramePoint(common, [0, 0, height / 2]).every((p, i) => p === frames[1].origin[i])
    || !loftFramePoint(common, [0, 0, height]).every((p, i) => p === upper.origin[i])))
    return fail('three framed sections need exact pure-normal middle and upper offsets');
  // The existing pair still admits an exactly reconstructed in-plane upper shift.
  const normalOrigin = loftFramePoint(common, [0, 0, height]);
  const [dx, dy] = three ? [0, 0] : loftFrameLocal({ ...common, origin: normalOrigin }, upper.origin);
  if (!loftFramePoint(common, [dx, dy, height]).every((p, i) => p === upper.origin[i]))
    return fail('need to reconstruct the upper frame origin exactly');
  const sections = input.sections.map((section, i): LoftSectionInput => {
    if (!Array.isArray(section.profile))
      return fail(three ? 'require a four-line rectangle on all three framed sections' : 'require a four-line rectangle on both framed sections');
    if (three) return { profile: section.profile, z: i * (height / 2) };
    if (i === 0) return { profile: section.profile, z: 0 };
    if (dx === 0 && dy === 0) return { profile: section.profile, z: height };

    // Validate the authored rectangle before carrying its vertices into the lower frame.
    twoGuideRectangle({ profile: section.profile, z: 0 }, i, fail);
    const profile = section.profile.map((segment: ProfileSegmentInput) => {
      const [x, y] = segment.start;
      const start: XY = [x + dx, y + dy];
      const world = loftFramePoint({ ...common, origin: upper.origin }, [x, y, 0]);
      if (!loftFramePoint(common, [...start, height]).every((p, axis) => p === world[axis]))
        return fail('need to reconstruct each upper rectangle corner exactly');
      return { kind: 'line' as const, start };
    });
    return { profile, z: height };
  });
  const localGuide = (guide: LoftQuadraticGuide, index: number): LoftQuadraticGuide => {
    const local = (world: Point, z: number): Point => {
      // The authored point must round-trip at the required section height. Project within that
      // section plane to avoid inventing a lateral offset when the point is its exact origin.
      const origin = loftFramePoint(common, [0, 0, z]), [x, y] = loftFrameLocal({ ...common, origin }, world);
      const point: Point = [x, y, z];
      if (!loftFramePoint(common, point).every((p, i) => p === world[i]))
        return fail(`require guide ${index} to lie at exact coordinates on its section ${z === height / 2 ? 'midplane' : 'plane'}`);
      return point;
    };
    const [start, middle, end] = guideControls(guide, index);
    return { kind: 'quadratic-bezier', controlPoints: [local(start, 0), local(middle, height / 2), local(end, height)] };
  };
  const guides: NonNullable<LoftInput['guides']> = [localGuide(input.guides[0], 1), localGuide(input.guides[1], 2)];
  const local = three ? threeSectionTwoGuideLoft({ ...input, sections, guides }, buildTwoGuideLoft, guideControls, fail)
    : buildTwoGuideLoft({ ...input, sections }, guides);
  const world = placeLoftInFrame(local, common, fail);
  if (!three) registerTwoGuideLoftDisplay(world.brep);
  return world;
}

function buildTwoGuideLoft(input: LoftInput, guides: NonNullable<LoftInput['guides']>) {
  const [lo, hi] = input.sections.map((section, i) => twoGuideRectangle(section, i, fail));
  if (!(hi.z - lo.z >= ExtrudedProfileLimits.minimumLengthMM)) return fail('require two separated heights in increasing order');
  const sideTags = input.sideTags;
  if (sideTags && (sideTags.length !== 4 || !Array.from(sideTags).every(tag => typeof tag === 'string' && tag.length > 0) || new Set(sideTags).size !== 4))
    return fail('require a unique side tag for each rectangle edge');

  const a = middleControl(guides[0], 1, lo.points[0], hi.points[0]);
  const b = middleControl(guides[1], 2, lo.points[1], hi.points[1]);
  const dx = b[0] - a[0], dy = b[1] - a[1], aspectLo = lo.depth / lo.width, aspectHi = hi.depth / hi.width;
  const cubic = aspectLo !== aspectHi;
  // Multiply the guide span by the linear aspect in the Bernstein basis, then rotate it 90°.
  // The end span has zero Y component at each cap. Only the inner offset coefficients are needed.
  const offsets: XY[] = cubic ? [
    [(-2 * aspectLo * dy) / 3, (2 * aspectLo * dx + aspectHi * lo.width) / 3],
    [(-2 * aspectHi * dy) / 3, (2 * aspectHi * dx + aspectLo * hi.width) / 3],
  ] : [[-dy * aspectLo, dx * aspectLo]];
  // The projected width and depth are bounded below by their Bernstein coefficients.
  const minimum = ExtrudedProfileLimits.minimumLengthMM;
  if (!(dx >= minimum && offsets.every(([, depth]) => depth >= minimum)))
    return fail('require guide 2 to stay to the right of guide 1 by a positive control gap');
  const guideRows = [[lo.points[0], a, hi.points[0]], [lo.points[1], b, hi.points[1]]];
  const frontRows = cubic ? guideRows.map(elevateQuadratic) : guideRows;
  const backRows = [2, 3].map(i => {
    const front = frontRows[3 - i];
    const inner = offsets.map(([ox, oy], j): Point => {
      const [x, y, z] = front[j + 1];
      return [x + ox, y + oy, z];
    });
    return [lo.points[i], ...inner, hi.points[i]];
  });
  if (!backRows.every(row => row.every(pointInRange))) return fail('would move the section outside the modeling coordinate range');
  const rows = [...frontRows, ...backRows], railRows = [...guideRows, ...backRows];

  const { id, name } = input;
  const vertex = (k: number, i: number) => `v${k}_${i % 4}`, ring = (k: number, i: number) => `r${k}_${i % 4}`, rail = (i: number) => `l0_${i % 4}`;
  const side = (i: number) => `${name}.${sideTags ? `side[${sideTags[lo.tags[i % 4]]}]` : `side${i % 4}`}`;
  const vertices = [lo, hi].flatMap(({ points }, k) => points.map((point, i) => ({ id: vertex(k, i), point })));
  const edges = [lo, hi].flatMap(({ points }, k) => points.map((p, i) => edge(ring(k, i), lineCurve(ring(k, i), p, points[(i + 1) % 4]),
    vertex(k, i), vertex(k, i + 1), side(i), `${name}.${k ? 'top' : 'bottom'}`)));
  for (const i of corners) {
    const controlPoints = railRows[i], degree = controlPoints.length - 1;
    edges.push(edge(rail(i), { kind: 'curve', id: rail(i), degree, knots: [...(degree === 2 ? quadraticKnots : cubicKnots)],
      controlPoints, weights: controlPoints.map(() => 1) }, vertex(0, i), vertex(1, i), side(i + 3), side(i)));
  }

  const faces = corners.map((i): BrepFaceInput => {
    const face = `f0_${i}`, weights = rows[i].map(() => 1);
    return { id: face, name: side(i), sense: 'forward', surface: { kind: 'surface', id: face, degreeU: 1, degreeV: cubic ? 3 : 2,
      knotsU: [...linearKnots], knotsV: [...(cubic ? cubicKnots : quadraticKnots)],
      controlPoints: [rows[i], rows[(i + 1) % 4]], weights: [weights, [...weights]] }, loops: [{ kind: 'outer', uses: [
        use(face, ring(0, i), 'forward', [0, 0], [1, 0]), use(face, rail(i + 1), 'forward', [1, 0], [1, 1]),
        use(face, ring(1, i), 'reversed', [0, 1], [1, 1]), use(face, rail(i), 'reversed', [0, 0], [0, 1]),
      ] }] };
  });
  for (const [k, section] of [lo, hi].entries()) {
    const face = k ? 'top' : 'bottom', uv: XY[] = k ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
    faces.push({ id: face, name: `${name}.${face}`, sense: 'forward', surface: capSurface(section.bounds, section.z, face, k === 1), loops: [{ kind: 'outer', uses:
      corners.map(j => k ? j : 3 - j).map(i => use(face, ring(k, i), k ? 'forward' : 'reversed', uv[i], uv[(i + 1) % 4])) }] });
  }
  const brep = buildBrep({ source: { family: 'loft', id }, vertices, edges, bodies: [{ id, kind: 'solid', shells: [{ id: `${id}.shell`, faces, closed: true }] }] });
  registerTwoGuideLoftDisplay(brep);
  const origin = lo.points[0], integrals = sliceIntegrals(rows, origin, hi.z - lo.z);
  return { brep, mass: (density: number) => {
    const local = solidMassFromIntegrals(integrals, density, 'quadrature');
    const result = { ...local, centroid: local.centroid.map((x, i) => x + origin[i]) as Point };
    transferNativeMassBasis(local, result);
    return result;
  } };
}

/** Degree elevation preserves the guide, including its height parameter, on the cubic side patch. */
function elevateQuadratic([start, middle, end]: Point[]): Point[] {
  const inner = (p: Point): Point => p.map((x, i) => x + (middle[i] - x) * (2 / 3)) as Point;
  return [start, inner(start), inner(end), end];
}

function edge(id: string, curve: Curve, a: string, b: string, left: string, right: string) {
  return { id, curve, vertices: [a, b] as [string, string], name: [left, right].sort().join('|') };
}

function use(face: string, edge: string, sense: 'forward' | 'reversed', start: XY, end: XY): BrepLoopInput['uses'][number] {
  // Pcurves run with their owning 3D edge; loop sense only changes traversal.
  return { edge, sense, pcurve: lineCurve(`uv_${face}_${edge}`, [...start, 0], [...end, 0]) };
}

/** Polygon moments of the native slice have degree at most four times the rail degree. */
function sliceIntegrals(rows: Point[][], origin: Point, height: number): number[] {
  const integrals = Array<number>(10).fill(0), cubic = rows[0].length === 4, rule = cubic ? G7 : G5;
  rule.x.forEach((t, i) => {
    const v = 1 - t, weights = cubic ? [v ** 3, 3 * t * v * v, 3 * t * t * v, t ** 3] : [v * v, 2 * t * v, t * t], z = t * height;
    const slice = rows.map(row => [0, 1].map(axis => row.reduce((sum, p, j) => sum + weights[j] * (p[axis] - origin[axis]), 0)));
    let area = 0, x = 0, y = 0, xx = 0, yy = 0, xy = 0;
    for (const j of corners) {
      const [a, b] = slice[j], [c, d] = slice[(j + 1) % 4], cross = a * d - b * c;
      area += cross / 2;
      x += cross * (a + c) / 6; y += cross * (b + d) / 6;
      xx += cross * (a * a + a * c + c * c) / 12; yy += cross * (b * b + b * d + d * d) / 12;
      xy += cross * (2 * a * b + a * d + b * c + 2 * c * d) / 24;
    }
    const w = height * rule.w[i];
    [area, x, y, z * area, xx, yy, z * z * area, xy, z * x, z * y].forEach((moment, j) => { integrals[j] += w * moment; });
  });
  return integrals;
}

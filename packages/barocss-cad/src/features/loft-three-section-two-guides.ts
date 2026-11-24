import { checkBrep, type Brep, type BrepFace } from '../brep/brep-core.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import { glueAtSharedFace } from '../brep/brep-glue.js';
import { combineMassProperties, type MassProperties } from '../brep/solid-mass.js';
import { binary64Dyadic } from '../core/dyadic.js';
import { unsupportedNativeMass } from '../internal/native-si-mass-state.js';
import { ExtrudedProfileLimits } from './extruded-profile-solid.js';
import { twoGuideRectangle } from './loft-two-guide-rectangle.js';
import type { LoftInput } from './loft.js';
import type { Point } from '../types.js';

type BuiltLoft = { brep: Brep; mass: (density: number) => MassProperties };
type Fail = (reason: string) => never;
type Controls = [Point, Point, Point];
type SpanBuilder = (input: LoftInput, guides: NonNullable<LoftInput['guides']>) => BuiltLoft;
type GuideReader = (value: unknown, index: number) => Controls;
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const limit = ExtrudedProfileLimits.coordinateMM;

/** No rounded split may replace an authored quadratic control. */
function midpoint(a: number, b: number, fail: Fail): number {
  const middle = (a + b) / 2, x = binary64Dyadic(a), y = binary64Dyadic(b), m = binary64Dyadic(middle);
  const exponent = Math.max(x.k, y.k, m.k);
  if ((x.m << BigInt(exponent - x.k)) + (y.m << BigInt(exponent - y.k)) !== 2n * (m.m << BigInt(exponent - m.k)))
    return fail('three-section guides need exactly representable dyadic midpoint controls');
  return middle;
}

function split(points: Controls, fail: Fail): [Controls, Controls] {
  const half = (a: Point, b: Point): Point => a.map((x, i) => midpoint(x, b[i], fail)) as Point;
  const left = half(points[0], points[1]), right = half(points[1], points[2]), centre = half(left, right);
  const copy = (p: Point): Point => [...p];
  return [[copy(points[0]), left, copy(centre)], [centre, right, copy(points[2])]];
}

/** The middle edge uses the same full line and parameter direction on both native caps. */
function exactMiddleCap(brep: Brep, name: string, points: readonly Point[], normal: 1 | -1): BrepFace | undefined {
  const matches = brep.faces.filter(face => face.name === name), face = matches[0];
  if (matches.length !== 1 || face.loops.length !== 1 || face.surface.kind !== 'surface') return;
  const surface = face.surface, plane = faceGeometry(face);
  if (plane.kind !== 'plane' || !same(plane.n, [0, 0, normal]) || plane.o[2] !== points[0][2]
    || surface.degreeU !== 1 || surface.degreeV !== 1 || surface.controlPoints.length !== 2
    || !surface.controlPoints.every(row => row.length === 2 && row.every(p => p[2] === points[0][2]))
    || !same(surface.knotsU, [0, 0, 1, 1]) || !same(surface.knotsV, [0, 0, 1, 1])
    || surface.weights.length !== 2 || !surface.weights.every(row => same(row, [1, 1]))) return;
  const loop = brep.loops.find(loop => loop.id === face.loops[0]);
  if (!loop || loop.face !== face.id || loop.kind !== 'outer' || loop.coedges.length !== 4) return;
  const uses = new Map(brep.coedges.map(use => [use.id, use])), edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point])), matched = new Set<number>();
  for (const id of loop.coedges) {
    const use = uses.get(id), edge = use && edges.get(use.edge), curve = edge?.curve;
    if (!use || use.loop !== loop.id || !use.pcurve || !edge || !curve || curve.degree !== 1
      || curve.controlPoints.length !== 2 || !same(curve.knots, [0, 0, 1, 1]) || !same(curve.weights, [1, 1])
      || !same(vertices.get(edge.vertices[0]) ?? [], curve.controlPoints[0])
      || !same(vertices.get(edge.vertices[1]) ?? [], curve.controlPoints[1])) return;
    const index = points.findIndex((point, i) => same(point, curve.controlPoints[0]) && same(points[(i + 1) % 4], curve.controlPoints[1]));
    if (index < 0 || matched.has(index)) return;
    matched.add(index);
  }
  return matched.size === 4 ? face : undefined;
}

/** Positive polynomial weights keep each complete span on its own side of the shared cap. */
function staysInSlab(brep: Brep, lo: number, hi: number): boolean {
  const inside = (p: readonly number[]) => p.length === 3 && p.every(x => Number.isFinite(x) && Math.abs(x) <= limit)
    && p[2] >= lo && p[2] <= hi;
  return brep.vertices.every(vertex => inside(vertex.point))
    && brep.edges.every(edge => edge.curve.controlPoints.every(inside) && edge.curve.weights.every(w => Number.isFinite(w) && w > 0))
    && brep.faces.every(face => face.surface.kind === 'surface' && face.surface.controlPoints.every(row => row.every(inside))
      && face.surface.weights.every(row => row.every(w => Number.isFinite(w) && w > 0)));
}

/** Exactly three horizontal stations and two unchanged full quadratic guides; each span retains its ruled law. */
export function threeSectionTwoGuideLoft(input: LoftInput, buildSpan: SpanBuilder, readGuide: GuideReader, fail: Fail): BuiltLoft {
  if (!Array.isArray(input.sections) || input.sections.length !== 3 || !Array.isArray(input.guides) || input.guides.length !== 2
    || Object.hasOwn(input, 'guide') || (input.smooth !== undefined && input.smooth !== false))
    return fail('need exactly three ruled rectangles and two quadratic Béziers');
  if (Array.from(input.sections).some(section => !section || Object.hasOwn(section, 'frame')))
    return fail('need horizontal rectangles with no explicit frames for three sections');
  const [lo, middle, hi] = input.sections.map((section, i) => twoGuideRectangle(section, i, fail));
  const height = hi.z;
  if (lo.z !== 0 || !(height / 2 >= ExtrudedProfileLimits.minimumLengthMM) || middle.z !== height / 2)
    return fail('need a lower section at 0 mm and a middle section exactly halfway to the end height');
  const source = input.guides.map((guide, i) => readGuide(guide, i + 1));
  if (source.some(points => points[0][2] !== 0 || points[1][2] !== middle.z || points[2][2] !== height))
    return fail('need both quadratic guides to have height controls at the lower, middle and upper stations');
  if (!(source[1][1][0] - source[0][1][0] >= ExtrudedProfileLimits.minimumLengthMM))
    return fail('guide 2 must stay to the right of guide 1 by a positive full-guide control gap');
  const halves = source.map(points => split(points, fail));
  if (!same(halves[0][0][2], middle.points[0]) || !same(halves[1][0][2], middle.points[1]))
    return fail('need both guides to match the middle rectangle front corners exactly at parameter 1/2');
  const firstTags = input.sideTags;
  if (firstTags && (firstTags.length !== 4 || !Array.from(firstTags).every(tag => typeof tag === 'string' && tag.length > 0)
    || new Set(firstTags).size !== 4)) return fail('require a unique side tag for each rectangle edge');
  const middleTags = firstTags && Array<string>(4);
  if (middleTags) for (let i = 0; i < 4; i++) middleTags[middle.tags[i]] = firstTags![lo.tags[i]];
  const guides = (span: 0 | 1): NonNullable<LoftInput['guides']> => [
    { kind: 'quadratic-bezier', controlPoints: halves[0][span] },
    { kind: 'quadratic-bezier', controlPoints: halves[1][span] },
  ];
  const firstName = `${input.name}.s0`, secondName = `${input.name}.s1`;
  const first = buildSpan({ ...input, name: firstName, sections: input.sections.slice(0, 2) }, guides(0));
  const second = buildSpan({ ...input, name: secondName, sections: input.sections.slice(1),
    ...(middleTags ? { sideTags: middleTags } : {}) }, guides(1));
  const firstCap = exactMiddleCap(first.brep, `${firstName}.top`, middle.points, 1);
  const secondCap = exactMiddleCap(second.brep, `${secondName}.bottom`, middle.points, -1);
  if (!firstCap || !secondCap || !staysInSlab(first.brep, 0, middle.z) || !staysInSlab(second.brep, middle.z, height))
    return fail('the exact middle cap and separated native span carriers could not be certified');
  const glued = glueAtSharedFace(first.brep, second.brep, { family: 'loft', id: input.id });
  if (!glued) return fail('the exact middle cap could not be joined without a Boolean fallback');
  const rename = (name: string | undefined) => name?.replaceAll(`${firstName}.bottom`, `${input.name}.bottom`)
    .replaceAll(`${secondName}.top`, `${input.name}.top`);
  const brep: Brep = { ...glued, faces: glued.faces.map(face => ({ ...face, name: rename(face.name) })),
    edges: glued.edges.map(edge => ({ ...edge, name: rename(edge.name) })) };
  const report = checkBrep(brep, { strict: true }), counts = report.counts;
  if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 0
    || counts.bodies !== 1 || counts.shells !== 1 || counts.faces !== 10 || counts.loops !== 10
    || counts.coedges !== 40 || counts.edges !== 20 || counts.vertices !== 12
    || brep.faces.some(face => face.name === `${firstName}.top` || face.name === `${secondName}.bottom`)
    || brep.coedges.some(use => use.pcurve === null))
    return fail('the joined three-section loft must retain one strict solid, the shared middle ring and every pcurve');
  return { brep, mass: density => {
    // Both child centroids already use the same global Z coordinates; do not translate the upper span again.
    const axes: [Point, Point, Point] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], offset: Point = [0, 0, 0];
    const combined = combineMassProperties([{ props: first.mass(density), axes, offset }, { props: second.mass(density), axes, offset }]);
    return unsupportedNativeMass({ ...combined, method: 'quadrature' }, 'combined');
  } };
}

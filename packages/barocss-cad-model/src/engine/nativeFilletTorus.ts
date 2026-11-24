import { CadNumericPolicy, checkBrep, faceGeometry, revolutionOf, type BrepFace, type CadPartOutput, type Curve } from '@barocss/cad';
import type { DisplayFace } from './mesh';
import { add, cross, dot, len, scale, sub, unit, type Vec3 } from './vec3';

/** Native surface and exact resolved edge of a single terminal toroidal fillet. */
export interface NativeFilletTorus {
  edge: string;
  face: string;
  centre: Vec3;
  axis: Vec3;
  majorRadius: number;
  radius: number;
}

export interface NativeFilletTorusFace extends Omit<NativeFilletTorus, 'edge'> {
  faceId: string;
}

/** Independent resolved targets and separate native surfaces; their array indices do not match. */
export interface NativeFilletTorusPair {
  targets: readonly [string, string];
  tori: readonly [NativeFilletTorusFace, NativeFilletTorusFace];
}

/** Two adjacent native half charts of one complete original cap-rim round. */
export interface NativeClosedFilletTorus {
  targets: readonly [string, string];
  faces: readonly [{ faceId: string; face: string }, { faceId: string; face: string }];
  centre: Vec3;
  axis: Vec3;
  majorRadius: number;
  radius: number;
  height: number;
}

function torusGeometry(face: BrepFace): Omit<NativeFilletTorus, 'edge' | 'face'> | undefined {
  if (face.surface.kind !== 'surface') return;
  const points = face.surface.controlPoints.flat(), origin = points[0];
  if (!origin) return;
  const size = points.reduce((extent, point) => Math.max(extent, len(sub(point, origin))), 0);
  if (!(size > 0) || !Number.isFinite(size)) return;
  let revolution: ReturnType<typeof revolutionOf>;
  try { revolution = revolutionOf(face.surface, size); }
  catch { return; }
  if (revolution?.profile.kind !== 'arc' || !(revolution.profile.c[0] > 0) || !(revolution.profile.r > 0)) return;
  const { c, a, profile } = revolution;
  const centre = add(c, scale(a, profile.c[1]));
  if (![...centre, ...a, profile.c[0], profile.r].every(Number.isFinite)) return;
  return { centre, axis: a, majorRadius: profile.c[0], radius: profile.r };
}

export function nativeFilletTorusOf(output: CadPartOutput): NativeFilletTorus | undefined {
  if (output.filletTargets?.length !== 1 || output.bodyCount !== 1) return;
  const { brep } = output, [edge] = output.filletTargets;
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' ||
    brep.shells.length !== 1 || !brep.shells[0].closed) return;
  const faces = brep.faces.filter(face => face.name?.startsWith(output.feature + '.'));
  const face = faces[0];
  if (faces.length !== 1 || face.name !== output.feature + '.face') return;
  const geometry = torusGeometry(face);
  return geometry && { edge, face: face.name, ...geometry };
}

export function nativeFilletTorusPairOf(output: CadPartOutput): NativeFilletTorusPair | undefined {
  const { brep, filletTargets: targets } = output;
  if (targets?.length !== 2 || targets[0] === targets[1] || output.bodyCount !== 1 ||
    brep.source.family !== 'analytic-boolean' || brep.source.id !== output.feature ||
    brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 1 ||
    brep.shells.length !== 1 || !brep.shells[0].closed || brep.bodies[0].shells[0] !== brep.shells[0].id) return;
  const faces = brep.faces.filter(face => face.name?.startsWith(output.feature + '.'));
  if (faces.length !== 2 || faces[0].id === faces[1].id ||
    !faces.some(face => face.name === output.feature + '.face#1') ||
    !faces.some(face => face.name === output.feature + '.face#2')) return;
  try {
    if (!checkBrep(brep, { strict: true }).valid) return;
    const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
    const uses = new Map(brep.coedges.map(use => [use.id, use]));
    const blendIds = new Set(faces.map(face => face.id)), trimIds = new Set<string>();
    for (const face of faces) {
      const loop = loops.get(face.loops[0]);
      if (face.shell !== brep.shells[0].id || face.loops.length !== 1 ||
        !loop || loop.face !== face.id || loop.kind !== 'outer' || loop.coedges.length !== 4) return;
      for (const id of loop.coedges) {
        const use = uses.get(id), twin = use?.twin && uses.get(use.twin);
        if (!use || use.loop !== loop.id || !twin || twin.twin !== use.id || twin.edge !== use.edge ||
          blendIds.has(loops.get(twin.loop)?.face ?? '') || trimIds.has(use.edge)) return;
        trimIds.add(use.edge);
      }
    }
    const tori = faces.map(face => {
      const geometry = torusGeometry(face);
      return geometry && Math.abs(len(geometry.axis) - 1) <= 1e-9
        ? { faceId: face.id, face: face.name!, ...geometry } : undefined;
    });
    const [first, second] = tori;
    if (!first || !second) return;
    return { targets: [targets[0], targets[1]], tori: [first, second] };
  } catch {
    // Missing or unsupported native ownership leaves the typed radius available.
    return;
  }
}

const closedHalfKnots = [0, 0, 0, .5, .5, 1, 1, 1], closedQuarterKnots = [0, 0, 0, 1, 1, 1];
const closedHalfWeights = [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1], closedQuarterWeights = [1, Math.SQRT1_2, 1];
const closedSame = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const closedNear = (a: readonly number[], b: readonly number[], tolerance: number) => a.length === b.length &&
  a.every((value, i) => Number.isFinite(value) && Number.isFinite(b[i]) && Math.abs(value - b[i]) <= tolerance);

/** Compare the complete native rational boundary, including every pole and normalized weight/domain. */
function closedIsoMatches(curve: Curve, points: readonly Vec3[], weights: readonly number[], knots: readonly number[], tolerance: number): boolean {
  if (curve.degree !== 2 || curve.controlPoints.length !== points.length || curve.weights.length !== weights.length ||
    curve.knots.length !== knots.length || !(curve.weights[0] > 0)) return false;
  const first = curve.knots[0], width = curve.knots[curve.knots.length - 1] - first;
  if (!(width > 0) || !Number.isFinite(width) || !closedNear(curve.knots.map(knot => (knot - first) / width), knots, 64 * Number.EPSILON)) return false;
  return [false, true].some(reverse => curve.controlPoints.every((point, i) => {
    const j = reverse ? points.length - 1 - i : i;
    return closedNear(point, points[j], tolerance) && Number.isFinite(curve.weights[i]) &&
      Math.abs(curve.weights[i] / curve.weights[0] - weights[j] / weights[reverse ? weights.length - 1 : 0]) <= 64 * Number.EPSILON;
  }));
}

function closedHalfChart(face: BrepFace, capSign: number, tolerance: number) {
  const surface = face.surface, geometry = torusGeometry(face);
  if (!geometry || surface.kind !== 'surface' || surface.degreeU !== 2 || surface.degreeV !== 2 ||
    !closedSame(surface.knotsU, closedHalfKnots) || !closedSame(surface.knotsV, closedQuarterKnots) ||
    surface.controlPoints.length !== 5 || surface.controlPoints.some(row => row.length !== 3) ||
    surface.weights.length !== 5 || surface.weights.some(row => row.length !== 3) ||
    Math.hypot(geometry.axis[0], geometry.axis[1]) > 1e-9 || Math.abs(Math.abs(geometry.axis[2]) - 1) > 1e-9) return;
  const { centre, majorRadius, radius } = geometry, outer = majorRadius + radius;
  const wallColumn = Math.abs(surface.controlPoints[0][0][2] - centre[2]) <= tolerance ? 0 : 2;
  const capColumn = 2 - wallColumn, vDirection = wallColumn === 0 ? 1 : -1;
  const radial = (point: Vec3) => unit([point[0] - centre[0], point[1] - centre[1], 0]);
  const first = radial(surface.controlPoints[0][wallColumn]), middle = radial(surface.controlPoints[2][wallColumn]);
  const turn = cross(first, middle)[2];
  if (Math.abs(dot(first, middle)) > 1e-9 || Math.abs(Math.abs(turn) - 1) > 1e-9 ||
    turn * vDirection * capSign * (face.sense === 'forward' ? 1 : -1) <= 0) return;
  const last = scale(first, -1), directions = [first, add(first, middle), middle, add(middle, last), last];
  const weight = surface.weights[0][0];
  if (!(weight > 0) || !Number.isFinite(weight)) return;
  // Positive quarter-net denominators are at least 1/2. Keep normalized coefficient noise
  // below the existing geometric budget at this carrier's scale, including rational division.
  const coefficientTolerance = tolerance / (16 * Math.max(1, outer + radius));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const column = vDirection === 1 ? j : 2 - j;
    const expected: Vec3 = [centre[0] + directions[i][0] * (j === 2 ? majorRadius : outer),
      centre[1] + directions[i][1] * (j === 2 ? majorRadius : outer), centre[2] + (j === 0 ? 0 : capSign * radius)];
    if (!closedNear(surface.controlPoints[i][column], expected, tolerance) ||
      !Number.isFinite(surface.weights[i][column]) ||
      Math.abs(surface.weights[i][column] / weight - closedHalfWeights[i] * closedQuarterWeights[j]) > coefficientTolerance) return;
  }
  return { geometry, first, middle, surface, wallColumn, capColumn };
}

export function closedFilletRimNames(owner: string, capSign: 1 | -1): readonly [string, string] {
  return capSign === 1 ? [`${owner}.side0#1|${owner}.top`, `${owner}.side0#2|${owner}.top`]
    : [`${owner}.bottom|${owner}.side0#1`, `${owner}.bottom|${owner}.side0#2`];
}

/** A shared drag keeps positive native wall height and cap radius. Typed radii retain their own admission. */
export function closedFilletDragLimit(stockRadius: number, height: number): number {
  return Math.min(stockRadius, height / 2) - 2 * CadNumericPolicy.linearTolerance;
}

/** Certify a complete cap-rim round, including the exact two chart boundaries and wall and cap ownership. */
export function nativeClosedFilletTorusOf(output: CadPartOutput): NativeClosedFilletTorus | undefined {
  return closedFilletTori(output, 1)?.[0];
}

/** Both rounded rims of one cylinder with its two original central wall charts still present. */
export function nativeClosedFilletTorusPairOf(output: CadPartOutput): readonly [NativeClosedFilletTorus, NativeClosedFilletTorus] | undefined {
  const tori = closedFilletTori(output, 2);
  if (!tori) return;
  const [upper, lower] = tori, tolerance = Math.max(1e-8, (upper.majorRadius + upper.radius) * 1e-9);
  if (upper.radius > closedFilletDragLimit(upper.majorRadius + upper.radius, upper.height) ||
    upper.centre[2] - lower.centre[2] <= tolerance ||
    Math.abs(upper.radius - lower.radius) > tolerance || Math.abs(upper.majorRadius - lower.majorRadius) > tolerance ||
    Math.hypot(upper.centre[0] - lower.centre[0], upper.centre[1] - lower.centre[1]) > tolerance ||
    new Set([...upper.faces, ...lower.faces].map(face => face.faceId)).size !== 4) return;
  return [upper, lower];
}

export function closedFilletDisplayFace(faces: readonly DisplayFace[], torus: NativeClosedFilletTorus): DisplayFace | undefined {
  const matches = faces.filter(face => torus.faces.some(member => member.faceId === face.id));
  if (matches.length === 1 && torus.faces.every(member => member.face.slice(0, member.face.lastIndexOf('#')) === matches[0].name)) return matches[0];
}

function closedFilletTori(output: CadPartOutput, count: 1 | 2): NativeClosedFilletTorus[] | undefined {
  const { brep, filletTargets: targets } = output;
  if (targets?.length !== 2 * count || new Set(targets).size !== targets.length || output.bodyCount !== 1 ||
    brep.source.family !== 'analytic-boolean' || brep.source.id !== output.feature ||
    brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 1 ||
    brep.shells.length !== 1 || !brep.shells[0].closed || brep.bodies[0].shells[0] !== brep.shells[0].id ||
    brep.faces.length !== 4 + 2 * count || brep.loops.length !== 4 + 2 * count || brep.coedges.length !== 12 + 8 * count ||
    brep.edges.length !== 6 + 4 * count || brep.vertices.length !== 4 + 2 * count) return;
  const owner = /^(n\d+)\./.exec(targets[0])?.[1];
  if (!owner) return;
  const signs = ([1, -1] as const).filter(sign => closedFilletRimNames(owner, sign).every(target => targets.includes(target)));
  if (signs.length !== count) return;
  const namedFace = (name: string) => brep.faces.find(face => face.name === name);
  const top = namedFace(`${owner}.top`), bottom = namedFace(`${owner}.bottom`);
  const wallA = namedFace(`${owner}.side0#1`), wallB = namedFace(`${owner}.side0#2`);
  const faces = Array.from({ length: 2 * count }, (_, i) => namedFace(`${output.feature}.face#${i + 1}`));
  if (!top || !bottom || !wallA || !wallB || !faces.every(face => !!face) ||
    new Set([top, bottom, wallA, wallB, ...faces].map(face => face.id)).size !== brep.faces.length) return;
  try {
    const report = checkBrep(brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 0) return;
    const topPlane = faceGeometry(top);
    if (topPlane.kind !== 'plane' || !(topPlane.o[2] > 0) || !Number.isFinite(topPlane.o[2])) return;
    const height = topPlane.o[2], result: NativeClosedFilletTorus[] = [];
    const initial = torusGeometry(faces[0]);
    if (!initial) return;
    const tolerance = Math.max(1e-8, (initial.majorRadius + initial.radius) * 1e-9);
    for (const [face, z, sign] of [[top, height, 1], [bottom, 0, -1]] as const) {
      const plane = faceGeometry(face);
      if (plane.kind !== 'plane' || !closedNear(plane.n, [0, 0, sign], 1e-9) || Math.abs(plane.o[2] - z) > tolerance ||
        face.loops.length !== 1 || face.surface.kind !== 'surface' || face.surface.degreeU !== 1 || face.surface.degreeV !== 1 ||
        face.surface.controlPoints.some(row => row.some(point => Math.abs(point[2] - z) > tolerance))) return;
    }
    for (const sign of signs) {
      // Use the native torus carrier to find the two half charts at this cap. The proof below
      // checks their exact reciprocal trims, so neither suffix order nor proximity grants ownership.
      const cap = sign === 1 ? top : bottom, z = sign === 1 ? height : 0;
      const charts = count === 1 ? faces : faces.filter(face => {
        const g = torusGeometry(face);
        return g && Math.abs(g.centre[2] + sign * g.radius - z) <= tolerance;
      });
      if (charts.length !== 2) return;
      const names = closedFilletRimNames(owner, sign);
      const selected = targets.filter(target => names.some(name => target === name));
      const proof = certifyClosedRim(brep, [charts[0], charts[1]], cap, [wallA, wallB], [selected[0], selected[1]], sign, height);
      if (!proof) return;
      result.push(proof);
    }
    return result;
  } catch { return; }
}

function certifyClosedRim(brep: CadPartOutput['brep'], faces: readonly [BrepFace, BrepFace], cap: BrepFace,
  walls: readonly [BrepFace, BrepFace], targets: readonly [string, string], capSign: 1 | -1, height: number): NativeClosedFilletTorus | undefined {
  const initial = torusGeometry(faces[0]);
  if (!initial) return;
  const tolerance = Math.max(1e-8, (initial.majorRadius + initial.radius) * 1e-9);
  const charts = faces.map(face => closedHalfChart(face, capSign, tolerance)), a = charts[0], b = charts[1];
  if (!a || !b || !closedNear(a.geometry.centre, b.geometry.centre, tolerance) ||
    Math.abs(a.geometry.majorRadius - b.geometry.majorRadius) > tolerance || Math.abs(a.geometry.radius - b.geometry.radius) > tolerance ||
    len(add(a.first, b.first)) > 1e-9 || len(add(a.middle, b.middle)) > 1e-9) return;
  const { centre, majorRadius, radius } = a.geometry, outerRadius = majorRadius + radius;
  if (!(centre[2] > 0 && height > centre[2]) ||
    Math.abs(centre[2] + capSign * radius - (capSign === 1 ? height : 0)) > tolerance) return;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop])), uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const seamIds = new Set<string>(), wallIds = new Set<string>();
  for (let f = 0; f < 2; f++) {
    const face = faces[f], chart = charts[f]!, { surface } = chart, loop = loops.get(face.loops[0]);
    if (face.shell !== brep.shells[0].id || face.loops.length !== 1 || !loop || loop.face !== face.id || loop.kind !== 'outer' || loop.coedges.length !== 4) return;
    const boundaries = [
      { role: 'seam', points: surface.controlPoints[0], weights: surface.weights[0], knots: closedQuarterKnots },
      { role: 'seam', points: surface.controlPoints[4], weights: surface.weights[4], knots: closedQuarterKnots },
      { role: 'wall', points: surface.controlPoints.map(row => row[chart.wallColumn]), weights: surface.weights.map(row => row[chart.wallColumn]), knots: closedHalfKnots },
      { role: 'cap', points: surface.controlPoints.map(row => row[chart.capColumn]), weights: surface.weights.map(row => row[chart.capColumn]), knots: closedHalfKnots },
    ];
    const matched = new Set<number>();
    for (const id of loop.coedges) {
      const use = uses.get(id), twin = use?.twin ? uses.get(use.twin) : undefined, edge = use && edges.get(use.edge);
      const neighbor = twin && loops.get(twin.loop)?.face;
      if (!use || use.pcurve !== null || use.loop !== loop.id || !edge || !twin || twin.twin !== use.id || twin.edge !== use.edge) return;
      const match = boundaries.flatMap((boundary, index) => closedIsoMatches(edge.curve, boundary.points, boundary.weights, boundary.knots, tolerance) ? [index] : []);
      if (match.length !== 1 || matched.has(match[0])) return;
      matched.add(match[0]);
      const role = boundaries[match[0]].role;
      if (role === 'seam') {
        if (neighbor !== faces[1 - f].id) return;
        seamIds.add(edge.id);
      } else if (role === 'cap') {
        if (neighbor !== cap.id) return;
      } else {
        const wall = walls.find(wall => wall.id === neighbor);
        if (!wall || wallIds.has(wall.id)) return;
        const cylinder = faceGeometry(wall);
        if (cylinder.kind !== 'cylinder' || cylinder.out !== 1 || !closedNear(cylinder.a, [0, 0, 1], 1e-9) ||
          Math.abs(cylinder.r - outerRadius) > tolerance || Math.hypot(cylinder.c[0] - centre[0], cylinder.c[1] - centre[1]) > tolerance) return;
        wallIds.add(wall.id);
      }
    }
    if (matched.size !== 4) return;
  }
  if (seamIds.size !== 2 || wallIds.size !== 2) return;
  return { targets, faces: [{ faceId: faces[0].id, face: faces[0].name! }, { faceId: faces[1].id, face: faces[1].name! }],
    centre, axis: [0, 0, 1], majorRadius, radius, height };
}

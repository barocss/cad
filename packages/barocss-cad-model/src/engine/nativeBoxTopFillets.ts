import { CadNumericPolicy, checkBrep, faceGeometry, type BrepEdge, type BrepFace, type CadPartOutput } from '@barocss/cad';
import { nativeFilletCardinalPlane, nativeFilletCurveMatches, nativeFilletFittedSeam, nativeFilletQuarterNet } from './nativeFilletPair';
import type { Vec3 } from './vec3';

/** One original upper box rim and its exact outward cylinder on the unplaced solid. */
export interface NativeBoxTopFillet {
  edge: string;
  faceId: string;
  centre: Vec3;
  axis: Vec3;
  radius: number;
}

type Cylinder = Extract<ReturnType<typeof faceGeometry>, { kind: 'cylinder' }>;
type Boundary = { use: string; twin: string; edge: BrepEdge; neighbor: BrepFace }[];
const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const near = (a: readonly number[], b: readonly number[], tolerance: number) => a.length === b.length
  && a.every((value, i) => Number.isFinite(value) && Math.abs(value - b[i]) <= tolerance);

/** Certify only the four-upper-rim cardinal box before opposite rounds meet or the walls disappear. */
export function nativeBoxTopFilletsOf(output: CadPartOutput): NativeBoxTopFillet[] | undefined {
  try {
    return boxTopFillets(output);
  } catch {
    // Missing or unreadable native evidence cannot authorize a History grip.
    return;
  }
}

function boxTopFillets(output: CadPartOutput): NativeBoxTopFillet[] | undefined {
  const { brep, filletTargets: targets } = output;
  if (targets?.length !== 4 || new Set(targets).size !== 4 || output.bodyCount !== 1 ||
    brep.source.family !== 'analytic-boolean' || brep.source.id !== output.feature ||
    brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 1 ||
    brep.shells.length !== 1 || !brep.shells[0].closed || brep.bodies[0].shells[0] !== brep.shells[0].id ||
    brep.faces.length !== 10 || brep.loops.length !== 10 || brep.coedges.length !== 48 ||
    brep.edges.length !== 24 || brep.vertices.length !== 16 || brep.coedges.some(use => use.pcurve !== null) ||
    brep.faces.some(face => face.loops.length !== 1) || new Set(brep.faces.map(face => face.name)).size !== 10) return;
  const roles = targets.map(edge => /^(.+)\.side([0-3])\|\1\.top$/.exec(edge));
  const stock = roles[0]?.[1];
  if (!stock || roles.some(role => !role || role[1] !== stock) || new Set(roles.map(role => role![2])).size !== 4) return;
  const blends = brep.faces.filter(face => face.name?.startsWith(output.feature + '.'));
  if (blends.length !== 4 || ![1, 2, 3, 4].every(i => blends.some(face => face.name === `${output.feature}.face#${i}`))) return;
  if (!checkBrep(brep, { strict: true }).valid) return;
  const cylinders = blends.map(face => faceGeometry(face));
  if (cylinders.some(cylinder => cylinder.kind !== 'cylinder' || cylinder.out !== 1 ||
    ![...cylinder.c, ...cylinder.a, cylinder.r].every(Number.isFinite))) return;
  const roundCylinders = cylinders as Cylinder[], radius = roundCylinders[0].r;
  const points = brep.vertices.map(vertex => vertex.point);
  if (points.some(point => !point.every(Number.isFinite))) return;
  const bounds = [0, 1, 2].map(axis => [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))]);
  const [[x0, x1], [y0, y1], [z0, z1]] = bounds, extent = Math.max(...bounds.flat().map(Math.abs));
  const tolerance = 64 * Number.EPSILON * Math.max(1, extent);
  if (!(extent <= CadNumericPolicy.coordinateAbs && radius > 2 * CadNumericPolicy.linearTolerance && radius < z1 - z0 &&
    2 * radius < x1 - x0 && 2 * radius < y1 - y0) || roundCylinders.some(cylinder => Math.abs(cylinder.r - radius) > tolerance)) return;
  const planeSpecs = [['side0', 1, y0, -1], ['side1', 0, x1, 1], ['side2', 1, y1, 1], ['side3', 0, x0, -1],
    ['top', 2, z1, 1], ['bottom', 2, z0, -1]] as const;
  if (!planeSpecs.every(([name, axis, station, sign]) => {
    const face = brep.faces.find(face => face.name === `${stock}.${name}`);
    return face && nativeFilletCardinalPlane(face, axis, station, sign, tolerance);
  })) return;

  const loops = byId(brep.loops), uses = byId(brep.coedges), edges = byId(brep.edges), faces = byId(brep.faces);
  const rounds: { face: BrepFace; cylinder: Cylinder; boundary: Boundary }[] = [];
  for (let i = 0; i < blends.length; i++) {
    const face = blends[i], cylinder = roundCylinders[i], loop = loops.get(face.loops[0]);
    if (loop?.kind !== 'outer' || loop.face !== face.id || loop.coedges.length !== 6) return;
    const boundary: Boundary = [];
    for (const id of loop.coedges) {
      const use = uses.get(id), twin = use?.twin && uses.get(use.twin), edge = use && edges.get(use.edge);
      const neighbor = twin && faces.get(loops.get(twin.loop)?.face ?? '');
      if (!use || !twin || !edge || !neighbor || twin.twin !== use.id || twin.edge !== use.edge || neighbor === face) return;
      boundary.push({ use: use.id, twin: twin.id, edge, neighbor });
    }
    const walls = boundary.filter(item => [0, 1, 2, 3].some(side => item.neighbor.name === `${stock}.side${side}`));
    const side = Number(walls[0]?.neighbor.name?.slice(-1));
    if (walls.length !== 1 || !Number.isInteger(side) || rounds[side]) return;
    const alongX = side === 0 || side === 2;
    const axis: Vec3 = alongX ? [1, 0, 0] : [0, 1, 0];
    if (!near(cylinder.a.map(Math.abs), axis, 64 * Number.EPSILON)) return;
    const station = side === 0 ? y0 + radius : side === 1 ? x1 - radius : side === 2 ? y1 - radius : x0 + radius;
    if (!near([cylinder.c[alongX ? 1 : 0], cylinder.c[2]], [station, z1 - radius], tolerance)) return;
    const a: Vec3 = alongX ? [x0, side === 0 ? y0 : y1, z1] : [side === 1 ? x1 : x0, y0, z1];
    const b: Vec3 = alongX ? [x1, a[1], z1] : [a[0], y1, z1];
    const inset: Vec3 = side === 0 ? [0, radius, 0] : side === 1 ? [-radius, 0, 0]
      : side === 2 ? [0, -radius, 0] : [radius, 0, 0];
    const shifted = (point: Vec3): Vec3 => point.map((value, k) => value + inset[k]) as Vec3;
    const lower = (point: Vec3): Vec3 => [point[0], point[1], z1 - radius];
    if (!nativeFilletQuarterNet(face, [[shifted(a), shifted(b)], [a, b], [lower(a), lower(b)]], tolerance)) return;
    const wallLine = [lower(a), lower(b)];
    const topA = shifted(a), topB = shifted(b), along = alongX ? 0 : 1;
    topA[along] += radius; topB[along] -= radius;
    const top = boundary.filter(item => item.neighbor.name === `${stock}.top`);
    if (!nativeFilletCurveMatches(walls[0].edge.curve, wallLine, tolerance) || top.length !== 1 ||
      !nativeFilletCurveMatches(top[0].edge.curve, [topA, topB], tolerance)) return;
    rounds[side] = { face, cylinder, boundary };
  }
  if (rounds.length !== 4 || [0, 1, 2, 3].some(side => !rounds[side])) return;
  // Every round has only its own wall, the cap, and two reciprocal seams to each adjacent round.
  for (let side = 0; side < 4; side++) {
    const peers = [(side + 1) % 4, (side + 3) % 4];
    const boundary = rounds[side].boundary;
    if (!peers.every(peer => boundary.filter(item => item.neighbor === rounds[peer].face).length === 2) ||
      boundary.some(item => item.neighbor !== rounds[peers[0]].face && item.neighbor !== rounds[peers[1]].face &&
        item.neighbor.name !== `${stock}.side${side}` && item.neighbor.name !== `${stock}.top`)) return;
  }
  // Reflect each corner into one canonical front-right intersection. Keep every native knot and weight.
  for (const [front, side] of [[0, 1], [0, 3], [2, 1], [2, 3]]) {
    const first = rounds[front], second = rounds[side];
    const shared = first.boundary.filter(item => item.neighbor === second.face);
    const back = second.boundary.filter(item => item.neighbor === first.face);
    if (new Set(shared.map(item => item.edge.id)).size !== 2 || shared.some(item => !back.some(other =>
      item.edge === other.edge && item.use === other.twin && item.twin === other.use))) return;
    const cornerX = side === 1 ? x1 : x0, cornerY = front === 0 ? y0 : y1;
    const transformed = shared.map(({ edge }) => ({ ...edge, curve: { ...edge.curve, controlPoints: edge.curve.controlPoints.map(point =>
      [(point[0] - cornerX) * (side === 1 ? 1 : -1), (point[1] - cornerY) * (front === 0 ? 1 : -1), point[2]] as Vec3) } }));
    const q = radius * (1 - Math.SQRT1_2), a: Vec3 = [0, 0, z1 - radius];
    const middle: Vec3 = [-q, q, z1 - radius + radius * Math.SQRT1_2], b: Vec3 = [-radius, radius, z1];
    const circle = { c: [-radius, radius, z1 - radius] as Vec3, r: radius };
    if (![false, true].some(reverse => nativeFilletFittedSeam(transformed[reverse ? 1 : 0], a, middle, 0, tolerance, circle)
      && nativeFilletFittedSeam(transformed[reverse ? 0 : 1], middle, b, 0, tolerance, circle))) return;
  }
  return targets.map<NativeBoxTopFillet>((edge, i) => {
    const { face, cylinder } = rounds[Number(roles[i]![2])];
    return { edge, faceId: face.id, centre: [...cylinder.c], axis: [...cylinder.a], radius: cylinder.r };
  });
}

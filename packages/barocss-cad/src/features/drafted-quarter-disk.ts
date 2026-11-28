import { buildBrep, checkBrep, lineCurve, type Brep, type BrepFaceInput, type BrepLoopInput } from '../brep/brep-core.js';
import { transformBrep } from '../brep/brep-transform.js';
import { binary64Dyadic } from '../core/dyadic.js';
import { CadNumericPolicy, linearToleranceMM } from '../numeric-policy.js';
import { retainDraftBaseEndpoints } from './draft-base-endpoints.js';
import { capSurface, segmentCurve, type ProfileSegment, type XY } from './extruded-profile-solid.js';
import type { Curve, Point, Surface } from '../types.js';

const LINE = [0, 0, 1, 1], QUADRATIC = [0, 0, 0, 1, 1, 1];
type Use = BrepLoopInput['uses'][number];
type Edge = { id: string; name: string; curve: Curve; vertices: [string, string] };
const use = (edge: string, sense: Use['sense'] = 'forward'): Use => ({ edge, sense });
const reverse = (edge: string): Use => use(edge, 'reversed');

type Arc = Extract<ProfileSegment, { kind: 'arc' }>;

/** Represent the original radial endpoint vectors with a common exact binary exponent. */
function radialVectors(arc: Arc): readonly [bigint, bigint, bigint, bigint] {
  const dyadics = [...arc.start, ...arc.end, ...arc.center].map(binary64Dyadic);
  const exponent = Math.max(...dyadics.map(value => value.k));
  const [ax, ay, bx, by, cx, cy] = dyadics.map(value => value.m << BigInt(exponent - value.k));
  return [ax - cx, ay - cy, bx - cx, by - cy];
}

/** Offset the two exact radial lines and one circular arc of an acute sector or quadrant. */
export function draftRadialSector(profile: readonly ProfileSegment[], names: readonly string[], z0: number, z1: number,
  slope: number, id: string, tag: string, fail: (detail: string) => never): Brep | undefined {
  if (profile.length !== 3) return;
  const i = profile.findIndex(segment => segment.kind === 'arc'), arc = profile[i];
  const startWall = profile[(i + 2) % 3], endWall = profile[(i + 1) % 3];
  if (arc?.kind !== 'arc' || startWall.kind !== 'line' || endWall.kind !== 'line') return;
  const [cx, cy] = arc.center, [ax, ay] = arc.start, [bx, by] = arc.end;
  const dx = ax - cx, dy = ay - cy, radius = arc.radius;
  if (startWall.start[0] !== cx || startWall.start[1] !== cy || endWall.end[0] !== cx || endWall.end[1] !== cy) return;
  const cardinal = dx === 0 || dy === 0;
  const x = dx / radius, y = dy / radius;
  const [ux, uy, vx, vy] = radialVectors(arc);
  const quadrant = cardinal
    ? arc.sweep === Math.PI / 2
      && ((dx === 0 && Math.abs(dy) === radius) || (dy === 0 && Math.abs(dx) === radius))
      && cx + dx === ax && cy + dy === ay && cx - dy === bx && cy + dx === by
      && bx - cx === -dy && by - cy === dx
    : arc.sweep > 0 && arc.sweep < Math.PI && vx === -uy && vy === ux;
  if (!quadrant && !(arc.sweep > 0 && arc.sweep < Math.PI / 2 && ux * vx + uy * vy > 0n
    && ux * vy - uy * vx > 0n && ux * ux + uy * uy === vx * vx + vy * vy)) return;
  const c = quadrant ? 0 : (x * (bx - cx) + y * (by - cy)) / radius;
  const s = quadrant ? 1 : (x * (by - cy) - y * (bx - cx)) / radius;
  if (!cardinal || !quadrant) {
    const size = Math.max(1, radius, Math.abs(ax), Math.abs(ay), Math.abs(bx), Math.abs(by), Math.abs(cx), Math.abs(cy));
    const roundoff = 64 * Number.EPSILON * size;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x * x + y * y - 1) > 16 * Number.EPSILON
      || (!quadrant && !(c > 0 && s > 0))
      || Math.abs(c * c + s * s - 1) > 32 * Number.EPSILON
      || Math.hypot(cx + radius * x - ax, cy + radius * y - ay) > roundoff
      || Math.hypot(cx + radius * (x * c - y * s) - bx, cy + radius * (y * c + x * s) - by) > roundoff)
      fail(quadrant ? 'the quarter disk does not have a stable radial frame' : 'the acute sector does not have a stable radial frame');
  }

  const profileName = quadrant ? 'quarter-disk' : 'acute sector';
  const h = z1 - z0, d = slope * h, r = radius - d;
  if (!(d < 0 ? r > radius : d > 0 && r < radius)) fail(`the angle is too small to move the ${profileName} walls`);
  const q = Math.sqrt(radius * (radius - 2 * d));
  const cotangent = (1 + c) / s;
  const corner = cotangent * d;
  const limit = linearToleranceMM(Math.max(radius, h, Math.abs(cx), Math.abs(cy), Math.abs(z0), Math.abs(z1)));
  // The two radial walls must still meet inside the circle, for either sign of the draft.
  if (!(r > limit && q - Math.abs(corner) > limit))
    fail(`the draft closes the ${profileName} at or before the top (steeper than the profile allows)`);

  const midAngle = quadrant ? Math.PI / 4 : Math.atan2(s, c) / 2;
  const bisectorX = quadrant ? Math.SQRT1_2 : Math.cos(midAngle);
  const bisectorY = quadrant ? Math.SQRT1_2 : Math.sin(midAngle);
  const lastWallPoint = (along: number, across: number, z: number): Point =>
    quadrant ? [across, along, z] : [c * along + s * across, s * along - c * across, z];
  const points: Record<string, Point> = {
    b0: [0, 0, 0], b1: [radius, 0, 0], b2: [radius * bisectorX, radius * bisectorY, 0], b3: lastWallPoint(radius, 0, 0),
    t0: [corner, d, h], t1: [q, d, h], t2: [r * bisectorX, r * bisectorY, h], t3: lastWallPoint(q, d, h),
  };
  const bottom = tag + '.bottom', top = tag + '.top';
  const firstWall = names[(i + 2) % 3], lastWall = names[(i + 1) % 3];
  const firstCone = names[i] + '#1', secondCone = names[i] + '#2';
  const sides = [firstWall, firstCone, secondCone, lastWall];
  const edges: Edge[] = [];
  const edge = (key: string, from: string, to: string, faceA: string, faceB: string, curve?: Curve) => {
    edges.push({ id: key, name: [faceA, faceB].sort().join('|'),
      vertices: [from, to], curve: curve ?? lineCurve(key, points[from], points[to]) });
  };
  const arcAt = (key: string, from: string, to: string, size: number, startAngle: number, sweep: number) => {
    const a = points[from], b = points[to];
    return segmentCurve({ kind: 'arc', center: [0, 0], radius: size, start: [a[0], a[1]],
      end: [b[0], b[1]], startAngle, sweep, length: size * sweep }, a[2], key);
  };
  const topAngle = Math.atan2(d, q);
  const bottomArcs = [arcAt('be1', 'b1', 'b2', radius, 0, midAngle), arcAt('be2', 'b2', 'b3', radius, midAngle, midAngle)];
  const topArcs = [arcAt('te1', 't1', 't2', r, topAngle, midAngle - topAngle), arcAt('te2', 't2', 't3', r, midAngle, midAngle - topAngle)];
  for (const j of sides.keys()) {
    const next = (j + 1) % 4;
    edge('be' + j, 'b' + j, 'b' + next, bottom, sides[j], bottomArcs[j - 1]);
    edge('te' + j, 't' + j, 't' + next, top, sides[j], topArcs[j - 1]);
  }

  // The cone meets each radial wall in the same parabola measured along that wall's local ray.
  const xMid = (radius + q) / 2, zMid = h * radius / (radius + q), offset = slope * zMid;
  const parabola = (key: string, j: number, middle: Point): Curve => ({
    kind: 'curve', id: key, degree: 2, knots: QUADRATIC, weights: [1, 1, 1],
    controlPoints: [points['b' + j], middle, points['t' + j]],
  });
  edge('se0', 'b0', 't0', lastWall, firstWall);
  edge('se1', 'b1', 't1', firstWall, firstCone, parabola('se1', 1, [xMid, offset, zMid]));
  edge('se2', 'b2', 't2', firstCone, secondCone);
  edge('se3', 'b3', 't3', secondCone, lastWall, parabola('se3', 3, lastWallPoint(xMid, offset, zMid)));

  // The wider angular end contains the two exact parabolas throughout the extrusion.
  const supportRadius = d < 0 ? r : radius, supportArcs = d < 0 ? topArcs : bottomArcs;
  const cone = (key: string, curve: Curve): Surface => ({
    kind: 'surface', id: key, degreeU: curve.degree, degreeV: 1, knotsU: curve.knots, knotsV: LINE,
    controlPoints: curve.controlPoints.map(([x, y]) => [
      [x * (radius / supportRadius), y * (radius / supportRadius), 0],
      [x * (r / supportRadius), y * (r / supportRadius), h],
    ]),
    weights: curve.weights.map(weight => [weight, weight]),
  });
  const lo = Math.min(0, corner), hi = Math.max(radius, q);
  const wall = (key: string, controlPoints: Point[][]): Surface => ({
    kind: 'surface', id: key, degreeU: 1, degreeV: 1, knotsU: LINE, knotsV: LINE,
    controlPoints, weights: [[1, 1], [1, 1]],
  });
  const surfaces = [
    wall('first-wall', [[[lo, 0, 0], [lo, d, h]], [[hi, 0, 0], [hi, d, h]]]),
    cone('first-cone', supportArcs[0]), cone('second-cone', supportArcs[1]),
    wall('last-wall', [[lastWallPoint(hi, 0, 0), lastWallPoint(hi, d, h)], [lastWallPoint(lo, 0, 0), lastWallPoint(lo, d, h)]]),
  ];
  const face = (name: string, surface: Surface, uses: Use[]): BrepFaceInput => ({
    id: surface.id, name, surface, sense: 'forward', loops: [{ kind: 'outer', uses }],
  });
  const faces = sides.map((name, j) => face(name, surfaces[j], [
    use('be' + j), use('se' + (j + 1) % 4), reverse('te' + j), reverse('se' + j),
  ]));
  const capBounds = (prefix: 'be' | 'te'): { min: XY; max: XY } => {
    if (quadrant) return prefix === 'be' ? { min: [0, 0], max: [radius, radius] } : { min: [d, d], max: [r, r] };
    const controls = edges.filter(edge => edge.id.startsWith(prefix)).flatMap(edge => edge.curve.controlPoints);
    const xs = controls.map(point => point[0]), ys = controls.map(point => point[1]);
    return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
  };
  faces.push(face(bottom, capSurface(capBounds('be'), 0, 'bottom', false),
    [reverse('be3'), reverse('be2'), reverse('be1'), reverse('be0')]));
  faces.push(face(top, capSurface(capBounds('te'), h, 'top', true),
    [use('te0'), use('te1'), use('te2'), use('te3')]));
  const local = buildBrep({ source: { family: 'drafted-extrusion', id },
    vertices: Object.entries(points).map(([key, point]) => ({ id: key, point })), edges,
    bodies: [{ id: id + '_body', kind: 'solid', shells: [{ id: 's', closed: true, faces }] }] });
  const placed = transformBrep(local, { matrix: [x, -y, 0, y, x, 0, 0, 0, 1], offset: [cx, cy, z0] });
  const brep = cardinal && quadrant ? placed : retainDraftBaseEndpoints(placed, new Map([
    ['b0', [cx, cy, z0]], ['b1', [ax, ay, z0]], ['b3', [bx, by, z0]],
  ]));
  const inRange = (point: Point) => point.every(value => Math.abs(value) <= CadNumericPolicy.coordinateAbs);
  if (!brep.vertices.every(vertex => inRange(vertex.point))
    || !brep.edges.every(edge => edge.curve.controlPoints.every(inRange))
    || !brep.faces.every(face => face.surface.kind === 'surface' && face.surface.controlPoints.every(row => row.every(inRange))))
    fail(`the drafted ${profileName} exceeds the ±10000 mm modeling coordinate range`);
  const report = checkBrep(brep, { strict: true });
  if (!report.valid) fail(`the drafted ${profileName} is invalid: ${report.issues[0]}`);
  return brep;
}

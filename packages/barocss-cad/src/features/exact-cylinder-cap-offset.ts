// Edits of the original native two-quarter Exact cylinder Thicken.
import { BrepError, checkBrep, type Brep } from '../brep/brep-core.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import { isThickenCylinderError, thickenCylinderWallOffsetSolid, thickenCylinderSolid } from '../brep/thicken-cylinder.js';
import { validateSurface } from '../core/math.js';
import { len } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';
import { encloseAxialSideTrims, mapCapStation } from './bored-cap-offset.js';

type Source = { id: string; surface: Surface; thickness: number; side?: 'normal' | 'reverse' | 'both' };
type ReplacementPlane = { origin: Point; normal: Point };
type PriorWallOffset = { face: string; distance: number };
type PriorCapReplacement = { face: string; plane: ReplacementPlane };

function retainedBoundary(before: Brep, after: Brep, fixed: Brep['faces'][number]): boolean {
  return JSON.stringify(fixed) === JSON.stringify(after.faces.find(face => face.id === fixed.id)) && retainedTrims(before, after, fixed);
}

function retainedTrims(before: Brep, after: Brep, fixed: Brep['faces'][number]): boolean {
  const loops = new Set(fixed.loops), edges = new Set(before.coedges.filter(use => loops.has(use.loop)).map(use => use.edge));
  const vertices = new Set(before.edges.filter(edge => edges.has(edge.id)).flatMap(edge => edge.vertices));
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const next = after.faces.find(face => face.id === fixed.id);
  const { surface: oldSurface, ...oldFace } = fixed;
  const { surface: newSurface, ...newFace } = next ?? fixed;
  return next !== undefined && same(oldFace, newFace) && oldSurface.id === newSurface.id
    && before.edges.every(edge => !edges.has(edge.id) || same(edge, after.edges.find(value => value.id === edge.id)))
    && before.vertices.every(vertex => !vertices.has(vertex.id) || same(vertex, after.vertices.find(value => value.id === vertex.id)));
}

function sameSupport(before: Brep['faces'][number], after: Brep['faces'][number], extent: number): boolean {
  const a = faceGeometry(before), b = faceGeometry(after), roundoff = 128 * Number.EPSILON * Math.max(1, extent);
  if (a.kind === 'cylinder' && b.kind === 'cylinder') return a.out === b.out && Math.abs(a.r - b.r) <= roundoff
    && a.c.every((value, axis) => Math.abs(value - b.c[axis]) <= roundoff) && a.a.every((value, axis) => Math.abs(value - b.a[axis]) <= roundoff);
  return a.kind === 'plane' && b.kind === 'plane' && a.n.every((value, axis) => Math.abs(value - b.n[axis]) <= 128 * Number.EPSILON)
    && Math.abs(a.n.reduce((sum, value, axis) => sum + value * (a.o[axis] - b.o[axis]), 0)) <= roundoff;
}

function currentCap(brep: Brep, cap: NonNullable<ReturnType<typeof admitted>>) {
  return { ...cap, skins: cap.skins.map(skin => brep.faces.find(face => face.surface.id === skin.id)!.surface as Surface) };
}

function admitted(brep: Brep, faceName: string, source: Source) {
  try {
    if (source.surface.degreeU !== 2 || source.surface.degreeV !== 1 || source.surface.controlPoints.length !== 5) return;
    validateSurface(source.surface);
    // Reuse the exact dyadic two-quarter admission and the actual native producer, not a circle fit.
    // Equality binds every current support, trim, name and ID to the original authored Thicken.
    const original = thickenCylinderSolid(source);
    if (JSON.stringify(brep) !== JSON.stringify(original)) return;
    const [a, b] = source.surface.controlPoints[0], lo = Math.min(a[2], b[2]), hi = Math.max(a[2], b[2]);
    const upper = `${source.id}.${a[2] < b[2] ? 'v-max' : 'v-min'}`;
    const lower = `${source.id}.${a[2] < b[2] ? 'v-min' : 'v-max'}`;
    if ((faceName !== upper && faceName !== lower) || brep.faces.filter(face => face.name === faceName).length !== 1) return;
    const sign = faceName === upper ? 1 : -1, station = sign === 1 ? hi : lo, opposite = sign === 1 ? lo : hi;
    const skins = ['normal', 'reverse'].map(role => brep.faces.find(face => face.name === `${source.id}.${role}`)?.surface);
    if (skins.some(surface => surface?.kind !== 'surface')) return;
    const poles = skins.map(surface => (surface as Surface).controlPoints[2][sign === 1 ? 1 : 0]);
    const anchor: Point = [poles[0][0] + (poles[1][0] - poles[0][0]) / 2,
      poles[0][1] + (poles[1][1] - poles[0][1]) / 2, station];
    return { anchor, lo, hi, sign, station, opposite, skins: skins as Surface[] };
  } catch { return; }
}

/** Either original axial cap, with a handle on annular material and its outward Z normal. */
export function exactSemicylinderCapOffsetFrame(brep: Brep, faceName: string, source: Source): { anchor: Point; normal: Point } | undefined {
  const cap = admitted(brep, faceName, source);
  return cap && { anchor: cap.anchor, normal: [0, 0, cap.sign] };
}

/** Only the original physical upper cap can follow an inclined replacement plane. */
export function exactSemicylinderCapReplacementFrame(brep: Brep, faceName: string, source: Source): { anchor: Point; normal: Point } | undefined {
  const cap = admitted(brep, faceName, source);
  return cap?.sign === 1 ? { anchor: cap.anchor, normal: [0, 0, 1] } : undefined;
}

function admittedWall(brep: Brep, faceName: string, source: Source) {
  try {
    const [a, b] = source.surface.controlPoints[0];
    const cap = admitted(brep, `${source.id}.${a[2] < b[2] ? 'v-max' : 'v-min'}`, source);
    if (!cap) return;
    const skins = ['normal', 'reverse'].map(role => brep.faces.find(face => face.name === `${source.id}.${role}`)!);
    const supports = skins.map(face => faceGeometry(face));
    const outerIndex = supports.findIndex(support => support.kind === 'cylinder' && support.out === 1);
    if (outerIndex < 0) return;
    const outer = skins[outerIndex], inner = skins[1 - outerIndex];
    const round = supports[outerIndex], bore = supports[1 - outerIndex];
    if (round.kind !== 'cylinder' || bore.kind !== 'cylinder' || bore.out !== -1) return;
    const skin: 'outer' | 'inner' | undefined = outer.name === faceName ? 'outer' : inner.name === faceName ? 'inner' : undefined;
    if (!skin) return;
    return { cap, skin, moving: skin === 'outer' ? outer : inner, fixed: skin === 'outer' ? inner : outer,
      support: skin === 'outer' ? round : bore, retained: skin === 'outer' ? bore : round };
  } catch { return; }
}

function wallFrame(wall: NonNullable<ReturnType<typeof admittedWall>>): { anchor: Point; normal: Point } | undefined {
  if (wall.moving.surface.kind !== 'surface') return;
  const point = wall.moving.surface.controlPoints[2][0], dx = point[0] - wall.support.c[0], dy = point[1] - wall.support.c[1];
  const radius = Math.hypot(dx, dy);
  const sign = wall.skin === 'outer' ? 1 : -1;
  return { anchor: [point[0], point[1], wall.cap.lo + (wall.cap.hi - wall.cap.lo) / 2],
    normal: [dx === 0 ? 0 : sign * dx / radius, dy === 0 ? 0 : sign * dy / radius, 0] };
}

/** Either original skin, pointing out of material: away from the axis outside, toward it inside. */
export function exactSemicylinderWallOffsetFrame(brep: Brep, faceName: string, source: Source): { anchor: Point; normal: Point } | undefined {
  const wall = admittedWall(brep, faceName, source);
  return wall && wallFrame(wall);
}

/** Compatibility admission for only the original physical outer skin. */
export function exactSemicylinderOuterWallOffsetFrame(brep: Brep, faceName: string, source: Source): { anchor: Point; normal: Point } | undefined {
  const wall = admittedWall(brep, faceName, source);
  return wall?.skin === 'outer' ? wallFrame(wall) : undefined;
}

function offsetWall(brep: Brep, source: Source, wall: NonNullable<ReturnType<typeof admittedWall>>, distance: number, oppositeDistance = 0): Brep {
  const label = `Exact semicylinder ${wall.skin} offset`, fixedSkin = wall.skin === 'outer' ? 'inner' : 'outer';
  if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs)
    throw new BrepError('INPUT', `${label}: distance must be nonzero and within the modeling range`);
  const sign = wall.skin === 'outer' ? 1 : -1, radius = wall.support.r + sign * distance;
  const extent = Math.max(geometryScaleMM(brep.vertices.map(vertex => vertex.point)),
    Math.abs(wall.support.c[0]) + Math.abs(radius), Math.abs(wall.support.c[1]) + Math.abs(radius));
  const tolerance = linearToleranceMM(extent);
  if (wall.skin === 'inner' && !(radius > tolerance))
    throw new BrepError('GEOMETRY', `${label}: the offset would reach or cross the cylinder axis`);
  if (!((radius - wall.retained.r) * sign > tolerance))
    throw new BrepError('GEOMETRY', `${label}: the offset would reach or cross the retained ${fixedSkin} wall`);
  if (radius === wall.support.r) throw new BrepError('GEOMETRY', `${label}: distance is too small to move the wall`);
  const [cx, cy] = wall.support.c, factor = radius / wall.support.r;
  const outsideRange = (wall.moving.surface as Surface).controlPoints.flat().some(([x, y]) =>
    Math.max(Math.abs(cx + (x - cx) * factor), Math.abs(cy + (y - cy) * factor)) > CadNumericPolicy.coordinateAbs);
  if (outsideRange) throw new BrepError('GEOMETRY', `${label}: the wall leaves the modeling range`);
  let candidate: Brep;
  try { candidate = thickenCylinderWallOffsetSolid(source, wall.skin, distance, oppositeDistance); }
  catch (cause) {
    if (isThickenCylinderError(cause)) throw new BrepError('GEOMETRY', `${label}: ${cause.message}`);
    throw cause;
  }
  // A profile-chart scale change can round even the retained support. Refuse that
  // representation change instead of moving an unselected native boundary.
  if (!retainedBoundary(brep, candidate, wall.fixed))
    throw new BrepError('GEOMETRY', `${label}: the retained ${fixedSkin} boundary cannot preserve its native representation`);
  const poles = [...candidate.vertices.map(vertex => vertex.point), ...candidate.edges.flatMap(edge => edge.curve.controlPoints),
    ...candidate.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const nextExtent = geometryScaleMM(poles);
  if (!poles.every(point => point.every(Number.isFinite)) || nextExtent > CadNumericPolicy.coordinateAbs)
    throw new BrepError('GEOMETRY', `${label}: the wall leaves the modeling range`);
  const support = faceGeometry(candidate.faces.find(face => face.id === wall.moving.id)!);
  const roundoff = 64 * Number.EPSILON * Math.max(1, nextExtent);
  if (support.kind !== 'cylinder' || support.out !== wall.support.out || Math.abs(support.r - radius) > roundoff
    || support.c.some((value, axis) => Math.abs(value - wall.support.c[axis]) > roundoff)
    || support.a.some((value, axis) => value !== wall.support.a[axis])
    || candidate.vertices.some(vertex => vertex.point[2] !== wall.cap.lo && vertex.point[2] !== wall.cap.hi))
    throw new BrepError('GEOMETRY', `${label}: the ${wall.skin} support or axial stations could not be preserved`);
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `${label}: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

/** Resize one original skin; positive distance adds material and preserves the opposite skin. */
export function offsetExactSemicylinderWallIfAdmitted(brep: Brep, faceName: string, source: Source, distance: number): Brep | undefined {
  const wall = admittedWall(brep, faceName, source);
  return wall && offsetWall(brep, source, wall, distance);
}

/** Compatibility operation that continues to admit only the physical outer skin. */
export function offsetExactSemicylinderOuterWallIfAdmitted(brep: Brep, faceName: string, source: Source, distance: number): Brep | undefined {
  const wall = admittedWall(brep, faceName, source);
  return wall?.skin === 'outer' ? offsetWall(brep, source, wall, distance) : undefined;
}

function admittedSecondWall(brep: Brep, faceName: string, source: Source, prior: PriorWallOffset) {
  try {
    if (!prior || typeof prior !== 'object' || Array.isArray(prior) || Object.keys(prior).sort().join(',') !== 'distance,face') return;
    const original = thickenCylinderSolid(source);
    const first = admittedWall(original, prior.face, source), next = admittedWall(original, faceName, source);
    if (!first || !next || first.skin === next.skin) return;
    const replay = offsetWall(original, source, first, prior.distance);
    if (JSON.stringify(brep) !== JSON.stringify(replay)) return;
    const moving = brep.faces.find(face => face.id === next.moving.id)!, fixed = brep.faces.find(face => face.id === first.moving.id)!;
    const support = faceGeometry(moving), retained = faceGeometry(fixed);
    if (support.kind !== 'cylinder' || retained.kind !== 'cylinder') return;
    return { ...next, moving, fixed, support, retained };
  } catch { return; }
}

/** The other original wall on an exact replay of one certified signed radial Offset. */
export function exactSemicylinderSecondWallOffsetFrame(brep: Brep, faceName: string, source: Source, prior: PriorWallOffset): { anchor: Point; normal: Point } | undefined {
  const wall = admittedSecondWall(brep, faceName, source, prior);
  return wall && wallFrame(wall);
}

/** Apply a second signed move only to the other wall, retaining the first wall's current native boundary. */
export function offsetExactSemicylinderSecondWallIfAdmitted(brep: Brep, faceName: string, source: Source, prior: PriorWallOffset, distance: number): Brep | undefined {
  const wall = admittedSecondWall(brep, faceName, source, prior);
  return wall && offsetWall(brep, source, wall, distance, prior.distance);
}

/** Move only the selected native station. All incidence, IDs and UV charts remain owned by the source. */
export function offsetExactSemicylinderCapIfAdmitted(brep: Brep, faceName: string, source: Source, distance: number): Brep | undefined {
  const cap = admitted(brep, faceName, source);
  if (!cap) return;
  return offsetCap(brep, cap, distance);
}

function offsetCap(brep: Brep, cap: NonNullable<ReturnType<typeof admitted>>, distance: number): Brep {
  if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs)
    throw new BrepError('INPUT', 'Exact semicylinder cap offset: distance must be nonzero and within the modeling range');
  const next = cap.station + cap.sign * distance;
  const controls = [...brep.vertices.map(vertex => vertex.point), ...brep.edges.flatMap(edge => edge.curve.controlPoints),
    ...brep.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const extent = Math.max(Math.abs(next), geometryScaleMM(controls));
  if (!(extent <= CadNumericPolicy.coordinateAbs)) throw new BrepError('GEOMETRY', 'Exact semicylinder cap offset: the cap leaves the modeling range');
  if (next === cap.station) throw new BrepError('GEOMETRY', 'Exact semicylinder cap offset: distance is too small to move the cap');
  if (!((next - cap.opposite) * cap.sign > linearToleranceMM(extent)))
    throw new BrepError('GEOMETRY', 'Exact semicylinder cap offset: the offset would reach or cross the opposite cap');
  if (controls.some(point => point[2] !== cap.lo && point[2] !== cap.hi))
    throw new BrepError('GEOMETRY', 'Exact semicylinder cap offset: the native poles do not retain the two original axial stations');
  // The station assignment is the positive axial affine map, with the opposite station fixed exactly.
  const candidate = mapCapStation(brep, cap.station, () => next), report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `Exact semicylinder cap offset: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

function admittedMixed(brep: Brep, faceName: string, source: Source, prior: PriorWallOffset) {
  try {
    if (!prior || typeof prior !== 'object' || Array.isArray(prior) || Object.keys(prior).sort().join(',') !== 'distance,face') return;
    const original = thickenCylinderSolid(source), [a, b] = source.surface.controlPoints[0];
    const upper = `${source.id}.${a[2] < b[2] ? 'v-max' : 'v-min'}`;
    const radialFirst = faceName === upper && prior.face !== upper;
    if (!radialFirst && (prior.face !== upper || faceName === upper)) return;
    const cap = admitted(original, upper, source), wall = admittedWall(original, radialFirst ? prior.face : faceName, source);
    if (!cap || cap.sign !== 1 || !wall) return;
    const replay = radialFirst ? offsetWall(original, source, wall, prior.distance) : offsetCap(original, cap, prior.distance);
    if (JSON.stringify(brep) !== JSON.stringify(replay)) return;
    return { original, cap, wall, radialFirst, upper };
  } catch { return; }
}

/** One original radial skin and the original upper cap, after exact replay of the first signed recipe. */
export function exactSemicylinderMixedOffsetFrame(brep: Brep, faceName: string, source: Source, prior: PriorWallOffset): { anchor: Point; normal: Point } | undefined {
  const mixed = admittedMixed(brep, faceName, source, prior);
  if (!mixed) return;
  const { cap, wall } = mixed;
  if (mixed.radialFirst) {
    const poles = cap.skins.map(skin => (brep.faces.find(face => face.surface.id === skin.id)!.surface as Surface).controlPoints[2][1]);
    return { anchor: [poles[0][0] + (poles[1][0] - poles[0][0]) / 2, poles[0][1] + (poles[1][1] - poles[0][1]) / 2, cap.hi], normal: [0, 0, 1] };
  }
  return wallFrame({ ...wall, moving: brep.faces.find(face => face.id === wall.moving.id)!, cap: { ...wall.cap, hi: cap.hi + prior.distance } });
}

/** Canonical radial-then-upper generation makes the two admitted history orders identical. */
export function offsetExactSemicylinderMixedOffsetIfAdmitted(brep: Brep, faceName: string, source: Source, prior: PriorWallOffset, distance: number): Brep | undefined {
  const mixed = admittedMixed(brep, faceName, source, prior);
  if (!mixed) return;
  const radialDistance = mixed.radialFirst ? prior.distance : distance, axialDistance = mixed.radialFirst ? distance : prior.distance;
  const radial = offsetWall(mixed.original, source, mixed.wall, radialDistance);
  const candidate = offsetCap(radial, mixed.cap, axialDistance);
  const controls = [...candidate.edges.flatMap(edge => edge.curve.controlPoints),
    ...candidate.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const tolerance = linearToleranceMM(geometryScaleMM(controls));
  const supports = ['normal', 'reverse'].map(role => faceGeometry(candidate.faces.find(face => face.name === `${source.id}.${role}`)!));
  const outer = supports.find(support => support.kind === 'cylinder' && support.out === 1);
  const inner = supports.find(support => support.kind === 'cylinder' && support.out === -1);
  if (outer?.kind !== 'cylinder' || inner?.kind !== 'cylinder' || !(inner.r > tolerance && outer.r - inner.r > tolerance))
    throw new BrepError('GEOMETRY', 'Exact semicylinder mixed offset: the radial wall or axis cannot be resolved within the final linear tolerance');
  if (mixed.radialFirst) {
    // Both upper rims move in Z; the complete lower cap and its boundary stay exactly fixed.
    const bottom = brep.faces.find(face => face.surface.kind === 'surface' && face.surface.controlPoints.flat().every(point => point[2] === mixed.cap.lo));
    if (!bottom || !retainedBoundary(brep, candidate, bottom))
      throw new BrepError('GEOMETRY', 'Exact semicylinder mixed offset: the fixed lower boundary changed');
  } else {
    // The shared rim changes in XY, but its cap plane and the opposite radial boundary stay fixed.
    const fixed = brep.faces.find(face => face.id === mixed.wall.fixed.id)!;
    const top = candidate.faces.find(face => face.name === mixed.upper)!;
    if (!retainedBoundary(brep, candidate, fixed) || top.surface.kind !== 'surface'
      || top.surface.controlPoints.flat().some(point => point[2] !== mixed.cap.hi + prior.distance))
      throw new BrepError('GEOMETRY', 'Exact semicylinder mixed offset: the retained radial boundary or upper plane changed');
  }
  return candidate;
}

/** Tilt the original upper cap, retaining both cylinders, both radial walls and the fixed bottom. */
export function replaceExactSemicylinderCapIfAdmitted(brep: Brep, faceName: string, source: Source, plane: ReplacementPlane): Brep | undefined {
  const cap = admitted(brep, faceName, source);
  if (!cap || cap.sign !== 1) return;
  return replaceCap(brep, cap, plane);
}

function replaceCap(brep: Brep, cap: NonNullable<ReturnType<typeof admitted>>, plane: ReplacementPlane): Brep {
  const finitePoint = (point: unknown): point is Point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
  if (!plane || typeof plane !== 'object' || Array.isArray(plane) || Object.keys(plane).sort().join(',') !== 'normal,origin'
    || !finitePoint(plane.origin) || !finitePoint(plane.normal))
    throw new BrepError('INPUT', 'Replace face: the reference needs a finite origin and normal.');
  const magnitude = len(plane.normal);
  if (!Number.isFinite(magnitude) || magnitude === 0)
    throw new BrepError('INPUT', 'Replace face: the reference normal must have a finite nonzero length.');
  const [nx, ny, nz] = plane.normal.map(value => value / magnitude);
  if (Math.abs(nz) <= 64 * Number.EPSILON)
    throw new BrepError('GEOMETRY', 'Replace face: the reference plane is too close to perpendicular to the selected cap.');
  const [ox, oy, oz] = plane.origin;
  const lift = (x: number, y: number) => oz - ((x - ox) * nx + (y - oy) * ny) / nz;
  // The convex hull of an annular semicircle is its outer half disk. Linear height extrema
  // occur at the diameter endpoints or on the outer rim in the gradient direction.
  const [firstSkin] = cap.skins, first = firstSkin.controlPoints[0][0], last = firstSkin.controlPoints[4][0];
  const cx = first[0] + (last[0] - first[0]) / 2, cy = first[1] + (last[1] - first[1]) / 2;
  const radiusOf = (skin: Surface) => Math.hypot(skin.controlPoints[0][0][0] - cx, skin.controlPoints[0][0][1] - cy);
  const outer = cap.skins.reduce((a, b) => radiusOf(a) > radiusOf(b) ? a : b), radius = radiusOf(outer);
  const p = outer.controlPoints[0][0], q = outer.controlPoints[4][0], crown = outer.controlPoints[2][0];
  const gx = -nx / nz, gy = -ny / nz, inward = gx * (crown[0] - cx) + gy * (crown[1] - cy);
  const variation = radius * Math.hypot(gx, gy), centerHeight = lift(cx, cy), ends = [lift(p[0], p[1]), lift(q[0], q[1])];
  const min = inward <= 0 ? centerHeight - variation : Math.min(...ends);
  const max = inward >= 0 ? centerHeight + variation : Math.max(...ends);
  const extent = Math.max(Math.abs(min), Math.abs(max), geometryScaleMM(brep.vertices.map(vertex => vertex.point)), geometryScaleMM([plane.origin]));
  if (!Number.isFinite(extent) || extent > CadNumericPolicy.coordinateAbs)
    throw new BrepError('GEOMETRY', 'Replace face: the replacement exceeds the modeling coordinate range.');
  // A steep plane can amplify XY reconstruction and subtraction roundoff even when the
  // resulting height is small. Keep this arithmetic envelope separate from native tolerance.
  const arithmetic = 256 * Number.EPSILON * Math.max(1, extent, Math.abs(oz),
    Math.abs(gx) * (Math.abs(cx) + Math.abs(ox) + radius), Math.abs(gy) * (Math.abs(cy) + Math.abs(oy) + radius));
  const linear = linearToleranceMM(extent);
  if (!Number.isFinite(arithmetic) || max + arithmetic > CadNumericPolicy.coordinateAbs)
    throw new BrepError('GEOMETRY', 'Replace face: the replacement exceeds the modeling coordinate range.');
  if (!(min - arithmetic - cap.lo > linear))
    throw new BrepError('GEOMETRY', 'Replace face: the replacement would reach or cross the opposite cap on the outer semicircular rim.');
  if (max - min <= linear)
    throw new BrepError('GEOMETRY', 'Replace face: the reference plane tilt is too small for this cap.');
  const moved = mapCapStation(brep, cap.hi, lift);
  const poles = [...moved.edges.flatMap(edge => edge.curve.controlPoints),
    ...moved.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  if (!poles.every(point => point.every(Number.isFinite)) || geometryScaleMM(poles) > CadNumericPolicy.coordinateAbs)
    throw new BrepError('GEOMETRY', 'Replace face: the replacement exceeds the modeling coordinate range.');
  const sideIds = new Set(brep.faces.filter(face => !face.name?.endsWith('.v-min') && !face.name?.endsWith('.v-max')).map(face => face.id));
  const candidate = encloseAxialSideTrims(moved, cap.lo, max + arithmetic, sideIds), report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `Replace face: the replacement solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

/** Original upper-cap replacement after exact replay of one signed radial wall edit. */
export function exactSemicylinderCapReplacementAfterWallFrame(brep: Brep, faceName: string, source: Source, prior: PriorWallOffset): { anchor: Point; normal: Point } | undefined {
  const mixed = admittedMixed(brep, faceName, source, prior);
  if (!mixed?.radialFirst) return;
  const cap = currentCap(brep, mixed.cap), poles = cap.skins.map(skin => skin.controlPoints[2][1]);
  return { anchor: [poles[0][0] + (poles[1][0] - poles[0][0]) / 2, poles[0][1] + (poles[1][1] - poles[0][1]) / 2, cap.hi], normal: [0, 0, 1] };
}

/** Canonical radial-then-inclined result, with extrema taken from the post-radial skins. */
export function replaceExactSemicylinderCapAfterWallIfAdmitted(brep: Brep, faceName: string, source: Source, prior: PriorWallOffset, plane: ReplacementPlane): Brep | undefined {
  const mixed = admittedMixed(brep, faceName, source, prior);
  if (!mixed?.radialFirst) return;
  const candidate = replaceCap(brep, currentCap(brep, mixed.cap), plane);
  const extent = geometryScaleMM(candidate.edges.flatMap(edge => edge.curve.controlPoints));
  const bottom = brep.faces.find(face => face.surface.kind === 'surface' && face.surface.controlPoints.flat().every(point => point[2] === mixed.cap.lo));
  const sides = brep.faces.filter(face => face.name !== faceName && face !== bottom);
  if (!bottom || !retainedBoundary(brep, candidate, bottom)
    || sides.some(face => !sameSupport(face, candidate.faces.find(value => value.id === face.id)!, extent)))
    throw new BrepError('GEOMETRY', 'Exact semicylinder radial replacement: the fixed bottom or side supports changed');
  return candidate;
}

function admittedWallAfterReplacement(brep: Brep, faceName: string, source: Source, prior: PriorCapReplacement) {
  try {
    if (!prior || typeof prior !== 'object' || Array.isArray(prior) || Object.keys(prior).sort().join(',') !== 'face,plane') return;
    const original = thickenCylinderSolid(source), cap = admitted(original, prior.face, source), wall = admittedWall(original, faceName, source);
    if (!cap || cap.sign !== 1 || !wall) return;
    const replay = replaceCap(original, cap, prior.plane);
    if (JSON.stringify(brep) !== JSON.stringify(replay)) return;
    return { original, cap, wall };
  } catch { return; }
}

/** Radial crown handle at half its local trimmed height, after exact replacement replay. */
export function exactSemicylinderWallOffsetAfterReplacementFrame(brep: Brep, faceName: string, source: Source, prior: PriorCapReplacement): { anchor: Point; normal: Point } | undefined {
  const mixed = admittedWallAfterReplacement(brep, faceName, source, prior);
  if (!mixed) return;
  const capFace = brep.faces.find(face => face.name === prior.face)!, moving = brep.faces.find(face => face.id === mixed.wall.moving.id)!;
  const capEdges = new Set(brep.coedges.filter(use => capFace.loops.includes(use.loop)).map(use => use.edge));
  const shared = brep.coedges.filter(use => moving.loops.includes(use.loop) && capEdges.has(use.edge));
  const edge = shared.length === 1 ? brep.edges.find(edge => edge.id === shared[0].edge) : undefined;
  if (edge?.curve.degree !== 2 || edge.curve.controlPoints.length !== 5) return;
  const top = edge.curve.controlPoints[2][2];
  return wallFrame({ ...mixed.wall, moving, cap: { ...mixed.wall.cap, hi: top } });
}

/** Continue one original radial wall while its saved inclined cap plane stays linked. */
export function offsetExactSemicylinderWallAfterReplacementIfAdmitted(brep: Brep, faceName: string, source: Source, prior: PriorCapReplacement, distance: number): Brep | undefined {
  const mixed = admittedWallAfterReplacement(brep, faceName, source, prior);
  if (!mixed) return;
  const radial = offsetWall(mixed.original, source, mixed.wall, distance);
  const candidate = replaceCap(radial, currentCap(radial, mixed.cap), prior.plane);
  const fixed = brep.faces.find(face => face.id === mixed.wall.fixed.id)!, top = brep.faces.find(face => face.name === prior.face)!;
  const extent = geometryScaleMM(candidate.edges.flatMap(edge => edge.curve.controlPoints));
  const newFixed = candidate.faces.find(face => face.id === fixed.id)!, newTop = candidate.faces.find(face => face.id === top.id)!;
  // Global chart bounds and UVs can change. Preserve the actual unselected 3D trims and supports.
  if (!retainedTrims(brep, candidate, fixed) || !sameSupport(fixed, newFixed, extent) || !sameSupport(top, newTop, extent))
    throw new BrepError('GEOMETRY', 'Exact semicylinder replacement offset: the retained wall boundary or inclined plane changed');
  return candidate;
}

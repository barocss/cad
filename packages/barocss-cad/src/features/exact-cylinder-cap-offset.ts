// Signed axial-cap move of the original native two-quarter Exact cylinder Thicken only.
import { BrepError, checkBrep, type Brep } from '../brep/brep-core.js';
import { thickenCylinderSolid } from '../brep/thicken-cylinder.js';
import { validateSurface } from '../core/math.js';
import { len } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';
import { encloseAxialSideTrims, mapCapStation } from './bored-cap-offset.js';

type Source = { id: string; surface: Surface; thickness: number; side?: 'normal' | 'reverse' | 'both' };
type ReplacementPlane = { origin: Point; normal: Point };

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

/** Move only the selected native station. All incidence, IDs and UV charts remain owned by the source. */
export function offsetExactSemicylinderCapIfAdmitted(brep: Brep, faceName: string, source: Source, distance: number): Brep | undefined {
  const cap = admitted(brep, faceName, source);
  if (!cap) return;
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
  if (controls.some(point => point[2] !== cap.lo && point[2] !== cap.hi)) return;
  // The station assignment is the positive axial affine map, with the opposite station fixed exactly.
  const candidate = mapCapStation(brep, cap.station, () => next), report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `Exact semicylinder cap offset: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

/** Tilt the original upper cap, retaining both cylinders, both radial walls and the fixed bottom. */
export function replaceExactSemicylinderCapIfAdmitted(brep: Brep, faceName: string, source: Source, plane: ReplacementPlane): Brep | undefined {
  const cap = admitted(brep, faceName, source);
  if (!cap || cap.sign !== 1) return;
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

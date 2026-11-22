// Signed upper-cap move of the original native two-quarter Exact cylinder Thicken only.
import { BrepError, checkBrep, type Brep } from '../brep/brep-core.js';
import { thickenCylinderSolid } from '../brep/thicken-cylinder.js';
import { validateSurface } from '../core/math.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';
import { mapCapStation } from './bored-cap-offset.js';

type Source = { id: string; surface: Surface; thickness: number; side?: 'normal' | 'reverse' | 'both' };

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
    if (faceName !== upper || brep.faces.filter(face => face.name === upper).length !== 1) return;
    const skins = ['normal', 'reverse'].map(role => brep.faces.find(face => face.name === `${source.id}.${role}`)?.surface);
    if (skins.some(surface => surface?.kind !== 'surface')) return;
    const poles = skins.map(surface => (surface as Surface).controlPoints[2][1]);
    const anchor: Point = [poles[0][0] + (poles[1][0] - poles[0][0]) / 2,
      poles[0][1] + (poles[1][1] - poles[0][1]) / 2, hi];
    return { anchor, lo, hi };
  } catch { return; }
}

/** The original upper axial cap, with a handle on annular material and outward +Z. */
export function exactSemicylinderCapOffsetFrame(brep: Brep, faceName: string, source: Source): { anchor: Point; normal: Point } | undefined {
  const cap = admitted(brep, faceName, source);
  return cap && { anchor: cap.anchor, normal: [0, 0, 1] };
}

/** Move only the upper native station. All incidence, IDs and UV charts remain owned by the source. */
export function offsetExactSemicylinderCapIfAdmitted(brep: Brep, faceName: string, source: Source, distance: number): Brep | undefined {
  const cap = admitted(brep, faceName, source);
  if (!cap) return;
  if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs)
    throw new BrepError('INPUT', 'Exact semicylinder cap offset: distance must be nonzero and within the modeling range');
  const next = cap.hi + distance;
  const controls = [...brep.vertices.map(vertex => vertex.point), ...brep.edges.flatMap(edge => edge.curve.controlPoints),
    ...brep.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const extent = Math.max(Math.abs(next), geometryScaleMM(controls));
  if (!(extent <= CadNumericPolicy.coordinateAbs)) throw new BrepError('GEOMETRY', 'Exact semicylinder cap offset: the cap leaves the modeling range');
  if (next === cap.hi) throw new BrepError('GEOMETRY', 'Exact semicylinder cap offset: distance is too small to move the cap');
  if (!(next - cap.lo > linearToleranceMM(extent)))
    throw new BrepError('GEOMETRY', 'Exact semicylinder cap offset: the offset would reach or cross the opposite cap');
  if (controls.some(point => point[2] !== cap.lo && point[2] !== cap.hi)) return;
  // The station assignment is the positive axial affine map, with the lower station assigned exactly.
  const candidate = mapCapStation(brep, cap.hi, () => next), report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `Exact semicylinder cap offset: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

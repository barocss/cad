import { checkBrep, type Brep } from '../brep/brep-core.js';
import { buildProfileLoop, ExtrudedProfileLimits, type ProfileSegmentInput } from '../features/extruded-profile-solid.js';
import { nameRevolvedEdges, revolveMassProperties, revolveProfile, type RevolveInput } from '../features/revolve.js';
import { SIDE_TAG, sideName } from '../document/side-names.js';
import { CadNumericPolicy } from '../numeric-policy.js';
import type { Tools } from './part-model.js';
import type { Part } from './part-types.js';

const samePoint = (a: readonly number[], x: number, y: number) => a.length === 2 && a[0] === x && a[1] === y;

/** One canonical positive-X capsule meridian about the original positive Y axis. */
function capsule(input: RevolveInput) {
  if (input.angle !== 360 || !input.id
    || !samePoint(input.axis.origin, 0, 0) || !samePoint(input.axis.direction, 0, 1)
    || input.holes !== undefined || input.holeTags !== undefined
    || !Array.isArray(input.profile) || input.profile.length !== 4) return;
  const tags = input.sideTags;
  if (tags && (tags.length !== 4 || !Array.from(tags).every(tag => typeof tag === 'string' && SIDE_TAG.test(tag))
    || new Set(tags).size !== 4)) return;
  const loop = buildProfileLoop(input.profile), segments = loop.segments;
  if (segments.length !== 4) return;
  const lowerIndex = segments.findIndex(segment => segment.kind === 'arc' && samePoint(segment.center, 0, 0));
  if (lowerIndex < 0) return;
  const lower = segments[lowerIndex], barrel = segments[(lowerIndex + 1) % 4];
  const upper = segments[(lowerIndex + 2) % 4], axis = segments[(lowerIndex + 3) % 4];
  if (lower.kind !== 'arc' || barrel.kind !== 'line' || upper.kind !== 'arc' || axis.kind !== 'line') return;
  const radius = lower.radius, height = upper.center[1];
  if (!(radius >= ExtrudedProfileLimits.minimumRadiusMM && height >= ExtrudedProfileLimits.minimumLengthMM)
    || !samePoint(lower.start, 0, -radius) || !samePoint(lower.end, radius, 0)
    || lower.startAngle !== -Math.PI / 2 || lower.sweep !== Math.PI / 2
    || !samePoint(barrel.start, radius, 0) || !samePoint(barrel.end, radius, height)
    || !samePoint(upper.center, 0, height) || upper.radius !== radius
    || !samePoint(upper.start, radius, height) || !samePoint(upper.end, 0, height + radius)
    || upper.end[1] - height !== radius || upper.startAngle !== 0 || upper.sweep !== Math.PI / 2
    || !samePoint(axis.start, 0, height + radius) || !samePoint(axis.end, 0, -radius)) return;
  // Match Revolve's normalization and authored-tag mapping, including reversed or cyclic input order.
  const name = (index: number) => sideName(input.id!, tags && loop.reversed ? 3 - index : index, tags);
  return { radius, height, lower: name(lowerIndex), barrel: name((lowerIndex + 1) % 4), upper: name((lowerIndex + 2) % 4) };
}

/** Keep native azimuth suffixes; rebuild edge names from the renamed owning faces. */
function wallNames(brep: Brep, id: string, names: readonly string[]): Brep {
  const byName = new Map(names.map((name, index) => [`${id}.side${index}`, name]));
  const faces = brep.faces.map(face => {
    if (!face.name) return face;
    const suffix = face.name.lastIndexOf('#'), renamed = byName.get(face.name.slice(0, suffix));
    return renamed ? { ...face, name: renamed + face.name.slice(suffix) } : face;
  });
  return nameRevolvedEdges({ ...brep, source: { family: 'shell', id }, faces });
}

/** The meridian and the corresponding native chart names for each complete opening. */
function wallSection(source: NonNullable<ReturnType<typeof capsule>>, inner: number, id: string,
  lower: boolean, upper: boolean): { profile: ProfileSegmentInput[]; names: string[] } {
  const { radius, height } = source;
  const innerBarrel = `${id}.in.${source.barrel}`, rim = `${id}.rim`;
  if (lower && upper) return {
    profile: [
      { kind: 'line', start: [radius, 0] },
      { kind: 'line', start: [radius, height] },
      { kind: 'line', start: [inner, height] },
      { kind: 'line', start: [inner, 0] },
    ],
    names: [source.barrel, `${rim}.upper`, innerBarrel, `${rim}.lower`],
  };
  // Give the lower-opening loop clockwise. Normalization reverses it while retaining the
  // radius measured at the inner equator. The pole height needs only one rounded addition.
  if (lower) return {
    profile: [
      { kind: 'line', start: [0, height + inner] },
      { kind: 'arc', start: [0, height + radius], center: [0, height], direction: 'cw' },
      { kind: 'line', start: [radius, height] },
      { kind: 'line', start: [radius, 0] },
      { kind: 'line', start: [inner, 0] },
      { kind: 'arc', start: [inner, height], center: [0, height], direction: 'ccw' },
    ],
    names: [`${id}.in.${source.upper}`, innerBarrel, rim, source.barrel, source.upper],
  };
  return {
    profile: [
      { kind: 'arc', start: [0, -radius], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [radius, 0] },
      { kind: 'line', start: [radius, height] },
      { kind: 'line', start: [inner, height] },
      { kind: 'arc', start: [inner, 0], center: [0, 0], direction: 'cw' },
      { kind: 'line', start: [0, -inner] },
    ],
    names: [source.lower, source.barrel, rim, innerBarrel, `${id}.in.${source.lower}`],
  };
}

/** Open one or both complete bare hemispheres of an original full capsule Revolve.
 * The caller owns the Revolve provenance; unsupported selections retain the existing Shell path.
 */
export function openRevolvedCapsuleShell(input: RevolveInput, wall: number, open: readonly string[], id: string,
  fail: Tools['fail']): Part | undefined {
  if (!open.length || open.length > 2) return;
  const source = capsule(input);
  if (!source) return;
  const lower = open.includes(source.lower), upper = open.includes(source.upper);
  if (open.length !== Number(lower) + Number(upper)) return;
  const { radius } = source, inner = radius - wall;
  if (!Number.isFinite(wall) || wall < ExtrudedProfileLimits.minimumLengthMM || wall > CadNumericPolicy.coordinateAbs)
    return fail('PARAMETER', `Capsule Shell needs a positive wall of at least ${ExtrudedProfileLimits.minimumLengthMM} mm within the modeling range.`);
  if (!(wall < radius && inner >= ExtrudedProfileLimits.minimumRadiusMM))
    return fail('PARAMETER', `Capsule Shell needs a wall smaller than the radius, leaving an inner radius of at least ${ExtrudedProfileLimits.minimumRadiusMM} mm.`);
  const { profile, names } = wallSection(source, inner, id, lower, upper);
  const recipe: RevolveInput = { id, profile, axis: { origin: [0, 0], direction: [0, 1] }, angle: 360 };
  const brep = wallNames(revolveProfile(recipe), id, names);
  const inside = (point: readonly number[]) => point.every(value => Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs);
  if (brep.vertices.some(vertex => !inside(vertex.point)) || brep.edges.some(edge => edge.curve.controlPoints.some(point => !inside(point)))
    || brep.faces.some(face => face.surface.kind !== 'surface' || face.surface.controlPoints.some(row => row.some(point => !inside(point)))))
    return fail('PARAMETER', 'Capsule Shell leaves the native modeling coordinate range.');
  const report = checkBrep(brep, { strict: true });
  const counts = report.counts, through = lower && upper;
  const expected = through ? { genus: 1, faces: 8, edges: 16, vertices: 8 }
    : { genus: 0, faces: 10, edges: 18, vertices: 10 };
  if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== expected.genus
    || counts.bodies !== 1 || counts.shells !== 1 || counts.faces !== expected.faces || counts.loops !== expected.faces
    || counts.coedges !== 2 * expected.edges || counts.edges !== expected.edges || counts.vertices !== expected.vertices)
    return fail('GEOMETRY', `Capsule Shell must retain one closed native wall: ${report.issues[0] ?? 'unexpected topology'}.`);
  return { solid: { kind: 'brep', brep }, mass: density => revolveMassProperties(recipe, density) };
}

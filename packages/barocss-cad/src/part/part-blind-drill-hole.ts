import { checkBrep, type Brep } from '../brep/brep-core.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import { transformBrep } from '../brep/brep-transform.js';
import { revolveProfile } from '../features/revolve.js';
import { ExtrudedProfileLimits, type ProfileSegmentInput } from '../features/extruded-profile-solid.js';
import { CadNumericPolicy } from '../numeric-policy.js';
import { priorCutRectangle } from './part-prior-rectangular-cut.js';
import type { Tools } from './part-model.js';
import type { CadPartDim, CadPartFeature, CadPartPoint2, Part, Result, Solid } from './part-types.js';

/** Axial height below the full-diameter depth of the fixed 118° drill point. */
export function blindDrillPointHeight(radius: number): number {
  if (!Number.isFinite(radius) || !(radius > 0)) throw new RangeError('Blind drill radius must be positive and finite.');
  return radius / Math.tan(59 * Math.PI / 180);
}

interface Helpers {
  brepOf(part: Part, id: string): Brep;
  boolean(a: Solid, b: Solid, operation: 'difference', id: string): Solid;
}

/** One original rectangular stock, one named upper face and one complete native cylinder/cone cutter. */
export function blindDrillHoleOperation(f: CadPartFeature & Record<string, unknown>, t: Tools, k: Helpers): () => Result {
  const { at, ref, dim, xy, fail } = t;
  const fields = new Set(['id', 'kind', 'target', 'center', 'radius', 'depth', 'face', 'suppressed']);
  if (Object.keys(f).some(key => !fields.has(key))) return fail('INPUT', 'Blind drill hole contains an unsupported field; only the fixed 118° blind point is supported.');
  const source = ref(f.target, 'blind drill target'), author = source.author;
  const unsupported = () => fail('CAPABILITY', 'Blind drill hole needs the named +Z top of one hole-free original upright rectangular extrusion with zero draft.');
  if (source.part !== null || f.target !== source.id || author?.kind !== 'extrude'
    || ('suppressed' in author && author.suppressed) || (author.draft !== undefined && author.draft !== 0)) return unsupported();
  const sketch = ref(author.sketch, 'blind drill stock sketch').author;
  if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' || ('suppressed' in sketch && sketch.suppressed)
    || sketch.holes?.length || sketch.regions?.length || source.result.kind !== 'solid' || source.result.parts.length !== 1) return unsupported();
  const stock = source.result.parts[0];
  if (stock.solid.kind !== 'upright' || stock.solid.solid.slabs.length !== 1) return unsupported();
  const slab = stock.solid.solid.slabs[0], region = slab.regions[0];
  const rectangle = region && priorCutRectangle(region.outer);
  if (slab.regions.length !== 1 || region.holes.length || !rectangle || !(slab.z0 < slab.z1)
    || ![slab.z0, slab.z1, ...rectangle.min, ...rectangle.max].every(Number.isFinite)) return unsupported();
  if (typeof f.face !== 'string' || f.face !== `${source.id}.top`)
    return fail('REFERENCE', 'Blind drill hole requires the original named +Z top face.');
  // Read native geometry without filling a cache on the captured original Part.
  const parent = k.brepOf({ solid: stock.solid }, source.id), faces = parent.faces.filter(face => face.name === f.face);
  const plane = faces.length === 1 ? faceGeometry(faces[0]) : undefined;
  if (parent.bodies.length !== 1 || parent.bodies[0].kind !== 'solid' || parent.shells.length !== 1 || !parent.shells[0].closed
    || parent.faces.length !== 6 || faces[0]?.loops.length !== 1 || plane?.kind !== 'plane'
    || plane.n[0] !== 0 || plane.n[1] !== 0 || plane.n[2] !== 1 || plane.o[2] !== slab.z1) return unsupported();
  const center = xy(f.center as CadPartPoint2, 'center'), radius = dim(f.radius as CadPartDim, 'radius', true), depth = dim(f.depth as CadPartDim, 'depth', true);
  if (radius < ExtrudedProfileLimits.minimumRadiusMM || depth < ExtrudedProfileLimits.minimumLengthMM)
    return fail('PARAMETER', 'Blind drill hole needs radius at least 0.01 mm and full-diameter depth at least 0.0001 mm.');
  const tipHeight = blindDrillPointHeight(radius), reach = depth + tipHeight, margin = 10 * CadNumericPolicy.linearTolerance;
  if (!center.every((value, axis) => value - radius - rectangle.min[axis] > margin && rectangle.max[axis] - value - radius > margin))
    return fail('GEOMETRY', 'Blind drill hole needs its complete circular rim strictly inside the original top face.');
  if (!(slab.z1 - slab.z0 - reach > margin))
    return fail('GEOMETRY', `Blind drill hole would reach the bottom: full-diameter depth ${depth} mm plus the 118° point ${tipHeight} mm needs more stock thickness.`);
  // These checks precede tool creation and every Boolean, including parameter reevaluation.
  t.solids(f.target, 'blind drill target');
  return () => {
    const over = Math.min(1, .01 * depth), toolId = `${at}_tool`;
    const tool = revolveProfile({ id: toolId, profile: [[0, -over], [radius, -over], [radius, depth], [0, reach]]
      .map<ProfileSegmentInput>(([x, y]) => ({ kind: 'line', start: [x, y] })),
    axis: { origin: [0, 0], direction: [0, 1] }, angle: 360, sideTags: ['entry', 'wall', 'point', 'axis'] });
    const placed = transformBrep(tool, { matrix: [1, 0, 0, 0, 0, 1, 0, -1, 0], offset: [center[0], center[1], slab.z1] },
      name => name.replaceAll(`${toolId}.side[entry]`, `${at}.entry`).replaceAll(`${toolId}.side[wall]`, `${at}.wall`)
        .replaceAll(`${toolId}.side[point]`, `${at}.point`).replaceAll(`${toolId}.side[axis]`, `${at}.axis`));
    const toolCheck = checkBrep(placed, { strict: true });
    if (!toolCheck.valid || toolCheck.topology.length !== 1 || toolCheck.topology[0].shells !== 1 || toolCheck.topology[0].genus !== 0)
      return fail('GEOMETRY', 'Blind drill hole could not form one strict native cutter with a complete conical point.');
    const result = k.boolean(stock.solid, { kind: 'brep', brep: placed }, 'difference', at);
    const brep = k.brepOf({ solid: result }, at), check = checkBrep(brep, { strict: true });
    if (!check.valid || check.topology.length !== 1 || check.topology[0].shells !== 1 || check.topology[0].genus !== 0
      || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid')
      return fail('GEOMETRY', 'Blind drill hole did not retain one strict closed solid with a blind conical point.');
    return { kind: 'solid', parts: [{ solid: result }] };
  };
}

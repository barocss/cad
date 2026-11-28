import { faceGeometry, type Brep } from '@barocss/cad';
import type { Ctx, Field, Values } from './commands';
import { partBreps } from '../engine/evaluate';
import type { BodyRef, StudioDoc } from '../engine/doc';
import { featureId } from '../engine/ids';
import { refusal } from '../engine/refusal';

const pulls = ['z', '-z', 'x', '-x', 'y', '-y'] as const;
export type DraftPull = typeof pulls[number];
export const draftLabel = (pull: DraftPull): string =>
  (pull.startsWith('-') ? '−' : '+') + pull.slice(-1).toUpperCase();
export const isDraftPull = (value: unknown): value is DraftPull => pulls.some(pull => pull === value);
export const readDraftPull = (value: unknown): DraftPull => isDraftPull(value) ? value : 'z';
export const draftPulls = pulls;

function exactAxis(vector: readonly number[]): number {
  const axis = vector.findIndex(value => Math.abs(value) === 1);
  return vector.length === 3 && axis >= 0 && vector.every((value, i) => i === axis || value === 0) ? axis : -1;
}

function originalCylinderDraftSource(doc: StudioDoc, ref: BodyRef, axis: number) {
  if (ref.side !== 'solid') return;
  const extrusion = doc.nodes[ref.node];
  if (extrusion?.kind !== 'extrude' || extrusion.cutDepth !== undefined || (extrusion.draft !== undefined && extrusion.draft !== 0)) return;
  const sketch = doc.nodes[extrusion.sketch];
  if (sketch?.kind !== 'sketch' || sketch.profile !== 'circle' || sketch.on || sketch.association
    || sketch.pocketFloor || sketch.regions?.length) return;
  const plane = sketch.plane;
  const owner = featureId(doc.nodes, ref.node);
  if (sketch.holes?.length) {
    const [bore] = sketch.holes, [arc] = bore;
    if (axis !== 2 || plane || sketch.holes.length !== 1 || bore.length !== 1 || arc.kind !== 'arc'
      || typeof extrusion.height !== 'number' || !Number.isFinite(extrusion.height) || extrusion.height <= 0
      || extrusion.from !== undefined && (typeof extrusion.from !== 'number' || !Number.isFinite(extrusion.from))
      || typeof sketch.radius !== 'number' || !Number.isFinite(sketch.radius) || sketch.radius <= 0
      || !arc.center.every((value, i) => typeof value === 'number' && Number.isFinite(value) && value === sketch.center[i])
      || !arc.start.every(value => typeof value === 'number' && Number.isFinite(value))) return;
    return { owner, wall: `${owner}.side`, bore: `${owner}.hole0.side`, faceCount: 6 };
  }
  if (plane) {
    const x = exactAxis(plane.xAxis);
    if (exactAxis(plane.normal) !== axis || x < 0 || x === axis || !plane.origin.every(Number.isFinite)) return;
  } else if (axis !== 2) return;
  return { owner, wall: `${owner}.side`, faceCount: 4 };
}

const draftEnd = (pull: DraftPull, bottom: number, top: number) => pull.startsWith('-') ? Math.max(bottom, top) : Math.min(bottom, top);

/** A pick of the complete native wall on original circular or coaxial annular stock. */
export function originalCylinderDraftSelection(ctx: Ctx, pull: DraftPull): { faces: string[]; end: number } | undefined {
  if (ctx.selection.faces.length !== 1) return;
  const direction = pull.slice(-1), axis = 'xyz'.indexOf(direction);
  const pick = ctx.selection.faces[0], body = ctx.bodies[pick.body], ref = body?.ref;
  if (!ref || body.topology?.bodyCount !== 1) return;
  const source = originalCylinderDraftSource(ctx.doc, ref, axis);
  if (!source || body.mesh.faces.length !== (source.bore ? 4 : 3)) return;
  const face = body.mesh.faces[pick.face];
  if (!face || !(face.name.startsWith(source.wall) || source.bore && face.name.startsWith(source.bore)) || face.exact?.kind !== 'cylinder'
    || exactAxis(face.exact.a) !== axis || face.nativeFaces?.length !== 2) return;
  const faces = face.nativeFaces.map(member => member.name).sort();
  if (faces[0] !== face.name + '#1' || faces[1] !== face.name + '#2') return;
  const [bottom, top] = ['bottom', 'top'].map(cap => body.mesh.faces.find(candidate => candidate.nativePlaneName === source.owner + '.' + cap)?.nativeAxisPlane);
  if (bottom?.axis !== direction || top?.axis !== direction) return;
  return { faces, end: draftEnd(pull, bottom.at, top.at) };
}

export const draftInputs = (): Field[] => [
  { key: 'deg', label: 'Angle', kind: 'deg', min: -45, max: 45, step: 1 },
  { key: 'pull', label: 'Pull', kind: 'choice', options: pulls.map(pull => ({ value: pull, label: draftLabel(pull) })) },
  { key: 'neutralMode', label: 'Neutral plane', kind: 'choice', options: [
    { value: 'auto', label: 'Body end' }, { value: 'fixed', label: 'Fixed coordinate' },
  ] },
  { key: 'neutral', label: 'Neutral coordinate', kind: 'mm', min: -10000, max: 10000, when: values => values.neutralMode === 'fixed' },
];

export function draftNeutral(values: Values): number | undefined {
  const value = values.neutral;
  if (values.neutralMode === 'auto' || values.neutralMode === undefined && value === undefined) return undefined;
  const neutral = Number(value);
  if (value === '' || !Number.isFinite(neutral) || Math.abs(neutral) > 10000)
    throw refusal('VALUE', 'Draft neutral must be a finite coordinate within ±10000 mm.');
  return neutral;
}

export function draftNeutralStep(values: Values, automatic: (pull: DraftPull) => number | undefined) {
  const pull = readDraftPull(values.pull), axis = pull.slice(-1).toUpperCase();
  let neutral: number | undefined;
  try { neutral = draftNeutral(values); } catch { /* The input is still being edited. */ }
  const fromBody = values.neutralMode !== 'fixed';
  if (fromBody) neutral = automatic(pull);
  return { label: 'Neutral', text: neutral === undefined ? axis + (fromBody
    ? (pull.startsWith('-') ? ' maximum of original body' : ' minimum of original body')
    : ' world coordinate') : `${axis} = ${neutral} mm`, done: neutral !== undefined || fromBody };
}

export function draftNeutralDefault(values: Values, changed: readonly string[], automatic: (pull: DraftPull) => number | undefined): Values {
  if (values.neutralMode !== 'fixed' || !changed.includes('neutralMode')) return values;
  return { ...values, neutral: automatic(readDraftPull(values.pull)) ?? '' };
}

interface SavedDraftWall { parent: BodyRef; faces: readonly string[] }

function cylinderDraftBodyEnd(doc: StudioDoc, target: Brep, wall: SavedDraftWall, pull: DraftPull, axis: number): number | undefined {
  const source = originalCylinderDraftSource(doc, wall.parent, axis);
  if (!source || target.bodies.length !== 1 || target.bodies[0].kind !== 'solid' || target.faces.length !== source.faceCount || wall.faces.length !== 2) return;
  const first = wall.faces.find(name => name.endsWith('#1'));
  if (!first || !wall.faces.includes(first.slice(0, -1) + '2')) return;
  const bore = !!source.bore && first.startsWith(source.bore);
  if (!bore && !first.startsWith(source.wall)) return;
  const sameWall = target.faces.filter(face => face.name !== undefined && wall.faces.includes(face.name));
  if (sameWall.length !== 2 || sameWall.some(face => {
    const geometry = faceGeometry(face);
    return geometry.kind !== 'cylinder' || exactAxis(geometry.a) !== axis || source.bore !== undefined && geometry.out !== (bore ? -1 : 1);
  })) return;
  const stations = ['bottom', 'top'].map(end => {
    const surface = target.faces.find(face => face.name === source.owner + '.' + end)?.surface;
    if (!surface || surface.kind !== 'surface') return undefined;
    const poles = surface.controlPoints.flat(), at = poles[0]?.[axis];
    return typeof at === 'number' && Number.isFinite(at) && poles.every(p => p[axis] === at) ? at : undefined;
  });
  const [bottom, top] = stations;
  return bottom !== undefined && top !== undefined && bottom !== top ? draftEnd(pull, bottom, top) : undefined;
}

/** Exact end of straight stock, or the authored cap of a saved complete cylindrical wall. */
export function draftBodyEnd(doc: StudioDoc, key: string, pull: DraftPull, wall?: SavedDraftWall): number | undefined {
  try {
    const target = partBreps(doc).find(output => output.key === key)?.brep;
    if (!target || target.faces.some(face => face.surface.kind === 'facets')) return undefined;
    const axis = 'xyz'.indexOf(pull.slice(-1)), max = pull.startsWith('-');
    if (target.edges.some(edge => edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2))
      return wall && cylinderDraftBodyEnd(doc, target, wall, pull, axis);
    let coordinate = max ? -Infinity : Infinity;
    const include = (point: readonly number[]) => {
      coordinate = max ? Math.max(coordinate, point[axis]) : Math.min(coordinate, point[axis]);
    };
    for (const vertex of target.vertices) include(vertex.point);
    for (const edge of target.edges) for (const point of edge.curve.controlPoints) include(point);
    return Number.isFinite(coordinate) ? coordinate : undefined;
  } catch { return undefined; }
}

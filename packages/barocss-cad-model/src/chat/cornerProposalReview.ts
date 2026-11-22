import { CadNumericPolicy, checkBrep, faceGeometry, type Brep, type BrepFace, type Point } from '@barocss/cad';
import { dropStaleMade, type StudioDoc } from '../engine/doc';
import { partBreps } from '../engine/evaluate';
import { bodyKeyFor } from '../engine/ids';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, revisionOf } from '../util/revision';
import { sketchEditCorners } from './part/sketchCorner';

type SidePair = [string, string];
type Operation = 'fillet' | 'chamfer';
type Geometry = ReturnType<typeof faceGeometry>;
type Plane = Extract<Geometry, { kind: 'plane' }>;

function scope(doc: StudioDoc) {
  const [sketch, extrude] = doc.nodes;
  if (doc.nodes.length !== 2 || doc.instances?.length || doc.direct ||
    sketch?.kind !== 'sketch' || !sketch.id || sketch.suppressed || sketch.held !== undefined ||
    sketch.on || sketch.association || sketch.pocketFloor || sketch.holes?.length || sketch.regions?.length ||
    !sketch.sideTags?.outer.length || extrude?.kind !== 'extrude' || !extrude.id || extrude.id === sketch.id ||
    extrude.sketch !== 0 || extrude.suppressed || extrude.held !== undefined || extrude.draft || extrude.cutDepth !== undefined) return;
  return { sketch, sketchId: sketch.id, extrude, feature: extrude.id, body: bodyKeyFor(doc.nodes, 1), tags: sketch.sideTags.outer };
}

/** The list can identify an exact operation before replaying or evaluating its geometry. */
export function cornerBatchProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1) return;
  const [{ tool, args }] = proposal.ops;
  if (tool !== 'edit_feature' || !isObj(args) || args.index !== 0 ||
    typeof args.expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(args.expectedRevision)) return;
  const round = Object.hasOwn(args, 'sketchRound');
  const key = round ? 'sketchRound' : 'sketchChamfer', sizeKey = round ? 'radius' : 'distance';
  const input = args[key];
  if (Object.keys(args).sort().join(',') !== `expectedRevision,index,${key}` || !isObj(input) ||
    Object.keys(input).sort().join(',') !== `corners,${sizeKey},sketch`) return;
  const size = input[sizeKey], requested = input.corners, source = scope(doc);
  if (!source || source.sketchId !== input.sketch || !Array.isArray(requested) || requested.length < 2 ||
    typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return;

  const available = sketchEditCorners(doc, 0), pairs: SidePair[] = [], incoming = new Set<string>();
  for (const pair of requested) {
    if (!Array.isArray(pair) || pair.length !== 2) return;
    const known = available.find(({ sides }) => sides.every(id => pair.includes(id)));
    if (!known || incoming.has(known.sides[0])) return;
    const [first, second] = known.sides;
    pairs.push([first, second]);
    incoming.add(first);
  }
  const operation: Operation = round ? 'fillet' : 'chamfer';
  return { revision: digestOf(proposal), sourceRevision: args.expectedRevision, sketch: source.sketchId, operation, size, pairs };
}

/** Every old side must survive in order. Each requested pair has exactly one new side between its sides. */
function insertedTags(was: string[], now: string[], pairs: SidePair[]) {
  const positions = new Map(now.map((tag, index) => [tag, index]));
  const selected = new Map(pairs), old = new Set(was), inserted = new Map<string, string>();
  if (old.size !== was.length || positions.size !== now.length || now.length !== was.length + pairs.length) return;
  for (const [index, first] of was.entries()) {
    const second = was[(index + 1) % was.length], at = positions.get(first);
    if (at === undefined) return;
    const next = (at + 1) % now.length;
    if (!selected.has(first)) {
      if (now[next] !== second) return;
    } else {
      if (selected.get(first) !== second || old.has(now[next]) || now[(next + 1) % now.length] !== second) return;
      inserted.set(first, now[next]);
    }
  }
  if (inserted.size === pairs.length) return inserted;
}

function prism(doc: StudioDoc, source: NonNullable<ReturnType<typeof scope>>) {
  const outputs = partBreps(doc), brep = outputs[0]?.brep, { feature } = source;
  if (outputs.length !== 1 || outputs[0].key !== source.body || brep.source.family !== 'prismatic-solid' ||
    brep.source.id !== feature || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' ||
    brep.shells.length !== 1 || !brep.shells[0].closed || !checkBrep(brep, { strict: true }).valid) return;
  const sideName = (tag: string) => `${feature}.side[${tag}]`;
  const bottom = `${feature}.bottom`, top = `${feature}.top`;
  const expected = [bottom, top, ...source.tags.map(sideName)];
  const faces = new Map(brep.faces.map(face => [face.name, face]));
  if (faces.size !== expected.length || brep.faces.length !== expected.length ||
    expected.some(name => faces.get(name)?.surface.kind !== 'surface')) return;
  const cap = faceGeometry(faces.get(bottom)!);
  if (cap.kind === 'plane') return { brep, faces, sideName, bottom, top, axis: cap.n };
}

const near = (a: number, b: number) => Math.abs(a - b) <= CadNumericPolicy.linearTolerance;
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const signedDistance = (p: Point, { o, n }: Plane) => dot([p[0] - o[0], p[1] - o[1], p[2] - o[2]], n);

function wallSeams(brep: Brep, face: BrepFace) {
  if (face.loops.length !== 1) return;
  const loop = brep.loops.find(entry => entry.id === face.loops[0]);
  if (loop?.kind !== 'outer' || loop.coedges.length !== 4) return;
  const seams = new Map<string, string>();
  for (const id of loop.coedges) {
    const use = brep.coedges.find(entry => entry.id === id);
    const twin = use?.twin && brep.coedges.find(entry => entry.id === use.twin);
    if (!use || !twin || twin.twin !== id || twin.edge !== use.edge) return;
    const neighborLoop = brep.loops.find(entry => entry.id === twin.loop);
    const neighbor = brep.faces.find(entry => entry.id === neighborLoop?.face)?.name;
    if (!neighbor || seams.has(neighbor)) return;
    seams.set(neighbor, use.edge);
  }
  return seams;
}

function hasChamferSetback(brep: Brep, seam: string, own: Plane, other: Plane, size: number) {
  // In the sketch plane, the perpendicular distance to the other carrier is the setback times sin(angle).
  const cosine = dot(own.n, other.n), sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const edge = brep.edges.find(entry => entry.id === seam);
  return sine > CadNumericPolicy.relativeComparison && edge?.curve.degree === 1 && edge.vertices.every(id => {
    const vertex = brep.vertices.find(entry => entry.id === id);
    return vertex && near(Math.abs(signedDistance(vertex.point, other)) / sine, size);
  });
}

/** Read the new walls and their carrier seams from the same strict native body used by the review. */
export function reviewedCornerBatchEvidence(base: StudioDoc, candidate: StudioDoc, edit: NonNullable<ReturnType<typeof cornerBatchProposal>>) {
  const source = scope(base), result = scope(candidate);
  if (!source || !result || source.sketchId !== edit.sketch || result.sketchId !== edit.sketch || source.body !== result.body ||
    revisionOf(base) !== edit.sourceRevision ||
    canonical(source.sketch.plane) !== canonical(result.sketch.plane) ||
    canonical(source.sketch.construction) !== canonical(result.sketch.construction) ||
    canonical(base.parameters) !== canonical(candidate.parameters) ||
    canonical(dropStaleMade(base.nodes, [result.sketch, source.extrude])[1]) !== canonical(result.extrude)) return;
  const insertions = insertedTags(source.tags, result.tags, edit.pairs);
  if (!insertions) return;
  const original = prism(base, source), native = prism(candidate, result);
  if (!original || !native) return;

  const faces: { name: string; sides: SidePair; geometry: Geometry }[] = [];
  for (const sides of edit.pairs) {
    const name = native.sideName(insertions.get(sides[0])!), wall = native.faces.get(name)!;
    const geometry = faceGeometry(wall), seams = wallSeams(native.brep, wall);
    if (!seams?.has(native.bottom) || !seams.has(native.top)) return;
    const carriers: { plane: Plane; seam: string }[] = [];
    for (const side of sides) {
      const sideName = native.sideName(side), seam = seams.get(sideName);
      const plane = faceGeometry(original.faces.get(sideName)!), retained = faceGeometry(native.faces.get(sideName)!);
      if (!seam || plane.kind !== 'plane' || retained.kind !== 'plane' || !near(dot(plane.n, retained.n), 1) ||
        !near(signedDistance(retained.o, plane), 0) || !near(dot(native.axis, plane.n), 0)) return;
      carriers.push({ plane, seam });
    }
    if (edit.operation === 'fillet') {
      if (geometry.kind !== 'cylinder' || !near(geometry.r, edit.size) || !near(Math.abs(dot(geometry.a, native.axis)), 1) ||
        carriers.some(({ plane }) => !near(signedDistance(geometry.c, plane), -geometry.out * geometry.r))) return;
    } else if (geometry.kind !== 'plane' || !near(dot(geometry.n, native.axis), 0) ||
      carriers.some(({ plane, seam }, index) => !hasChamferSetback(native.brep, seam, plane, carriers[1 - index].plane, edit.size))) return;
    faces.push({ name, sides, geometry });
  }
  return { brep: native.brep, cornerBatch: { body: result.body, sketch: edit.sketch, operation: edit.operation, size: edit.size, faces } };
}

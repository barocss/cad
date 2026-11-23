import {
  CadNumericPolicy, checkBrep, evaluateCurve, faceGeometry, measureBrepEdgeContinuity,
  type Brep, type BrepEdge, type Point,
} from '@barocss/cad';
import { sweepPath } from '../app/profileCommands';
import { withNode, type ModelNode, type SketchNode, type StudioDoc } from '../engine/doc';
import { loadDirect } from '../engine/directModule';
import { partBreps } from '../engine/evaluate';
import { bodyKeyFor, featureId } from '../engine/ids';
import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { canonical, canonicalOf, revisionOf } from '../util/revision';
import { closedRectangularDuctEvidence } from './closedRectangularDuctEvidence';
import { closedPairedRectangularDuctEvidence } from './closedPairedRectangularDuctEvidence';
import { pairedLineArcDuctEvidence } from './pairedLineArcDuctEvidence';
import { pairedSpacedArcDuctEvidence } from './pairedSpacedArcDuctEvidence';
import { directInspectionRevision } from './sweepSource';

const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= CadNumericPolicy.linearTolerance;
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function rectangularOpening(hole: NonNullable<SketchNode['holes']>[number]) {
  if (hole.length !== 4 || hole.some(segment => segment.kind !== 'line' ||
    Object.keys(segment).sort().join(',') !== 'kind,start' || !segment.start.every(value => typeof value === 'number' && Number.isFinite(value)))) return;
  const points = hole.map(segment => segment.start.map(Number));
  const min = [0, 1].map(axis => Math.min(...points.map(point => point[axis])));
  const max = [0, 1].map(axis => Math.max(...points.map(point => point[axis])));
  const inner = max.map((value, axis) => value - min[axis]);
  if (inner.some(size => size <= 0) || new Set(points.map(point => point.join(','))).size !== 4 ||
    points.some((point, index) => point.some((value, axis) => value !== min[axis] && value !== max[axis]) ||
      point.filter((value, axis) => value !== points[(index + 1) % 4][axis]).length !== 1)) return;
  return { min, max, inner };
}

function ductSection(sketch: ModelNode | undefined, holeCount: number) {
  if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' || !sketch.id ||
    sketch.suppressed || sketch.held !== undefined || sketch.on || sketch.association || sketch.pocketFloor || sketch.regions?.length || sketch.plane ||
    ![...sketch.min, ...sketch.max].every(value => typeof value === 'number' && Number.isFinite(value)) ||
    sketch.holes?.length !== holeCount) return;
  const low = sketch.min.map(Number), high = sketch.max.map(Number), outer = high.map((value, axis) => value - low[axis]);
  const tags = sketch.sideTags;
  if (outer.some(size => size <= 0) || tags?.outer.length !== 4 || tags.regions?.length ||
    tags.holes?.length !== holeCount || tags.holes.some(hole => hole.length !== 4)) return;
  const names = [...tags.outer, ...tags.holes.flat()];
  if (names.some(tag => typeof tag !== 'string' || !tag) || new Set(names).size !== names.length) return;
  const openings = [];
  for (const [index, loop] of sketch.holes.entries()) {
    const opening = rectangularOpening(loop);
    if (!opening || opening.min.some((value, axis) => value - low[axis] <= CadNumericPolicy.linearTolerance ||
      high[axis] - opening.max[axis] <= CadNumericPolicy.linearTolerance)) return;
    openings.push({ ...opening, tags: tags.holes[index] });
  }
  return { sketchId: sketch.id, outer, outerTags: tags.outer, openings, low, high };
}

/** Read one authored, tagged rectangular wall section and its centered opening. */
export function rectangularDuctSection(sketch: ModelNode | undefined) {
  const section = ductSection(sketch, 1);
  if (!section) return;
  const { sketchId, outer, outerTags, openings: [hole], low, high } = section;
  if (hole.min.some((value, axis) => !near(value + hole.max[axis], low[axis] + high[axis]))) return;
  return { sketchId, outer, inner: hole.inner, outerTags, innerTags: hole.tags };
}

export function pairedDuctSection(sketch: ModelNode | undefined) {
  const section = ductSection(sketch, 2);
  if (!section) return;
  const { sketchId, outer, outerTags, openings: [first, second], low, high } = section;
  const separated = [0, 1].some(axial => {
    const radial = 1 - axial;
    const web = Math.max(first.min[axial], second.min[axial]) - Math.min(first.max[axial], second.max[axial]);
    return web > CadNumericPolicy.linearTolerance &&
      [first, second].every(hole => near(hole.min[radial] + hole.max[radial], low[radial] + high[radial]));
  });
  if (!separated) return;
  const center = low.map((value, axis) => (value + high[axis]) / 2);
  const relative = (points: number[]): [number, number] => [points[0] - center[0], points[1] - center[1]];
  const cavities = [first, second].map(hole => ({ min: relative(hole.min), max: relative(hole.max), tags: hole.tags }));
  return { sketchId, outer, outerTags, cavities };
}

function scope(doc: StudioDoc) {
  const section = rectangularDuctSection(doc.nodes[0]) ?? pairedDuctSection(doc.nodes[0]);
  if (doc.nodes.length !== 1 || doc.instances?.length || Object.keys(doc.outputs).length || !section) return;
  const direct = doc.direct, visible = direct?.objects.filter(object => !object.hidden), object = visible?.[0];
  if (!direct || visible?.length !== 1 || !object || direct.objects.filter(item => item.id === object.id).length !== 1 ||
    Object.keys(object).some(key => !['id', 'name', 'source', 'geometry', 'hidden'].includes(key)) ||
    typeof direct.sources[object.source] !== 'string') return;
  return { ...section, object };
}

/** Identify one pinned creation of an independent rectangular duct. */
export function rectangularDuctProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1) return;
  const [{ tool, args }] = proposal.ops, source = scope(doc);
  if (!source || tool !== 'run_command' || !isObj(args) ||
    Object.keys(args).sort().join(',') !== 'command,expectedRevision,values' || args.command !== 'sweep-curve' ||
    typeof args.expectedRevision !== 'string' || args.expectedRevision !== revisionOf(doc) || !isObj(args.values) ||
    Object.keys(args.values).sort().join(',') !== 'path,pathRevision,representation,sketch') return;
  const { sketch, path, pathRevision, representation } = args.values;
  if (sketch !== source.sketchId || path !== source.object.id || representation !== 'exact' ||
    typeof pathRevision !== 'string' || !/^[a-f0-9]{64}$/.test(pathRevision)) return;
  return { revision: digestOf(proposal), sourceRevision: args.expectedRevision, source: canonicalOf(doc),
    directRevision: directInspectionRevision(doc), sketch, path, pathRevision };
}

/** Four native straight edges form the requested centered rectangular section. */
function rectangle(edges: BrepEdge[], center: Point, normal: Point, sizes: number[]) {
  if (edges.length !== 4 || new Set(edges.map(edge => edge.id)).size !== 4) return false;
  const lengths: number[] = [], corners: Point[] = [];
  for (const edge of edges) {
    if (edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2) return false;
    const [a, b] = edge.curve.controlPoints;
    lengths.push(Math.hypot(...sub(a, b)));
    for (const point of [a, b]) {
      if (!near(dot(sub(point, center), normal), 0) || !near(Math.hypot(...sub(point, center)), Math.hypot(...sizes) / 2)) return false;
      if (!corners.some(other => near(Math.hypot(...sub(point, other)), 0))) corners.push(point);
    }
  }
  const expected = [...sizes, ...sizes].sort((a, b) => a - b);
  return corners.length === 4 && lengths.sort((a, b) => a - b).every((value, index) => near(value, expected[index]));
}

function capEvidence(brep: Brep, name: string, center: Point, normal: Point, source: NonNullable<ReturnType<typeof rectangularDuctSection>>, wallNames: (tags: string[]) => string[], requireCharts = false) {
  const face = brep.faces.find(item => item.name === name);
  if (!face || face.loops.length !== 2) return;
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane' || !near(dot(plane.n, normal), 1) || !near(dot(sub(plane.o, center), normal), 0)) return;
  const result: { outer?: string[]; inner?: string[] } = {};
  for (const id of face.loops) {
    const loop = brep.loops.find(item => item.id === id);
    if (!loop || loop.face !== face.id || !['outer', 'inner'].includes(loop.kind) || loop.coedges.length !== 4) return;
    const kind = loop.kind as 'outer' | 'inner';
    if (result[kind]) return;
    const walls = new Set(wallNames(kind === 'outer' ? source.outerTags : source.innerTags));
    const edges: BrepEdge[] = [];
    let area = 0;
    for (const useId of loop.coedges) {
      const use = brep.coedges.find(item => item.id === useId), twin = use?.twin ? brep.coedges.find(item => item.id === use.twin) : undefined;
      const edge = use && brep.edges.find(item => item.id === use.edge);
      const otherLoop = twin && brep.loops.find(item => item.id === twin.loop);
      const other = otherLoop && brep.faces.find(item => item.id === otherLoop.face);
      if (!use || use.loop !== loop.id || !twin || twin.twin !== use.id || twin.edge !== use.edge || twin.sense === use.sense ||
        !edge || !other?.name || !walls.has(other.name) || (requireCharts && (!use.pcurve || !twin.pcurve))) return;
      edges.push(edge);
      if (edge.curve.controlPoints.length !== 2) return;
      const [a, b] = edge.curve.controlPoints.map(point => sub(point, center));
      area += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), normal) / 2;
    }
    const sizes = kind === 'outer' ? source.outer : source.inner;
    if (!rectangle(edges, center, normal, sizes) || !near(area, (kind === 'outer' ? 1 : -1) * sizes[0] * sizes[1])) return;
    result[kind] = edges.map(edge => edge.id);
  }
  if (result.outer && result.inner) return { name, outerEdges: result.outer, innerEdges: result.inner };
}

function seams(brep: Brep, feature: string, tags: string[], [lead, exit]: readonly [string, string]) {
  const result: string[] = [];
  for (const tag of tags) {
    const first = `${feature}.${lead}.side[${tag}]`, second = `${feature}.${exit}.side[${tag}]`;
    const matches = brep.edges.filter(edge => edge.name === `${first}|${second}` || edge.name === `${second}|${first}`);
    if (matches.length !== 1) return;
    const [edge] = matches, uses = brep.coedges.filter(use => use.edge === edge.id);
    if (uses.length !== 2 || uses[0].twin !== uses[1].id || uses[1].twin !== uses[0].id || uses[0].sense === uses[1].sense ||
      uses.some(use => !use.pcurve)) return;
    const faces = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop))?.name);
    if (!faces.includes(first) || !faces.includes(second)) return;
    const continuity = measureBrepEdgeContinuity(brep, edge.id);
    if (continuity.status !== 'measured' || !Number.isFinite(continuity.maximumAngleDegrees) ||
      continuity.maximumAngleDegrees > CadNumericPolicy.relativeComparison * 180 / Math.PI) return;
    result.push(edge.id);
  }
  return result;
}

/** Verify unchanged sources, the exact copied path and the native open ends or sealed cavity. */
export async function reviewedRectangularDuctEvidence(base: StudioDoc, candidate: StudioDoc, edit: NonNullable<ReturnType<typeof rectangularDuctProposal>>) {
  const source = scope(base);
  if (!source || edit.source !== canonicalOf(base) || edit.sourceRevision !== revisionOf(base) ||
    edit.directRevision !== directInspectionRevision(base) || edit.sketch !== source.sketchId || edit.path !== source.object.id ||
    canonical(candidate.direct) !== canonical(base.direct)) return;
  await loadDirect();
  const copied = sweepPath(base, [edit.path]);
  // The same copied payload is hashed by sweepSourceRevision for the command's read pin.
  if (typeof copied === 'string' || digestOf(copied.path) !== edit.pathRevision || copied.path.degree !== 2) return;
  const { path } = copied;
  const closedCircle = path.controlPoints.length === 9 && path.knots.length === 12;
  const threePieceDuct = 'cavities' in source && path.controlPoints.length === 7 && path.knots.length === 10;
  if (!closedCircle && !threePieceDuct && (path.controlPoints.length !== 5 || path.knots.length !== 8)) return;
  const expected = withNode(base, { kind: 'sweep-curve', sketch: 0, name: copied.name, path: copied.path, mode: 'exact' });
  if (canonicalOf(candidate) !== canonicalOf(expected) || candidate.nextId !== expected.nextId) return;
  try {
    if (partBreps(base).length) return;
    const outputs = partBreps(candidate), brep = outputs[0]?.brep, feature = featureId(candidate.nodes, 1), body = bodyKeyFor(candidate.nodes, 1);
    if (outputs.length !== 1 || outputs[0].key !== body || brep.source.family !== 'sweep-curve' || brep.source.id !== feature ||
      brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid') return;
    if ('cavities' in source) {
      if (!closedCircle) {
        const evidence = pairedLineArcDuctEvidence(brep, path, source)
          ?? (threePieceDuct ? pairedSpacedArcDuctEvidence(brep, path, source) : undefined);
        if (!evidence) return;
        return { brep, rectangularDuct: { body, sketch: edit.sketch, path: edit.path, pathRevision: edit.pathRevision, ...evidence } };
      }
      const evidence = closedPairedRectangularDuctEvidence(brep, path, source);
      if (!evidence) return;
      return { brep, rectangularDuct: { body, sketch: edit.sketch, path: edit.path, pathRevision: edit.pathRevision,
        pathKind: 'closed-circle' as const, caps: [], ...evidence } };
    }
    if (closedCircle) {
      const evidence = closedRectangularDuctEvidence(brep, path, source);
      if (!evidence) return;
      return { brep, rectangularDuct: { body, sketch: edit.sketch, path: edit.path, pathRevision: edit.pathRevision,
        pathKind: 'closed-circle' as const, caps: [], ...evidence } };
    }
    if (brep.shells.length !== 1 || !brep.shells[0].closed) return;
    const report = checkBrep(brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 1 ||
      canonical(report.counts) !== canonical({ bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 80, edges: 40, vertices: 24 })) return;
    const points = path.controlPoints;
    const mixedPath = brep.faces.some(face => face.name?.startsWith(`${feature}.line.`));
    const arcFirst = mixedPath && path.weights[1] < path.weights[0];
    const pieces = mixedPath ? arcFirst ? ['bend', 'line'] as const : ['line', 'bend'] as const : ['first', 'second'] as const;
    const wallNames = (tags: string[], piece: string) => tags.map(tag => `${feature}.${piece}.side[${tag}]`);
    const outerWalls = new Set(pieces.flatMap(piece => wallNames(source.outerTags, piece)));
    const innerWalls = new Set(pieces.flatMap(piece => wallNames(source.innerTags, piece)));
    const names = new Set([...outerWalls, ...innerWalls, `${feature}.start`, `${feature}.end`]);
    if (new Set(brep.faces.map(face => face.name)).size !== names.size || brep.faces.some(face => !face.name || !names.has(face.name) || face.surface.kind !== 'surface')) return;
    const first = sub(points[1], points[0]), last = sub(points[4], points[3]);
    const normal = (vector: Point, sign: number): Point => vector.map(value => sign * value / Math.hypot(...vector)) as Point;
    const caps = [capEvidence(brep, `${feature}.start`, points[0], normal(first, -1), source, tags => wallNames(tags, pieces[0]), arcFirst),
      capEvidence(brep, `${feature}.end`, points[4], normal(last, 1), source, tags => wallNames(tags, pieces[1]), mixedPath && !arcFirst)];
    if (!caps[0] || !caps[1]) return;
    const exteriorSeams = seams(brep, feature, source.outerTags, pieces), interiorSeams = seams(brep, feature, source.innerTags, pieces);
    if (!exteriorSeams || !interiorSeams) return;
    const curve = { ...path, kind: 'curve' as const, id: edit.path };
    const center = evaluateCurve(curve, path.knots[3]), tangent = normal(sub(points[2], points[1]), 1);
    const edges = (ids: string[]) => ids.map(id => brep.edges.find(edge => edge.id === id)!);
    if (!rectangle(edges(exteriorSeams), center, tangent, source.outer) || !rectangle(edges(interiorSeams), center, tangent, source.inner)) return;
    const pathKind = arcFirst ? 'arc-and-line' : 'line-and-arc';
    return { brep, rectangularDuct: { body, sketch: edit.sketch, path: edit.path, pathRevision: edit.pathRevision,
      caps: [caps[0], caps[1]], exteriorSeams, interiorSeams, ...(mixedPath ? { pathKind } : {}) } };
  } catch { return; }
}

import { CadNumericPolicy, CadPartLimits, ExtrudedProfileLimits, checkOutput, coedgeVertices, evaluateCadPart, faceGeometry, type Brep, type BrepFace, type CadPartFeature, type Point } from '@barocss/cad';
import { NODE_EXTRA_FIELDS, type DocPlane, type FaceEndExtrudeNode, type ModelNode, type NodeExtras, type SketchNode, type StudioDoc } from './doc';
import { refusal } from './refusal';
import { finiteBinary64Integer as exact } from './binary64';

const recipeFields = new Set(['kind', 'sketch', 'target']);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs;
const previous = (value: unknown, index: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < index;
const withinTolerance = (a: number, b: number) => Math.abs(a - b) <= CadNumericPolicy.linearTolerance;
const invalid = (message: string) => refusal('VALUE', `Extrude to face: ${message}`);
const missing = (message: string) => refusal('BAD_REFERENCE', `Extrude to face: ${message}`);

function targetDimension(value: unknown, parameters: unknown): number {
  const resolved = record(value) && typeof value.parameter === 'string' && record(parameters)
    && Object.hasOwn(parameters, value.parameter) ? parameters[value.parameter] : value;
  return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : NaN;
}

/** Detaching drops the target and its reference metadata. The feature and source IDs stay in place. */
export function detachFaceEndExtrude(node: FaceEndExtrudeNode & NodeExtras, distance: number): ModelNode {
  if (node.suppressed || !Number.isFinite(distance) || distance <= CadNumericPolicy.linearTolerance || distance > CadPartLimits.length) {
    throw invalid('a current exact distance is required to detach.');
  }
  const { id, sketch, bought } = node;
  return { kind: 'extrude', sketch, height: distance, ...(id === undefined ? {} : { id }), ...(bought === undefined ? {} : { bought }) };
}

function recipeProblem(node: Record<string, unknown>, index: number, nodes: readonly unknown[], parameters: unknown): string | null {
  if (Object.keys(node).some(key => !recipeFields.has(key) && !(NODE_EXTRA_FIELDS as readonly string[]).includes(key))) return 'the saved recipe has an unknown field.';
  const target = node.target;
  if (!previous(node.sketch, index) || !record(target) || Object.keys(target).some(key => key !== 'body' && key !== 'feature' && key !== 'face')) return 'the saved recipe needs a preceding sketch and target.';
  const body = target.body;
  if (!record(body) || Object.keys(body).some(key => key !== 'node' && key !== 'side') || !previous(body.node, index) || body.side !== 'solid') return 'the target must be a preceding solid in the same document.';
  const source = nodes[body.node];
  if (!record(source) || typeof target.feature !== 'string' || !/^n\d+$/.test(target.feature)
    || source.id !== target.feature || nodes.filter(other => record(other) && other.id === target.feature).length !== 1) {
    return 'the target feature identity is missing, changed or ambiguous.';
  }
  if (typeof target.face !== 'string' || !target.face || target.face.includes('+') || /#\d+$/.test(target.face)) return 'one persistent native face name is required.';
  // Native zero-draft prism names follow lower/upper geometry. A sign reversal can
  // reuse the lower name for the other authored end even when the old start is unchanged.
  if (node.suppressed !== true && source.kind === 'extrude' && !source.draft
    && target.face === `${target.feature}.bottom` && !(targetDimension(source.height, parameters) > 0)) {
    return 'the target extrusion must stay forward to preserve its authored start cap.';
  }
  return null;
}

export function faceEndExtrudeProblem(input: unknown): string | null {
  const stack: unknown[] = [input], seen = new Set<object>();
  while (stack.length) {
    const doc = stack.pop();
    if (!record(doc) || seen.has(doc)) continue;
    seen.add(doc);
    if (Array.isArray(doc.nodes)) for (const [index, node] of doc.nodes.entries()) {
      if (record(node) && node.kind === 'face-end-extrude') {
        const problem = recipeProblem(node, index, doc.nodes, doc.parameters);
        if (problem) return problem;
      }
    }
    if (Array.isArray(doc.instances)) for (const instance of doc.instances) if (record(instance)) stack.push(instance.doc);
    if (record(doc.pendingParts)) for (const pending of Object.values(doc.pendingParts)) if (record(pending)) stack.push(pending.doc);
  }
  return null;
}

type Axis = 0 | 1 | 2;
type AxisOrder = readonly [Axis, Axis, Axis];
type EndFrame = { axes: AxisOrder; sign: 1 | -1 };
const XY: EndFrame = { axes: [0, 1, 2], sign: 1 }, YZ: EndFrame = { axes: [1, 2, 0], sign: 1 };
const FRONT: EndFrame = { axes: [0, 2, 1], sign: -1 };

type ExactPoint = readonly [bigint, bigint];
const turn = (a: ExactPoint, b: ExactPoint, c: ExactPoint) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
/** A complete native convex straight trim whose outward normal opposes the extrusion. */
function targetPolygon(brep: Brep, face: BrepFace, { axes: [u, v, w], sign }: EndFrame) {
  const surface = face.surface;
  if (surface.kind !== 'surface' || surface.degreeU !== 1 || surface.degreeV !== 1
    || surface.controlPoints.length !== 2 || surface.controlPoints.some(row => row.length !== 2)) throw invalid('the target needs a native plane parallel to the sketch.');
  const poles = surface.controlPoints.flat(), level = poles[0][w];
  if (!poles.every(point => point.every(finiteCoordinate) && point[w] === level)) throw invalid('the target needs a native plane parallel to the sketch.');
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane' || !withinTolerance(plane.o[w], level) || !withinTolerance(plane.n[u], 0)
    || !withinTolerance(plane.n[v], 0) || !withinTolerance(plane.n[w], -sign)) {
    throw invalid('the target face normal must oppose the extrusion direction.');
  }
  const loop = face.loops.length === 1 ? brep.loops.find(loop => loop.id === face.loops[0]) : undefined;
  if (loop?.kind !== 'outer' || (loop.coedges.length < 3 || loop.coedges.length > 16)) throw invalid('the target face needs one convex straight trim of 3 to 16 edges without holes.');
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const coedges = new Map(brep.coedges.map(coedge => [coedge.id, coedge]));
  const points: Point[] = [];
  let first: string | undefined, previousEnd: string | undefined;
  for (const id of loop.coedges) {
    const use = coedges.get(id), edge = use && edges.get(use.edge);
    if (!use || !edge || use.loop !== loop.id) throw invalid('the target face trim is incomplete.');
    const curve = edge.curve, start = vertices.get(edge.vertices[0]), end = vertices.get(edge.vertices[1]);
    if (!start || !end || curve.degree !== 1 || curve.controlPoints.length !== 2 || curve.weights.length !== 2
      || !(curve.weights[0] > 0) || curve.weights[0] !== curve.weights[1]
      || !curve.controlPoints[0].every((value, axis) => value === start[axis])
      || !curve.controlPoints[1].every((value, axis) => value === end[axis])
      || !start.every(finiteCoordinate) || !end.every(finiteCoordinate)
      || start[w] !== level || end[w] !== level) {
      throw invalid('the target face trim must have native straight edges.');
    }
    const [a, b] = coedgeVertices(brep, use, edges);
    if (previousEnd !== undefined && a !== previousEnd) throw invalid('the target face trim is incomplete.');
    first ??= a;
    previousEnd = b;
    points.push(a === edge.vertices[0] ? start : end);
  }
  if (previousEnd !== first) throw invalid('the target face trim is incomplete.');
  const min = [Math.min(...points.map(p => p[u])), Math.min(...points.map(p => p[v]))];
  const max = [Math.max(...points.map(p => p[u])), Math.max(...points.map(p => p[v]))];
  const polygon: ExactPoint[] = points.map(p => [exact(p[u]), exact(p[v])]);
  const winding = turn(polygon[0], polygon[1], polygon[2]) > 0n ? 1n : -1n;
  // Every other vertex must lie strictly inward of every oriented edge. This rejects
  // collinear, repeated, concave and self-crossing rings without rounded determinants.
  for (let i=0;i<polygon.length;i++) for (let j=0;j<polygon.length;j++) {
    if (j === i || j === (i+1)%polygon.length) continue;
    if (winding*turn(polygon[i],polygon[(i+1)%polygon.length],polygon[j]) <= 0n)
      throw invalid('the target face trim must be strictly convex without collinear corners.');
  }
  const rectangle = points.length === 4 && [min[0],max[0]].every(x => [min[1],max[1]].every(y => points.some(p => p[u] === x && p[v] === y)));
  return { min, max, level, rectangle, contains: (point: readonly number[]) => {
    const p:ExactPoint=[exact(point[0]),exact(point[1])];
    return polygon.every((a,i)=>winding*turn(a,polygon[(i+1)%polygon.length],p)>=0n);
  } };
}

type LiteralRectangle = Extract<SketchNode, { profile: 'rectangle' }> & { min: [number, number]; max: [number, number] };
type LiteralPolygon = Omit<Extract<SketchNode, { profile: 'polygon' }>, 'points'> & { points: [number, number][] };

type LiteralCircle = Omit<Extract<SketchNode, { profile: 'circle' }>, 'center' | 'radius'> & { center: [number, number]; radius: number };
function literalCircle(sketch: Extract<SketchNode, { profile: 'circle' }>): sketch is LiteralCircle {
  const { center, radius } = sketch;
  if (!Array.isArray(center) || center.length !== 2 || !center.every(finiteCoordinate)
    || typeof radius !== 'number' || !Number.isFinite(radius) || radius < ExtrudedProfileLimits.minimumRadiusMM) return false;
  if (sketch.outline !== undefined || sketch.holes !== undefined || sketch.regions !== undefined
    || sketch.on !== undefined || sketch.association !== undefined || sketch.pocketFloor !== undefined
    || sketch.holeOutlines !== undefined || sketch.regionLengths !== undefined) return false;
  return center.every(c => typeof c === 'number' && finiteCoordinate(c - radius) && finiteCoordinate(c + radius));
}

/** Exact global convexity plus the existing minimum edge/altitude boundary. */
function admittedPolygon(points: readonly (readonly number[])[]): boolean {
  const n = points.length;
  if (n < 3 || n > 8 || !points.every(p => p.length === 2 && p.every(finiteCoordinate))) return false;
  const polygon: ExactPoint[] = points.map(p => [exact(p[0]), exact(p[1])]);
  const winding = turn(polygon[0], polygon[1], polygon[2]) > 0n ? 1n : -1n;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length <= CadNumericPolicy.linearTolerance) return false;
    for (let j = 0; j < n; j++) {
      if (j === i || j === (i + 1) % n) continue;
      if (winding * turn(polygon[i], polygon[(i + 1) % n], polygon[j]) <= 0n) return false;
      const c = points[j], area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      if (area <= CadNumericPolicy.linearTolerance * length) return false;
    }
  }
  return true;
}
function literalPolygon(sketch: Extract<SketchNode, { profile: 'polygon' }>): sketch is LiteralPolygon {
  const p = sketch.points;
  if (!Array.isArray(p) || !p.every(q => Array.isArray(q) && q.length === 2 && q.every(finiteCoordinate))) return false;
  const points = p as [number, number][];
  if (!admittedPolygon(points)) return false;
  // The existing editor writes >8-point outlines as loop profiles. Do not admit
  // a polygon whose ordinary Edit sketch/Finish would change this recipe's kind.
  if (points.length > 3 && ['holes', 'regions', 'holeOutlines', 'regionLengths', 'on', 'association', 'pocketFloor'].some(key => (sketch as unknown as Record<string, unknown>)[key] !== undefined)) return false;
  const frame = faceEndAxes(sketch.plane);
  if (!frame) return false;
  const { axes: [u, v] } = frame, origin = sketch.plane?.origin ?? [0, 0, 0];
  if (!admittedPolygon(points.map(p => [origin[u] + p[0], origin[v] + p[1]]))) return false;
  const outline: unknown = sketch.outline;
  if (outline !== undefined) {
    if (!record(outline) || !Array.isArray(outline.points) || outline.points.length !== points.length
      || !outline.points.every((q, i) => Array.isArray(q) && q.length === 2 && q.every((v, j) => v === points[i][j]))) return false;
    if (outline.bulges !== undefined && (!Array.isArray(outline.bulges)
      || (outline.bulges.length !== 0 && outline.bulges.length !== points.length)
      || !outline.bulges.every(v => typeof v === 'number' && Number.isFinite(v) && v === 0))) return false;
    if (outline.spline !== undefined || outline.ellipse !== undefined) return false;
    for (const key of ['circles', 'tangents', 'equalRadii', 'concentric']) {
      if (outline[key] !== undefined && (!Array.isArray(outline[key]) || outline[key].length !== 0)) return false;
    }
    if (outline.radii !== undefined && (!record(outline.radii) || Object.keys(outline.radii).length !== 0)) return false;
  }
  return true;
}

function exactAxis(vector: unknown, axis: Axis): boolean {
  return Array.isArray(vector) && vector.length === 3 && vector[0] === Number(axis === 0)
    && vector[1] === Number(axis === 1) && vector[2] === Number(axis === 2);
}

/** Only the three admitted exact raw frames reach the native prism placement. */
function faceEndAxes(plane: DocPlane | undefined): EndFrame | null {
  if (plane === undefined) return XY;
  if (!Array.isArray(plane?.origin) || plane.origin.length !== 3 || !plane.origin.every(finiteCoordinate)) return null;
  if (exactAxis(plane.normal, 2) && exactAxis(plane.xAxis, 0)) return XY;
  if (exactAxis(plane.normal, 0) && exactAxis(plane.xAxis, 1)) return YZ;
  if (Array.isArray(plane.normal) && plane.normal.length === 3 && plane.normal[0] === 0 && plane.normal[1] === -1
    && plane.normal[2] === 0 && exactAxis(plane.xAxis, 0)) return FRONT;
  return null;
}

export function isFaceEndExtrudeSketch(sketch: ModelNode | undefined): sketch is LiteralRectangle | LiteralPolygon | LiteralCircle {
  if (sketch?.kind !== 'sketch' || sketch.suppressed || faceEndAxes(sketch.plane) === null || sketch.on
    || sketch.association || sketch.regions?.length || sketch.holes?.length) return false;
  if (sketch.profile === 'circle') return literalCircle(sketch);
  if (sketch.profile === 'polygon') return literalPolygon(sketch);
  return sketch.profile === 'rectangle'
    && Array.isArray(sketch.min) && sketch.min.length === 2 && sketch.min.every(finiteCoordinate)
    && Array.isArray(sketch.max) && sketch.max.length === 2 && sketch.max.every(finiteCoordinate);
}

/** Resolve from the live preceding native results. A consumed target has no eligible output. */
export function faceEndExtrudeHeight(doc: StudioDoc, node: FaceEndExtrudeNode, prefix: readonly CadPartFeature[]): number {
  const sketch = doc.nodes[node.sketch];
  if (!isFaceEndExtrudeSketch(sketch)) throw invalid('the source needs a literal rectangle, straight convex polygon of 3 to 8 points or circle on a default or translated XY plane, on the supported +X-normal YZ plane, or on the exact -Y-normal Front XZ plane.');
  const axes = faceEndAxes(sketch.plane)!;
  const { axes: [u, v, w], sign } = axes, origin = sketch.plane?.origin ?? [0, 0, 0];
  // Bounds use the actual native profile fields, never the editor's optional outline snapshot.
  const min = sketch.profile === 'rectangle' ? sketch.min : sketch.profile === 'circle' ? sketch.center.map(c => c - sketch.radius) : [Math.min(...sketch.points.map(p => p[0])), Math.min(...sketch.points.map(p => p[1]))];
  const max = sketch.profile === 'rectangle' ? sketch.max : sketch.profile === 'circle' ? sketch.center.map(c => c + sketch.radius) : [Math.max(...sketch.points.map(p => p[0])), Math.max(...sketch.points.map(p => p[1]))];
  const u0 = origin[u] + min[0], v0 = origin[v] + min[1];
  const u1 = origin[u] + max[0], v1 = origin[v] + max[1];
  if (![u0, v0, u1, v1].every(finiteCoordinate)) throw invalid('the projected source is outside the native coordinate range.');
  if (u0 >= u1 || v0 >= v1) throw invalid('the source rectangle needs a positive width and height.');
  const target = doc.nodes[node.target.body.node];
  if (!target || target.suppressed) throw missing('the target body is missing or suppressed.');
  const snapshot = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: doc.parameters, features: [...prefix] });
  const outputs = snapshot.outputs.filter(output => output.id === node.target.feature);
  if (outputs.length !== 1 || outputs[0].representation === 'faceted' || outputs[0].brep.bodies.length !== 1
    || outputs[0].brep.bodies[0].kind !== 'solid' || !checkOutput(outputs[0]).valid) throw missing('the target must remain one current exact solid.');
  const brep = outputs[0].brep;
  const faces = brep.faces.filter(face => face.name === node.target.face);
  if (faces.length !== 1) throw missing('the named target face is missing or ambiguous.');
  const box = targetPolygon(brep, faces[0], axes);
  if (u0 < box.min[0] || v0 < box.min[1] || u1 > box.max[0] || v1 > box.max[1]) throw invalid('the target face must contain the entire projected profile.');
  if (!box.rectangle) {
    // Native circles reconstruct their radius from rounded arc endpoints. Do not
    // claim a disk proof from the authored radius; retain only the previous target scope.
    if (sketch.profile === 'circle') throw invalid('a circle source currently needs an axis-aligned rectangle target.');
    const projected = sketch.profile === 'rectangle' ? [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]
      : sketch.points.map(p => [origin[u]+p[0],origin[v]+p[1]]);
    if (!projected.every(box.contains)) throw invalid('the target face must contain the entire projected profile.');
  }
  const height = sign * (box.level - origin[w]);
  if (height <= CadNumericPolicy.linearTolerance || height > CadPartLimits.length) throw invalid('the target must be ahead of the source in the positive extrusion direction.');
  if (!withinTolerance(origin[w] + sign * height, box.level)) throw invalid('the reconstructed end is outside the native linear tolerance.');
  return height;
}

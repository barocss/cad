import { CadNumericPolicy, CadPartLimits, ExtrudedProfileLimits, checkOutput, coedgeVertices, evaluateCadPart, faceGeometry, type Brep, type BrepFace, type CadPartFeature, type Point } from '@barocss/cad';
import { annularCapReplacementFrame, circularCapReplacementFrame } from '@barocss/cad/internal/bored-cap-offset';
import { NODE_EXTRA_FIELDS, type DocPlane, type FaceEndExtrudeNode, type ModelNode, type NodeExtras, type SketchNode, type StudioDoc } from './doc';
import { featureId } from './ids';
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

const uniqueIdentity = (nodes: readonly unknown[], id: unknown): id is string => typeof id === 'string' && /^n\d+$/.test(id)
  && nodes.filter(node => record(node) && node.id === id).length === 1;

/** A direct Hole must still refer to the same authored forward circular stock. */
function annularSource(nodes: readonly unknown[], index: number) {
  const hole = nodes[index];
  if (!record(hole) || hole.kind !== 'hole' || !record(hole.parent) || hole.parent.side !== 'solid'
    || !previous(hole.parent.node, index)) return;
  const stock = nodes[hole.parent.node];
  if (!record(stock) || stock.kind !== 'extrude' || !previous(stock.sketch, hole.parent.node)) return;
  const circle = nodes[stock.sketch];
  if (!record(circle) || circle.kind !== 'sketch' || circle.profile !== 'circle') return;
  return { hole, stock, circle, sketchIndex: stock.sketch };
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
  const sketch = nodes[node.sketch as number];
  if (node.suppressed !== true && record(sketch) && faceEndAxes(sketch.plane as DocPlane | undefined) === DOWN_XY) {
    const problem = downwardTargetProblem(nodes, target as unknown as FaceEndExtrudeNode['target'], parameters, sketch.profile === 'circle');
    if (problem) return problem;
  }
  const annular = annularSource(nodes, body.node);
  if (annular && target.face.endsWith('.bottom')) {
    if (!uniqueIdentity(nodes, annular.stock.id) || !uniqueIdentity(nodes, annular.circle.id)) {
      return 'the target stock or source sketch identity is missing, changed or ambiguous.';
    }
    if (target.face !== `${annular.stock.id}.bottom`) return 'the original lower target face identity has changed.';
    if (node.suppressed !== true && !annular.stock.draft && !(targetDimension(annular.stock.height, parameters) > 0)) {
      return 'the target extrusion must stay forward to preserve its authored start cap.';
    }
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
const DOWN_XY: EndFrame = { axes: [0, 1, 2], sign: -1 };

type ExactPoint = readonly [bigint, bigint];
const turn = (a: ExactPoint, b: ExactPoint, c: ExactPoint) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

/** An admitted convex polygon must exclude the disk's centre and clear every boundary segment. */
function polygonClearsDisk(polygon: readonly ExactPoint[], centre: ExactPoint, radius: bigint): boolean {
  const winding = turn(polygon[0], polygon[1], polygon[2]) > 0n ? 1n : -1n;
  if (polygon.every((a, i) => winding * turn(a, polygon[(i + 1) % polygon.length], centre) >= 0n)) return false;
  const radius2 = radius * radius;
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const x = b[0] - a[0], y = b[1] - a[1], dx = centre[0] - a[0], dy = centre[1] - a[1];
    const length2 = x * x + y * y, dot = dx * x + dy * y;
    if (length2 === 0n) return false;
    if (dot <= 0n) return dx * dx + dy * dy > radius2;
    if (dot >= length2) {
      const ex = centre[0] - b[0], ey = centre[1] - b[1];
      return ex * ex + ey * ey > radius2;
    }
    const cross = x * dy - y * dx;
    return cross * cross > radius2 * length2;
  });
}

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
type RadialTarget = ReturnType<typeof targetPolygon> & {
  centre: readonly [number, number]; radius: number; roundoff: number; bore?: number;
};
function literalCircle(sketch: Extract<SketchNode, { profile: 'circle' }>): sketch is LiteralCircle {
  const { center, radius } = sketch;
  if (!Array.isArray(center) || center.length !== 2 || !center.every(finiteCoordinate)
    || typeof radius !== 'number' || !Number.isFinite(radius) || radius < ExtrudedProfileLimits.minimumRadiusMM) return false;
  if (sketch.outline !== undefined || sketch.holes !== undefined || sketch.regions !== undefined
    || sketch.on !== undefined || sketch.association !== undefined || sketch.pocketFloor !== undefined
    || sketch.holeOutlines !== undefined || sketch.regionLengths !== undefined) return false;
  return center.every(c => typeof c === 'number' && finiteCoordinate(c - radius) && finiteCoordinate(c + radius));
}

/** The original outward disk of an intact upright circular Extrude. */
function circularProfileTarget(doc: StudioDoc, node: FaceEndExtrudeNode, sketch: LiteralRectangle | LiteralPolygon | LiteralCircle,
  brep: Brep, face: BrepFace, axes: EndFrame): RadialTarget | undefined {
  const target = doc.nodes[node.target.body.node];
  const downward = axes === DOWN_XY && sketch.profile === 'circle';
  if (!downward && (axes !== XY || (sketch.profile !== 'rectangle' && sketch.profile !== 'circle'))) return;
  const cap = downward ? 'top' : 'bottom';
  if (target?.kind !== 'extrude' || target.held || target.cutDepth !== undefined
    || target.draft || face.name !== `${node.target.feature}.${cap}`) return;
  const circle = doc.nodes[target.sketch];
  if (circle?.kind !== 'sketch' || circle.profile !== 'circle' || circle.suppressed || circle.held || circle.plane || !literalCircle(circle)) return;
  const frame = circularCapReplacementFrame(brep, face.name);
  if (!frame || frame.normal[0] !== 0 || frame.normal[1] !== 0 || frame.normal[2] !== -axes.sign) return;
  // The kernel verifies the complete rational disk, its two outward half cylinders and exact trims.
  // Bound the disk from the same native supports, rather than from the authored circle radius.
  const cylinders = brep.faces.map(candidate => faceGeometry(candidate)).filter(support => support.kind === 'cylinder');
  if (cylinders.length !== 2) return;
  const extent = Math.max(1, ...brep.faces.flatMap(candidate => candidate.surface.kind === 'surface'
    ? candidate.surface.controlPoints.flat().flat().map(Math.abs) : []));
  const roundoff = 64 * Number.EPSILON * extent, [cx, cy, level] = frame.anchor;
  const radius = Math.min(...cylinders.map(support => support.r - Math.hypot(support.c[0] - cx, support.c[1] - cy))) - roundoff;
  if (!(radius > roundoff)) throw invalid('the circular target radius cannot be certified.');
  return {
    min: [cx - radius, cy - radius], max: [cx + radius, cy + radius], level, rectangle: false, centre: [cx, cy], radius, roundoff,
    // A rectangle is convex and distance to a fixed centre attains its maximum at a corner.
    // The extra roundoff margin also bounds subtraction and hypot, so tangency is not silently widened.
    contains: point => Math.hypot(point[0] - cx, point[1] - cy) + roundoff <= radius,
  };
}

/** Certify the represented source disk, including native radius normalization and XY placement. */
function probeCircleSource(doc: StudioDoc, node: FaceEndExtrudeNode, prefix: readonly CadPartFeature[],
  height: number, cap: 'probe.bottom' | 'probe.top') {
  const sourceId = featureId(doc.nodes, node.sketch), sources = prefix.filter(feature => feature.id === sourceId);
  if (sources.length !== 1 || sources[0].kind !== 'sketch' || sources[0].profile !== 'circle') throw missing('the original circular source is missing or ambiguous.');
  // A two-feature probe uses the same compiled sketch and actual depth, without changing the document.
  const probe = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: doc.parameters,
    features: [{ ...sources[0], id: 'source' }, { id: 'probe', kind: 'extrude', sketch: 'source', height }] });
  const [output] = probe.outputs;
  if (probe.outputs.length !== 1 || !checkOutput(output).valid) throw invalid('the circular source needs one current exact solid.');
  const brep = output.brep, frame = circularCapReplacementFrame(brep, cap);
  const cylinders = brep.faces.map(face => faceGeometry(face)).filter(support => support.kind === 'cylinder');
  if (!frame || frame.normal[2] !== -1 || cylinders.length !== 2) throw invalid('the circular source supports cannot be certified.');
  const extent = Math.max(1, ...brep.faces.flatMap(face => face.surface.kind === 'surface'
    ? face.surface.controlPoints.flat().flat().map(Math.abs) : []));
  return { frame, cylinders, roundoff: 64 * Number.EPSILON * extent };
}

function circleFitsRadialTarget(doc: StudioDoc, node: FaceEndExtrudeNode, prefix: readonly CadPartFeature[],
  target: RadialTarget, height: number, downward: boolean): boolean {
  const source = probeCircleSource(doc, node, prefix, height, downward ? 'probe.top' : 'probe.bottom');
  if (downward && !withinTolerance(source.frame.anchor[2], target.level)) return false;
  const roundoff = Math.max(target.roundoff, source.roundoff);
  return source.cylinders.every(support => {
    if (support.out !== 1 || support.a[0] !== 0 || support.a[1] !== 0 || support.a[2] !== 1
      || !support.c.every(finiteCoordinate) || !finiteCoordinate(support.r) || support.r <= 0) return false;
    const room = exact(target.radius) - exact(support.r) - exact(roundoff);
    const dx = exact(support.c[0]) - exact(target.centre[0]), dy = exact(support.c[1]) - exact(target.centre[1]);
    const distance2 = dx * dx + dy * dy;
    if (!(room > 0n && distance2 < room * room)) return false;
    if (target.bore === undefined) return true;
    // Exclude the complete bore disk, including strict contact. Add before squaring without Number rounding.
    const excluded = exact(target.bore) + exact(support.r) + exact(roundoff);
    return distance2 > excluded * excluded;
  });
}

function downwardCircleFits(doc: StudioDoc, node: FaceEndExtrudeNode, sketch: LiteralCircle,
  prefix: readonly CadPartFeature[], target: ReturnType<typeof targetPolygon>, height: number): boolean {
  // With a -Z sketch the authored end cap is the lower native disk.
  const { frame, cylinders, roundoff } = probeCircleSource(doc, node, prefix, height, 'probe.top');
  const [x, y] = sketch.plane!.origin;
  const center = [x + sketch.center[0], y - sketch.center[1]];
  return withinTolerance(frame.anchor[2], target.level) && cylinders.every(support => {
    if (support.out !== 1 || support.a[0] !== 0 || support.a[1] !== 0 || support.a[2] !== 1
      || !support.c.every(finiteCoordinate) || !finiteCoordinate(support.r) || support.r <= 0) return false;
    const reach = exact(support.r) + exact(roundoff);
    return center.every((value, axis) => {
      const at = exact(support.c[axis]);
      return Math.abs(support.c[axis] - value) <= roundoff
        && at - reach > exact(target.min[axis]) && at + reach < exact(target.max[axis]);
    });
  });
}

/** One original lower annulus of a forward upright coaxial circular Extrude and through Hole. */
function annularProfileTarget(doc: StudioDoc, node: FaceEndExtrudeNode, sketch: LiteralRectangle | LiteralPolygon | LiteralCircle,
  brep: Brep, face: BrepFace, axes: EndFrame, min: readonly number[], max: readonly number[]): RadialTarget | undefined {
  if (axes !== XY) return;
  const source = annularSource(doc.nodes, node.target.body.node);
  if (!source) return;
  const { hole, stock, circle } = source;
  if (hole.suppressed || hole.held || stock.suppressed || stock.held || circle.suppressed || circle.held
    || (hole.axis !== undefined && hole.axis !== 'z') || hole.depth !== undefined || hole.pattern !== undefined
    || hole.countersink !== undefined || hole.csk !== undefined || hole.thread !== undefined || hole.face !== undefined
    || stock.draft || stock.cutDepth !== undefined || circle.plane !== undefined
    || !(targetDimension(stock.height, doc.parameters) > 0) || face.name !== `${stock.id}.bottom`
    || !uniqueIdentity(doc.nodes, stock.id) || !uniqueIdentity(doc.nodes, circle.id)) return;
  const authoredCircle = doc.nodes[source.sketchIndex];
  if (authoredCircle.kind !== 'sketch' || authoredCircle.profile !== 'circle' || !literalCircle(authoredCircle)
    || !Array.isArray(hole.center) || hole.center.length !== 2
    || !hole.center.every((value, i) => targetDimension(value, doc.parameters) === authoredCircle.center[i])) return;
  const frame = annularCapReplacementFrame(brep, face.name!);
  if (!frame || frame.normal[0] !== 0 || frame.normal[1] !== 0 || frame.normal[2] !== -1) return;
  // The kernel certifies the entire annular trim and both pairs of native half cylinders.
  // Its anchor is a material point: only its Z station is a cap coordinate.
  const cylinders = brep.faces.map(candidate => faceGeometry(candidate)).filter(support => support.kind === 'cylinder');
  const outer = cylinders.filter(support => support.out === 1), inner = cylinders.filter(support => support.out === -1);
  if (cylinders.length !== 4 || outer.length !== 2 || inner.length !== 2) return;
  const extent = Math.max(1, ...brep.faces.flatMap(candidate => candidate.surface.kind === 'surface'
    ? candidate.surface.controlPoints.flat().flat().map(Math.abs) : []));
  const roundoff = 64 * Number.EPSILON * extent, [cx, cy] = outer[0].c, level = frame.anchor[2];
  if (!cylinders.every(support => support.a[0] === 0 && support.a[1] === 0 && support.a[2] === 1
    && support.c.every(finiteCoordinate) && finiteCoordinate(support.r)
    && Math.hypot(support.c[0] - cx, support.c[1] - cy) <= roundoff
    && Math.hypot(support.c[0] - authoredCircle.center[0], support.c[1] - authoredCircle.center[1]) <= roundoff)) return;
  const separation = (support: typeof outer[number]) => Math.hypot(support.c[0] - cx, support.c[1] - cy);
  const radius = Math.min(...outer.map(support => support.r - separation(support))) - roundoff;
  const bore = Math.max(...inner.map(support => support.r + separation(support))) + roundoff;
  if (!(bore > roundoff && radius - bore > roundoff)) throw invalid('the annular target radii cannot be certified.');
  const target: RadialTarget = {
    min: [cx - radius, cy - radius], max: [cx + radius, cy + radius], level, rectangle: false,
    centre: [cx, cy], radius, bore, roundoff,
    contains: point => Math.hypot(point[0] - cx, point[1] - cy) + roundoff <= radius,
  };
  // A circle uses its represented native disk at the actual depth, not its bounding square or authored radius.
  if (sketch.profile === 'circle') return target;
  let clearsBore: boolean;
  if (sketch.profile === 'rectangle') {
    // Clamp to the whole rectangle, including its edges and interior.
    const dx = Math.max(min[0] - cx, 0, cx - max[0]), dy = Math.max(min[1] - cy, 0, cy - max[1]);
    clearsBore = Math.hypot(dx, dy) > bore + roundoff;
  } else {
    const origin = sketch.plane?.origin ?? [0, 0, 0];
    const polygon: ExactPoint[] = sketch.points.map(p => [exact(origin[0] + p[0]), exact(origin[1] + p[1])]);
    // Keep the existing native radius margin without rounding its final addition down.
    clearsBore = polygonClearsDisk(polygon, [exact(cx), exact(cy)], exact(bore) + exact(roundoff));
  }
  if (!clearsBore) throw invalid('the target face must contain the entire projected profile clear of its bore.');
  return target;
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

/** Only the admitted exact raw frames reach the native prism placement. */
function faceEndAxes(plane: DocPlane | undefined): EndFrame | null {
  if (plane === undefined) return XY;
  if (!Array.isArray(plane?.origin) || plane.origin.length !== 3 || !plane.origin.every(finiteCoordinate)) return null;
  if (exactAxis(plane.normal, 2) && exactAxis(plane.xAxis, 0)) return XY;
  if (exactAxis(plane.normal, 0) && exactAxis(plane.xAxis, 1)) return YZ;
  if (Array.isArray(plane.normal) && plane.normal.length === 3 && plane.normal[0] === 0 && plane.normal[1] === -1
    && plane.normal[2] === 0 && exactAxis(plane.xAxis, 0)) return FRONT;
  if (Array.isArray(plane.normal) && plane.normal.length === 3 && plane.normal[0] === 0 && plane.normal[1] === 0
    && plane.normal[2] === -1 && exactAxis(plane.xAxis, 0)) return DOWN_XY;
  return null;
}

export function isFaceEndExtrudeSketch(sketch: ModelNode | undefined): sketch is LiteralRectangle | LiteralPolygon | LiteralCircle {
  if (sketch?.kind !== 'sketch' || sketch.suppressed || faceEndAxes(sketch.plane) === null || sketch.on
    || sketch.association || sketch.regions?.length || sketch.holes?.length) return false;
  if (faceEndAxes(sketch.plane) === DOWN_XY &&
    ((sketch.profile !== 'rectangle' && sketch.profile !== 'circle') || sketch.held !== undefined || sketch.pocketFloor !== undefined)) return false;
  if (sketch.profile === 'circle') return literalCircle(sketch);
  if (sketch.profile === 'polygon') return literalPolygon(sketch);
  return sketch.profile === 'rectangle'
    && Array.isArray(sketch.min) && sketch.min.length === 2 && sketch.min.every(finiteCoordinate)
    && Array.isArray(sketch.max) && sketch.max.length === 2 && sketch.max.every(finiteCoordinate);
}

/** A reversed XY profile keeps the original upper end of one supported forward upright extrusion. */
function downwardTargetProblem(nodes: readonly unknown[], target: FaceEndExtrudeNode['target'], parameters: unknown, circleSource: boolean): string | null {
  const stock = nodes[target.body.node];
  const profile = circleSource ? 'rectangular or circular' : 'rectangular';
  const unsupported = `the downward profile needs the original upper cap of a forward upright ${profile} extrusion with zero draft.`;
  if (!record(stock) || stock.kind !== 'extrude' || stock.suppressed || stock.held !== undefined
    || !previous(stock.sketch, target.body.node) || stock.cutDepth !== undefined || (stock.draft ?? 0) !== 0
    || target.face !== `${target.feature}.top`) return unsupported;
  if (!(targetDimension(stock.height, parameters) > 0))
    return 'the target extrusion must stay forward to preserve its authored end cap.';
  const sketch = nodes[stock.sketch];
  if (!record(sketch) || sketch.kind !== 'sketch' || sketch.held !== undefined
    || sketch.pocketFloor !== undefined || faceEndAxes(sketch.plane as DocPlane | undefined) !== XY
    || !isFaceEndExtrudeSketch(sketch as unknown as ModelNode)) return unsupported;
  return sketch.profile === 'rectangle' || (circleSource && sketch.profile === 'circle' && sketch.plane === undefined)
    ? null : unsupported;
}

/** Resolve from the live preceding native results. A consumed target has no eligible output. */
export function faceEndExtrudeHeight(doc: StudioDoc, node: FaceEndExtrudeNode, prefix: readonly CadPartFeature[]): number {
  const sketch = doc.nodes[node.sketch];
  if (!isFaceEndExtrudeSketch(sketch)) throw invalid('the source needs a literal rectangle, straight convex polygon of 3 to 8 points or circle on a default or translated XY plane, on the supported +X-normal YZ plane, or on the exact -Y-normal Front XZ plane. An exact -Z-normal XY plane supports a literal rectangle or circle.');
  const axes = faceEndAxes(sketch.plane)!;
  const { axes: [u, v, w], sign } = axes, origin = sketch.plane?.origin ?? [0, 0, 0];
  if (axes === DOWN_XY) {
    const problem = downwardTargetProblem(doc.nodes, node.target, doc.parameters, sketch.profile === 'circle');
    if (problem) throw invalid(problem);
  }
  // Bounds use the actual native profile fields, never the editor's optional outline snapshot.
  const min = sketch.profile === 'rectangle' ? sketch.min : sketch.profile === 'circle' ? sketch.center.map(c => c - sketch.radius) : [Math.min(...sketch.points.map(p => p[0])), Math.min(...sketch.points.map(p => p[1]))];
  const max = sketch.profile === 'rectangle' ? sketch.max : sketch.profile === 'circle' ? sketch.center.map(c => c + sketch.radius) : [Math.max(...sketch.points.map(p => p[0])), Math.max(...sketch.points.map(p => p[1]))];
  const u0 = origin[u] + min[0], v0 = origin[v] + (axes === DOWN_XY ? -max[1] : min[1]);
  const u1 = origin[u] + max[0], v1 = origin[v] + (axes === DOWN_XY ? -min[1] : max[1]);
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
  const disk = circularProfileTarget(doc, node, sketch, brep, faces[0], axes);
  const radial = disk ?? annularProfileTarget(doc, node, sketch, brep, faces[0], axes, [u0, v0], [u1, v1]);
  const box = radial ?? targetPolygon(brep, faces[0], axes);
  if (axes === DOWN_XY && !box.rectangle && !disk) throw invalid('the downward profile needs a native rectangular face or an original upper circular disk.');
  if (!(sketch.profile === 'circle' && radial)) {
    if (u0 < box.min[0] || v0 < box.min[1] || u1 > box.max[0] || v1 > box.max[1]) throw invalid('the target face must contain the entire projected profile.');
    if (!box.rectangle) {
      if (sketch.profile === 'circle') throw invalid('a circle source currently needs an axis-aligned rectangle target or an original lower circular disk or annulus.');
      const projected = sketch.profile === 'rectangle' ? [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]
        : sketch.points.map(p => [origin[u]+p[0],origin[v]+p[1]]);
      if (!projected.every(box.contains)) throw invalid('the target face must contain the entire projected profile.');
    }
  }
  const height = sign * (box.level - origin[w]);
  if (height <= CadNumericPolicy.linearTolerance || height > CadPartLimits.length) throw invalid('the target must be ahead of the source in the positive extrusion direction.');
  if (!withinTolerance(origin[w] + sign * height, box.level)) throw invalid('the reconstructed end is outside the native linear tolerance.');
  if (axes === DOWN_XY && sketch.profile === 'circle' && !radial && !downwardCircleFits(doc, node, sketch, prefix, box, height))
    throw invalid('the target face must strictly contain the entire projected circle.');
  if (sketch.profile === 'circle' && radial && !circleFitsRadialTarget(doc, node, prefix, radial, height, axes === DOWN_XY))
    throw invalid(radial.bore === undefined ? 'the target face must contain the entire projected profile.'
      : 'the target face must contain the entire projected profile clear of its bore.');
  return height;
}

import { CadNumericPolicy, checkOutput, coedgeVertices, evaluateCadPart, faceGeometry, type Brep, type CadPartFeature, type CadPartOutput, type Point } from '@barocss/cad';
import type { BodyRef, Dim, ModelNode, StudioDoc } from './doc';
import { featureId } from './ids';
import type { Sig } from './references';
import { refusal } from './refusal';

type Rib = Extract<ModelNode, { kind: 'rib' }>;
interface Cap { signature: Sig; min: [number, number]; max: [number, number]; thickness: number }
const TOL = CadNumericPolicy.linearTolerance;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs;
const bad = (message: string): never => { throw refusal('BAD_REFERENCE', `Attached Rib: ${message}`); };
function dimension(value: Dim, doc: StudioDoc): number {
  const resolved = typeof value === 'number' ? value : value && Object.keys(value).length === 1 && typeof value.parameter === 'string'
    && Object.hasOwn(doc.parameters, value.parameter) ? doc.parameters[value.parameter] : NaN;
  return finite(resolved) ? resolved : bad('coordinates must resolve to finite values within the modeling range.');
}

/** Read the actual four native edge uses, not a display AABB or a merged face. */
function rectangularCap(brep: Brep, name: string, sign: 1 | -1): Cap {
  const faces = brep.faces.filter(face => face.name === name);
  if (faces.length !== 1) return bad('the original cap face is missing or ambiguous.');
  const [face] = faces, geometry = faceGeometry(face);
  if (geometry.kind !== 'plane' || geometry.n[0] !== 0 || geometry.n[1] !== 0 || geometry.n[2] !== sign || !finite(geometry.o[2]))
    return bad('the original cap must retain its horizontal plane and outward direction.');
  const loop = face.loops.length === 1 ? brep.loops.find(loop => loop.id === face.loops[0]) : undefined;
  if (loop?.kind !== 'outer' || loop.coedges.length !== 4) return bad('the original cap needs one rectangular boundary without holes.');
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const points: Point[] = []; let first: string | undefined, previous: string | undefined;
  for (const id of loop.coedges) {
    const use = coedges.get(id), edge = use && edges.get(use.edge), curve = edge?.curve;
    const ends = edge?.vertices.map(id => vertices.get(id));
    if (!use || !edge || !curve || !ends?.[0] || !ends[1] || curve.degree !== 1 || curve.controlPoints.length !== 2
      || curve.weights.length !== 2 || !(curve.weights[0] > 0) || curve.weights[0] !== curve.weights[1]
      || !ends.every((point, i) => point!.every((value, k) => finite(value) && value === curve.controlPoints[i][k]) && point![2] === geometry.o[2])
      || (ends[0][0] === ends[1][0]) === (ends[0][1] === ends[1][1]))
      return bad('the cap must keep exact axis-aligned rectangular native edges.');
    const [start, end] = coedgeVertices(brep, use, edges);
    if (previous !== undefined && previous !== start) return bad('the cap boundary is disconnected.');
    first ??= start; previous = end; points.push(vertices.get(start)!);
  }
  if (previous !== first) return bad('the cap boundary does not close.');
  const min: [number, number] = [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1]))];
  const max: [number, number] = [Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1]))];
  if (!(min[0] < max[0] && min[1] < max[1]) || ![min[0], max[0]].every(x => [min[1], max[1]].every(y => points.some(point => point[0] === x && point[1] === y))))
    return bad('the cap must remain one nondegenerate rectangle.');
  const levels = brep.vertices.map(vertex => vertex.point[2]), thickness = Math.max(...levels) - Math.min(...levels);
  const signature: Sig = { k: 'plane', p: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, geometry.o[2]],
    d: [0, 0, sign], s: (max[0] - min[0]) * (max[1] - min[1]) };
  if (!signature.p.every(finite) || !Number.isFinite(signature.s) || !(thickness > TOL)) return bad('the cap is outside the supported numeric range.');
  return { signature, min, max, thickness };
}

function currentCap(doc: StudioDoc, parent: BodyRef, face: string, index: number, prefix: readonly CadPartFeature[]): Cap {
  if (!parent) return bad('one preceding stock body is required.');
  const stock = doc.nodes[parent.node], name = stock && featureId(doc.nodes, parent.node);
  if (doc.instances?.length || parent.side !== 'solid' || !Number.isInteger(parent.node) || parent.node < 0 || parent.node >= index
    || stock?.kind !== 'extrude' || stock.suppressed || stock.held !== undefined || stock.draft || stock.cutDepth
    || !name || doc.nodes.filter((_, i) => featureId(doc.nodes, i) === name).length !== 1
    || (face !== `${name}.top` && face !== `${name}.bottom`))
    return bad('select the same original cap of one preceding upright rectangular stock.');
  const profile = doc.nodes[stock.sketch], plane = profile?.kind === 'sketch' ? profile.plane : undefined;
  if (!Number.isInteger(stock.sketch) || stock.sketch < 0 || stock.sketch >= parent.node || profile?.kind !== 'sketch'
    || profile.profile !== 'rectangle' || profile.suppressed || profile.held !== undefined || profile.holes?.length || profile.regions?.length
    || profile.association || profile.pocketFloor || !(dimension(stock.height, doc) > TOL)
    || (plane !== undefined && (plane.normal.some((value, i) => value !== [0, 0, 1][i])
      || plane.xAxis.some((value, i) => value !== [1, 0, 0][i]) || !plane.origin.every(finite))))
    return bad('the source must remain one forward, undrafted XY rectangular extrusion.');
  let outputs: readonly CadPartOutput[];
  try { ({ outputs } = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: doc.parameters, features: [...prefix] })); }
  catch { return bad('the source prefix could not be evaluated.'); }
  const matches = outputs.filter(output => output.id === name && output.feature === name), output = matches[0];
  if (matches.length !== 1 || output.representation !== 'upright' || output.brep.bodies.length !== 1 || output.brep.bodies[0].kind !== 'solid'
    || output.brep.faces.length !== 6 || output.brep.shells.length !== 1 || !output.brep.shells[0].closed || !checkOutput(output).valid)
    return bad('the original stock must remain one current exact rectangular solid.');
  return rectangularCap(output.brep, face, face === `${name}.top` ? 1 : -1);
}

/** Exact native signature for callers that already own the document's native prefix.
 * Studio can equivalently use the unmerged native cap centroid, exact plane Z,
 * outward normal and face area. Do not round the saved plane Z.
 */
export function attachedRibSignature(doc: StudioDoc, parent: BodyRef, face: string, prefix: readonly CadPartFeature[]): Sig {
  return currentCap(doc, parent, face, doc.nodes.length, prefix).signature;
}

/** Resolve a Rib's saved cap reference and lower only its Z translation.
 * Missing sigs retain the legacy absolute Rib contract; a present malformed
 * signature never falls back to that contract. The native Rib still checks its
 * positive overlap, positive outside volume and single-solid union.
 */
export function resolveAttachedRib(doc: StudioDoc, node: Rib, index: number, prefix: readonly CadPartFeature[]): { min: Point; max: Point } {
  const sigs = node.sigs, names = sigs && Object.keys(sigs), face = names?.[0], saved = face && sigs?.[face];
  if (!names || names.length !== 1 || !face || !saved || Object.keys(saved).sort().join(',') !== 'd,k,p,s'
    || saved.k !== 'plane' || !Array.isArray(saved.p) || saved.p.length !== 3 || !saved.p.every(finite)
    || !Array.isArray(saved.d) || saved.d.length !== 3 || saved.d[0] !== 0 || saved.d[1] !== 0 || (saved.d[2] !== 1 && saved.d[2] !== -1)
    || !Number.isFinite(saved.s) || saved.s <= 0 || node.rematched !== undefined)
    return bad('one exact saved cap plane and outward normal are required; do not rematch the attachment.');
  const cap = currentCap(doc, node.parent, face, index, prefix), actual = cap.signature;
  if (actual.d![2] !== saved.d[2] || Math.abs(actual.p[0] - saved.p[0]) > TOL || Math.abs(actual.p[1] - saved.p[1]) > TOL
    || Math.abs(actual.s - saved.s) > CadNumericPolicy.relativeComparison * Math.max(1, actual.s, saved.s))
    return bad('the original cap orientation or XY support changed.');
  if (!Array.isArray(node.min) || node.min.length !== 3 || !Array.isArray(node.max) || node.max.length !== 3)
    return bad('the authored Rib needs two three-dimensional corners.');
  const min = node.min.map(value => dimension(value, doc)) as Point, max = node.max.map(value => dimension(value, doc)) as Point;
  if (!min.every((value, i) => max[i] - value > TOL) || !(min[2] < saved.p[2] && saved.p[2] < max[2]))
    return bad('the Rib must straddle its saved attachment plane with positive interior and exterior material.');
  const embed = saved.d[2] === 1 ? saved.p[2] - min[2] : max[2] - saved.p[2];
  const protrusion = saved.d[2] === 1 ? max[2] - saved.p[2] : saved.p[2] - min[2];
  if (!(embed > TOL && protrusion > TOL && embed < cap.thickness)
    || min[0] < cap.min[0] || min[1] < cap.min[1] || max[0] > cap.max[0] || max[1] > cap.max[1])
    return bad('the current cap must fully support the Rib footprint and a positive embed below the stock thickness.');
  const delta = actual.p[2] - saved.p[2], before = [min[2], max[2]];
  min[2] += delta; max[2] += delta;
  if (![...min, ...max].every(finite) || (delta !== 0 && (min[2] === before[0] || max[2] === before[1]))
    || Math.abs((saved.d[2] === 1 ? actual.p[2] - min[2] : max[2] - actual.p[2]) - embed) > TOL
    || Math.abs((saved.d[2] === 1 ? max[2] - actual.p[2] : actual.p[2] - min[2]) - protrusion) > TOL)
    return bad('the attached coordinates cannot retain the authored embed and protrusion.');
  return { min, max };
}

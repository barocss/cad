import { cageTopology, edgeLoop, SubdError, validateCage, type CageTopology } from '@barocss/cad';
import { add, cross, dot, len, scale, sub, type Vec3 } from '../engine/vec3';
import type { StudioCage } from './cageEdit';

type Edge = readonly [number, number];
type Rail = { positive: number; negative: number };
export interface CageEdgeSlideDirections {
  readonly anchor: Edge;
  readonly positive: Edge;
  readonly negative: Edge;
}

interface SlideCell {
  readonly edge: Edge;
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly origin: Vec3;
  readonly extent: number;
  readonly tolerance: number;
  readonly normal: Vec3;
}

// Absolute floor in millimetres and relative limit at the scale of each local cell.
const tolerance = 1e-9;
const key = (a: number, b: number) => a < b ? `${a}_${b}` : `${b}_${a}`;
const point = (positions: readonly number[], v: number): Vec3 => [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]];

function refuse(reason: string): never {
  throw new SubdError('INPUT', `edge slide: ${reason}`);
}

function orderedLoop(cage: StudioCage, selected: readonly Edge[]) {
  const count = cage.positions.length / 3;
  const isVertex = (v: number) => Number.isInteger(v) && v >= 0 && v < count;
  if (!Number.isInteger(count) || cage.positions.some(value => !Number.isFinite(value))
    || cage.faces.some(face => face.length < 3 || new Set(face).size !== face.length || !face.every(isVertex))) {
    refuse('the cage has invalid coordinates or faces');
  }
  if (!validateCage(cage).valid) refuse('the cage must be manifold');
  const topology = cageTopology(cage);
  if (cage.creases?.some(([a, b]) => !topology.edges.has(key(a, b)))) refuse('the cage has an invalid crease edge');
  const selectedKeys = new Set<string>();
  let anchor: Edge | undefined;
  for (const [a, b] of selected) {
    const id = key(a, b);
    if (!isVertex(a) || !isVertex(b) || a === b || !topology.edges.has(id) || selectedKeys.has(id)) {
      refuse('select distinct current cage edges');
    }
    selectedKeys.add(id);
    const first = Math.min(a, b);
    const last = Math.max(a, b);
    if (!anchor || first < anchor[0] || (first === anchor[0] && last < anchor[1])) anchor = [first, last];
  }
  if (!anchor) refuse('select one complete edge loop');
  const loop = edgeLoop(cage, ...anchor);
  const loopKeys = new Set(loop.map(([a, b]) => key(a, b)));
  if (loopKeys.size !== loop.length || loopKeys.size !== selectedKeys.size || [...loopKeys].some(id => !selectedKeys.has(id))) {
    refuse('select one complete edge loop');
  }
  const first = loop[0][0];
  const last = loop[loop.length - 1][1];
  const closed = first === last;
  const vertices = [first, ...loop.map(([, b]) => b)];
  if (closed) vertices.pop();
  if (new Set(vertices).size !== vertices.length) refuse('the loop crosses itself or branches');
  return { anchor, loop, vertices, topology, closed };
}

// Using the directed half-edge fixes the same side along the whole loop.
function targets(cage: StudioCage, topology: CageTopology, from: number, to: number): Edge {
  const half = topology.half.get(`${from}>${to}`);
  if (!half) refuse('each selected edge needs quads on both sides');
  const [faceId, side] = half;
  const quad = cage.faces[faceId];
  if (quad.length !== 4) refuse('triangles and n-gons in the strip are unsupported');
  return [quad[(side + 3) % 4], quad[(side + 2) % 4]];
}

function loopRails(cage: StudioCage, selection: ReturnType<typeof orderedLoop>) {
  const { topology, loop, vertices, closed } = selection;
  const rails = new Map<number, Rail>();
  const setRail = (vertex: number, positive: number, negative: number) => {
    const prior = rails.get(vertex);
    if (prior && (prior.positive !== positive || prior.negative !== negative)) refuse('the rails change sides along the loop');
    rails.set(vertex, { positive, negative });
  };
  for (const [a, b] of loop) {
    const [aPositive, bPositive] = targets(cage, topology, a, b);
    const [bNegative, aNegative] = targets(cage, topology, b, a);
    setRail(a, aPositive, aNegative);
    setRail(b, bPositive, bNegative);
  }
  const used = new Set(vertices);
  for (const [index, vertex] of vertices.entries()) {
    const { positive, negative } = rails.get(vertex)!;
    if (positive === negative || used.has(positive) || used.has(negative)) refuse('the loop or its rail rows overlap');
    used.add(positive);
    used.add(negative);

    const end = !closed && (index === 0 || index === vertices.length - 1);
    const incident = topology.vertexFaces[vertex];
    if (topology.neighbours[vertex].length !== (end ? 3 : 4) || incident.length !== (end ? 2 : 4)) {
      refuse('the loop stops at a pole or has an irregular vertex');
    }
    if (end && [positive, negative].some(target => topology.edges.get(key(vertex, target))?.faces.length !== 1)) {
      refuse('the ends of an open loop need two boundary rails');
    }
  }
  return rails;
}

function strictlyConvex(points: readonly Vec3[], normal: Vec3, epsilon: number): boolean {
  const edges = points.map((p, i) => sub(points[(i + 1) % points.length], p));
  return edges.every((edge, i) => {
    const next = edges[(i + 1) % edges.length];
    return len(edge) > epsilon && dot(cross(edge, next), normal) > epsilon * Math.max(len(edge), len(next));
  });
}

function insideRail(p: Vec3, start: Vec3, end: Vec3, epsilon: number): boolean {
  const line = sub(end, start);
  const length = len(line);
  if (!(length > epsilon)) return false;
  const unit = scale(line, 1 / length);
  const offset = sub(p, start);
  const along = dot(unit, offset);
  return along > epsilon && length - along > epsilon && len(sub(offset, scale(unit, along))) <= epsilon;
}

// Each pair of faces must split the same fixed convex quad before and after the move.
// Each pair may occupy a different plane, as on a loop that crosses the sides of a box.
function slideCell(positions: number[], edge: Edge, rails: ReadonlyMap<number, Rail>): SlideCell {
  const [a, b] = edge;
  const aRail = rails.get(a)!;
  const bRail = rails.get(b)!;
  const origin = point(positions, aRail.negative);
  const offsets = [aRail.negative, bRail.negative, bRail.positive, aRail.positive].map(v => sub(point(positions, v), origin));
  const extent = Math.max(...offsets.map(len));
  if (!Number.isFinite(extent) || extent <= tolerance) refuse('the strip has a collapsed cell or invalid coordinate range');
  const epsilon = Math.max(tolerance / extent, tolerance);
  const [aNegative, bNegative, bPositive, aPositive] = offsets.map(offset => scale(offset, 1 / extent));
  const area = cross(bNegative, aPositive);
  const magnitude = len(area);
  if (magnitude <= epsilon * Math.max(len(bNegative), len(aPositive))) refuse('the strip has a collapsed cell');
  const normal = scale(area, 1 / magnitude);
  const corners = [aNegative, bNegative, bPositive, aPositive] as const;
  if (Math.abs(dot(normal, bPositive)) > epsilon || !strictlyConvex(corners, normal, epsilon)) {
    refuse('each pair of quads must form a convex planar cell');
  }
  return { edge, corners, origin, extent, tolerance: epsilon, normal };
}

function checkSplit(positions: number[], cell: SlideCell) {
  const [aNegative, bNegative, bPositive, aPositive] = cell.corners;
  const [a, b] = cell.edge.map(v => scale(sub(point(positions, v), cell.origin), 1 / cell.extent));
  const epsilon = cell.tolerance;
  if (!insideRail(a, aNegative, aPositive, epsilon) || !insideRail(b, bNegative, bPositive, epsilon)) {
    refuse('a rail is bent or the loop touches a rail endpoint');
  }
  if (!strictlyConvex([aNegative, bNegative, b, a], cell.normal, epsilon)
    || !strictlyConvex([a, b, bPositive, aPositive], cell.normal, epsilon)) {
    refuse('the loop collapses or crosses a quad');
  }
}

export function planCageEdgeSlide(cage: StudioCage, selected: readonly Edge[]) {
  const selection = orderedLoop(cage, selected);
  const rails = loopRails(cage, selection);
  const cells = selection.loop.map(edge => slideCell(cage.positions, edge, rails));
  cells.forEach(cell => checkSplit(cage.positions, cell));
  const [a, b] = selection.anchor;
  const first = rails.get(a)!;
  const last = rails.get(b)!;
  const directions: CageEdgeSlideDirections = {
    anchor: selection.anchor,
    positive: [first.positive, last.positive],
    negative: [first.negative, last.negative],
  };
  return { directions, rails, cells };
}

export function slideEdgeLoop(cage: StudioCage, selected: readonly Edge[], ratio: number): StudioCage {
  if (!Number.isFinite(ratio) || Math.abs(ratio) >= 1) refuse('use a ratio strictly between −1 and 1');
  const { rails, cells } = planCageEdgeSlide(cage, selected);
  if (ratio === 0) return cage;

  const positions = [...cage.positions];
  const side = ratio > 0 ? 'positive' : 'negative';
  let moved = false;
  let lostPrecision = false;
  for (const [vertex, rail] of rails) {
    const current = point(cage.positions, vertex);
    const target = point(cage.positions, rail[side]);
    const direction = sub(target, current);
    const offset = scale(direction, Math.abs(ratio));
    const next = add(current, offset);
    if (!next.every(Number.isFinite)) refuse('the slide exceeds the supported coordinate range');
    if (len(sub(sub(next, current), offset)) > tolerance * Math.max(1, len(direction))) lostPrecision = true;
    if (next.every((value, axis) => value === current[axis])) continue;
    for (let axis = 0; axis < 3; axis++) positions[3 * vertex + axis] = next[axis];
    moved = true;
  }
  if (!moved) return cage;
  if (lostPrecision) refuse('the slide exceeds the supported coordinate precision');
  cells.forEach(cell => checkSplit(positions, cell));
  return { ...cage, positions };
}

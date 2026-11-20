import { cageTopology, SubdError, type Cage } from '@barocss/cad';

/** A distance inset of ONE planar, strictly convex quad. No repair, projection of nonplanar faces,
 * region union or final-surface thickness claim. Original vertices/outer creases remain unchanged.
 */
export function insetPlanarQuad(c: Cage, face: number, distance: number): Cage {
  const fail = (reason: string): never => { throw new SubdError('INPUT', `inset: ${reason}`); };
  const nv = c.positions.length / 3;
  if (!Number.isInteger(nv) || c.positions.some(v => !Number.isFinite(v)) || c.faces.some(f => f.length < 3 || f.some(v => !Number.isInteger(v) || v < 0 || v >= nv))) fail('invalid cage coordinates or topology');
  if (!Number.isInteger(face) || face < 0 || face >= c.faces.length) fail('pick a current face');
  const f = c.faces[face];
  if (f.length !== 4 || new Set(f).size !== 4) fail('pick one quad with four distinct vertices');
  if (!Number.isFinite(distance) || distance <= 0) fail('distance must be finite and greater than zero');
  const p = f.map(i => Array.from(c.positions.slice(3 * i, 3 * i + 3)));
  const sub = (a: readonly number[], b: readonly number[]) => a.map((x, i) => x - b[i]);
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const e = sub(p[1], p[0]), length = Math.hypot(...e), extent = Math.max(...p.map(q => Math.hypot(...sub(q, p[0]))));
  if (!Number.isFinite(extent)) fail('coordinate range is too large');
  const epsilon = Math.max(1e-9, extent * 1e-9);
  if (length <= epsilon || distance <= epsilon) fail('edge or inset distance is below the supported tolerance');
  const u = e.map(x => x / length), rawNormal = cross(u, sub(p[2], p[0])), normalLength = Math.hypot(...rawNormal);
  if (normalLength <= epsilon || !Number.isFinite(normalLength)) fail('degenerate quad');
  const normal = rawNormal.map(x => x / normalLength), v = cross(normal, u), local = p.map(q => sub(q, p[0]));
  if (local.some(q => Math.abs(dot(q, normal)) > epsilon)) fail('quad must be planar');
  const points = local.map(q => [dot(q, u), dot(q, v)]);
  const turn = (a: number[], b: number[], d: number[]) => (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
  if (points.some((q, i) => turn(q, points[(i + 1) % 4], points[(i + 2) % 4]) <= epsilon * epsilon)) fail('quad must be strictly convex and nondegenerate');
  const lines = points.map((q, i) => {
    const next = points[(i + 1) % 4], dx = next[0] - q[0], dy = next[1] - q[1], len = Math.hypot(dx, dy);
    if (len <= epsilon) fail('zero-length quad edge');
    const n = [-dy / len, dx / len]; return { n, c: dot(n, q) + distance };
  });
  const inner = lines.map((line, i) => {
    const prev = lines[(i + 3) % 4], det = prev.n[0] * line.n[1] - prev.n[1] * line.n[0];
    if (Math.abs(det) <= 1e-12) fail('adjacent sides are too nearly parallel');
    return [(prev.c * line.n[1] - prev.n[1] * line.c) / det, (prev.n[0] * line.c - prev.c * line.n[0]) / det];
  });
  if (inner.some(q => q.some(x => !Number.isFinite(x)) || lines.some(line => dot(line.n, q) < line.c - epsilon)) || inner.some((q, i) => Math.hypot(...sub(q, inner[(i + 1) % 4])) <= epsilon || turn(q, inner[(i + 1) % 4], inner[(i + 2) % 4]) <= epsilon * epsilon)) fail('distance collapses or crosses the inner quad');
  const positions = Array.from(c.positions);
  for (const q of inner) {
    const offset = u.map((value, axis) => value * q[0] + v[axis] * q[1]);
    positions.push(...checkedWorldPoint(p[0], offset, epsilon));
  }
  const ids = [nv, nv + 1, nv + 2, nv + 3], faces = c.faces.map((old, i) => i === face ? ids : [...old]);
  for (let i = 0; i < 4; i++) faces.push([f[i], f[(i + 1) % 4], ids[(i + 1) % 4], ids[i]]);
  return { ...c, positions, faces, ...(c.creases ? { creases: c.creases.map(edge => [...edge] as [number, number]) } : {}) };
}

type Point = readonly [number, number];
type Vector = readonly [number, number, number];

const fail = (reason: string): never => { throw new SubdError('INPUT', `inset: ${reason}`); };
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const det = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = ([x, y, z]: Vector, by: number): Vector => [x * by, y * by, z * by];
const delta = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const edgeKey = (a: number, b: number) => a < b ? `${a}_${b}` : `${b}_${a}`;

// Round-trip all three coordinates. A point can project to the correct 2D offset while drifting off its plane.
function checkedWorldPoint(origin: readonly number[], offset: readonly number[], tolerance: number): Vector {
  const result: Vector = [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]];
  const error = Math.hypot(...result.map((value, axis) => (value - origin[axis]) - offset[axis]));
  if (!(error <= tolerance)) fail('result coordinates exceed the supported precision');
  return result;
}

function orderedBoundary(c: Cage, selected: ReadonlySet<number>, vertices: ReadonlySet<number>): number[] {
  const topology = cageTopology(c);
  const creases = new Set((c.creases ?? []).map(([a, b]) => edgeKey(a, b)));
  const next = new Map<number, number>();
  const incoming = new Set<number>();
  const connected = new Map([...selected].map(face => [face, new Set<number>()]));
  for (const face of selected) {
    const quad = c.faces[face];
    for (let i = 0; i < quad.length; i++) {
      const a = quad[i], b = quad[(i + 1) % quad.length], key = edgeKey(a, b);
      const edge = topology.edges.get(key)!;
      if (edge.faces.length > 2) fail('region has a non-manifold edge');
      const across = edge.faces.find(other => other !== face);
      if (across !== undefined && topology.half.get(`${b}>${a}`)?.[0] !== across) fail('region edges must be consistently wound');
      if (across !== undefined && selected.has(across)) {
        if (creases.has(key)) fail('region contains an internal crease');
        connected.get(face)!.add(across);
      } else {
        if (next.has(a) || incoming.has(b)) fail('region boundary branches or touches itself');
        next.set(a, b);
        incoming.add(b);
      }
    }
  }
  const reached = new Set<number>();
  const pending = [[...selected][0]];
  while (pending.length) {
    const face = pending.pop()!;
    if (reached.has(face)) continue;
    reached.add(face);
    for (const across of connected.get(face)!) pending.push(across);
  }
  if (reached.size !== selected.size) fail('pick one edge-connected region');
  if (!next.size) fail('region needs an outer boundary');
  const start = next.keys().next().value!;
  const boundary = [start];
  let vertex = next.get(start);
  while (vertex !== undefined && vertex !== start && boundary.length < next.size) {
    boundary.push(vertex);
    vertex = next.get(vertex);
  }
  if (vertex !== start || boundary.length !== next.size) fail('region needs one closed boundary without holes');
  for (const v of vertices) {
    if (!next.has(v) && topology.vertexFaces[v].some(face => !selected.has(face))) fail('an interior region vertex also belongs to an unselected face');
  }
  return boundary;
}

function projection(c: Cage, vertices: ReadonlySet<number>, first: readonly number[]) {
  const at = (vertex: number): Vector => [c.positions[3 * vertex], c.positions[3 * vertex + 1], c.positions[3 * vertex + 2]];
  const origin = at(first[0]);
  const local = new Map([...vertices].map(vertex => [vertex, delta(at(vertex), origin)]));
  let extent = 0;
  for (const p of local.values()) extent = Math.max(extent, Math.hypot(...p));
  if (!Number.isFinite(extent)) fail('coordinate range is too large');
  if (extent <= 1e-9) fail('region is below the supported tolerance');
  const epsilon = Math.max(1e-9 / extent, 1e-9);
  const edge = scale(local.get(first[1])!, 1 / extent), length = Math.hypot(...edge);
  if (length <= epsilon) fail('region has a zero-length edge');
  const u = scale(edge, 1 / length);
  const rawNormal = cross(u, scale(local.get(first[2])!, 1 / extent)), normalLength = Math.hypot(...rawNormal);
  if (normalLength <= epsilon) fail('region contains a degenerate quad');
  const normal = scale(rawNormal, 1 / normalLength), v = cross(normal, u);
  const project = (p: Vector): Point => [dot(p, u), dot(p, v)];
  const points = new Map<number, Point>();
  for (const [id, p] of local) {
    const q = scale(p, 1 / extent);
    if (Math.abs(dot(q, normal)) > epsilon) fail('region faces must be coplanar');
    points.set(id, project(q));
  }
  return {
    epsilon, extent, points,
    unproject: (q: Point): Vector => checkedWorldPoint(origin,
      u.map((value, axis) => extent * (q[0] * value + q[1] * v[axis])), extent * epsilon),
    project: (p: Vector): Point => project(scale(delta(p, origin), 1 / extent)),
  };
}

function convexQuad(points: readonly Point[], epsilon: number): boolean {
  const edges = points.map((p, i) => subtract(points[(i + 1) % points.length], p));
  return edges.every((edge, i) => Math.hypot(...edge) > epsilon && det(edge, edges[(i + 1) % edges.length]) > epsilon * epsilon);
}

function offsetBoundary(boundary: readonly Point[], distance: number, epsilon: number) {
  const edges = boundary.map((p, i) => {
    const step = subtract(boundary[(i + 1) % boundary.length], p), length = Math.hypot(...step);
    if (length <= epsilon) fail('region boundary has a zero-length edge');
    const tangent: Point = [step[0] / length, step[1] / length];
    const normal: Point = [-tangent[1], tangent[0]];
    return { p, tangent, normal };
  });
  const angularTolerance = 1e-12;
  let turnSum = 0;
  const inset = edges.map((edge, i): Point => {
    const prev = edges[(i + edges.length - 1) % edges.length];
    const cosine = dot(prev.normal, edge.normal), turn = Math.atan2(det(prev.normal, edge.normal), cosine);
    if (turn < -angularTolerance) fail('region boundary must be convex');
    if (1 + cosine <= angularTolerance) fail('region boundary reverses direction');
    turnSum += turn;
    // Move straight side splits only along the inward normal. Their tangential positions stay fixed.
    if (turn <= angularTolerance) return [edge.p[0] + distance * edge.normal[0], edge.p[1] + distance * edge.normal[1]];
    // At the corner this displacement has inward projection `distance` on both incident edges.
    const shift = distance / (1 + cosine);
    return [edge.p[0] + shift * (prev.normal[0] + edge.normal[0]), edge.p[1] + shift * (prev.normal[1] + edge.normal[1])];
  });
  if (Math.abs(turnSum - 2 * Math.PI) > edges.length * angularTolerance) fail('region boundary overlaps or is degenerate');

  const clearance = (p: Point, edge: typeof edges[number]) => dot(edge.normal, subtract(p, edge.p));
  if (edges.some(edge => boundary.some(p => clearance(p, edge) < -epsilon))) fail('region boundary is concave or overlaps');
  if (inset.some((p, i) => !p.every(Number.isFinite)
    || dot(edges[i].tangent, subtract(inset[(i + 1) % inset.length], p)) <= epsilon
    || edges.some(edge => clearance(p, edge) < distance - epsilon))) fail('distance collapses or crosses the inset boundary');
  return { inset, containsInterior: (p: Point) => edges.every(edge => clearance(p, edge) > epsilon) };
}

/** Mean value coordinates reproduce each original interior point at zero inset and follow the new boundary. */
function insetInterior(p: Point, boundary: readonly Point[], inset: readonly Point[]): Point {
  const rays = boundary.map(q => subtract(q, p));
  const halfAngles = rays.map((a, i) => {
    const b = rays[(i + 1) % rays.length];
    return Math.tan(0.5 * Math.atan2(det(a, b), dot(a, b)));
  });
  let sum = 0, x = 0, y = 0;
  for (let i = 0; i < rays.length; i++) {
    const weight = (halfAngles[(i + rays.length - 1) % rays.length] + halfAngles[i]) / Math.hypot(...rays[i]);
    sum += weight;
    x += weight * inset[i][0];
    y += weight * inset[i][1];
  }
  return [x / sum, y / sum];
}

/** Inset a connected coplanar, convex region once, preserving its quad fill and selected face IDs. */
export function insetPlanarRegion(c: Cage, faceIds: readonly number[], distance: number): Cage {
  if (faceIds.length === 1) return insetPlanarQuad(c, faceIds[0], distance);
  const facesInOrder = [...faceIds].sort((a, b) => a - b);
  const selected = new Set(facesInOrder);
  if (!selected.size || selected.size !== faceIds.length || faceIds.some(face => !Number.isInteger(face) || face < 0 || face >= c.faces.length)) fail('pick distinct current quad faces');
  if (!Number.isFinite(distance) || distance <= 0) fail('distance must be finite and greater than zero');
  const nv = c.positions.length / 3;
  if (!Number.isInteger(nv) || c.positions.some(v => !Number.isFinite(v)) || c.faces.some(f => f.length < 3 || f.some(v => !Number.isInteger(v) || v < 0 || v >= nv))) fail('invalid cage coordinates or topology');
  const patch = facesInOrder.map(face => c.faces[face]);
  if (patch.some(face => face.length !== 4 || new Set(face).size !== 4)) fail('region needs quads with four distinct vertices');
  const vertices = new Set(patch.flat());
  const boundary = orderedBoundary(c, selected, vertices);
  const plane = projection(c, vertices, patch[0]);
  const { points, epsilon } = plane;
  if (distance / plane.extent <= epsilon) fail('inset distance is below the supported tolerance');
  if (patch.some(face => !convexQuad(face.map(v => points.get(v)!), epsilon))) fail('region faces must be consistently wound, strictly convex quads');
  const outer = boundary.map(v => points.get(v)!);
  const { inset, containsInterior } = offsetBoundary(outer, distance / plane.extent, epsilon);
  // Opposite internal edges cancel in the patch's winding number. With positive quads and
  // one simple convex boundary, the remaining winding is one inside and zero outside.
  const positions = [...c.positions], moved = new Map<number, Point>(), innerIds = new Map<number, number>();
  const place = (id: number, p: Point) => {
    const q = plane.unproject(p), actual = plane.project(q);
    for (let k = 0; k < q.length; k++) positions[3 * id + k] = q[k];
    moved.set(id, actual);
  };
  boundary.forEach((v, i) => {
    const id = positions.length / 3;
    innerIds.set(v, id);
    place(id, inset[i]);
  });
  for (const v of vertices) {
    if (innerIds.has(v)) continue;
    const p = points.get(v)!;
    if (!containsInterior(p)) fail('region overlaps or has an interior vertex on its boundary');
    innerIds.set(v, v);
    place(v, insetInterior(p, outer, inset));
  }
  const faces = c.faces.map((face, i) => selected.has(i) ? face.map(v => innerIds.get(v)!) : [...face]);
  for (const id of selected) {
    if (!convexQuad(faces[id].map(v => moved.get(v)!), epsilon)) fail('distance folds or collapses an inner quad');
  }
  boundary.forEach((a, i) => {
    const b = boundary[(i + 1) % boundary.length], innerA = innerIds.get(a)!, innerB = innerIds.get(b)!;
    if (!convexQuad([points.get(a)!, points.get(b)!, moved.get(innerB)!, moved.get(innerA)!], epsilon)) fail('distance folds or collapses a border quad');
    faces.push([a, b, innerB, innerA]);
  });
  return { ...c, positions, faces, ...(c.creases ? { creases: c.creases.map(edge => [...edge] as [number, number]) } : {}) };
}

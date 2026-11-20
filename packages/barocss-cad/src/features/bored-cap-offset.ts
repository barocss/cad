import { faceGeometry } from '../brep/analytic-boolean.js';
import { BrepError, checkBrep, type Brep, type BrepEdge, type BrepFace, type BrepLoop } from '../brep/brep-core.js';
import { createCylindricalBoreCheck } from '../brep/cylindrical-bore.js';
import { add, dist, dot, len, scale, sub } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point } from '../types.js';
import { capSurface } from './extruded-profile-solid.js';

type XY = [number, number];
type StockKind = 'bored' | 'two-bore' | 'circular' | 'annular';
type Cap = { readonly point: Point; readonly sign: 1 | -1; readonly opposite: number; readonly min: XY; readonly max: XY;
  readonly center: XY; readonly radius: number };
type AxialStock = {
  readonly bottom: BrepFace; readonly top: BrepFace; readonly borePairs?: readonly (readonly BrepFace[])[];
  readonly lo: number; readonly hi: number; readonly anchorX: number; readonly anchorY: number; readonly radius: number;
  readonly min: XY; readonly max: XY; readonly center: XY;
};
type ReplacementPlane = { readonly origin: Point; readonly normal: Point };
type Use = { readonly edge: BrepEdge; readonly pcurve: Curve; readonly neighbor: BrepFace };
const lineKnots = [0, 0, 1, 1];
const halfCircleKnots = [0, 0, 0, 0.5, 0.5, 1, 1, 1];
const stockCounts = { bored: [8, 10, 36, 18, 12], 'two-bore': [10, 14, 48, 24, 16], circular: [4, 4, 12, 6, 4], annular: [6, 8, 24, 12, 8] } as const;
const capLoopCount = (kind: StockKind) => kind === 'circular' ? 1 : kind === 'two-bore' ? 3 : 2;
const isRectangular = (kind: StockKind) => kind === 'bored' || kind === 'two-bore';
const boredPlateKind = (brep: Brep) => brep.faces.length === stockCounts['two-bore'][0] ? 'two-bore' : 'bored';

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const samePoles = (a: readonly Point[], b: readonly Point[]) => a.length === b.length && a.every((point, i) => same(point, b[i]));
const level = (edge: BrepEdge, z: number) => edge.curve.controlPoints.every(point => point[2] === z);

function line(curve: Curve): boolean {
  return curve.degree === 1 && curve.controlPoints.length === 2 && same(curve.knots, lineKnots) && same(curve.weights, [1, 1]);
}

function matchingPcurve(uv: Curve, edge: Curve, map: (point: Point) => Point): boolean {
  return uv.degree === edge.degree && same(uv.knots, edge.knots)
    && same(uv.weights, edge.weights) && samePoles(uv.controlPoints, edge.controlPoints.map(map));
}

function boreClearsRectangle([x, y]: Point, radius: number, [x0, y0]: XY, [x1, y1]: XY, tolerance: number): boolean {
  return x - radius - x0 > tolerance && x1 - x - radius > tolerance
    && y - radius - y0 > tolerance && y1 - y - radius > tolerance;
}

/** Prove that the two native half cylinders together cover a full circle. */
function cylinderPair(cylinders: readonly BrepFace[], extent: number, out: 1 | -1): { center: Point; radius: number } | undefined {
  if (cylinders.length !== 2) return;
  const roundoff = 64 * Number.EPSILON * Math.max(1, extent);
  const halves = [];
  for (const face of cylinders) {
    const surface = face.surface, geometry = faceGeometry(face, extent);
    if (surface.kind !== 'surface' || geometry.kind !== 'cylinder' || geometry.out !== out
      || !same(geometry.a, [0, 0, 1])) return;
    // The ring arrangement can recompute a quarter span's weight one ulp from sqrt(1/2).
    if (!surface.weights.every(([weight], i) => i % 2 === 0 ? weight === 1 : Math.abs(weight - Math.SQRT1_2) <= 4 * Number.EPSILON)) return;
    const [start, tangent1, middle, tangent2, end] = surface.controlPoints.map(row => row[0]);
    const center = add(start, scale(sub(end, start), 0.5));
    const radial = sub(start, center), quarter = sub(middle, center), radius = len(radial);
    if (!(radius > linearToleranceMM(extent)) || !(Math.abs(len(quarter) - radius) <= roundoff)
      || !(Math.abs(dot(scale(radial, 1 / radius), quarter)) <= roundoff)
      || !(dist(tangent1, add(start, quarter)) <= roundoff) || !(dist(tangent2, add(end, quarter)) <= roundoff)
      || !(dist(geometry.c, center) <= roundoff) || !(Math.abs(geometry.r - radius) <= roundoff)) return;
    halves.push({ center, radius, quarter });
  }
  const [a, b] = halves;
  if (!(dist(a.center, b.center) <= roundoff) || !(Math.abs(a.radius - b.radius) <= roundoff)
    || !(len(add(a.quarter, b.quarter)) <= roundoff)) return;
  return { center: a.center, radius: a.radius };
}

/** Prove the native cap and wall charts before continuing an axial stock. */
function admittedAxialStock(brep: Brep, kind: StockKind): AxialStock | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  const [body] = bodies, [shell] = shells;
  const rectangular = isRectangular(kind), annular = kind === 'annular', twoBore = kind === 'two-bore', capLoops = capLoopCount(kind);
  const [faceCount, loopCount, useCount, edgeCount, vertexCount] = stockCounts[kind];
  if (bodies.length !== 1 || body.kind !== 'solid' || shells.length !== 1 || body.shells.length !== 1
    || body.shells[0] !== shell.id || shell.body !== body.id || !shell.closed || shell.faces.length !== faceCount
    || new Set(shell.faces).size !== faceCount || faces.length !== faceCount || !faces.every(face => shell.faces.includes(face.id))
    || loops.length !== loopCount || coedges.length !== useCount || edges.length !== edgeCount || vertices.length !== vertexCount) return undefined;

  const vertexById = byId(vertices), edgeById = byId(edges), loopById = byId(loops), coedgeById = byId(coedges), faceById = byId(faces);
  const points = vertices.map(vertex => vertex.point), extent = geometryScaleMM(points), tolerance = linearToleranceMM(extent);
  if (!(extent <= CadNumericPolicy.coordinateAbs) || !points.every(point => point.length === 3 && point.every(Number.isFinite))) return undefined;
  const heights = [...new Set(points.map(point => point[2]))].sort((a, b) => a - b), [lo, hi] = heights;
  if (heights.length !== 2 || !(hi - lo > tolerance)) return undefined;
  // A disk's seam vertices do not bound its chart. Its cap chart bounds come from the rim poles.
  const rimPoles = rectangular ? points : edges.filter(edge => edge.curve.degree === 2).flatMap(edge => edge.curve.controlPoints);
  const xs = rimPoles.map(p => p[0]), ys = rimPoles.map(p => p[1]);
  const min: XY = [Math.min(...xs), Math.min(...ys)], max: XY = [Math.max(...xs), Math.max(...ys)];
  if (!(max[0] - min[0] > tolerance && max[1] - min[1] > tolerance)) return undefined;

  for (const { vertices: [start, end], curve } of edges) {
    const a = vertexById.get(start)?.point, b = vertexById.get(end)?.point;
    if (!a || !b || start === end || !same(a, curve.controlPoints[0] ?? []) || !same(b, curve.controlPoints.at(-1) ?? [])) return undefined;
  }
  for (const face of faces) {
    if (face.surface.kind !== 'surface') return undefined;
    const poles = face.surface.controlPoints.flat();
    if (!poles.every(p => p.length === 3 && p.every(Number.isFinite)) || !(geometryScaleMM(poles) <= CadNumericPolicy.coordinateAbs)) return undefined;
  }

  // Resolve every use through its actual twin. A face's label cannot establish the wall or the bore.
  function readUses(face: BrepFace, loop: BrepLoop, count: number): Use[] | undefined {
    if (loop.face !== face.id || loop.coedges.length !== count) return undefined;
    const result: Use[] = [];
    for (const id of loop.coedges) {
      const use = coedgeById.get(id), twin = use?.twin ? coedgeById.get(use.twin) : undefined;
      const edge = use && edgeById.get(use.edge), other = twin && loopById.get(twin.loop);
      const neighbor = other && faceById.get(other.face);
      if (!use?.pcurve || use.loop !== loop.id || !edge || !twin || twin.twin !== id || twin.edge !== use.edge
        || twin.sense === use.sense || !other || !neighbor || neighbor === face || !neighbor.loops.includes(other.id)) return undefined;
      result.push({ edge, pcurve: use.pcurve, neighbor });
    }
    return new Set(result.map(use => use.edge.id)).size === count ? result : undefined;
  }

  function uses(face: BrepFace, count: number): Use[] | undefined {
    const matches = face.loops.map(id => loopById.get(id)).filter(loop => loop?.kind === 'outer');
    return matches.length === 1 && matches[0] ? readUses(face, matches[0], count) : undefined;
  }

  const caps = new Map<number, BrepFace>(), cylinders: BrepFace[] = [];
  const outerWalls = new Set<BrepFace>(), innerWalls = new Set<BrepFace>();
  const boreRims = new Map<number, BrepFace[][]>(), strutNeighbors = new Map<BrepFace, BrepFace[]>();
  for (const face of faces) {
    const surface = face.surface;
    if (surface.kind !== 'surface') return undefined;
    const { controlPoints, weights, degreeU, degreeV, knotsU, knotsV } = surface;
    if (degreeV !== 1 || !same(knotsV, lineKnots)) return undefined;

    if (face.loops.length === capLoops && (rectangular || degreeU === 1)) {
      const z = controlPoints[0]?.[0]?.[2], up = z === hi;
      if ((!up && z !== lo) || caps.has(z) || face.sense !== 'forward') return undefined;
      const expected = capSurface({ min, max }, z, surface.id, up);
      if (degreeU !== 1 || !same(knotsU, lineKnots) || controlPoints.length !== 2 || weights.length !== 2
        || !controlPoints.every((row, i) => samePoles(row, expected.controlPoints[i]))
        || !weights.every(row => same(row, [1, 1]))) return undefined;
      const outer = uses(face, rectangular ? 4 : 2);
      if (!outer) return undefined;
      const innerRims: Use[][] = [];
      for (const id of face.loops) {
        const loop = loopById.get(id);
        if (loop?.kind !== 'inner') continue;
        const rim = readUses(face, loop, 2);
        if (!rim) return undefined;
        innerRims.push(rim);
      }
      if (innerRims.length !== capLoops - 1) return undefined;
      const sides = new Set<number>();
      for (const { edge, neighbor } of rectangular ? outer : []) {
        const p = edge.curve.controlPoints;
        const corners = p.every(([x, y]) => (x === min[0] || x === max[0]) && (y === min[1] || y === max[1]));
        if (!line(edge.curve) || !corners
          || neighbor.loops.length !== 1 || neighbor.surface.kind !== 'surface' || neighbor.surface.degreeU !== 1) return undefined;
        const alongY = p[0][0] === p[1][0], alongX = p[0][1] === p[1][1];
        if (alongX === alongY) return undefined;
        const axis = alongY ? 0 : 1;
        sides.add(2 * axis + Number(p[0][axis] === max[axis]));
      }
      if (rectangular && sides.size !== 4) return undefined;
      for (const rim of [outer, ...innerRims]) {
        if (rim.length !== 2) continue;
        if (rim.some(({ neighbor }) => neighbor.loops.length !== 1 || neighbor.surface.kind !== 'surface' || neighbor.surface.degreeU !== 2)
          || new Set(rim.map(use => use.neighbor.id)).size !== 2) return undefined;
        const walls = rim === outer ? outerWalls : innerWalls;
        for (const { neighbor } of rim) walls.add(neighbor);
      }
      if (twoBore) boreRims.set(z, innerRims.map(rim => rim.map(use => use.neighbor)));
      const uv = ([x, y]: Point): Point => {
        const u = (x - min[0]) / (max[0] - min[0]), v = (y - min[1]) / (max[1] - min[1]);
        return up ? [u, v, 0] : [v, u, 0];
      };
      if ([...outer, ...innerRims.flat()].some(({ edge, pcurve }) => !level(edge, z) || !matchingPcurve(pcurve, edge.curve, uv))) return undefined;
      caps.set(z, face);
      continue;
    }

    const count = degreeU === 1 ? 2 : 5;
    if (face.loops.length !== 1 || (degreeU !== 2 && (!rectangular || degreeU !== 1)) || !same(knotsU, degreeU === 1 ? lineKnots : halfCircleKnots)
      || controlPoints.length !== count || weights.length !== count
      || !controlPoints.every(row => row.length === 2 && row[0][2] === lo && row[1][2] === hi
        && row[0][0] === row[1][0] && row[0][1] === row[1][1])
      || !weights.every(row => row.length === 2 && row[0] === row[1] && row[0] > 0 && Number.isFinite(row[0]))) return undefined;
    const boundary = uses(face, 4);
    if (!boundary) return undefined;
    for (const [station, z] of [lo, hi].entries()) {
      const rails = boundary.filter(({ edge }) => level(edge, z)), [rail] = rails;
      if (rails.length !== 1 || rail.neighbor.loops.length !== capLoops
        || (!rectangular && (rail.neighbor.surface.kind !== 'surface' || rail.neighbor.surface.degreeU !== 1))) return undefined;
      const { edge, pcurve } = rail, curve = edge.curve;
      if (curve.degree !== degreeU || !same(curve.knots, knotsU)
        || !same(curve.weights, weights.map(row => row[station]))
        || !samePoles(curve.controlPoints, controlPoints.map(row => row[station]))
        || !line(pcurve) || !samePoles(pcurve.controlPoints, [[0, station, 0], [1, station, 0]])) return undefined;
    }
    const struts = boundary.filter(({ edge }) => !level(edge, lo) && !level(edge, hi));
    const slots = new Set<number>();
    for (const { edge, pcurve, neighbor } of struts) {
      const [a, b] = edge.curve.controlPoints;
      if (!line(edge.curve) || !line(pcurve) || a[2] !== lo || b[2] !== hi || a[0] !== b[0] || a[1] !== b[1]
        || neighbor.loops.length !== 1 || neighbor.surface.kind !== 'surface' || neighbor.surface.degreeU !== degreeU) return undefined;
      const u = pcurve.controlPoints[0][0];
      if ((u !== 0 && u !== 1) || !samePoles(pcurve.controlPoints, [[u, 0, 0], [u, 1, 0]])
        || !same(a, controlPoints[u === 0 ? 0 : count - 1][0])) return undefined;
      slots.add(u);
    }
    if (struts.length !== 2 || slots.size !== 2) return undefined;
    if (degreeU === 2) {
      cylinders.push(face);
      if (twoBore) strutNeighbors.set(face, struts.map(use => use.neighbor));
    } else {
      const [a, b] = controlPoints.map(row => row[0]), sense = face.sense === 'forward' ? 1 : -1;
      const side = (b[1] - a[1]) * (a[0] - (min[0] + max[0]) / 2) - (b[0] - a[0]) * (a[1] - (min[1] + max[1]) / 2);
      if (!(side * sense > 0)) return undefined;
    }
  }

  const bottom = caps.get(lo), top = caps.get(hi);
  if (!bottom || !top || cylinders.length !== (annular || twoBore ? 4 : 2) || !checkBrep(brep, { strict: true }).valid) return undefined;
  if (!rectangular) {
    const round = cylinderPair([...outerWalls], extent, 1);
    if (!round) return;
    const [x, y] = round.center, center: XY = [x, y];
    let anchor = round.center;
    if (annular) {
      const bore = cylinderPair([...innerWalls], extent, -1);
      if (!bore) return;
      const away = sub(round.center, bore.center), separation = len(away);
      if (!(round.radius - bore.radius > separation + tolerance)) return;
      // Pick a point on cap material, on the thicker side of an eccentric tube.
      const direction: Point = separation > tolerance ? scale(away, 1 / separation) : [1, 0, 0];
      anchor = add(round.center, scale(direction, (round.radius + bore.radius) / 2));
    }
    return { bottom, top, lo, hi, min, max, radius: round.radius, center, anchorX: anchor[0], anchorY: anchor[1] };
  }
  const readDiameter = createCylindricalBoreCheck(brep);
  if (twoBore) {
    const lower = boreRims.get(lo)!, upper = boreRims.get(hi)!;
    // Each pair must close against itself at both axial seams and continue to the same upper rim.
    if (new Set(lower.flat()).size !== cylinders.length || lower.some(([a, b]) =>
      !upper.some(pair => pair.includes(a) && pair.includes(b)) || !strutNeighbors.get(a)?.every(face => face === b)
      || !strutNeighbors.get(b)?.every(face => face === a))) return;
    const [first, second] = lower.map(pair => cylinderPair(pair, extent, -1));
    if (!first || !second || lower.some(pair => readDiameter(pair) === undefined)
      || !boreClearsRectangle(first.center, first.radius, min, max, tolerance)
      || !boreClearsRectangle(second.center, second.radius, min, max, tolerance)
      || !(dist(first.center, second.center) > first.radius + second.radius + tolerance)) return;
    const [x, y] = first.center;
    const left = Math.min(x - first.radius, second.center[0] - second.radius) - min[0];
    return { bottom, top, borePairs: lower, lo, hi, min, max, radius: first.radius, center: [x, y], anchorX: min[0] + left / 2, anchorY: y };
  }
  const diameter = readDiameter(cylinders);
  const bore = faceGeometry(cylinders[0], extent);
  if (diameter === undefined || !(diameter > 2 * tolerance) || bore.kind !== 'cylinder'
    || bore.a[0] !== 0 || bore.a[1] !== 0) return undefined;
  const [x, y] = bore.c, radius = diameter / 2, left = x - radius - min[0];
  if (!boreClearsRectangle(bore.c, radius, min, max, tolerance)) return undefined;

  return { bottom, top, borePairs: [cylinders], lo, hi, min, max, radius, center: [x, y], anchorX: min[0] + left / 2, anchorY: y };
}

function admittedCap(brep: Brep, faceName: string, kind: StockKind = 'bored'): Cap | undefined {
  const matches = brep.faces.filter(face => face.name === faceName);
  if (matches.length !== 1 || matches[0].loops.length !== capLoopCount(kind)) return undefined;
  const stock = admittedAxialStock(brep, kind);
  if (!stock) return undefined;
  const { bottom, top, lo, hi, min, max, anchorX, anchorY, center, radius } = stock;
  if (top.name !== faceName && bottom.name !== faceName) return undefined;
  const up = top.name === faceName;
  return { point: [anchorX, anchorY, up ? hi : lo], sign: up ? 1 : -1, opposite: up ? lo : hi, min, max, center, radius };
}

/** A handle anchor on the material and its exact signed axial direction. */
export function boredCapOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const cap = admittedCap(brep, faceName);
  return cap && { anchor: cap.point, normal: [0, 0, cap.sign] };
}

/** A point on the plate's cap material and its outward direction, for one or two bores. */
export function boredCapReplacementFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const cap = admittedCap(brep, faceName, boredPlateKind(brep));
  return cap && { anchor: cap.point, normal: [0, 0, cap.sign] };
}

/** The center and outward direction of an exact circular end cap. */
export function circularCapReplacementFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const cap = admittedCap(brep, faceName, 'circular');
  return cap && { anchor: cap.point, normal: [0, 0, cap.sign] };
}

/** A point on the annular cap material and its outward direction. */
export function annularCapReplacementFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const cap = admittedCap(brep, faceName, 'annular');
  return cap && { anchor: cap.point, normal: [0, 0, cap.sign] };
}

function mapCapStation(brep: Brep, station: number, height: (x: number, y: number) => number): Brep {
  const moved = (point: Point): Point => point[2] === station ? [point[0], point[1], height(point[0], point[1])] : point;
  return {
    ...brep,
    vertices: brep.vertices.map(vertex => vertex.point[2] === station ? { ...vertex, point: moved(vertex.point) } : vertex),
    edges: brep.edges.map(edge => edge.curve.controlPoints.some(point => point[2] === station)
      ? { ...edge, curve: { ...edge.curve, controlPoints: edge.curve.controlPoints.map(moved) } } : edge),
    faces: brep.faces.map(face => {
      if (face.surface.kind !== 'surface' || !face.surface.controlPoints.some(row => row.some(point => point[2] === station))) return face;
      return { ...face, surface: { ...face.surface, controlPoints: face.surface.controlPoints.map(row => row.map(moved)) } };
    }),
  };
}

export function offsetBoredCapIfAdmitted(brep: Brep, faceName: string, distance: number): Brep | undefined {
  const cap = admittedCap(brep, faceName);
  if (!cap) return undefined;
  if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs) {
    throw new BrepError('INPUT', 'bored cap offset: distance must be nonzero and within the modeling range');
  }
  const z = cap.point[2], next = z + cap.sign * distance;
  const extent = Math.max(Math.abs(next), Math.abs(cap.opposite), geometryScaleMM(brep.vertices.map(vertex => vertex.point)));
  if (!(extent <= CadNumericPolicy.coordinateAbs)) throw new BrepError('GEOMETRY', 'bored cap offset: the cap leaves the modeling range');
  if (next === z) throw new BrepError('GEOMETRY', 'bored cap offset: distance is too small to move the cap');
  if (!((next - cap.opposite) * cap.sign > linearToleranceMM(extent))) {
    throw new BrepError('GEOMETRY', 'bored cap offset: the offset would reach or cross the opposite cap');
  }

  // With positive axial scale this is an affine map of every support and trim. Assign the two
  // stations directly so the fixed cap is exact and the edge/face parameter charts stay valid.
  const candidate = mapCapStation(brep, z, () => next);
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `bored cap offset: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

const finitePoint = (value: unknown): value is Point => Array.isArray(value) && value.length === 3
  && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Number.isFinite(value[2]);

const elevateQuadratic = ([a, b, c]: readonly number[]) => [a, (a + 2 * b) / 3, (2 * b + c) / 3, c];

function ellipsePcurve(pcurve: Curve, edge: Curve, heights: readonly number[]): Curve {
  const controlPoints: Point[] = [], weights: number[] = [];
  // The admitted rim consists of two quadratic rational Bézier spans. In the uniform cylinder
  // chart, U is the original edge parameter and V is the affine Z coordinate divided by height.
  for (let span = 0; span < 2; span++) {
    const start = 2 * span;
    const w = edge.weights.slice(start, start + 3), weight = elevateQuadratic(w);
    const v = elevateQuadratic(w.map((value, i) => value * heights[start + i]));
    // Multiplying the quadratic weight by the local linear parameter gives cubic Bernstein coefficients.
    const tWeight = [0, w[0] / 3, 2 * w[1] / 3, w[2]];
    for (let j = span; j < 4; j++) {
      controlPoints.push([(span + tWeight[j] / weight[j]) / 2, v[j] / weight[j], 0]);
      weights.push(weight[j]);
    }
  }
  return { ...pcurve, degree: 3, knots: [0, 0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1, 1], controlPoints, weights };
}

/** Keep the fixed planar and cylindrical supports in their uniform native charts. */
function encloseSideTrims(brep: Brep, lo: number, hi: number, kind: StockKind): Brep {
  const sideFaces = new Set(brep.faces.filter(face => isRectangular(kind) ? face.loops.length === 1
    : face.surface.kind === 'surface' && face.surface.degreeU === 2));
  const sideLoops = new Set([...sideFaces].map(face => face.loops[0]));
  const edges = byId(brep.edges);
  const faces = brep.faces.map(face => {
    if (!sideFaces.has(face) || face.surface.kind !== 'surface') return face;
    const controlPoints = face.surface.controlPoints.map(([[x, y]]): Point[] => [[x, y, lo], [x, y, hi]]);
    return { ...face, surface: { ...face.surface, controlPoints } };
  });
  const coedges = brep.coedges.map(use => {
    const { pcurve } = use;
    if (!pcurve || !sideLoops.has(use.loop)) return use;
    const edge = edges.get(use.edge)!.curve;
    const heights = edge.controlPoints.map(point => (point[2] - lo) / (hi - lo));
    if (edge.degree === 2 && heights.some(height => height !== heights[0]))
      return { ...use, pcurve: ellipsePcurve(pcurve, edge, heights) };
    const [[u0], [u1]] = pcurve.controlPoints;
    const controlPoints: Point[] = [[u0, heights[0], 0], [u1, heights.at(-1)!, 0]];
    return samePoles(controlPoints, pcurve.controlPoints) ? use : { ...use, pcurve: { ...pcurve, controlPoints } };
  });
  return { ...brep, faces, coedges };
}

function replaceAxialCapIfAdmitted(brep: Brep, faceName: string, plane: ReplacementPlane, kind: StockKind): Brep | undefined {
  const cap = admittedCap(brep, faceName, kind);
  if (!cap) return undefined;
  if (!plane || typeof plane !== 'object' || Array.isArray(plane) || Object.keys(plane).sort().join(',') !== 'normal,origin'
    || !finitePoint(plane.origin) || !finitePoint(plane.normal))
    throw new BrepError('INPUT', 'Replace face: the reference needs a finite origin and normal.');
  const magnitude = len(plane.normal);
  if (!Number.isFinite(magnitude) || magnitude === 0)
    throw new BrepError('INPUT', 'Replace face: the reference normal must have a finite nonzero length.');
  const [nx, ny, nz] = plane.normal.map(component => component / magnitude);
  if (Math.abs(nz) <= 64 * Number.EPSILON)
    throw new BrepError('GEOMETRY', 'Replace face: the reference plane is too close to perpendicular to the selected cap.');

  const [ox, oy, oz] = plane.origin;
  const lift = (x: number, y: number) => oz - ((x - ox) * nx + (y - oy) * ny) / nz;
  const [x0, y0] = cap.min, [x1, y1] = cap.max;
  let heights: number[];
  if (!isRectangular(kind)) {
    const atCenter = lift(...cap.center), radialVariation = cap.radius * Math.hypot(nx / nz, ny / nz);
    // A linear height over a disk reaches its extrema on the rim in the direction of its gradient.
    heights = [atCenter - radialVariation, atCenter + radialVariation];
  } else {
    heights = [lift(x0, y0), lift(x1, y0), lift(x0, y1), lift(x1, y1)];
  }
  const extent = Math.max(Math.abs(cap.opposite), geometryScaleMM([cap.min, cap.max, heights, plane.origin]));
  if (!(extent <= CadNumericPolicy.coordinateAbs))
    throw new BrepError('GEOMETRY', 'Replace face: the replacement exceeds the modeling coordinate range.');
  const linear = linearToleranceMM(extent);
  if (heights.some(z => (z - cap.opposite) * cap.sign <= linear)) {
    const location = isRectangular(kind) ? 'at one corner' : kind === 'annular' ? 'on the outer circular rim' : 'on the circular rim';
    throw new BrepError('GEOMETRY', `Replace face: the replacement would reach or cross the opposite cap ${location}.`);
  }
  if (Math.max(...heights) - Math.min(...heights) <= linear)
    throw new BrepError('GEOMETRY', 'Replace face: the reference plane tilt is too small for this cap.');

  // Affine lifting preserves the cap chart and all boundary weights. Enclose the lifted trims
  // in uniform vertical charts to keep the original planar walls and exact cylinder recognizable.
  const moved = mapCapStation(brep, cap.point[2], lift);
  const curvePoles = moved.edges.map(edge => edge.curve.controlPoints);
  const surfacePoles = moved.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints : []);
  if (!(geometryScaleMM(...curvePoles, ...surfacePoles) <= CadNumericPolicy.coordinateAbs))
    throw new BrepError('GEOMETRY', 'Replace face: the replacement exceeds the modeling coordinate range.');
  const candidate = encloseSideTrims(moved, Math.min(cap.opposite, ...heights), Math.max(cap.opposite, ...heights), kind);
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `Replace face: the replacement solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

/** Tilt one cap while retaining both plate supports and the existing through bores. */
export function replaceBoredCapIfAdmitted(brep: Brep, faceName: string, plane: ReplacementPlane): Brep | undefined {
  return replaceAxialCapIfAdmitted(brep, faceName, plane, boredPlateKind(brep));
}

/** Tilt an exact circular cap while retaining the outward cylinder and all trim identities. */
export function replaceCircularCapIfAdmitted(brep: Brep, faceName: string, plane: ReplacementPlane): Brep | undefined {
  return replaceAxialCapIfAdmitted(brep, faceName, plane, 'circular');
}

/** Tilt an exact annular cap while retaining both parallel cylinders and all trim identities. */
export function replaceAnnularCapIfAdmitted(brep: Brep, faceName: string, plane: ReplacementPlane): Brep | undefined {
  return replaceAxialCapIfAdmitted(brep, faceName, plane, 'annular');
}

/** Select either native half of a bore and restore the material removed by that bore. */
export function healBoredPlateIfAdmitted(brep: Brep, faceName: string): Brep | undefined {
  if (typeof faceName !== 'string' || !faceName.trim() || faceName.includes('+')) return undefined;
  const plate = admittedAxialStock(brep, boredPlateKind(brep));
  const selected = plate?.borePairs?.find(pair => pair.some(face => face.name === faceName));
  if (!plate || !selected) return undefined;

  const removed = new Set(selected.map(face => face.id));
  const wallLoops = new Set(selected.flatMap(face => face.loops));
  const loopById = byId(brep.loops), coedgeById = byId(brep.coedges);
  const capTrims = new Set<string>();
  for (const cap of [plate.bottom, plate.top]) {
    const trims = cap.loops.filter(id => {
      const loop = loopById.get(id);
      return loop?.kind === 'inner' && loop.coedges.length === 2 && loop.coedges.every(use => {
        const twin = coedgeById.get(coedgeById.get(use)?.twin ?? '');
        return twin !== undefined && wallLoops.has(twin.loop);
      });
    });
    if (trims.length !== 1) return undefined;
    capTrims.add(trims[0]);
  }

  const faces = brep.faces.filter(face => !removed.has(face.id)).map(face => face.loops.some(id => capTrims.has(id))
    ? { ...face, loops: face.loops.filter(id => !capTrims.has(id)) } : face);
  // Retain every other face chart and incidence. Only the selected bore walls and their cap trims disappear.
  const liveLoops = new Set(faces.flatMap(face => face.loops));
  const loops = brep.loops.filter(loop => liveLoops.has(loop.id));
  const liveUses = new Set(loops.flatMap(loop => loop.coedges));
  const coedges = brep.coedges.filter(use => liveUses.has(use.id));
  const liveEdges = new Set(coedges.map(use => use.edge));
  const edges = brep.edges.filter(edge => liveEdges.has(edge.id));
  const liveVertices = new Set(edges.flatMap(edge => edge.vertices));
  const vertices = brep.vertices.filter(vertex => liveVertices.has(vertex.id));
  const [shell] = brep.shells;
  const candidate: Brep = {
    ...brep, shells: [{ ...shell, faces: shell.faces.filter(id => !removed.has(id)) }], faces, loops, coedges, edges, vertices,
  };
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `Delete face: the healed solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

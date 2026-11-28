import { faceGeometry } from '../brep/analytic-boolean.js';
import { BrepError, checkBrep, type Brep, type BrepEdge, type BrepFace, type BrepLoop } from '../brep/brep-core.js';
import { createCylindricalBoreCheck, readTiltedRectangularPlateBore } from '../brep/cylindrical-bore.js';
import { transformBrep } from '../brep/brep-transform.js';
import { circleOf } from '../brep/brep-tessellate.js';
import { evaluateSurface } from '../core/math.js';
import { add, dist, dot, len, scale, sub } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point, Surface } from '../types.js';
import { boxCapOffsetFrame } from './drafted-cap-offset.js';
import { capSurface } from './extruded-profile-solid.js';
import { affineChart, coverAffineTrim, uvPoint } from './prism-wall-offset.js';

type XY = [number, number];
type StockKind = 'bored' | 'two-bore' | 'circular' | 'annular';
type Cap = { readonly point: Point; readonly sign: 1 | -1; readonly opposite: number; readonly min: XY; readonly max: XY;
  readonly center: XY; readonly radius: number };
type BoreDisk = { readonly center: Point; readonly radius: number };
type AxialStock = {
  readonly bottom: BrepFace; readonly top: BrepFace; readonly borePairs?: readonly (readonly BrepFace[])[];
  readonly boreDisks?: readonly BoreDisk[];
  readonly lo: number; readonly hi: number; readonly anchorX: number; readonly anchorY: number; readonly radius: number;
  readonly min: XY; readonly max: XY; readonly center: XY;
};
type ReplacementPlane = { readonly origin: Point; readonly normal: Point };
type Use = { readonly edge: BrepEdge; readonly pcurve: Curve; readonly neighbor: BrepFace; readonly neighborLoop: BrepLoop };
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

function matchingPcurve(uv: Curve, edge: Curve, map: (point: Point) => Point, roundoff = 0): boolean {
  return uv.degree === edge.degree && same(uv.knots, edge.knots)
    && same(uv.weights, edge.weights) && (roundoff === 0 ? samePoles(uv.controlPoints, edge.controlPoints.map(map))
      : uv.controlPoints.length === edge.controlPoints.length && uv.controlPoints.every((point, i) => {
        const projected = map(edge.controlPoints[i]); return point.every((value, axis) => Math.abs(value - projected[axis]) <= roundoff);
      }));
}

function capProjection(min: XY, max: XY, up: boolean): (point: Point) => Point {
  return ([x, y]) => {
    const u = (x - min[0]) / (max[0] - min[0]), v = (y - min[1]) / (max[1] - min[1]);
    return up ? [u, v, 0] : [v, u, 0];
  };
}

function diskClearsRectangle([x, y]: Point, radius: number, [x0, y0]: XY, [x1, y1]: XY, tolerance: number): boolean {
  return x - radius - x0 > tolerance && x1 - x - radius > tolerance
    && y - radius - y0 > tolerance && y1 - y - radius > tolerance;
}

/** Prove that the two native half cylinders together cover a full circle. */
function cylinderPair(cylinders: readonly BrepFace[], extent: number, out: 1 | -1): BoreDisk | undefined {
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

function nativeLoopReader(brep: Brep) {
  const loopById = byId(brep.loops), coedgeById = byId(brep.coedges), edgeById = byId(brep.edges), faceById = byId(brep.faces);
  // Resolve every use through its actual twin, independently of the authored face names.
  function readUses(face: BrepFace, loop: BrepLoop, count: number): Use[] | undefined {
    if (loop.face !== face.id || loop.coedges.length !== count) return undefined;
    const result: Use[] = [];
    for (const id of loop.coedges) {
      const use = coedgeById.get(id), twin = use?.twin ? coedgeById.get(use.twin) : undefined;
      const edge = use && edgeById.get(use.edge), other = twin && loopById.get(twin.loop);
      const neighbor = other && faceById.get(other.face);
      if (!use?.pcurve || use.loop !== loop.id || !edge || !twin || twin.twin !== id || twin.edge !== use.edge
        || twin.sense === use.sense || !other || !neighbor || neighbor === face || !neighbor.loops.includes(other.id)) return undefined;
      result.push({ edge, pcurve: use.pcurve, neighbor, neighborLoop: other });
    }
    return new Set(result.map(use => use.edge.id)).size === count ? result : undefined;
  }
  return { loopById, readUses };
}

/** Prove the native cap and wall charts before continuing an axial stock. */
function admittedAxialStock(brep: Brep, kind: StockKind, retainedCardinalTrims = false): AxialStock | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  const [body] = bodies, [shell] = shells;
  const rectangular = isRectangular(kind), annular = kind === 'annular', twoBore = kind === 'two-bore', capLoops = capLoopCount(kind);
  const [faceCount, loopCount, useCount, edgeCount, vertexCount] = stockCounts[kind];
  if (bodies.length !== 1 || body.kind !== 'solid' || shells.length !== 1 || body.shells.length !== 1
    || body.shells[0] !== shell.id || shell.body !== body.id || !shell.closed || shell.faces.length !== faceCount
    || new Set(shell.faces).size !== faceCount || faces.length !== faceCount || !faces.every(face => shell.faces.includes(face.id))
    || loops.length !== loopCount || coedges.length !== useCount || edges.length !== edgeCount || vertices.length !== vertexCount) return undefined;

  const vertexById = byId(vertices), { loopById, readUses } = nativeLoopReader(brep);
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
      const uv = capProjection(min, max, up);
      if ([...outer, ...innerRims.flat()].some(({ edge, pcurve }) => !level(edge, z)
        || !matchingPcurve(pcurve, edge.curve, uv, retainedCardinalTrims ? 64 * Number.EPSILON : 0))) return undefined;
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
      || !diskClearsRectangle(first.center, first.radius, min, max, tolerance)
      || !diskClearsRectangle(second.center, second.radius, min, max, tolerance)
      || !(dist(first.center, second.center) > first.radius + second.radius + tolerance)) return;
    const [x, y] = first.center;
    const left = Math.min(x - first.radius, second.center[0] - second.radius) - min[0];
    return { bottom, top, borePairs: lower, boreDisks: [first, second], lo, hi, min, max,
      radius: first.radius, center: [x, y], anchorX: min[0] + left / 2, anchorY: y };
  }
  const diameter = readDiameter(cylinders);
  const bore = faceGeometry(cylinders[0], extent);
  if (diameter === undefined || !(diameter > 2 * tolerance) || bore.kind !== 'cylinder'
    || bore.a[0] !== 0 || bore.a[1] !== 0) return undefined;
  const [x, y] = bore.c, radius = diameter / 2, left = x - radius - min[0];
  if (!diskClearsRectangle(bore.c, radius, min, max, tolerance)) return undefined;

  return { bottom, top, borePairs: [cylinders], boreDisks: [{ center: bore.c, radius }], lo, hi, min, max,
    radius, center: [x, y], anchorX: min[0] + left / 2, anchorY: y };
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

/** Read the two proven circular passages and their common exterior caps in a rectangular plate. */
export function readTwoThroughBorePlate(brep: Brep) {
  const stock = admittedAxialStock(brep, 'two-bore');
  if (!stock?.boreDisks || !stock.borePairs) return;
  const { bottom, top, lo, hi, boreDisks, borePairs, min, max } = stock;
  return {
    bounds: { min: [min[0], min[1], lo], max: [max[0], max[1], hi] },
    openings: [{ face: bottom.name ?? bottom.id, z: lo }, { face: top.name ?? top.id, z: hi }],
    bores: borePairs.map((pair, index) => ({
      center: [boreDisks[index].center[0], boreDisks[index].center[1]],
      diameter: 2 * boreDisks[index].radius,
      faces: pair.map(face => face.name ?? face.id),
    })),
  };
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

function admittedCircularWall(brep: Brep, faceName: string, retainedCardinalTrims = false) {
  if (brep.source.family !== 'prismatic-solid') return;
  const matches = brep.faces.filter(face => face.name === faceName);
  if (matches.length !== 1) return;
  const annular = brep.faces.length === stockCounts.annular[0];
  const stock = admittedAxialStock(brep, annular ? 'annular' : 'circular', retainedCardinalTrims);
  if (!stock) return;
  let bore: BoreDisk | undefined;
  if (annular) {
    const extent = geometryScaleMM(brep.vertices.map(vertex => vertex.point));
    bore = cylinderPair(brep.faces.filter(face => {
      const support = faceGeometry(face);
      return support.kind === 'cylinder' && support.out === -1;
    }), extent, -1);
    if (!bore || dist(bore.center, [stock.center[0], stock.center[1], stock.lo]) > 64 * Number.EPSILON * Math.max(1, extent)) return;
  }
  const walls = brep.faces.filter(face => {
    if (face === stock.bottom || face === stock.top) return false;
    if (!annular) return true;
    const support = faceGeometry(face);
    return support.kind === 'cylinder' && support.out === 1;
  });
  const faces = walls.map(face => face.name);
  if (!walls.includes(matches[0]) || faces.some(name => !name) || new Set(faces).size !== 2) return;
  return { stock, wall: matches[0], walls, faces: faces as string[], bore };
}

/** The radial handle and both outer native patches of an upright cylinder or coaxial tube. */
export function circularWallOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point; faces: string[] } | undefined {
  const admitted = admittedCircularWall(brep, faceName);
  if (!admitted) return;
  const { stock, faces } = admitted, surface = admitted.wall.surface;
  if (surface.kind !== 'surface') return;
  // The middle pole of a native half circle has unit weight and lies on the circle.
  const point = surface.controlPoints[2][0];
  const anchor: Point = [point[0], point[1], stock.lo + (stock.hi - stock.lo) / 2];
  return { anchor, normal: [(point[0] - stock.center[0]) / stock.radius, (point[1] - stock.center[1]) / stock.radius, 0], faces };
}

/** Turn both original circular walls into one cone without changing any native trim parameter or owner. */
export function draftCircularWallIfAdmitted(brep: Brep, faceNames: readonly string[], angle: number, pull: 'z' | '-z', neutral?: number,
  retainedCardinalTrims = false): Brep | undefined {
  if (faceNames.length !== 2 || new Set(faceNames).size !== 2 || brep.faces.length !== stockCounts.circular[0]) return undefined;
  // Only the caller's proved authored cardinal placement may retain cap UV arithmetic from before its origin was added.
  // Offset and the incumbent unplaced Draft readers keep exact coefficient comparisons.
  const admitted = admittedCircularWall(brep, faceNames[0], retainedCardinalTrims);
  if (!admitted || admitted.bore || !admitted.faces.every(name => faceNames.includes(name))) return undefined;
  const { stock, walls } = admitted, sign = pull === 'z' ? 1 : -1, zN = neutral ?? (sign === 1 ? stock.lo : stock.hi);
  if ((pull !== 'z' && pull !== '-z') || !Number.isFinite(angle) || angle === 0 || Math.abs(angle) >= Math.PI / 4 || !Number.isFinite(zN) || zN < stock.lo || zN > stock.hi)
    throw new BrepError('INPUT', 'circular wall draft: use a nonzero angle below 45 degrees and a neutral within the original caps');
  const slope = sign * Math.tan(angle), radiusAt = (z: number) => stock.radius - slope * (z - zN);
  const radii = [radiusAt(stock.lo), radiusAt(stock.hi)], extent = Math.max(geometryScaleMM(brep.vertices.map(v => v.point)), ...radii.map(Math.abs));
  if (radii.some(radius => !Number.isFinite(radius) || !(radius > linearToleranceMM(extent))))
    throw new BrepError('GEOMETRY', 'circular wall draft: the draft reaches or crosses the cylinder axis');
  const [cx, cy] = stock.center;
  const moved = (point: Point): Point => {
    const radius = radiusAt(point[2]);
    if (radius === stock.radius) return point; // Preserve a neutral cap, including all its original records, exactly.
    const factor = radius / stock.radius;
    return [cx + (point[0] - cx) * factor, cy + (point[1] - cy) * factor, point[2]];
  };
  // This non-affine map is exact only on the proved two-station recipe: constant-Z caps/rims,
  // constant-radial straight seams, and degree-V-one sides with equal axial weights.
  const candidate: Brep = {
    ...brep, vertices: brep.vertices.map(vertex => { const point = moved(vertex.point); return point === vertex.point ? vertex : { ...vertex, point }; }),
    edges: brep.edges.map(edge => {
      const controlPoints = edge.curve.controlPoints.map(moved);
      return controlPoints.every((p, i) => p === edge.curve.controlPoints[i]) ? edge : { ...edge, curve: { ...edge.curve, controlPoints } };
    }),
    faces: brep.faces.map(face => {
      const surface = face.surface;
      if (surface.kind !== 'surface') return face;
      const controlPoints = surface.controlPoints.map(row => row.map(moved));
      return controlPoints.every((row, i) => row.every((p, j) => p === surface.controlPoints[i][j])) ? face : { ...face, surface: { ...surface, controlPoints } };
    }),
  };
  if (!candidate.edges.some((edge, i) => !samePoles(edge.curve.controlPoints, brep.edges[i].curve.controlPoints)))
    throw new BrepError('GEOMETRY', 'circular wall draft: the angle is too small to move the native walls');
  const poles = [...candidate.vertices.map(v => v.point), ...candidate.edges.flatMap(edge => edge.curve.controlPoints),
    ...candidate.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const nextExtent = geometryScaleMM(poles), roundoff = 128 * Number.EPSILON * Math.max(1, nextExtent);
  if (!poles.every(point => point.every(Number.isFinite)) || nextExtent > CadNumericPolicy.coordinateAbs)
    throw new BrepError('GEOMETRY', 'circular wall draft: the drafted walls leave the modeling range');
  // Read the actual mapped rim circles and plane supports; do not use the input radius as the receipt.
  for (const [i, cap] of [stock.bottom, stock.top].entries()) {
    const z = i === 0 ? stock.lo : stock.hi, face = candidate.faces.find(f => f.id === cap.id)!, plane = faceGeometry(face, nextExtent);
    const rims = candidate.edges.filter(edge => edge.curve.degree === 2 && level(edge, z));
    if (plane.kind !== 'plane' || plane.o[2] !== z || !same(plane.n, [0, 0, i === 0 ? -1 : 1]) || rims.length !== 2
      || rims.some(edge => { const circle = circleOf(edge.curve); return !circle || Math.abs(circle.r - radii[i]) > roundoff || dist(circle.c, [cx, cy, z]) > roundoff; }))
      throw new BrepError('GEOMETRY', 'circular wall draft: the native cap or circular boundary could not be preserved');
  }
  for (const wall of walls) {
    const face = candidate.faces.find(f => f.id === wall.id)!;
    if (face.surface.kind !== 'surface') throw new BrepError('GEOMETRY', 'circular wall draft: a native wall lost its surface');
    for (const u of [0, .25, .5, .75, 1]) for (const v of [0, .5, 1]) {
      const point = evaluateSurface(face.surface, u, v);
      if (Math.abs(Math.hypot(point[0] - cx, point[1] - cy) - radiusAt(point[2])) > roundoff)
        throw new BrepError('GEOMETRY', 'circular wall draft: the mapped native wall does not retain its conical support');
    }
  }
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `circular wall draft: the drafted solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

/** Draft only a coaxial tube's original exterior; its two cap charts follow their own native rim stations. */
export function draftAnnularOuterWallIfAdmitted(brep: Brep, faceNames: readonly string[], angle: number, pull: 'z' | '-z', neutral?: number): Brep | undefined {
  if (faceNames.length !== 2 || new Set(faceNames).size !== 2 || brep.faces.length !== stockCounts.annular[0]) return undefined;
  const admitted = admittedCircularWall(brep, faceNames[0]);
  if (!admitted?.bore || !admitted.faces.every(name => faceNames.includes(name))) return undefined;
  const { stock, walls, bore } = admitted, sign = pull === 'z' ? 1 : -1, zN = neutral ?? (sign === 1 ? stock.lo : stock.hi);
  if ((pull !== 'z' && pull !== '-z') || !Number.isFinite(angle) || angle === 0 || Math.abs(angle) >= Math.PI / 4
    || !Number.isFinite(zN) || zN < stock.lo || zN > stock.hi)
    throw new BrepError('INPUT', 'annular outer draft: use a nonzero angle below 45 degrees and a neutral within the original caps');
  const slope = sign * Math.tan(angle), radiusAt = (z: number) => stock.radius - slope * (z - zN);
  const radii = [radiusAt(stock.lo), radiusAt(stock.hi)], extent = Math.max(geometryScaleMM(brep.vertices.map(vertex => vertex.point)), ...radii.map(Math.abs));
  const tolerance = linearToleranceMM(extent), separation = dist(bore.center, [stock.center[0], stock.center[1], stock.lo]);
  if (radii.some(radius => !Number.isFinite(radius) || !(radius - bore.radius > separation + tolerance)))
    throw new BrepError('GEOMETRY', 'annular outer draft: the draft reaches or crosses the retained bore');
  const wallLoops = new Set(walls.flatMap(face => face.loops)), movedEdges = new Set(brep.coedges.filter(use => wallLoops.has(use.loop)).map(use => use.edge));
  const movedVertices = new Set(brep.edges.filter(edge => movedEdges.has(edge.id)).flatMap(edge => edge.vertices));
  if (movedEdges.size !== 6 || movedVertices.size !== 4) return undefined;
  const [cx, cy] = stock.center;
  const moved = (point: Point): Point => {
    const radius = radiusAt(point[2]);
    if (radius === stock.radius) return point;
    const factor = radius / stock.radius;
    return [cx + (point[0] - cx) * factor, cy + (point[1] - cy) * factor, point[2]];
  };
  const nextEdges = brep.edges.map(edge => {
    if (!movedEdges.has(edge.id)) return edge;
    const controlPoints = edge.curve.controlPoints.map(moved);
    return controlPoints.every((point, i) => point === edge.curve.controlPoints[i]) ? edge : { ...edge, curve: { ...edge.curve, controlPoints } };
  });
  if (!nextEdges.some((edge, i) => !samePoles(edge.curve.controlPoints, brep.edges[i].curve.controlPoints)))
    throw new BrepError('GEOMETRY', 'annular outer draft: the angle is too small to move the native walls');
  const charts = new Map<string, Surface>(), capTrims = new Map<string, (point: Point) => Point>(), edgeById = byId(nextEdges);
  for (const [i, cap] of [stock.bottom, stock.top].entries()) {
    if (radii[i] === stock.radius) continue; // Retain the complete neutral cap and both of its trim loops byte for byte.
    const z = i === 0 ? stock.lo : stock.hi;
    const rim = nextEdges.filter(edge => movedEdges.has(edge.id) && edge.curve.degree === 2 && level(edge, z));
    if (rim.length !== 2) throw new BrepError('GEOMETRY', 'annular outer draft: a native cap lost its complete outer rim');
    const poles = rim.flatMap(edge => edge.curve.controlPoints), min: XY = [Math.min(...poles.map(point => point[0])), Math.min(...poles.map(point => point[1]))];
    const max: XY = [Math.max(...poles.map(point => point[0])), Math.max(...poles.map(point => point[1]))];
    charts.set(cap.id, capSurface({ min, max }, z, cap.surface.id, i === 1));
    // The fixed bore's world curve has new UV coordinates in the changed outer chart too.
    for (const loop of cap.loops) capTrims.set(loop, capProjection(min, max, i === 1));
  }
  const candidate: Brep = {
    ...brep, edges: nextEdges,
    vertices: brep.vertices.map(vertex => {
      if (!movedVertices.has(vertex.id)) return vertex;
      const point = moved(vertex.point); return point === vertex.point ? vertex : { ...vertex, point };
    }),
    faces: brep.faces.map(face => {
      const surface = face.surface;
      if (surface.kind !== 'surface') return face;
      if (walls.includes(face)) {
        const controlPoints = surface.controlPoints.map(row => row.map(moved));
        return controlPoints.every((row, i) => row.every((point, j) => point === surface.controlPoints[i][j]))
          ? face : { ...face, surface: { ...surface, controlPoints } };
      }
      const chart = charts.get(face.id);
      return chart ? { ...face, surface: { ...surface, controlPoints: chart.controlPoints } } : face;
    }),
    coedges: brep.coedges.map(use => {
      const project = capTrims.get(use.loop);
      return project && use.pcurve ? { ...use, pcurve: { ...use.pcurve, controlPoints: edgeById.get(use.edge)!.curve.controlPoints.map(project) } } : use;
    }),
  };
  const poles = [...candidate.vertices.map(vertex => vertex.point), ...nextEdges.flatMap(edge => edge.curve.controlPoints),
    ...candidate.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const nextExtent = geometryScaleMM(poles), roundoff = 128 * Number.EPSILON * Math.max(1, nextExtent);
  if (!poles.every(point => point.every(Number.isFinite)) || !(nextExtent <= CadNumericPolicy.coordinateAbs))
    throw new BrepError('GEOMETRY', 'annular outer draft: the drafted walls leave the modeling range');
  const retainedBore = cylinderPair(candidate.faces.filter(face => {
    const support = faceGeometry(face, nextExtent); return support.kind === 'cylinder' && support.out === -1;
  }), nextExtent, -1);
  if (!retainedBore || Math.abs(retainedBore.radius - bore.radius) > roundoff || dist(retainedBore.center, bore.center) > roundoff)
    throw new BrepError('GEOMETRY', 'annular outer draft: the retained cylindrical bore could not be preserved');
  for (const [i, cap] of [stock.bottom, stock.top].entries()) {
    const z = i === 0 ? stock.lo : stock.hi, nextCap = candidate.faces.find(face => face.id === cap.id)!, support = faceGeometry(nextCap, nextExtent);
    const rim = nextEdges.filter(edge => movedEdges.has(edge.id) && edge.curve.degree === 2 && level(edge, z));
    if (support.kind !== 'plane' || support.o[2] !== z || !same(support.n, [0, 0, i === 0 ? -1 : 1]) || rim.length !== 2
      || rim.some(edge => { const circle = circleOf(edge.curve); return !circle || Math.abs(circle.r - radii[i]) > roundoff || dist(circle.c, [cx, cy, z]) > roundoff; }))
      throw new BrepError('GEOMETRY', 'annular outer draft: the native caps or outer circular boundaries could not be preserved');
  }
  for (const wall of walls) {
    const surface = candidate.faces.find(face => face.id === wall.id)!.surface;
    if (surface.kind !== 'surface') throw new BrepError('GEOMETRY', 'annular outer draft: a native outer wall lost its surface');
    for (const u of [0, .25, .5, .75, 1]) for (const v of [0, .5, 1]) {
      const point = evaluateSurface(surface, u, v);
      if (Math.abs(Math.hypot(point[0] - cx, point[1] - cy) - radiusAt(point[2])) > roundoff)
        throw new BrepError('GEOMETRY', 'annular outer draft: the mapped native wall does not retain its conical support');
    }
  }
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid || report.topology[0]?.genus !== 1)
    throw new BrepError('GEOMETRY', `annular outer draft: the drafted solid is invalid: ${report.issues[0] ?? 'unexpected genus'}`, report);
  return candidate;
}

function resizeAnnularOutside(brep: Brep, { stock, walls }: NonNullable<ReturnType<typeof admittedCircularWall>>, radius: number): Brep {
  const wallLoops = new Set(walls.flatMap(wall => wall.loops));
  const movedEdges = new Set(brep.coedges.filter(use => wallLoops.has(use.loop)).map(use => use.edge));
  const movedVertices = new Set(brep.edges.filter(edge => movedEdges.has(edge.id)).flatMap(edge => edge.vertices));
  const factor = radius / stock.radius, [cx, cy] = stock.center;
  const moved = ([x, y, z]: Point): Point => [cx + (x - cx) * factor, cy + (y - cy) * factor, z];
  const edges = brep.edges.map(edge => movedEdges.has(edge.id)
    ? { ...edge, curve: { ...edge.curve, controlPoints: edge.curve.controlPoints.map(moved) } } : edge);
  const rimPoles = edges.filter(edge => edge.curve.degree === 2).flatMap(edge => edge.curve.controlPoints);
  const min: XY = [Math.min(...rimPoles.map(point => point[0])), Math.min(...rimPoles.map(point => point[1]))];
  const max: XY = [Math.max(...rimPoles.map(point => point[0])), Math.max(...rimPoles.map(point => point[1]))];
  const edgeById = byId(edges), capTrims = new Map<string, (point: Point) => Point>();
  for (const cap of [stock.bottom, stock.top]) {
    for (const id of cap.loops) capTrims.set(id, capProjection(min, max, cap === stock.top));
  }
  return {
    ...brep, edges,
    vertices: brep.vertices.map(vertex => movedVertices.has(vertex.id) ? { ...vertex, point: moved(vertex.point) } : vertex),
    faces: brep.faces.map(face => {
      const surface = face.surface;
      if (surface.kind !== 'surface') return face;
      if (walls.includes(face)) return { ...face, surface: { ...surface, controlPoints: surface.controlPoints.map(row => row.map(moved)) } };
      if (face !== stock.bottom && face !== stock.top) return face;
      const chart = capSurface({ min, max }, face === stock.top ? stock.hi : stock.lo, surface.id, face === stock.top);
      return { ...face, surface: { ...surface, controlPoints: chart.controlPoints } };
    }),
    coedges: brep.coedges.map(use => {
      const project = capTrims.get(use.loop);
      // Pcurves follow the stored edge direction. The coedge sense only orients the loop walk.
      return project && use.pcurve ? { ...use, pcurve: { ...use.pcurve, controlPoints: edgeById.get(use.edge)!.curve.controlPoints.map(project) } } : use;
    }),
  };
}

/** Continue both patches of one certified circular support without changing native trim identities. */
export function offsetCircularWallIfAdmitted(brep: Brep, faceName: string, distance: number): Brep | undefined {
  const admitted = admittedCircularWall(brep, faceName);
  if (!admitted) return;
  if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs)
    throw new BrepError('INPUT', 'circular wall offset: distance must be nonzero and within the modeling range');
  const { stock, walls } = admitted, radius = stock.radius + distance;
  const extent = Math.max(geometryScaleMM(brep.vertices.map(vertex => vertex.point)), Math.abs(radius));
  if (admitted.bore && !(radius - admitted.bore.radius > dist(admitted.bore.center, [stock.center[0], stock.center[1], stock.lo]) + linearToleranceMM(extent)))
    throw new BrepError('GEOMETRY', 'circular wall offset: the offset would reach or cross the retained bore');
  if (!(radius > linearToleranceMM(extent)))
    throw new BrepError('GEOMETRY', 'circular wall offset: the offset would reach or cross the cylinder axis');
  if (radius === stock.radius) throw new BrepError('GEOMETRY', 'circular wall offset: distance is too small to move the wall');
  const factor = radius / stock.radius;
  const candidate = admitted.bore ? resizeAnnularOutside(brep, admitted, radius) : transformBrep(brep, { matrix: [factor, 0, 0, 0, factor, 0, 0, 0, 1],
    offset: [stock.center[0] * (1 - factor), stock.center[1] * (1 - factor), 0] });
  const poles = [...candidate.vertices.map(vertex => vertex.point), ...candidate.edges.flatMap(edge => edge.curve.controlPoints),
    ...candidate.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const nextExtent = geometryScaleMM(poles);
  if (!poles.every(point => point.every(Number.isFinite)) || !(nextExtent <= CadNumericPolicy.coordinateAbs))
    throw new BrepError('GEOMETRY', 'circular wall offset: the wall leaves the modeling range');
  const round = cylinderPair(candidate.faces.filter(face => walls.some(wall => wall.id === face.id)), nextExtent, 1);
  const roundoff = 64 * Number.EPSILON * Math.max(1, nextExtent);
  const capsUnchanged = [stock.bottom, stock.top].every((cap, index) => {
    const face = candidate.faces.find(item => item.id === cap.id)!, support = faceGeometry(face, nextExtent);
    return support.kind === 'plane' && support.o[2] === (index === 0 ? stock.lo : stock.hi)
      && same(support.n, [0, 0, index === 0 ? -1 : 1]);
  });
  if (!round || Math.abs(round.radius - radius) > roundoff
    || dist(round.center, [stock.center[0], stock.center[1], stock.lo]) > roundoff || !capsUnchanged)
    throw new BrepError('GEOMETRY', 'circular wall offset: the circular support or fixed caps could not be preserved');
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `circular wall offset: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

function admittedBoreWall(brep: Brep, faceName: string) {
  if (brep.source.family !== 'prismatic-solid') return;
  const matches = brep.faces.filter(face => face.name === faceName);
  if (matches.length !== 1) return;
  const annular = brep.faces.length === stockCounts.annular[0];
  const stock = admittedAxialStock(brep, annular ? 'annular' : 'bored');
  if (!stock || (!annular && stock.borePairs?.length !== 1)) return;
  const walls = annular ? brep.faces.filter(face => {
    const support = faceGeometry(face);
    return support.kind === 'cylinder' && support.out === -1;
  }) : stock.borePairs![0];
  if (!walls.includes(matches[0])) return;
  const faces = walls.map(face => face.name), extent = geometryScaleMM(brep.vertices.map(vertex => vertex.point));
  const round = cylinderPair(walls, extent, -1);
  if (!round || faces.some(name => !name) || new Set(faces).size !== 2) return;
  // The general annular cap proof permits eccentric tubes. Only numerical roundoff,
  // rather than the modeling linear tolerance, is allowed in this new coaxial path.
  const roundoff = 64 * Number.EPSILON * Math.max(1, extent);
  if (annular && dist(round.center, [stock.center[0], stock.center[1], stock.lo]) > roundoff) return;
  const wallLoops = new Set(walls.flatMap(wall => wall.loops));
  const edges = new Set(brep.coedges.filter(use => wallLoops.has(use.loop)).map(use => use.edge));
  const vertices = new Set(brep.edges.filter(edge => edges.has(edge.id)).flatMap(edge => edge.vertices));
  const capLoops = new Set(brep.loops.filter(loop => loop.kind === 'inner'
    && (loop.face === stock.bottom.id || loop.face === stock.top.id)).map(loop => loop.id));
  if (edges.size !== 6 || vertices.size !== 4 || capLoops.size !== 2) return;
  return { stock, wall: matches[0], walls, round, faces: faces as string[], edges, vertices, capLoops, annular };
}

/** Both inward patches of one plate bore or coaxial tube, with a handle pointing out of the material. */
export function boreWallOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point; faces: string[] } | undefined {
  const admitted = admittedBoreWall(brep, faceName);
  if (!admitted) return;
  const { stock, round, faces } = admitted, surface = admitted.wall.surface;
  if (surface.kind !== 'surface') return;
  const point = surface.controlPoints[2][0];
  const anchor: Point = [point[0], point[1], stock.lo + (stock.hi - stock.lo) / 2];
  return { anchor, normal: [(round.center[0] - point[0]) / round.radius, (round.center[1] - point[1]) / round.radius, 0], faces };
}

/** Draft only the complete inner native wall of a coaxial tube, preserving its exterior and cap surface charts. */
export function draftAnnularBoreWallIfAdmitted(brep: Brep, faceNames: readonly string[], angle: number, pull: 'z' | '-z', neutral?: number): Brep | undefined {
  if (faceNames.length !== 2 || new Set(faceNames).size !== 2 || brep.faces.length !== stockCounts.annular[0]) return undefined;
  const admitted = admittedBoreWall(brep, faceNames[0]);
  if (!admitted?.annular || !admitted.faces.every(name => faceNames.includes(name))) return undefined;
  const { stock, walls, round, edges, vertices, capLoops } = admitted;
  const sign = pull === 'z' ? 1 : -1, zN = neutral ?? (sign === 1 ? stock.lo : stock.hi);
  if ((pull !== 'z' && pull !== '-z') || !Number.isFinite(angle) || angle === 0 || Math.abs(angle) >= Math.PI / 4
    || !Number.isFinite(zN) || zN < stock.lo || zN > stock.hi)
    throw new BrepError('INPUT', 'annular bore draft: use a nonzero angle below 45 degrees and a neutral within the original caps');
  // Positive Draft leans into the material: the inner radius grows along the signed pull.
  const slope = sign * Math.tan(angle), radiusAt = (z: number) => round.radius + slope * (z - zN);
  const radii = [radiusAt(stock.lo), radiusAt(stock.hi)], extent = Math.max(geometryScaleMM(brep.vertices.map(vertex => vertex.point)), ...radii.map(Math.abs));
  const tolerance = linearToleranceMM(extent), separation = dist(round.center, [stock.center[0], stock.center[1], stock.lo]);
  if (radii.some(radius => !Number.isFinite(radius) || !(radius > tolerance)))
    throw new BrepError('GEOMETRY', 'annular bore draft: the draft reaches or crosses the bore axis');
  if (radii.some(radius => !(stock.radius - radius > separation + tolerance)))
    throw new BrepError('GEOMETRY', 'annular bore draft: the draft reaches or crosses the outer tube wall');
  const [cx, cy] = round.center;
  const moved = (point: Point): Point => {
    const radius = radiusAt(point[2]);
    if (radius === round.radius) return point;
    const factor = radius / round.radius;
    return [cx + (point[0] - cx) * factor, cy + (point[1] - cy) * factor, point[2]];
  };
  // Exact on the admitted two-station recipe: ruled half-circle charts with equal axial weights,
  // constant-Z rim curves and straight radial seams. No generic deformation is admitted.
  const nextEdges = brep.edges.map(edge => {
    if (!edges.has(edge.id)) return edge;
    const controlPoints = edge.curve.controlPoints.map(moved);
    return controlPoints.every((point, i) => point === edge.curve.controlPoints[i]) ? edge : { ...edge, curve: { ...edge.curve, controlPoints } };
  });
  if (!nextEdges.some((edge, i) => !samePoles(edge.curve.controlPoints, brep.edges[i].curve.controlPoints)))
    throw new BrepError('GEOMETRY', 'annular bore draft: the angle is too small to move the native bore');
  const edgeById = byId(nextEdges), originalEdges = byId(brep.edges), capTrims = new Map<string, (point: Point) => Point>();
  for (const cap of [stock.bottom, stock.top]) for (const id of cap.loops)
    if (capLoops.has(id)) capTrims.set(id, capProjection(stock.min, stock.max, cap === stock.top));
  const candidate: Brep = {
    ...brep, edges: nextEdges,
    vertices: brep.vertices.map(vertex => {
      if (!vertices.has(vertex.id)) return vertex;
      const point = moved(vertex.point); return point === vertex.point ? vertex : { ...vertex, point };
    }),
    faces: brep.faces.map(face => {
      const surface = face.surface;
      if (!walls.includes(face) || surface.kind !== 'surface') return face;
      const controlPoints = surface.controlPoints.map(row => row.map(moved));
      return controlPoints.every((row, i) => row.every((point, j) => point === surface.controlPoints[i][j]))
        ? face : { ...face, surface: { ...surface, controlPoints } };
    }),
    coedges: brep.coedges.map(use => {
      const project = capTrims.get(use.loop), edge = edgeById.get(use.edge)!;
      return project && use.pcurve && edge !== originalEdges.get(use.edge)
        ? { ...use, pcurve: { ...use.pcurve, controlPoints: edge.curve.controlPoints.map(project) } } : use;
    }),
  };
  const poles = [...candidate.vertices.map(vertex => vertex.point), ...nextEdges.flatMap(edge => edge.curve.controlPoints),
    ...candidate.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const nextExtent = geometryScaleMM(poles), roundoff = 128 * Number.EPSILON * Math.max(1, nextExtent);
  if (!poles.every(point => point.every(Number.isFinite)) || !(nextExtent <= CadNumericPolicy.coordinateAbs))
    throw new BrepError('GEOMETRY', 'annular bore draft: the drafted bore leaves the modeling range');
  for (const [i, cap] of [stock.bottom, stock.top].entries()) {
    const z = i === 0 ? stock.lo : stock.hi, nextCap = candidate.faces.find(face => face.id === cap.id)!, plane = faceGeometry(nextCap, nextExtent);
    const rims = nextEdges.filter(edge => edges.has(edge.id) && edge.curve.degree === 2 && level(edge, z));
    if (nextCap !== cap || plane.kind !== 'plane' || plane.o[2] !== z || !same(plane.n, [0, 0, i === 0 ? -1 : 1]) || rims.length !== 2
      || rims.some(edge => { const circle = circleOf(edge.curve); return !circle || Math.abs(circle.r - radii[i]) > roundoff || dist(circle.c, [cx, cy, z]) > roundoff; }))
      throw new BrepError('GEOMETRY', 'annular bore draft: the native cap or circular bore boundary could not be preserved');
  }
  for (const wall of walls) {
    const face = candidate.faces.find(item => item.id === wall.id)!, surface = face.surface;
    if (surface.kind !== 'surface') throw new BrepError('GEOMETRY', 'annular bore draft: a native bore wall lost its surface');
    for (const u of [0, .25, .5, .75, 1]) for (const v of [0, .5, 1]) {
      const point = evaluateSurface(surface, u, v);
      if (Math.abs(Math.hypot(point[0] - cx, point[1] - cy) - radiusAt(point[2])) > roundoff)
        throw new BrepError('GEOMETRY', 'annular bore draft: the mapped native bore does not retain its conical support');
    }
  }
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid || report.topology[0]?.genus !== 1)
    throw new BrepError('GEOMETRY', `annular bore draft: the drafted solid is invalid: ${report.issues[0] ?? 'unexpected genus'}`, report);
  return candidate;
}

/** Combine the two certified same-original edits, then bind both cap loops to the final outer charts. */
export function draftAnnularWallsIfAdmitted(brep: Brep, faceNames: readonly string[], angle: number, pull: 'z' | '-z', neutral?: number): Brep | undefined {
  if (faceNames.length !== 4 || new Set(faceNames).size !== 4 || brep.faces.length !== stockCounts.annular[0]) return undefined;
  const outerNames: string[] = [], innerNames: string[] = [];
  for (const name of faceNames) {
    const matches = brep.faces.filter(face => face.name === name);
    if (matches.length !== 1) return undefined;
    const support = faceGeometry(matches[0]);
    if (support.kind !== 'cylinder') return undefined;
    (support.out === 1 ? outerNames : innerNames).push(name);
  }
  if (outerNames.length !== 2 || innerNames.length !== 2) return undefined;
  const admitted = admittedCircularWall(brep, outerNames[0]);
  if (!admitted?.bore || !admitted.faces.every(name => outerNames.includes(name))) return undefined;
  const { stock, bore } = admitted, sign = pull === 'z' ? 1 : -1, zN = neutral ?? (sign === 1 ? stock.lo : stock.hi);
  if ((pull !== 'z' && pull !== '-z') || !Number.isFinite(angle) || angle === 0 || Math.abs(angle) >= Math.PI / 4
    || !Number.isFinite(zN) || zN < stock.lo || zN > stock.hi)
    throw new BrepError('INPUT', 'annular walls draft: use a nonzero angle below 45 degrees and a neutral within the original caps');
  const slope = sign * Math.tan(angle), outerAt = (z: number) => stock.radius - slope * (z - zN), innerAt = (z: number) => bore.radius + slope * (z - zN);
  const stations = [stock.lo, stock.hi], extent = Math.max(geometryScaleMM(brep.vertices.map(vertex => vertex.point)), ...stations.flatMap(z => [Math.abs(outerAt(z)), Math.abs(innerAt(z))]));
  const tolerance = linearToleranceMM(extent), separation = dist(bore.center, [stock.center[0], stock.center[1], stock.lo]);
  if (stations.some(z => !Number.isFinite(innerAt(z)) || !(innerAt(z) > tolerance)))
    throw new BrepError('GEOMETRY', 'annular walls draft: the draft reaches or crosses the bore axis');
  if (stations.some(z => !Number.isFinite(outerAt(z)) || !(outerAt(z) - innerAt(z) > separation + tolerance)))
    throw new BrepError('GEOMETRY', 'annular walls draft: the drafted inner and outer walls reach or cross each other');
  // Neither candidate consumes the other's conical output. Their disjoint native edits share one original proof.
  const outer = draftAnnularOuterWallIfAdmitted(brep, outerNames, angle, pull, zN), inner = draftAnnularBoreWallIfAdmitted(brep, innerNames, angle, pull, zN);
  if (!outer || !inner) return undefined;
  const merge = <T extends { readonly id: string }>(base: readonly T[], first: readonly T[], second: readonly T[]): T[] => {
    if (first.length !== base.length || second.length !== base.length)
      throw new BrepError('GEOMETRY', 'annular walls draft: the native correspondence changed');
    const a = byId(first), b = byId(second);
    return base.map(original => {
      const left = a.get(original.id), right = b.get(original.id);
      if (!left || !right || left !== original && right !== original)
        throw new BrepError('GEOMETRY', 'annular walls draft: the native edits do not have disjoint owners');
      return left === original ? right : left;
    });
  };
  const edges = merge(brep.edges, outer.edges, inner.edges), faces = merge(brep.faces, outer.faces, inner.faces), vertices = merge(brep.vertices, outer.vertices, inner.vertices);
  const edgeById = byId(edges), originalEdges = byId(brep.edges), capTrims = new Map<string, (point: Point) => Point>();
  for (const cap of [stock.bottom, stock.top]) {
    const finalCap = faces.find(face => face.id === cap.id)!, surface = finalCap.surface;
    if (surface.kind !== 'surface') throw new BrepError('GEOMETRY', 'annular walls draft: a cap lost its native chart');
    const changed = finalCap !== cap || brep.coedges.some(use => cap.loops.includes(use.loop) && edgeById.get(use.edge) !== originalEdges.get(use.edge));
    if (!changed) continue; // Keep a shared neutral cap and all its original trims exact.
    const poles = surface.controlPoints.flat(), min: XY = [Math.min(...poles.map(point => point[0])), Math.min(...poles.map(point => point[1]))];
    const max: XY = [Math.max(...poles.map(point => point[0])), Math.max(...poles.map(point => point[1]))];
    for (const loop of cap.loops) capTrims.set(loop, capProjection(min, max, cap === stock.top));
  }
  const candidate: Brep = { ...brep, edges, faces, vertices,
    coedges: brep.coedges.map(use => {
      const project = capTrims.get(use.loop);
      return project && use.pcurve ? { ...use, pcurve: { ...use.pcurve, controlPoints: edgeById.get(use.edge)!.curve.controlPoints.map(project) } } : use;
    }) };
  // The component receipts prove the conical charts. Remeasure the final rim owners after correspondence and UV merging.
  const loops = new Map(brep.loops.map(loop => [loop.id, loop])), uses = byId(brep.coedges);
  const nextExtent = geometryScaleMM([...vertices.map(vertex => vertex.point), ...edges.flatMap(edge => edge.curve.controlPoints)]);
  const roundoff = 128 * Number.EPSILON * Math.max(1, nextExtent);
  for (const cap of [stock.bottom, stock.top]) for (const loopId of cap.loops) {
    const loop = loops.get(loopId)!, z = cap === stock.bottom ? stock.lo : stock.hi, radius = loop.kind === 'outer' ? outerAt(z) : innerAt(z);
    const center: Point = loop.kind === 'outer' ? [stock.center[0], stock.center[1], z] : [bore.center[0], bore.center[1], z];
    if (loop.coedges.length !== 2 || loop.coedges.some(useId => {
      const edge = edgeById.get(uses.get(useId)!.edge)!, circle = circleOf(edge.curve);
      return !level(edge, z) || !circle || Math.abs(circle.r - radius) > roundoff || dist(circle.c, center) > roundoff;
    })) throw new BrepError('GEOMETRY', 'annular walls draft: the final circular cap boundaries could not be preserved');
  }
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid || report.topology[0]?.genus !== 1)
    throw new BrepError('GEOMETRY', `annular walls draft: the drafted solid is invalid: ${report.issues[0] ?? 'unexpected genus'}`, report);
  return candidate;
}

/** Change one through-bore radius while keeping the stock supports and native boundary ownership. */
export function offsetBoreWallIfAdmitted(brep: Brep, faceName: string, distance: number): Brep | undefined {
  const admitted = admittedBoreWall(brep, faceName);
  if (!admitted) return;
  if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs)
    throw new BrepError('INPUT', 'bore wall offset: distance must be nonzero and within the modeling range');
  const { stock, walls, round, edges, vertices, capLoops } = admitted, radius = round.radius - distance;
  const extent = Math.max(Math.abs(radius), geometryScaleMM(brep.vertices.map(vertex => vertex.point))), tolerance = linearToleranceMM(extent);
  if (!(radius > tolerance)) throw new BrepError('GEOMETRY', 'bore wall offset: the offset would reach or cross the bore axis');
  if (admitted.annular && !(stock.radius - radius > dist(round.center, [stock.center[0], stock.center[1], stock.lo]) + tolerance))
    throw new BrepError('GEOMETRY', 'bore wall offset: the offset would reach or cross the outer tube wall');
  if (!admitted.annular && !diskClearsRectangle(round.center, radius, stock.min, stock.max, tolerance))
    throw new BrepError('GEOMETRY', 'bore wall offset: the offset would reach or cross an outer plate wall');
  if (radius === round.radius) throw new BrepError('GEOMETRY', 'bore wall offset: distance is too small to move the wall');
  const factor = radius / round.radius, [cx, cy] = round.center;
  const moved = ([x, y, z]: Point): Point => [cx + (x - cx) * factor, cy + (y - cy) * factor, z];
  const nextEdges = brep.edges.map(edge => edges.has(edge.id)
    ? { ...edge, curve: { ...edge.curve, controlPoints: edge.curve.controlPoints.map(moved) } } : edge);
  const edgeById = byId(nextEdges);
  const capTrims = new Map<string, (point: Point) => Point>();
  for (const cap of [stock.bottom, stock.top]) {
    for (const id of cap.loops) if (capLoops.has(id)) capTrims.set(id, capProjection(stock.min, stock.max, cap === stock.top));
  }
  const candidate: Brep = {
    ...brep, edges: nextEdges,
    vertices: brep.vertices.map(vertex => vertices.has(vertex.id) ? { ...vertex, point: moved(vertex.point) } : vertex),
    faces: brep.faces.map(face => walls.includes(face) && face.surface.kind === 'surface'
      ? { ...face, surface: { ...face.surface, controlPoints: face.surface.controlPoints.map(row => row.map(moved)) } } : face),
    coedges: brep.coedges.map(use => {
      const project = capTrims.get(use.loop);
      return project && use.pcurve ? { ...use, pcurve: { ...use.pcurve, controlPoints: edgeById.get(use.edge)!.curve.controlPoints.map(project) } } : use;
    }),
  };
  const poles = [...candidate.vertices.map(vertex => vertex.point), ...nextEdges.flatMap(edge => edge.curve.controlPoints),
    ...candidate.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  const nextExtent = geometryScaleMM(poles);
  if (!poles.every(point => point.every(Number.isFinite)) || !(nextExtent <= CadNumericPolicy.coordinateAbs))
    throw new BrepError('GEOMETRY', 'bore wall offset: the bore leaves the modeling range');
  const nextRound = cylinderPair(candidate.faces.filter(face => walls.some(wall => wall.id === face.id)), nextExtent, -1);
  const roundoff = 64 * Number.EPSILON * Math.max(1, nextExtent);
  if (!nextRound || Math.abs(nextRound.radius - radius) > roundoff || dist(nextRound.center, round.center) > roundoff)
    throw new BrepError('GEOMETRY', 'bore wall offset: the circular support could not be preserved');
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `bore wall offset: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

/** A point on the annular cap material and its outward direction. */
export function annularCapReplacementFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const cap = admittedCap(brep, faceName, 'annular');
  return cap && { anchor: cap.point, normal: [0, 0, cap.sign] };
}

/** @internal Shared axial map; callers prove that the two native stations own every pole. */
export function mapCapStation(brep: Brep, station: number, height: (x: number, y: number) => number): Brep {
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
  // The annular extension admits either cap of a coaxial upright tube only.
  // The circular-wall admission proves both complete native supports are coaxial.
  const annular = admittedCap(brep, faceName, 'annular');
  const outer = annular ? brep.faces.find(face => {
    const support = faceGeometry(face);
    return support.kind === 'cylinder' && support.out === 1;
  }) : undefined;
  const cap = admittedCap(brep, faceName) ?? (outer?.name && admittedCircularWall(brep, outer.name) ? annular : undefined);
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

function admittedCardinalWall(brep: Brep, faceName: string) {
  const matches = brep.faces.filter(face => face.name === faceName), [wall] = matches;
  if (matches.length !== 1 || wall.loops.length !== 1 || wall.surface.kind !== 'surface' || wall.surface.degreeU !== 1) return;
  const stock = admittedAxialStock(brep, boredPlateKind(brep));
  if (!stock?.boreDisks) return;
  const role = cardinalWallSupport(wall, stock.min, stock.max);
  if (!role) return;
  const trim = readWallContinuation(brep, wall, stock.bottom, stock.top, role.axis, role.station);
  return trim && { ...trim, stock, boreDisks: stock.boreDisks, ...role };
}

function cardinalWallSupport(wall: BrepFace, min: XY, max: XY) {
  if (wall.surface.kind !== 'surface') return;
  const support = faceGeometry(wall);
  if (support.kind !== 'plane') return;
  const axis = support.n[0] !== 0 ? 0 : 1, transverse = axis === 0 ? 1 : 0;
  const sign = support.n[axis];
  if ((sign !== 1 && sign !== -1) || support.n[transverse] !== 0 || support.n[2] !== 0) return;
  const station = (sign === 1 ? max : min)[axis];
  if (!wall.surface.controlPoints.every(row => row.every(point => point[axis] === station))) return;
  return { axis, sign, station } as const;
}

function readWallContinuation(brep: Brep, wall: BrepFace, bottom: BrepFace, top: BrepFace, axis: 0 | 1, station: number) {
  const transverse = axis === 0 ? 1 : 0;
  const loops = byId(brep.loops), coedges = byId(brep.coedges), edges = byId(brep.edges), faces = byId(brep.faces);
  const loop = loops.get(wall.loops[0]);
  if (loop?.kind !== 'outer' || loop.coedges.length !== 4) return;
  const adjacent = new Set<BrepFace>(), corners = new Set<string>(), capCorners = new Map<string, BrepFace>();
  for (const id of loop.coedges) {
    const use = coedges.get(id), twin = use?.twin ? coedges.get(use.twin) : undefined;
    const neighbor = twin && faces.get(loops.get(twin.loop)?.face ?? ''), edge = use && edges.get(use.edge);
    if (!edge || !neighbor || !line(edge.curve) || !edge.curve.controlPoints.every(point => point[axis] === station)) return;
    adjacent.add(neighbor);
    for (const vertex of edge.vertices) {
      corners.add(vertex);
      if (neighbor === bottom || neighbor === top) capCorners.set(vertex, neighbor);
    }
  }
  if (corners.size !== 4 || capCorners.size !== 4 || adjacent.size !== 4 || !adjacent.has(bottom) || !adjacent.has(top)) return;
  const sideSigns = new Set<number>();
  for (const neighbor of adjacent) {
    if (neighbor === bottom || neighbor === top) continue;
    const geometry = faceGeometry(neighbor);
    if (geometry.kind !== 'plane' || geometry.n[axis] !== 0 || Math.abs(geometry.n[transverse]) !== 1 || geometry.n[2] !== 0) return;
    sideSigns.add(geometry.n[transverse]);
  }
  if (sideSigns.size !== 2) return;
  return { corners, capCorners, faces: new Set([wall, ...adjacent]), edges, loops, coedges };
}

/** The center and outward normal of a supported through-bored plate wall. */
export function boredPlateWallOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const admitted = admittedCardinalWall(brep, faceName);
  if (!admitted) {
    const tilted = admittedTiltedCardinalWall(brep, faceName);
    if (!tilted) return;
    const { axis, sign, station, min, max, bottomZ, topZ } = tilted;
    const anchor: Point = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, 0], normal: Point = [0, 0, 0];
    anchor[axis] = station;
    const [x, y] = anchor;
    anchor[2] = (bottomZ(x, y) + topZ(x, y)) / 2;
    normal[axis] = sign;
    return { anchor, normal };
  }
  const { stock: { min, max, lo, hi }, axis, sign, station } = admitted;
  const anchor: Point = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (lo + hi) / 2], normal: Point = [0, 0, 0];
  anchor[axis] = station;
  normal[axis] = sign;
  return { anchor, normal };
}

function offsetWallStation(brep: Brep, station: number, axis: 0 | 1, sign: 1 | -1, boreDisks: readonly BoreDisk[], distance: number) {
  if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs)
    throw new BrepError('INPUT', 'bored wall offset: distance must be nonzero and within the modeling range');
  const next = station + sign * distance;
  const extent = Math.max(Math.abs(next), geometryScaleMM(brep.vertices.map(vertex => vertex.point)));
  if (!(extent <= CadNumericPolicy.coordinateAbs)) throw new BrepError('GEOMETRY', 'bored wall offset: the wall leaves the modeling range');
  if (next === station) throw new BrepError('GEOMETRY', 'bored wall offset: distance is too small to move the wall');
  const clearance = linearToleranceMM(extent);
  if (!boreDisks.every(({ center, radius }) => (next - center[axis]) * sign - radius > clearance))
    throw new BrepError('GEOMETRY', 'bored wall offset: the offset would reach or cross the bore');
  return { next, extent };
}

export function offsetBoredPlateWallIfAdmitted(brep: Brep, faceName: string, distance: number): Brep | undefined {
  const admitted = admittedCardinalWall(brep, faceName);
  if (!admitted) {
    const tilted = admittedTiltedCardinalWall(brep, faceName);
    return tilted && offsetTiltedCardinalWall(brep, tilted, distance);
  }
  const { stock, boreDisks, axis, sign, station, corners, faces, edges } = admitted;
  const { next } = offsetWallStation(brep, station, axis, sign, boreDisks, distance);

  const moved = (point: Point): Point => {
    if (point[axis] !== station) return point;
    const output: Point = [...point];
    output[axis] = next;
    return output;
  };
  const min: XY = [...stock.min], max: XY = [...stock.max];
  const bound = sign === 1 ? max : min;
  bound[axis] = next;
  const capTrims = new Map<string, (point: Point) => Point>();
  for (const loop of brep.loops) {
    if (loop.kind === 'inner' && (loop.face === stock.top.id || loop.face === stock.bottom.id))
      capTrims.set(loop.id, capProjection(min, max, loop.face === stock.top.id));
  }
  // The straight boundaries keep their original UV charts. The bores stay in place, so only
  // their uses on the resized caps need new UV coordinates from their unchanged 3D rim poles.
  const candidate: Brep = {
    ...brep,
    vertices: brep.vertices.map(vertex => corners.has(vertex.id) ? { ...vertex, point: moved(vertex.point) } : vertex),
    edges: brep.edges.map(edge => edge.vertices.some(vertex => corners.has(vertex))
      ? { ...edge, curve: { ...edge.curve, controlPoints: edge.curve.controlPoints.map(moved) } } : edge),
    faces: brep.faces.map(face => faces.has(face) && face.surface.kind === 'surface'
      ? { ...face, surface: { ...face.surface, controlPoints: face.surface.controlPoints.map(row => row.map(moved)) } } : face),
    coedges: brep.coedges.map(use => {
      const project = capTrims.get(use.loop);
      return project && use.pcurve ? { ...use, pcurve: { ...use.pcurve, controlPoints: edges.get(use.edge)!.curve.controlPoints.map(project) } } : use;
    }),
  };
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `bored wall offset: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

type AffineChart = NonNullable<ReturnType<typeof affineChart>>;

function capHeight({ origin: [ox, oy, oz], normal: [nx, ny, nz] }: AffineChart) {
  return (x: number, y: number) => oz - ((x - ox) * nx + (y - oy) * ny) / nz;
}

function admittedTiltedCardinalWall(brep: Brep, faceName: string) {
  if (brep.faces.length !== stockCounts[boredPlateKind(brep)][0]) return;
  const matches = brep.faces.filter(face => face.name === faceName), [wall] = matches;
  if (matches.length !== 1 || wall.loops.length !== 1 || wall.surface.kind !== 'surface' || wall.surface.degreeU !== 1) return;
  const plate = readTiltedRectangularPlateBore(brep);
  if (!plate) return;
  const { bottom, top, boreDisks } = plate;
  const points = brep.vertices.map(vertex => vertex.point);
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const min: XY = [Math.min(...xs), Math.min(...ys)], max: XY = [Math.max(...xs), Math.max(...ys)];
  const role = cardinalWallSupport(wall, min, max);
  if (!role) return;
  const trim = readWallContinuation(brep, wall, bottom, top, role.axis, role.station);
  if (!trim || brep.edges.some(edge => edge.vertices.some(id => trim.corners.has(id)) && !line(edge.curve))) return;

  const charts = new Map<BrepFace, AffineChart>();
  for (const face of trim.faces) {
    const chart = affineChart(face.surface, face.sense);
    if (!chart || !same(chart.surface.knotsU, lineKnots) || !same(chart.surface.knotsV, lineKnots)) return;
    for (const id of face.loops) {
      const loop = trim.loops.get(id);
      if (!loop || loop.coedges.some(use => !trim.coedges.get(use)?.pcurve)) return;
    }
    charts.set(face, chart);
  }
  const bottomChart = charts.get(bottom)!, topChart = charts.get(top)!;
  return { ...trim, ...role, wall, bottom, charts, min, max, boreDisks, bottomZ: capHeight(bottomChart), topZ: capHeight(topChart) };
}

function offsetTiltedCardinalWall(brep: Brep, admitted: NonNullable<ReturnType<typeof admittedTiltedCardinalWall>>, distance: number): Brep {
  const { axis, sign, station, boreDisks, bottom, bottomZ, topZ, capCorners, charts, wall } = admitted;
  const { next, extent } = offsetWallStation(brep, station, axis, sign, boreDisks, distance);
  const min: XY = [...admitted.min], max: XY = [...admitted.max], bound = sign === 1 ? max : min;
  bound[axis] = next;
  const heights = [min[0], max[0]].flatMap(x => [min[1], max[1]].map(y => [bottomZ(x, y), topZ(x, y)]));
  const size = Math.max(extent, geometryScaleMM(heights));
  if (!(size <= CadNumericPolicy.coordinateAbs)) throw new BrepError('GEOMETRY', 'bored wall offset: the wall leaves the modeling range');
  const clearance = linearToleranceMM(size);
  if (heights.some(([lo, hi]) => !(hi - lo > clearance)))
    throw new BrepError('GEOMETRY', 'bored wall offset: the offset would reach or cross the opposite cap');

  // The four end vertices belong to the actual cap rails. Intersect the moved wall with
  // those same planes, and rebuild only the incident straight edges from their endpoints.
  const moveToWall = (point: Point): Point => {
    const moved: Point = [...point];
    moved[axis] = next;
    return moved;
  };
  const moved = new Map<string, Point>();
  const vertices = brep.vertices.map(vertex => {
    const cap = capCorners.get(vertex.id);
    if (!cap) return vertex;
    const point = moveToWall(vertex.point), [x, y] = point;
    point[2] = (cap === bottom ? bottomZ : topZ)(x, y);
    moved.set(vertex.id, point);
    return { ...vertex, point };
  });
  const changedEdges = new Set<string>();
  const edges = brep.edges.map(edge => {
    if (!edge.vertices.some(id => moved.has(id))) return edge;
    changedEdges.add(edge.id);
    const controlPoints = edge.vertices.map((id, i) => moved.get(id) ?? edge.curve.controlPoints[i]);
    return { ...edge, curve: { ...edge.curve, controlPoints } };
  });
  const edgeById = byId(edges), chartByLoop = new Map<string, AffineChart>(), changedLoops = new Set<string>();
  const roundoff = 64 * Number.EPSILON * Math.max(1, size);
  const faces = brep.faces.map(face => {
    const original = charts.get(face);
    if (!original) return face;
    const poles = face.loops.flatMap(id => admitted.loops.get(id)!.coedges.flatMap(use =>
      edgeById.get(admitted.coedges.get(use)!.edge)!.curve.controlPoints));
    const seed = face === wall ? affineChart({ ...original.surface,
      controlPoints: original.surface.controlPoints.map(row => row.map(moveToWall)) }, face.sense) : original;
    const chart = seed && coverAffineTrim(seed, face.sense, poles, roundoff);
    if (!chart) throw new BrepError('GEOMETRY', 'bored wall offset: the offset cannot keep the trim on its planar support within the modeling range');
    for (const id of face.loops) {
      chartByLoop.set(id, chart);
      if (chart !== original) changedLoops.add(id);
    }
    return chart === original ? face : { ...face, surface: chart.surface };
  });
  const coedges = brep.coedges.map(use => {
    const chart = chartByLoop.get(use.loop);
    if (!chart || !use.pcurve || (!changedLoops.has(use.loop) && !changedEdges.has(use.edge))) return use;
    const { curve } = edgeById.get(use.edge)!;
    // The chart already covers every pole, including the conic rims. Its UV projection also
    // snaps endpoint roundoff to the closed parameter domain.
    const controlPoints = curve.controlPoints.map(point => uvPoint(chart, point));
    return { ...use, pcurve: { ...curve, id: use.pcurve.id, controlPoints } };
  });
  const candidate = { ...brep, vertices, edges, faces, coedges };
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `bored wall offset: the offset solid is invalid: ${report.issues[0]}`, report);
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
  return encloseAxialSideTrims(brep, lo, hi, new Set([...sideFaces].map(face => face.id)));
}

/** @internal Keep identified vertical supports while their rational cap trims change height. */
export function encloseAxialSideTrims(brep: Brep, lo: number, hi: number, sideIds: ReadonlySet<string>): Brep {
  const sideFaces = new Set(brep.faces.filter(face => sideIds.has(face.id)));
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
  const flat = admittedAxialStock(brep, boredPlateKind(brep));
  const tilted = flat ? undefined : readTiltedRectangularPlateBore(brep, faceName);
  const plate = flat ?? tilted;
  const selected = flat?.borePairs?.find(pair => pair.some(face => face.name === faceName)) ?? tilted?.selected;
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

  return healWithoutTrims(brep, removed, capTrims);
}

function healWithoutTrims(brep: Brep, removed: ReadonlySet<string>, capTrims: ReadonlySet<string>): Brep {
  const faces = brep.faces.filter(face => !removed.has(face.id)).map(face => face.loops.some(id => capTrims.has(id))
    ? { ...face, loops: face.loops.filter(id => !capTrims.has(id)) } : face);
  // Retain the original charts and incidence of the surviving faces.
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

function boundsXY(points: readonly Point[]): { min: XY; max: XY } {
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

function exactBossCap(face: BrepFace, z: number, bounds: { min: XY; max: XY }, rim: readonly Use[]): boolean {
  const { surface } = face;
  if (face.sense !== 'forward' || surface.kind !== 'surface' || surface.degreeU !== 1 || surface.degreeV !== 1
    || !same(surface.knotsU, lineKnots) || !same(surface.knotsV, lineKnots)
    || !same(surface.weights.flat(), [1, 1, 1, 1]) || surface.controlPoints.length !== 2) return false;
  const expected = capSurface(bounds, z, surface.id, true), project = capProjection(bounds.min, bounds.max, true);
  return surface.controlPoints.every((row, i) => samePoles(row, expected.controlPoints[i]))
    && rim.every(({ edge, pcurve }) => level(edge, z) && matchingPcurve(pcurve, edge.curve, project));
}

function readBossWall(wall: BrepFace, boundary: readonly Use[], mate: BrepFace, tipLoop: BrepLoop, lo: number, hi: number) {
  const { surface } = wall;
  if (surface.kind !== 'surface' || surface.degreeU !== 2 || surface.degreeV !== 1
    || !same(surface.knotsU, halfCircleKnots) || !same(surface.knotsV, lineKnots)
    || surface.controlPoints.length !== 5 || surface.weights.length !== 5
    || !surface.controlPoints.every(row => row.length === 2 && row[0][2] === lo && row[1][2] === hi
      && row[0][0] === row[1][0] && row[0][1] === row[1][1])
    || !surface.weights.every(row => row.length === 2 && row[0] > 0 && row[0] === row[1])) return;
  const lowerUses = boundary.filter(({ edge }) => level(edge, lo)), upperUses = boundary.filter(({ edge }) => level(edge, hi));
  const [lower] = lowerUses, [upper] = upperUses;
  if (lowerUses.length !== 1 || upperUses.length !== 1 || lower.neighborLoop.kind !== 'inner' || upper.neighborLoop !== tipLoop) return;
  for (const [station, { edge, pcurve }] of [lower, upper].entries()) {
    if (edge.curve.degree !== 2 || !same(edge.curve.knots, surface.knotsU)
      || !same(edge.curve.weights, surface.weights.map(row => row[station]))
      || !samePoles(edge.curve.controlPoints, surface.controlPoints.map(row => row[station]))
      || !line(pcurve) || !samePoles(pcurve.controlPoints, [[0, station, 0], [1, station, 0]])) return;
  }
  const seams = boundary.filter(use => use !== lower && use !== upper);
  const positions = new Set<number>();
  for (const { edge, pcurve, neighbor } of seams) {
    if (neighbor !== mate || !line(edge.curve) || !line(pcurve)) return;
    const u = pcurve.controlPoints[0][0];
    if ((u !== 0 && u !== 1) || !samePoles(pcurve.controlPoints, [[u, 0, 0], [u, 1, 0]])
      || !samePoles(edge.curve.controlPoints, surface.controlPoints[u === 0 ? 0 : 4])) return;
    positions.add(u);
  }
  return positions.size === 2 ? { lower, seams } : undefined;
}

/** Remove one exposed cylindrical boss from the top of a straight rectangular stock. */
export function healCylindricalBossIfAdmitted(brep: Brep, faceName: string): Brep | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  const [body] = bodies, [shell] = shells;
  if (bodies.length !== 1 || body.kind !== 'solid' || body.shells.length !== 1 || shells.length !== 1
    || body.shells[0] !== shell.id || shell.body !== body.id || !shell.closed || shell.faces.length !== 9 || new Set(shell.faces).size !== 9
    || faces.length !== 9 || !faces.every(face => shell.faces.includes(face.id)) || loops.length !== 10
    || coedges.length !== 36 || edges.length !== 18 || vertices.length !== 12) return;
  const matches = faces.filter(face => face.name === faceName), [tip] = matches;
  if (matches.length !== 1 || tip.loops.length !== 1 || tip.surface.kind !== 'surface' || tip.surface.degreeU !== 1) return;
  const { loopById, readUses } = nativeLoopReader(brep), tipLoop = loopById.get(tip.loops[0]);
  const tipRim = tipLoop?.kind === 'outer' ? readUses(tip, tipLoop, 2) : undefined;
  if (!tipLoop || !tipRim || new Set(tipRim.map(use => use.neighbor)).size !== 2) return;
  const [a, b] = tipRim.map(use => use.neighbor);
  if (a.loops.length !== 1 || b.loops.length !== 1 || a.surface.kind !== 'surface') return;
  const extent = geometryScaleMM(vertices.map(vertex => vertex.point), ...edges.map(edge => edge.curve.controlPoints),
    ...faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints : []));
  if (!(extent <= CadNumericPolicy.coordinateAbs) || !checkBrep(brep, { strict: true }).valid) return;
  const lo = a.surface.controlPoints[0]?.[0]?.[2], hi = tip.surface.controlPoints[0]?.[0]?.[2];
  const tolerance = linearToleranceMM(extent);
  if (!(hi - lo > tolerance)) return;

  const boundaryA = readUses(a, tipRim[0].neighborLoop, 4), boundaryB = readUses(b, tipRim[1].neighborLoop, 4);
  const wallA = boundaryA && readBossWall(a, boundaryA, b, tipLoop, lo, hi);
  const wallB = boundaryB && readBossWall(b, boundaryB, a, tipLoop, lo, hi);
  if (!wallA || !wallB || wallA.lower.neighborLoop !== wallB.lower.neighborLoop
    || wallA.seams.some(({ edge }) => !wallB.seams.some(use => use.edge === edge))) return;
  const footprint = cylinderPair([a, b], extent, 1);
  const tipBounds = boundsXY(tipRim.flatMap(({ edge }) => edge.curve.controlPoints));
  if (!footprint || !exactBossCap(tip, hi, tipBounds, tipRim)) return;

  const base = wallA.lower.neighbor, baseLoop = wallA.lower.neighborLoop;
  const baseRim = readUses(base, baseLoop, 2);
  if (!base.name || base.loops.length !== 2 || !baseRim || !baseRim.every(({ neighbor }) => neighbor === a || neighbor === b)) return;
  const candidate = healWithoutTrims(brep, new Set([tip.id, a.id, b.id]), new Set([baseLoop.id]));
  const frame = boxCapOffsetFrame(candidate, base.name), bounds = boundsXY(candidate.vertices.map(vertex => vertex.point));
  if (!frame || frame.anchor[2] !== lo || !same(frame.normal, [0, 0, 1])
    || !exactBossCap(base, lo, bounds, baseRim) || !diskClearsRectangle(footprint.center, footprint.radius, bounds.min, bounds.max, tolerance)) return;
  return candidate;
}

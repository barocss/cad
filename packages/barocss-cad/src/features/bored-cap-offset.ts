import { faceGeometry } from '../brep/analytic-boolean.js';
import { BrepError, checkBrep, type Brep, type BrepEdge, type BrepFace } from '../brep/brep-core.js';
import { createCylindricalBoreCheck } from '../brep/cylindrical-bore.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point } from '../types.js';
import { capSurface } from './extruded-profile-solid.js';

type XY = [number, number];
type Cap = { readonly point: Point; readonly sign: 1 | -1; readonly opposite: number };
type BoredPlate = {
  readonly bottom: BrepFace; readonly top: BrepFace; readonly cylinders: readonly BrepFace[];
  readonly lo: number; readonly hi: number; readonly anchorX: number; readonly anchorY: number;
};
type Use = { readonly edge: BrepEdge; readonly pcurve: Curve; readonly neighbor: BrepFace };
const lineKnots = [0, 0, 1, 1];
const halfCircleKnots = [0, 0, 0, 0.5, 0.5, 1, 1, 1];

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

/** The supported stock is the native rectangular-prism chart with one cylindrical through bore. */
function admittedBoredPlate(brep: Brep): BoredPlate | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  const [body] = bodies, [shell] = shells;
  if (bodies.length !== 1 || body.kind !== 'solid' || shells.length !== 1 || body.shells.length !== 1
    || body.shells[0] !== shell.id || shell.body !== body.id || !shell.closed || shell.faces.length !== 8
    || new Set(shell.faces).size !== 8 || faces.length !== 8 || !faces.every(face => shell.faces.includes(face.id))
    || loops.length !== 10 || coedges.length !== 36 || edges.length !== 18 || vertices.length !== 12) return undefined;

  const vertexById = byId(vertices), edgeById = byId(edges), loopById = byId(loops), coedgeById = byId(coedges), faceById = byId(faces);
  const points = vertices.map(vertex => vertex.point), extent = geometryScaleMM(points), tolerance = linearToleranceMM(extent);
  if (!(extent <= CadNumericPolicy.coordinateAbs) || !points.every(point => point.length === 3 && point.every(Number.isFinite))) return undefined;
  const heights = [...new Set(points.map(point => point[2]))].sort((a, b) => a - b), [lo, hi] = heights;
  if (heights.length !== 2 || !(hi - lo > tolerance)) return undefined;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
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
  function uses(face: BrepFace, kind: 'outer' | 'inner', count: number): Use[] | undefined {
    const matches = face.loops.map(id => loopById.get(id)).filter(loop => loop?.kind === kind);
    const [loop] = matches;
    if (matches.length !== 1 || !loop || loop.face !== face.id || loop.coedges.length !== count) return undefined;
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

  const caps = new Map<number, BrepFace>(), cylinders: BrepFace[] = [];
  for (const face of faces) {
    const surface = face.surface;
    if (surface.kind !== 'surface') return undefined;
    const { controlPoints, weights, degreeU, degreeV, knotsU, knotsV } = surface;
    if (degreeV !== 1 || !same(knotsV, lineKnots)) return undefined;

    if (face.loops.length === 2) {
      const z = controlPoints[0]?.[0]?.[2], up = z === hi;
      if ((!up && z !== lo) || caps.has(z) || face.sense !== 'forward') return undefined;
      const expected = capSurface({ min, max }, z, surface.id, up);
      if (degreeU !== 1 || !same(knotsU, lineKnots) || controlPoints.length !== 2 || weights.length !== 2
        || !controlPoints.every((row, i) => samePoles(row, expected.controlPoints[i]))
        || !weights.every(row => same(row, [1, 1]))) return undefined;
      const outer = uses(face, 'outer', 4), inner = uses(face, 'inner', 2);
      if (!outer || !inner) return undefined;
      const sides = new Set<number>();
      for (const { edge, neighbor } of outer) {
        const p = edge.curve.controlPoints;
        const corners = p.every(([x, y]) => (x === min[0] || x === max[0]) && (y === min[1] || y === max[1]));
        if (!line(edge.curve) || !corners
          || neighbor.loops.length !== 1 || neighbor.surface.kind !== 'surface' || neighbor.surface.degreeU !== 1) return undefined;
        const alongY = p[0][0] === p[1][0], alongX = p[0][1] === p[1][1];
        if (alongX === alongY) return undefined;
        const axis = alongY ? 0 : 1;
        sides.add(2 * axis + Number(p[0][axis] === max[axis]));
      }
      if (sides.size !== 4) return undefined;
      if (inner.some(({ neighbor }) => neighbor.loops.length !== 1 || neighbor.surface.kind !== 'surface' || neighbor.surface.degreeU !== 2)
        || new Set(inner.map(use => use.neighbor.id)).size !== 2) return undefined;
      const uv = ([x, y]: Point): Point => {
        const u = (x - min[0]) / (max[0] - min[0]), v = (y - min[1]) / (max[1] - min[1]);
        return up ? [u, v, 0] : [v, u, 0];
      };
      if ([...outer, ...inner].some(({ edge, pcurve }) => !level(edge, z) || !matchingPcurve(pcurve, edge.curve, uv))) return undefined;
      caps.set(z, face);
      continue;
    }

    const count = degreeU === 1 ? 2 : 5;
    if (face.loops.length !== 1 || (degreeU !== 1 && degreeU !== 2) || !same(knotsU, degreeU === 1 ? lineKnots : halfCircleKnots)
      || controlPoints.length !== count || weights.length !== count
      || !controlPoints.every(row => row.length === 2 && row[0][2] === lo && row[1][2] === hi
        && row[0][0] === row[1][0] && row[0][1] === row[1][1])
      || !weights.every(row => row.length === 2 && row[0] === row[1] && row[0] > 0 && Number.isFinite(row[0]))) return undefined;
    const boundary = uses(face, 'outer', 4);
    if (!boundary) return undefined;
    for (const [station, z] of [lo, hi].entries()) {
      const rails = boundary.filter(({ edge }) => level(edge, z)), [rail] = rails;
      if (rails.length !== 1 || rail.neighbor.loops.length !== 2) return undefined;
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
    } else {
      const [a, b] = controlPoints.map(row => row[0]), sense = face.sense === 'forward' ? 1 : -1;
      const side = (b[1] - a[1]) * (a[0] - (min[0] + max[0]) / 2) - (b[0] - a[0]) * (a[1] - (min[1] + max[1]) / 2);
      if (!(side * sense > 0)) return undefined;
    }
  }

  const bottom = caps.get(lo), top = caps.get(hi);
  if (!bottom || !top || cylinders.length !== 2 || !checkBrep(brep, { strict: true }).valid) return undefined;
  const diameter = createCylindricalBoreCheck(brep)(cylinders);
  const bore = faceGeometry(cylinders[0], extent);
  if (diameter === undefined || !(diameter > 2 * tolerance) || bore.kind !== 'cylinder'
    || bore.a[0] !== 0 || bore.a[1] !== 0) return undefined;
  const [x, y] = bore.c, radius = diameter / 2, left = x - radius - min[0];
  if (!(left > tolerance && max[0] - x - radius > tolerance
    && y - radius - min[1] > tolerance && max[1] - y - radius > tolerance)) return undefined;

  return { bottom, top, cylinders, lo, hi, anchorX: min[0] + left / 2, anchorY: y };
}

function admittedCap(brep: Brep, faceName: string): Cap | undefined {
  if (brep.faces.filter(face => face.name === faceName).length !== 1) return undefined;
  const plate = admittedBoredPlate(brep);
  if (!plate) return undefined;
  const { bottom, top, lo, hi, anchorX, anchorY } = plate;
  if (top.name !== faceName && bottom.name !== faceName) return undefined;
  const up = top.name === faceName;
  return { point: [anchorX, anchorY, up ? hi : lo], sign: up ? 1 : -1, opposite: up ? lo : hi };
}

/** A handle anchor on the material and its exact signed axial direction. */
export function boredCapOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const cap = admittedCap(brep, faceName);
  return cap && { anchor: cap.point, normal: [0, 0, cap.sign] };
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
  const moved = (point: Point): Point => point[2] === z ? [point[0], point[1], next] : point;
  const candidate: Brep = {
    ...brep,
    vertices: brep.vertices.map(vertex => vertex.point[2] === z ? { ...vertex, point: moved(vertex.point) } : vertex),
    edges: brep.edges.map(edge => edge.curve.controlPoints.some(point => point[2] === z)
      ? { ...edge, curve: { ...edge.curve, controlPoints: edge.curve.controlPoints.map(moved) } } : edge),
    faces: brep.faces.map(face => {
      if (face.surface.kind !== 'surface' || !face.surface.controlPoints.some(row => row.some(point => point[2] === z))) return face;
      return { ...face, surface: { ...face.surface, controlPoints: face.surface.controlPoints.map(row => row.map(moved)) } };
    }),
  };
  const report = checkBrep(candidate, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `bored cap offset: the offset solid is invalid: ${report.issues[0]}`, report);
  return candidate;
}

/** Select either native half of the sole bore and restore both of the original planar caps. */
export function healBoredPlateIfAdmitted(brep: Brep, faceName: string): Brep | undefined {
  if (typeof faceName !== 'string' || !faceName.trim() || faceName.includes('+')) return undefined;
  const plate = admittedBoredPlate(brep);
  if (!plate?.cylinders.some(face => face.name === faceName)) return undefined;

  const removed = new Set(plate.cylinders.map(face => face.id));
  const outerLoops = new Set(brep.loops.filter(loop => loop.kind === 'outer').map(loop => loop.id));
  const faces = brep.faces.filter(face => !removed.has(face.id)).map(face => face.loops.length === 1
    ? face : { ...face, loops: face.loops.filter(id => outerLoops.has(id)) });
  // Retain the existing outer shell topology and its pcurves. Only the two cap trim rings and the bore wall disappear.
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

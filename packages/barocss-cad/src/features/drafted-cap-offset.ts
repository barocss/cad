import { faceGeometry } from '../brep/analytic-boolean.js';
import { BrepError, checkBrep, type Brep, type BrepFace, type BrepVertex } from '../brep/brep-core.js';
import { dot, len, scale, sub } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';
import { capSurface } from './extruded-profile-solid.js';
import { affineChart, trimFits, uvPoint } from './prism-wall-offset.js';

type Axis = 0 | 1;
type End = 0 | 1;
type Range = [number, number];
type Rectangle = [Range, Range];
type Section = { readonly z: number; readonly ranges: Rectangle };
type FaceRole = { readonly axis: Axis | 2; readonly end: End };
type Plane = Extract<ReturnType<typeof faceGeometry>, { kind: 'plane' }>;
type Wall = { readonly axis: Axis; readonly end: End; readonly plane: Plane; readonly slope: number };
type Taper = {
  readonly sections: readonly [Section, Section];
  readonly caps: readonly [BrepFace, BrepFace];
  readonly walls: ReadonlyMap<string, Wall>;
};
type DraftedCap = Taper & {
  readonly end: End;
  readonly named: BrepFace;
  readonly opposite: BrepFace;
};

const XY_AXES = [0, 1] as const;
const ENDS = [0, 1] as const;
const LINEAR_KNOTS = [0, 0, 1, 1];

/** Exact corner incidence in a horizontal rectangle. Includes four independent vertices. */
function sectionOf(vertices: readonly BrepVertex[], z: number): Section | undefined {
  const points = vertices.filter(vertex => vertex.point[2] === z).map(vertex => vertex.point);
  if (points.length !== 4 || new Set(points.map(p => p.join(','))).size !== 4) return undefined;
  const levels = (axis: Axis) => [...new Set(points.map(p => p[axis]))].sort((a, b) => a - b);
  const x = levels(0), y = levels(1);
  if (x.length !== 2 || y.length !== 2) return undefined;
  return { z, ranges: [[x[0], x[1]], [y[0], y[1]]] };
}

function endOf(section: Section, point: Point, axis: Axis): End {
  return point[axis] === section.ranges[axis][0] ? 0 : 1;
}

function roleOf(corners: readonly Point[], base: Section, top: Section): FaceRole | undefined {
  if (corners.length !== 4 || new Set(corners).size !== 4) return undefined;
  const low = corners.filter(point => point[2] === base.z), high = corners.filter(point => point[2] === top.z);
  if (low.length === 4) return { axis: 2, end: 0 };
  if (high.length === 4) return { axis: 2, end: 1 };
  if (low.length !== 2 || high.length !== 2) return undefined;
  for (const axis of XY_AXES) for (const end of ENDS) {
    if (low.every(point => point[axis] === base.ranges[axis][end]) && high.every(point => point[axis] === top.ranges[axis][end]))
      return { axis, end };
  }
  return undefined;
}

function planeOf(face: BrepFace): Plane | undefined {
  const s = face.surface;
  if (s.kind !== 'surface' || s.degreeU !== 1 || s.degreeV !== 1 || s.controlPoints.length !== 2
    || s.controlPoints.some(row => row.length !== 2)) return undefined;
  try {
    const plane = faceGeometry(face);
    return plane.kind === 'plane' ? plane : undefined;
  } catch { return undefined; }
}

function wallAt(wall: Wall, z: number): number {
  return wall.plane.o[wall.axis] + (z - wall.plane.o[2]) * wall.slope;
}

/** A rounding allowance for agreeing on the native support, separate from general trim tolerances. */
function roundoffAt(points: readonly Point[]): number {
  return 64 * Number.EPSILON * Math.max(1, ...points.flatMap(p => p.map(Math.abs)));
}

/** One solid, two four-edge sections, four matching straight connectors and one support per side. */
function admittedTaper(brep: Brep, profile: 'taper' | 'box' = 'taper'): Taper | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  if (bodies.length !== 1 || bodies[0].kind !== 'solid' || bodies[0].shells.length !== 1 || shells.length !== 1
    || !shells[0].closed || faces.length !== 6 || loops.length !== 6 || coedges.length !== 24 || edges.length !== 12 || vertices.length !== 8) return undefined;
  const heights = [...new Set(vertices.map(vertex => vertex.point[2]))].sort((a, b) => a - b);
  if (heights.length !== 2) return undefined;
  const base = sectionOf(vertices, heights[0]), top = sectionOf(vertices, heights[1]);
  if (!base || !top) return undefined;
  const roundoff = roundoffAt(vertices.map(vertex => vertex.point));
  const widths = (s: Section, axis: Axis) => s.ranges[axis][1] - s.ranges[axis][0];
  if (profile === 'box') {
    const extent = geometryScaleMM(vertices.map(vertex => vertex.point)), linear = linearToleranceMM(extent);
    if (!(extent <= CadNumericPolicy.coordinateAbs && top.z - base.z > linear)
      || !XY_AXES.every(axis => widths(base, axis) > linear && ENDS.every(end => base.ranges[axis][end] === top.ranges[axis][end]))) return undefined;
  } else if (!XY_AXES.some(axis => Math.abs(widths(base, axis) - widths(top, axis)) > roundoff)) return undefined;

  const point = new Map(vertices.map(vertex => [vertex.id, vertex.point]));
  const edgeById = new Map(edges.map(edge => [edge.id, edge]));
  const coedgeById = new Map(coedges.map(coedge => [coedge.id, coedge]));
  const loopById = new Map(loops.map(loop => [loop.id, loop]));
  const pairs = new Set<string>();
  for (const edge of edges) {
    const [a, b] = edge.vertices.map(id => point.get(id));
    const poles = edge.curve.controlPoints, key = JSON.stringify([...edge.vertices].sort());
    if (!a || !b || pairs.has(key) || edge.curve.degree !== 1 || poles.length !== 2
      || !poles[0].every((value, i) => value === a[i]) || !poles[1].every((value, i) => value === b[i])) return undefined;
    pairs.add(key);
    const endA = a[2] === base.z ? base : top, endB = b[2] === base.z ? base : top;
    const differing = XY_AXES.filter(axis => endOf(endA, a, axis) !== endOf(endB, b, axis)).length;
    if (differing !== (endA === endB ? 1 : 0)) return undefined;
  }

  const walls = new Map<string, Wall>(), occupied = new Set<string>();
  const caps: [BrepFace?, BrepFace?] = [];
  for (const face of faces) {
    const loop = face.loops.length === 1 ? loopById.get(face.loops[0]) : undefined;
    if (loop?.kind !== 'outer' || loop.coedges.length !== 4) return undefined;
    const corners: Point[] = [];
    for (const id of loop.coedges) {
      const use = coedgeById.get(id), edge = use && edgeById.get(use.edge);
      const p = edge && point.get(edge.vertices[use!.sense === 'forward' ? 0 : 1]);
      if (!p) return undefined;
      corners.push(p);
    }
    const role = roleOf(corners, base, top);
    const plane = planeOf(face);
    if (!role || !plane || face.surface.kind !== 'surface') return undefined;
    const { axis, end } = role;
    if (!(plane.n[axis] * (end === 0 ? -1 : 1) > 0)) return undefined;
    const key = `${role.axis}:${role.end}`;
    if (occupied.has(key)) return undefined;
    occupied.add(key);
    const poles = face.surface.controlPoints.flat();
    if (axis === 2) {
      if (!poles.every(p => p[2] === (end === 0 ? base.z : top.z))) return undefined;
      caps[end] = face;
      continue;
    }
    const wall = { axis, end, plane, slope: -plane.n[2] / plane.n[axis] };
    // A generally valid B-rep may tolerate gaps. Require the trim and every pole on the same cardinal wall.
    if (![...poles, ...corners].every(p => Math.abs(p[axis] - wallAt(wall, p[2])) <= roundoff)) return undefined;
    walls.set(face.id, wall);
  }
  if (!caps[0] || !caps[1] || !checkBrep(brep, { strict: true }).valid) return undefined;
  return { sections: [base, top], caps: [caps[0], caps[1]], walls };
}

function admittedCap(taper: Taper, named: BrepFace): DraftedCap | undefined {
  const end = taper.caps[0] === named ? 0 : taper.caps[1] === named ? 1 : undefined;
  if (end === undefined) return undefined;
  return { ...taper, end, named, opposite: taper.caps[1 - end] };
}

function namedFace(brep: Brep, faceName: string): BrepFace | undefined {
  const faces = brep.faces.filter(face => face.name === faceName);
  return faces.length === 1 ? faces[0] : undefined;
}

function capFrame(cap: DraftedCap): { anchor: Point; normal: Point } {
  const { z, ranges: [[x0, x1], [y0, y1]] } = cap.sections[cap.end];
  return { anchor: [(x0 + x1) / 2, (y0 + y1) / 2, z], normal: [0, 0, cap.end === 0 ? -1 : 1] };
}

/** Locate the exact named end and its signed outward normal. */
export function draftedCapOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const face = namedFace(brep, faceName);
  if (!face) return undefined;
  try {
    const taper = admittedTaper(brep);
    const cap = taper && admittedCap(taper, face);
    return cap && capFrame(cap);
  } catch { return undefined; }
}

function inclinedWall(taper: Taper, face: BrepFace): Wall | undefined {
  const wall = taper.walls.get(face.id);
  if (!wall || face.surface.kind !== 'surface') return undefined;
  const poles = face.surface.controlPoints.flat();
  const coordinates = poles.map(p => p[wall.axis]);
  if (wall.plane.n[2] === 0 || Math.max(...coordinates) - Math.min(...coordinates) <= roundoffAt(poles)) return undefined;
  return wall;
}

/** Locate the native planar face under the direct Offset face command. */
export function draftedFaceOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const face = namedFace(brep, faceName);
  if (!face) return undefined;
  try {
    const taper = admittedTaper(brep);
    if (!taper) return undefined;
    const cap = admittedCap(taper, face);
    if (cap) return capFrame(cap);
    const wall = inclinedWall(taper, face);
    if (!wall) return undefined;
    const [base, top] = taper.sections, across: Axis = wall.axis === 0 ? 1 : 0;
    const anchor: Point = [0, 0, (base.z + top.z) / 2];
    anchor[wall.axis] = (base.ranges[wall.axis][wall.end] + top.ranges[wall.axis][wall.end]) / 2;
    anchor[across] = (base.ranges[across][0] + base.ranges[across][1] + top.ranges[across][0] + top.ranges[across][1]) / 4;
    return { anchor, normal: wall.plane.n };
  } catch { return undefined; }
}

/** Put the wall chart on its continued plane, enclosing the new trim without overhanging poles. */
function sideSurface(id: string, axis: Axis, end: End, base: Section, top: Section): Surface {
  const across: Axis = axis === 0 ? 1 : 0;
  const span = [Math.min(base.ranges[across][0], top.ranges[across][0]), Math.max(base.ranges[across][1], top.ranges[across][1])];
  const controlPoints = span.map(u => [base, top].map(({ z, ranges }): Point => {
    const v = ranges[axis][end];
    return axis === 0 ? [v, u, z] : [u, v, z];
  }));
  return { kind: 'surface', id, degreeU: 1, degreeV: 1, knotsU: LINEAR_KNOTS, knotsV: LINEAR_KNOTS, controlPoints, weights: [[1, 1], [1, 1]] };
}

function polesFit(surface: Surface): boolean {
  return surface.controlPoints.every(row => row.every(p => p.every(value => Math.abs(value) <= CadNumericPolicy.coordinateAbs)));
}

/** A wall chart spanning both sections can remain in place as the trim moves over it. */
function chartCovers(surface: Surface, wall: Wall, base: Section, top: Section): boolean {
  const poles = surface.controlPoints.flat(), across: Axis = wall.axis === 0 ? 1 : 0;
  const lo = Math.min(...poles.map(p => p[2])), hi = Math.max(...poles.map(p => p[2]));
  if (!(hi > lo) || base.z < lo || top.z > hi) return false;
  const [[p00, p01], [p10, p11]] = surface.controlPoints;
  // Two chart edges must follow the section levels without crossing between them.
  const uHorizontal = p00[2] === p10[2] && p01[2] === p11[2] && p00[2] !== p01[2];
  const vHorizontal = p00[2] === p01[2] && p10[2] === p11[2] && p00[2] !== p10[2];
  if ((!uHorizontal || Math.sign(p10[across] - p00[across]) !== Math.sign(p11[across] - p01[across]))
    && (!vHorizontal || Math.sign(p01[across] - p00[across]) !== Math.sign(p11[across] - p10[across]))) return false;
  const atLo = poles.filter(p => p[2] === lo).map(p => p[across]).sort((a, b) => a - b);
  const atHi = poles.filter(p => p[2] === hi).map(p => p[across]).sort((a, b) => a - b);
  if (atLo.length !== 2 || atHi.length !== 2 || !(atLo[0] < atLo[1] && atHi[0] < atHi[1])) return false;
  // Two horizontal boundary edges enclosing the two sections also enclose their connecting lines.
  const at = (z: number, end: End) => atLo[end] + (atHi[end] - atLo[end]) * ((z - lo) / (hi - lo));
  const roundoff = roundoffAt(poles);
  return [base, top].every(({ z, ranges }) => ranges[across][0] >= at(z, 0) - roundoff && ranges[across][1] <= at(z, 1) + roundoff);
}

function fail(code: BrepError['code'], detail: string): never {
  throw new BrepError(code, 'drafted cap offset: ' + detail);
}

/** Move the named Z-facing cap outwards by a signed distance along its existing planar supports. */
export function offsetDraftedCap(brep: Brep, faceName: string, distance: number): Brep {
  if (typeof distance !== 'number' || !Number.isFinite(distance)) fail('INPUT', 'distance must be finite');
  const face = namedFace(brep, faceName);
  if (!face) fail('INPUT', 'the selected face name is missing or ambiguous');
  const taper = admittedTaper(brep);
  const cap = taper && admittedCap(taper, face);
  if (!cap) fail('GEOMETRY', 'pick a Z-facing cap of one solid with tapered planar walls and rectangular sections');
  return offsetCap(brep, cap, distance);
}

function offsetCap(brep: Brep, cap: DraftedCap, distance: number): Brep {
  if (distance === 0) return brep;
  const { sections, end, named, opposite, walls } = cap, outward = end === 0 ? -1 : 1;
  const selected = sections[end], fixed = sections[1 - end], z = selected.z + outward * distance;
  if (z === selected.z) fail('GEOMETRY', 'distance is too small to move the cap');
  const far: Section = { z, ranges: [[0, 0], [0, 0]] };
  for (const wall of walls.values()) far.ranges[wall.axis][wall.end] = wallAt(wall, z);
  const extent = Math.max(Math.abs(fixed.z), Math.abs(z), ...fixed.ranges.flat().map(Math.abs), ...far.ranges.flat().map(Math.abs));
  // The retained cap's chart can be padded beyond its four trim corners.
  const fixedFits = opposite.surface.kind === 'surface' && polesFit(opposite.surface);
  if (!Number.isFinite(extent) || extent > CadNumericPolicy.coordinateAbs || !fixedFits)
    fail('GEOMETRY', 'the offset exceeds the modeling coordinate range');
  const linear = linearToleranceMM(extent);
  if ((z - fixed.z) * outward <= linear || far.ranges.some(([lo, hi]) => hi - lo <= linear))
    fail('GEOMETRY', 'the offset would close a wall or cross the opposite cap');
  const [base, top] = end === 0 ? [far, fixed] : [fixed, far];

  const vertices = brep.vertices.map(vertex => {
    const p = vertex.point;
    if (p[2] === fixed.z) return vertex;
    const point: Point = [far.ranges[0][endOf(selected, p, 0)], far.ranges[1][endOf(selected, p, 1)], z];
    return { ...vertex, point };
  });
  const point = new Map(vertices.map(vertex => [vertex.id, vertex.point]));
  const edges = brep.edges.map(edge => {
    const [a, b] = edge.vertices.map(id => point.get(id)!);
    if (a[2] === fixed.z && b[2] === fixed.z) return edge;
    return { ...edge, curve: { ...edge.curve, controlPoints: [a, b] } };
  });
  const faces = brep.faces.map(face => {
    if (face === named) {
      const [[x0, x1], [y0, y1]] = far.ranges;
      return { ...face, sense: 'forward' as const, surface: capSurface({ min: [x0, y0], max: [x1, y1] }, z, face.surface.id, end === 1) };
    }
    const wall = walls.get(face.id);
    if (!wall) return face; // The opposite cap and its own trim are unchanged.
    if (face.surface.kind === 'surface' && polesFit(face.surface) && chartCovers(face.surface, wall, base, top)) return face;
    const { axis, end: wallEnd } = wall;
    const sense = wallChartSense(wall);
    const adjusted = { ...face, sense, surface: sideSurface(face.surface.id, axis, wallEnd, base, top) };
    const plane = planeOf(adjusted), normalError = plane ? Math.hypot(...plane.n.map((n, i) => n - wall.plane.n[i])) : Infinity;
    const span = Math.max(1, ...base.ranges.map(([lo, hi]) => hi - lo), ...top.ranges.map(([lo, hi]) => hi - lo), top.z - base.z);
    if (normalError * span > linear) fail('GEOMETRY', 'the offset cannot preserve the side wall planes at this distance');
    return adjusted;
  });
  const unchanged = opposite.loops[0];
  const coedges = brep.coedges.map(coedge => coedge.loop === unchanged ? coedge : { ...coedge, pcurve: null });
  const result: Brep = { ...brep, vertices, edges, faces, coedges };
  const report = checkBrep(result, { strict: true });
  if (!report.valid) fail('GEOMETRY', `the offset solid is invalid: ${report.issues[0]}`);
  return result;
}


/** Expand a transverse wall chart across the retouched trim, keeping its original pull interval if possible. */
function extendWallChart(surface: Surface, wall: Wall, base: Section, top: Section): Surface {
  const poles = surface.controlPoints.flat();
  const lo = Math.min(...poles.map(p => p[2])), hi = Math.max(...poles.map(p => p[2]));
  const extend = (section: Section, z: number): Section => {
    const ranges: Rectangle = [[...section.ranges[0]], [...section.ranges[1]]];
    ranges[wall.axis][wall.end] = wallAt(wall, z);
    return { z, ranges };
  };
  if (lo <= base.z && hi >= top.z) {
    const extended = sideSurface(surface.id, wall.axis, wall.end, extend(base, lo), extend(top, hi));
    if (polesFit(extended)) return extended;
  }
  return sideSurface(surface.id, wall.axis, wall.end, base, top);
}

function wallChartSense(wall: Wall): BrepFace['sense'] {
  return (wall.axis === 1 ? wall.end === 0 : wall.end === 1) ? 'forward' : 'reversed';
}

function offsetWall(brep: Brep, taper: Taper, face: BrepFace, wall: Wall, distance: number): Brep {
  if (distance === 0) return brep;
  const { axis, end } = wall;
  // The new wall obeys n · (p − o) = distance. Its four corners keep their Z and transverse coordinates.
  const shift = distance / wall.plane.n[axis];
  const sections = taper.sections.map((section): Section => {
    const ranges: Rectangle = [[...section.ranges[0]], [...section.ranges[1]]];
    ranges[axis][end] += shift;
    if (ranges[axis][end] === section.ranges[axis][end]) fail('GEOMETRY', 'distance is too small to move the inclined wall');
    return { ...section, ranges };
  });
  const [base, top] = sections;
  const extent = Math.max(...sections.flatMap(section => [Math.abs(section.z), ...section.ranges.flat().map(Math.abs)]));
  if (!Number.isFinite(extent) || extent > CadNumericPolicy.coordinateAbs)
    fail('GEOMETRY', 'the offset exceeds the modeling coordinate range');
  const linear = linearToleranceMM(extent);
  if (sections.some(section => section.ranges.some(([lo, hi]) => hi - lo <= linear)))
    fail('GEOMETRY', 'the offset would close a section or cross the opposite wall');

  const moved = new Map<string, Point>();
  const vertices = brep.vertices.map(vertex => {
    const original = vertex.point, level = original[2] === base.z ? 0 : 1;
    if (original[axis] !== taper.sections[level].ranges[axis][end]) return vertex;
    const point: Point = [...original];
    point[axis] = sections[level].ranges[axis][end];
    moved.set(vertex.id, point);
    return { ...vertex, point };
  });
  const changedEdges = new Set<string>();
  const edges = brep.edges.map(edge => {
    const a = moved.get(edge.vertices[0]), b = moved.get(edge.vertices[1]);
    if (!a && !b) return edge;
    changedEdges.add(edge.id);
    return { ...edge, curve: { ...edge.curve, controlPoints: [a ?? edge.curve.controlPoints[0], b ?? edge.curve.controlPoints[1]] } };
  });
  const changedCharts = new Set<string>();
  const faces = brep.faces.map(current => {
    const support = taper.walls.get(current.id);
    let surface: Surface, sense: BrepFace['sense'];
    if (!support) {
      const section = current === taper.caps[0] ? base : top;
      const [[x0, x1], [y0, y1]] = section.ranges;
      surface = capSurface({ min: [x0, y0], max: [x1, y1] }, section.z, current.surface.id, section === top);
      sense = 'forward';
    } else if (current === face) {
      const original = current.surface as Surface;
      const controlPoints = original.controlPoints.map(row => row.map((p): Point => {
        const translated: Point = [...p];
        translated[axis] += shift;
        return translated;
      }));
      surface = { ...original, controlPoints };
      sense = current.sense;
      if (!polesFit(surface) || !chartCovers(surface, wall, base, top)) {
        surface = sideSurface(surface.id, axis, end, base, top);
        sense = wallChartSense(wall);
      }
    } else {
      const original = current.surface as Surface;
      if (polesFit(original) && chartCovers(original, support, base, top)) return current;
      surface = extendWallChart(original, support, base, top);
      sense = wallChartSense(support);
    }
    const adjusted = { ...current, sense, surface };
    if (support) {
      const plane = planeOf(adjusted);
      const normalError = plane ? Math.hypot(...plane.n.map((n, i) => n - support.plane.n[i])) : Infinity;
      const poles = surface.controlPoints.flat(), expectedDistance = current === face ? distance : 0;
      const allowance = roundoffAt([...poles, support.plane.o]);
      const across: Axis = support.axis === 0 ? 1 : 0;
      const corners = sections.flatMap(({ z, ranges }) => ranges[across].map((u): Point => {
        const v = ranges[support.axis][support.end];
        return support.axis === 0 ? [v, u, z] : [u, v, z];
      }));
      const span = Math.max(1, top.z - base.z, ...sections.flatMap(section => section.ranges.map(([lo, hi]) => hi - lo)));
      if (normalError * span > linear || [...poles, ...corners].some(point => {
        const signed = point.reduce((sum, x, i) => sum + (x - support.plane.o[i]) * support.plane.n[i], 0);
        return Math.abs(signed - expectedDistance) > allowance;
      }))
        fail('GEOMETRY', 'the offset cannot preserve the wall supports at this distance');
    }
    for (const loop of current.loops) changedCharts.add(loop);
    return adjusted;
  });
  const coedges = brep.coedges.map(coedge => coedge.pcurve && (changedEdges.has(coedge.edge) || changedCharts.has(coedge.loop))
    ? { ...coedge, pcurve: null } : coedge);
  const result: Brep = { ...brep, vertices, edges, faces, coedges };
  const report = checkBrep(result, { strict: true });
  if (!report.valid) fail('GEOMETRY', `the offset solid is invalid: ${report.issues[0]}`);
  return result;
}

/** Move one cap or inclined wall of an admitted rectangular taper along its outward unit normal. */
export function offsetDraftedFace(brep: Brep, faceName: string, distance: number): Brep {
  if (typeof distance !== 'number' || !Number.isFinite(distance)) fail('INPUT', 'distance must be finite');
  const face = namedFace(brep, faceName);
  if (!face) fail('INPUT', 'the selected face name is missing or ambiguous');
  const taper = admittedTaper(brep);
  if (!taper) fail('GEOMETRY', 'pick one planar face of a solid with tapered walls and rectangular sections');
  const cap = admittedCap(taper, face);
  if (cap) return offsetCap(brep, cap, distance);
  const wall = inclinedWall(taper, face);
  if (!wall) fail('GEOMETRY', 'pick a Z-facing cap or one inclined wall of the rectangular taper');
  return offsetWall(brep, taper, face, wall, distance);
}

type ReplacementPlane = { readonly origin: Point; readonly normal: Point };

function certifiedBoxWall(brep: Brep, faceName: string) {
  const face = namedFace(brep, faceName), box = face && admittedTaper(brep, 'box');
  const wall = face && box?.walls.get(face.id);
  return face && box && wall ? { face, box, wall } : undefined;
}

/** The exact selected side and its original outward direction for Replace face picks. */
export function boxWallReplacementFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const admitted = certifiedBoxWall(brep, faceName);
  if (!admitted) return undefined;
  const { box, wall } = admitted, [base, top] = box.sections, across = wall.axis === 0 ? 1 : 0;
  const anchor: Point = [0, 0, (base.z + top.z) / 2];
  anchor[wall.axis] = base.ranges[wall.axis][wall.end];
  anchor[across] = (base.ranges[across][0] + base.ranges[across][1]) / 2;
  return { anchor, normal: wall.plane.n };
}

function replacementFailure(code: BrepError['code'], detail: string): never {
  throw new BrepError(code, `Replace face: ${detail}`);
}

const finitePoint = (value: unknown): value is Point => Array.isArray(value) && value.length === 3 && value.every(component => typeof component === 'number' && Number.isFinite(component));

function continuedSections(box: Taper, wall: Wall, plane: ReplacementPlane): { sections: [Section, Section]; wanted: Plane } {
  if (!plane || typeof plane !== 'object' || Array.isArray(plane) || Object.keys(plane).sort().join(',') !== 'normal,origin'
    || !finitePoint(plane.origin) || !finitePoint(plane.normal)) return replacementFailure('INPUT', 'the reference needs a finite origin and normal.');
  const magnitude = len(plane.normal);
  if (!Number.isFinite(magnitude) || magnitude === 0) return replacementFailure('INPUT', 'the reference normal must have a finite nonzero length.');
  const { axis, end } = wall, across = axis === 0 ? 1 : 0;
  const n: Point = [plane.normal[0] / magnitude, plane.normal[1] / magnitude, plane.normal[2] / magnitude];
  const roundoff = 64 * Number.EPSILON;
  if (Math.abs(n[across]) > roundoff || Math.abs(n[axis]) <= roundoff || Math.abs(n[2]) <= roundoff)
    return replacementFailure('GEOMETRY', 'the reference plane must tilt only along the height of the selected wall.');
  const withPlane = ({ z, ranges }: Section): Section => {
    const next: Rectangle = [[...ranges[0]], [...ranges[1]]];
    next[axis][end] = plane.origin[axis] - (z - plane.origin[2]) * n[2] / n[axis];
    return { z, ranges: next };
  };
  const sections: [Section, Section] = [withPlane(box.sections[0]), withPlane(box.sections[1])];
  const extent = Math.max(...plane.origin.map(Math.abs), ...sections.flatMap(section => [Math.abs(section.z), ...section.ranges.flat().map(Math.abs)]));
  if (!(extent <= CadNumericPolicy.coordinateAbs)) return replacementFailure('GEOMETRY', 'the replacement exceeds the modeling coordinate range.');
  const linear = linearToleranceMM(extent);
  if (sections.some(section => section.ranges[axis][1] - section.ranges[axis][0] <= linear))
    return replacementFailure('GEOMETRY', 'the replacement would reach or cross the opposite wall at one end.');
  if (Math.abs(sections[1].ranges[axis][end] - sections[0].ranges[axis][end]) <= linear)
    return replacementFailure('GEOMETRY', 'the reference plane tilt is too small for this wall.');
  return { sections, wanted: { kind: 'plane', o: plane.origin, n: dot(n, wall.plane.n) > 0 ? n : scale(n, -1) } };
}

/** Replace a cardinal wall of a strict box with the chosen transverse-axis-invariant plane. */
export function replaceBoxWall(brep: Brep, faceName: string, plane: ReplacementPlane): Brep {
  const admitted = certifiedBoxWall(brep, faceName);
  if (!admitted) return replacementFailure('GEOMETRY', 'pick one upright wall of a straight rectangular box.');
  const { face, box, wall } = admitted, { axis, end } = wall;
  const { sections: [base, top], wanted } = continuedSections(box, wall, plane);
  const moved = new Map<string, Point>();
  const vertices = brep.vertices.map(vertex => {
    if (vertex.point[axis] !== box.sections[0].ranges[axis][end]) return vertex;
    const point: Point = [...vertex.point];
    point[axis] = (point[2] === base.z ? base : top).ranges[axis][end];
    moved.set(vertex.id, point);
    return { ...vertex, point };
  });
  const changed = new Set<string>();
  const edges = brep.edges.map(edge => {
    const [a, b] = edge.vertices.map(id => moved.get(id));
    if (!a && !b) return edge;
    changed.add(edge.id);
    return { ...edge, curve: { ...edge.curve, controlPoints: [a ?? edge.curve.controlPoints[0], b ?? edge.curve.controlPoints[1]] } };
  });

  const point = new Map(vertices.map(vertex => [vertex.id, vertex.point]));
  const edgeById = new Map(edges.map(edge => [edge.id, edge]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const charts = new Map<string, NonNullable<ReturnType<typeof affineChart>>>(), changedLoops = new Set<string>();
  const faces = brep.faces.map(current => {
    const loop = loops.get(current.loops[0])!;
    const corners = loop.coedges.map(id => {
      const use = uses.get(id)!, edge = edgeById.get(use.edge)!;
      return point.get(edge.vertices[use.sense === 'forward' ? 0 : 1])!;
    });
    const support = box.walls.get(current.id), original = current.surface as Surface;
    const originalChart = affineChart(original, current.sense);
    const allowance = roundoffAt([...corners, ...original.controlPoints.flat(), wanted.o]);
    if (current !== face && originalChart && corners.every(p => trimFits(originalChart, p, allowance))) {
      charts.set(loop.id, originalChart);
      return current;
    }

    let surface: Surface, sense: BrepFace['sense'];
    if (current === face) {
      surface = sideSurface(original.id, axis, end, base, top);
      sense = wallChartSense(wall);
    } else if (support) {
      surface = extendWallChart(original, support, base, top);
      sense = wallChartSense(support);
    } else {
      const section = current === box.caps[0] ? base : top, [[x0, x1], [y0, y1]] = section.ranges;
      surface = capSurface({ min: [x0, y0], max: [x1, y1] }, section.z, original.id, section === top);
      sense = 'forward';
    }
    const chart = affineChart(surface, sense);
    const continued = current === face ? wanted : support?.plane ?? planeOf(current);
    const poles = surface.controlPoints.flat();
    const roundoff = roundoffAt([...poles, ...corners, ...(continued ? [continued.o] : [])]);
    if (!continued || !chart || !polesFit(surface) || len(sub(chart.normal, continued.n)) > 128 * Number.EPSILON
      || [...poles, ...corners].some(p => Math.abs(dot(sub(p, continued.o), continued.n)) > roundoff)
      || corners.some(p => !trimFits(chart, p, roundoff)))
      return replacementFailure('GEOMETRY', 'the replacement cannot preserve the planar supports and their trims.');
    charts.set(loop.id, chart);
    changedLoops.add(loop.id);
    return { ...current, surface, sense };
  });
  const coedges = brep.coedges.map(use => {
    if (!use.pcurve || (!changed.has(use.edge) && !changedLoops.has(use.loop))) return use;
    const { curve } = edgeById.get(use.edge)!, chart = charts.get(use.loop)!;
    return { ...use, pcurve: { ...curve, id: use.pcurve.id, controlPoints: curve.controlPoints.map(p => uvPoint(chart, p)) } };
  });
  const result: Brep = { ...brep, vertices, edges, faces, coedges };
  const report = checkBrep(result, { strict: true });
  if (!report.valid) return replacementFailure('GEOMETRY', `the replacement solid is invalid: ${report.issues[0]}`);
  return result;
}

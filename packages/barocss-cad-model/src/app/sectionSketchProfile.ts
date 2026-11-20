import { CadNumericPolicy, faceGeometry, type Brep } from '@barocss/cad';
import type { SketchNode } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { segmentDistance, signedArea } from '../engine/geom2';
import { cutAfter } from '../engine/ids';
import type { DisplayFace, DisplayMesh, Vec3 } from '../engine/mesh';
import { nativeCircleOf } from '../engine/nativeCircle';
import { dot, len, sub } from '../engine/vec3';
import { planeOfDisplayFace, planeOfFace, toLocal, type SketchPlane } from '../sketch/plane';
import type { LoopSegment, P2 } from '../sketch/profile';
import { completeFaceBoundary, faceProfile, faceProfileTolerance, fitLoop } from './faceProfile';
import { sampleLoop } from './profiles';

export type SectionOutlineMode = 'all' | 'outer' | 'inner';
type SectionProfile = Extract<SketchNode, { profile: 'loop' }>;
type Failure = 'no-inner' | 'unsupported' | 'unreadable';
type Boundary = { plane: SketchPlane; outer: LoopSegment[]; holes: LoopSegment[][]; tolerance: number };
type NativeBoundary = { status: 'known'; boundary: Boundary } | { status: 'unsupported' | 'unreadable' };
export type SectionCapEvidence = { faceId: string; name: string } & NativeBoundary;

const fullTurn = 2 * Math.PI;
const positiveAngle = (angle: number) => {
  const remainder = angle % fullTurn;
  return remainder < 0 ? remainder + fullTurn : remainder;
};
const gap = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const finitePoint = (point: Vec3) => point.every(Number.isFinite);

/** Compact evidence from the exact worker output. The original body and its mesh are not changed. */
export function nativeSectionCaps(brep: Brep, mesh: DisplayMesh, from: number): SectionCapEvidence[] {
  const faces = brep.faces.filter(face => face.name && cutAfter(face.name, from));
  if (!faces.length) return [];
  // A merged display face can retain the common base name without keeping every member ID.
  const mergedNames = new Set(mesh.faces.filter(face => !face.nativePlaneName).flatMap(face => face.name.split('+')));
  const indices = {
    loops: new Map(brep.loops.map(loop => [loop.id, loop])),
    uses: new Map(brep.coedges.map(use => [use.id, use])),
    edges: new Map(brep.edges.map(edge => [edge.id, edge])),
    vertices: new Map(brep.vertices.map(vertex => [vertex.id, vertex.point])),
  };
  return faces.map(face => {
    const unsupported = brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid'
      || mergedNames.has(face.name!) || mergedNames.has(face.name!.replace(/#\d+$/, ''));
    return { faceId: face.id, name: face.name!, ...(unsupported ? { status: 'unsupported' as const } : nativeBoundary(face, indices)) };
  });
}

function nativeBoundary(face: Brep['faces'][number], { loops, uses, edges, vertices }: {
  loops: ReadonlyMap<string, Brep['loops'][number]>; uses: ReadonlyMap<string, Brep['coedges'][number]>;
  edges: ReadonlyMap<string, Brep['edges'][number]>; vertices: ReadonlyMap<string, Vec3>;
}): NativeBoundary {
  if (face.surface.kind !== 'surface' || face.loops.length > 3) return { status: 'unsupported' };
  const geometry = faceGeometry(face);
  if (geometry.kind !== 'plane') return { status: 'unsupported' };
  const plane = planeOfFace(geometry.n, geometry.o);
  if (!plane || !finitePoint(plane.origin) || !face.loops.length) return { status: 'unreadable' };
  const span = Math.max(...face.surface.controlPoints.flat().map(p => len(sub(p, geometry.o))));
  const tolerance = Math.max(CadNumericPolicy.linearTolerance, span * CadNumericPolicy.relativeLinearTolerance);
  const inPlane = (point: Vec3) => finitePoint(point) && Math.abs(dot(sub(point, plane.origin), plane.normal)) <= tolerance;
  const outers: LoopSegment[][] = [], holes: LoopSegment[][] = [];
  for (const id of face.loops) {
    const loop = loops.get(id);
    if (!loop || loop.face !== face.id || !loop.coedges.length) return { status: 'unreadable' };
    const segments: LoopSegment[] = [];
    let first: string | undefined, end: string | undefined;
    for (const useId of loop.coedges) {
      const use = uses.get(useId), edge = use && edges.get(use.edge);
      if (!use || use.loop !== loop.id || !edge) return { status: 'unreadable' };
      const forward = use.sense === 'forward';
      const [a, b] = forward ? edge.vertices : [...edge.vertices].reverse();
      if (end !== undefined && a !== end) return { status: 'unreadable' };
      first ??= a;
      end = b;
      const start = vertices.get(a), finish = vertices.get(b);
      const { curve } = edge;
      if (!start || !finish || !inPlane(start) || !inPlane(finish)) return { status: 'unreadable' };
      const start2 = toLocal(plane, start);
      const line = curve.degree === 1 && curve.controlPoints.length === 2 && curve.weights.length === 2
        && curve.weights[0] > 0 && curve.weights[0] === curve.weights[1];
      const circle = line ? undefined : nativeCircleOf(curve);
      if (!line && !circle) return { status: 'unsupported' };
      const startPole = curve.controlPoints[forward ? 0 : curve.controlPoints.length - 1];
      const finishPole = curve.controlPoints[forward ? curve.controlPoints.length - 1 : 0];
      if (len(sub(startPole, start)) > tolerance || len(sub(finishPole, finish)) > tolerance) return { status: 'unreadable' };
      if (!circle) {
        if (a === b) return { status: 'unreadable' };
        segments.push({ kind: 'line', start: start2 });
        continue;
      }
      const alignment = dot(circle.normal, plane.normal);
      if (!inPlane(circle.centre) || Math.abs(alignment) < 1 - 1e-9) return { status: 'unreadable' };
      const direction = alignment * (forward ? 1 : -1) > 0 ? 'ccw' : 'cw';
      segments.push({ kind: 'arc', start: start2, center: toLocal(plane, circle.centre), direction });
    }
    if (end !== first || !usableLoop(segments)) return { status: 'unreadable' };
    (loop.kind === 'outer' ? outers : holes).push(segments);
  }
  if (outers.length !== 1) return { status: 'unreadable' };
  return { status: 'known', boundary: { plane, outer: outers[0], holes, tolerance } };
}

function usableLoop(loop: readonly LoopSegment[]): boolean {
  if (!loop.length || (loop.length === 1 && loop[0].kind !== 'arc')) return false;
  return loop.every(segment => segment.start.every(Number.isFinite)
    && (segment.kind !== 'arc' || (segment.center.every(Number.isFinite) && gap(segment.start, segment.center) > 0)));
}

/** Compare against the bounded trim, including the end points of a partial circular arc. */
function onLoop(point: P2, loop: readonly LoopSegment[], tolerance: number): boolean {
  return loop.some((segment, index) => {
    const start = segment.start, end = loop[(index + 1) % loop.length].start;
    if (segment.kind === 'line') return segmentDistance(point, start, end) <= tolerance;
    const { center } = segment, direction = segment.direction === 'ccw' ? 1 : -1;
    const angle = (p: P2) => Math.atan2(p[1] - center[1], p[0] - center[0]);
    const origin = angle(start), sweep = positiveAngle(direction * (angle(end) - origin));
    if (loop.length === 1 || positiveAngle(direction * (angle(point) - origin)) <= sweep)
      return Math.abs(gap(point, center) - gap(start, center)) <= tolerance;
    return Math.min(gap(point, start), gap(point, end)) <= tolerance;
  });
}

function agreesWithNative(points: readonly P2[], fit: LoopSegment[], native: LoopSegment[], tolerance: number): boolean {
  return points.every(p => onLoop(p, native, tolerance))
    && sampleLoop(fit).every(p => onLoop(p, native, tolerance))
    && sampleLoop(native).every(p => onLoop(p, fit, tolerance));
}

type CopyResult = { ok: true; profile: SectionProfile } | { ok: false; reason: Failure };

/** Filter only after the complete displayed copy agrees with the original native section trims. */
export function sectionSketchProfile(body: BodyResult, face: DisplayFace, mode: SectionOutlineMode): CopyResult {
  if (body.mesh.faces[face.index] !== face) return { ok: false, reason: 'unreadable' };
  const read = body.sectionCaps?.find(cap => cap.faceId === face.id);
  const merged = !read && !face.nativePlaneName && body.sectionCaps?.some(cap => cap.status === 'unsupported'
    && face.name.split('+').some(name => name === cap.name || name === cap.name.replace(/#\d+$/, '')));
  if (read?.status === 'unsupported' || merged) {
    if (mode !== 'all') return { ok: false, reason: 'unsupported' };
    const profile = faceProfile(body.mesh, face.index);
    return profile ? { ok: true, profile } : { ok: false, reason: 'unreadable' };
  }
  if (read?.status !== 'known' || read.name !== face.nativePlaneName || face.facet || face.name.includes('+'))
    return { ok: false, reason: 'unreadable' };
  const { boundary } = read;
  const plane = planeOfDisplayFace(face);
  const rings = completeFaceBoundary(body.mesh, face.index);
  const fitTolerance = faceProfileTolerance(body.mesh);
  // A fitted point is rounded to 0.0001 mm per coordinate by fitLoop.
  const comparison = fitTolerance + 1e-4;
  if (!plane || !rings || rings.length !== boundary.holes.length + 1
    || !Number.isFinite(comparison)
    || dot(plane.normal, boundary.plane.normal) < 1 - 1e-9
    || len(sub(plane.origin, boundary.plane.origin)) > boundary.tolerance
    || rings.some(ring => ring.some(point => Math.abs(dot(sub(point, boundary.plane.origin), boundary.plane.normal)) > comparison)))
    return { ok: false, reason: 'unreadable' };
  const fitted = rings.map(ring => {
    const points = ring.map(point => toLocal(plane, point));
    const area = signedArea(points);
    const ccw = area < 0 ? [...points].reverse() : points;
    return { area, points: ccw, segments: fitLoop(ccw, fitTolerance) };
  }).sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const [outer, ...holes] = fitted;
  if (!(outer.area > 0) || holes.some(hole => !(hole.area < 0))
    || fitted.some(ring => !usableLoop(ring.segments))
    || !agreesWithNative(outer.points, outer.segments, boundary.outer, comparison))
    return { ok: false, reason: 'unreadable' };
  const remaining = [...boundary.holes];
  for (const hole of holes) {
    const index = remaining.findIndex(native => agreesWithNative(hole.points, hole.segments, native, comparison));
    if (index < 0) return { ok: false, reason: 'unreadable' };
    remaining.splice(index, 1);
  }

  const profile = { kind: 'sketch', profile: 'loop', plane } as const;
  if (mode === 'inner') {
    const [first, ...other] = holes;
    return first ? { ok: true, profile: { ...profile, segments: first.segments, ...(other.length ? { regions: other.map(ring => ring.segments) } : {}) } }
      : { ok: false, reason: 'no-inner' };
  }
  return { ok: true, profile: { ...profile, segments: outer.segments,
    ...(mode === 'all' && holes.length ? { holes: holes.map(ring => ring.segments) } : {}) } };
}

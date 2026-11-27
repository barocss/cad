// Dimensions on a drawing: what can be picked in a view (edge ends, circle centres, edges), how a
// dimension's references resolve against the current projection, and the value it reads — always
// from the model's 3D geometry in mm, so a dimension follows the part as it changes.
import type { BrepProjection, ProjectedCurve, ProjectedEdge } from '@barocss/cad';
import { isSectionRef } from './types';
import type { CentreRef, DimPoint, DimView, DrawingDimension, DrawingViews, EdgeRef, Vec3, XY } from './types';
import { dot } from '../engine/vec3';
import type { DrawingFrame } from './controls';
import { nextFreeId } from '../util/ids';
import { formatNumber, type LengthFormat, type UnitPrecision } from './standard';
import type { DrawingDetail } from './detail';
import { reflexAngle } from './reflexAngle';
import { resolveArcLengthEdge } from './arcLength';
import { resolveChamferEdges } from './chamferDim';
import { resolveRadialThicknessEdges } from './radialThickness';
import { resolveCylinderDiameter } from './cylinderDiameter';
import { resolveCircleSeparationEdges } from './circleSeparation';
import { resolveVirtualSharpInProjection } from './virtualSharp';
import { resolveCenterOfMassPoint, type DrawingBodyMassSource } from './centerOfMass';

const sub3 = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist3 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** A model point in the view's 2D frame (mm). */
export const inView = (pr: BrepProjection, p: readonly number[]): XY => [dot(p, pr.right), dot(p, pr.up)];

/** A point a dimension can start or end at, in view coordinates. */
export interface SnapPoint { at: XY; ref: DimPoint }

/** Edge ends and circle centres of a view (one per position). */
export function snapPoints(pr: BrepProjection): SnapPoint[] {
  // (O172, F8: where edges coincide on the view — a shaft's two Ø25 shoulders seen end on, a key's top on the step's
  // outline — the point is a visible edge's when one is: the first one found could be the hidden one, and a dimension to
  // it measured to a hidden line though the same line shows.)
  const out: SnapPoint[] = [], shown: boolean[] = [];
  for (const e of pr.edges) {
    const pieceVisible = e.pieces.some(p => p.visible), visible = !e.pieces.length || pieceVisible;
    if (e.ends) for (const p of e.ends) addSnap(pr, out, shown, e, 'end', p, visible);
    if (e.circle) addSnap(pr, out, shown, e, 'center', e.circle.center, roundIn(pr, e) ? pieceVisible : visible);
  }
  return out;
}
function addSnap(pr: BrepProjection, out: SnapPoint[], shown: boolean[], edge: ProjectedEdge, at: DimPoint['at'], p: readonly number[], visible: boolean): void {
  const q = inView(pr, p), ref: DimPoint = { edge: edge.name, at, near: [p[0], p[1], p[2]] };
  for (let k = 0; k < out.length; k++) if (Math.hypot(out[k].at[0] - q[0], out[k].at[1] - q[1]) < 1e-6) {
    if (visible && !shown[k]) { out[k] = { at: q, ref }; shown[k] = true; }
    return;
  }
  out.push({ at: q, ref }); shown.push(visible);
}

/** Whether a circle shows true (round) in the view: its plane faces the viewer. */
export const roundIn = (pr: BrepProjection, e: ProjectedEdge) => !!e.circle && Math.abs(dot(e.circle.normal, pr.toward)) > 1 - 1e-6;

/** The nearest edge to a view point, within `tol` (view mm). */
export function edgeAt(pr: BrepProjection, p: XY, tol: number, visibleOnly = false): ProjectedEdge | null {
  let best: ProjectedEdge | null = null, bestD = tol;
  for (const e of pr.edges) for (const piece of e.pieces) {
    if (visibleOnly && !piece.visible) continue;
    const d = distanceTo(piece.curve, p);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function distanceTo(c: ProjectedCurve, p: XY): number {
  const seg = (a: readonly number[], b: readonly number[]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dd = dx * dx + dy * dy, t = dd > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / dd)) : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  };
  if (c.kind === 'line') return seg(c.a, c.b);
  const pts = c.kind === 'polyline' ? c.points : arcPoints(c, 96);
  let d = Infinity; for (let k = 1; k < pts.length; k++) d = Math.min(d, seg(pts[k - 1], pts[k]));
  return d;
}

export function arcPoints(c: Extract<ProjectedCurve, { kind: 'arc' }>, n: number): XY[] {
  return Array.from({ length: n + 1 }, (_, k) => { const t = c.t0 + (c.t1 - c.t0) * k / n; return [c.center[0] + c.u[0] * Math.cos(t) + c.v[0] * Math.sin(t), c.center[1] + c.u[1] * Math.cos(t) + c.v[1] * Math.sin(t)] as XY; });
}

/** A dimension point on the current model (null: its edge or mass source is gone). */
export function resolvePoint(pr: BrepProjection, ref: DimPoint, comSources?: ReadonlyMap<string, DrawingBodyMassSource>): Vec3 | null {
  if (ref.at === 'com') return resolveCenterOfMassPoint(ref.bodyKey, comSources);
  if (ref.at === 'pcd') { const c = pitchCircle(pr, ref.ring ?? []); return c && c.center; }
  if (ref.at === 'virtual-sharp') {
    if (!ref.second) return null;
    const vs = resolveVirtualSharpInProjection(pr, { edge: ref.edge, near: ref.near }, ref.second);
    return vs.ok ? vs.geometry.point3 : null;
  }
  const edges = pr.edges.filter(e => e.name === ref.edge);
  let best: Vec3 | null = null, bestD = Infinity;
  for (const e of edges) {
    const cands = ref.at === 'center' ? (e.circle ? [e.circle.center] : []) : (e.ends ?? []);
    for (const p of cands) { const d = dist3(p, ref.near); if (d < bestD) { bestD = d; best = [p[0], p[1], p[2]]; } }
  }
  return best;
}

/**
 * The circle through holes' centres (each the centre of the circle of its edge nearest its point): its centre, radius,
 * axis and the members, and whether they are evenly spaced round it. Null when a member is gone, fewer than three
 * remain, or they no longer lie on one circle (to 1e-6 of its radius).
 */
export function pitchCircle(pr: BrepProjection, ring: readonly CentreRef[]): { center: Vec3; radius: number; normal: Vec3; members: Vec3[]; even: boolean } | null {
  if (ring.length < 3) return null;
  const members: Vec3[] = [];
  for (const m of ring) { const p = resolvePoint(pr, { edge: m.edge, at: 'center', near: m.near }); if (!p) return null; members.push(p); }
  // The circumcentre of the first three; every member as far from it.
  const [a, b, c] = members, ab = sub3(b, a), ac = sub3(c, a), n = cross3(ab, ac), nn = dot(n, n);
  if (nn < 1e-18) return null;
  const t1 = cross3(n, ab), t2 = cross3(ac, n), k1 = dot(ac, ac) / (2 * nn), k2 = dot(ab, ab) / (2 * nn);
  const center: Vec3 = [a[0] + t1[0] * k1 + t2[0] * k2, a[1] + t1[1] * k1 + t2[1] * k2, a[2] + t1[2] * k1 + t2[2] * k2];
  const radius = dist3(a, center);
  if (members.some(p => Math.abs(dist3(p, center) - radius) > 1e-6 * Math.max(1, radius))) return null;
  const l = Math.sqrt(nn), normal: Vec3 = [n[0] / l, n[1] / l, n[2] / l];
  // Evenly spaced: every member's nearest neighbour round the circle 360°/n away.
  const u = sub3(a, center), v = cross3(normal, u), angle = (p: Vec3) => { const d = sub3(p, center); return ((Math.atan2(dot(d, v), dot(d, u)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); };
  const angles = members.map(angle).sort((x, y) => x - y), step = 2 * Math.PI / members.length;
  const even = angles.every((x, i) => Math.abs((i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI) - x - step) <= 1e-6);
  return { center, radius, normal, members, even };
}
const cross3 = (a: readonly number[], b: readonly number[]): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface ResolvedArcLength {
  ok: true;
  kind: 'arc-length';
  dim: Extract<DrawingDimension, { kind: 'arc-length' }>;
  center: XY;
  radius: number;
  startAngle: number;
  sweep: number;
  midAngle: number;
  ends: readonly [XY, XY];
  value: number;
  text: string;
  alt?: string;
}

export interface ResolvedChamfer {
  ok: true;
  kind: 'chamfer';
  dim: Extract<DrawingDimension, { kind: 'chamfer' }>;
  midpoint: XY;
  angleDeg: number;
  value: number;
  text: string;
  alt?: string;
}

export interface ResolvedRadialThickness {
  ok: true;
  kind: 'radial-thickness';
  dim: Extract<DrawingDimension, { kind: 'radial-thickness' }>;
  center: XY;
  innerRadius: number;
  outerRadius: number;
  dir: XY;
  innerPoint: XY;
  outerPoint: XY;
  value: number;
  text: string;
  alt?: string;
}

export interface ResolvedCylinderDiameter {
  ok: true;
  kind: 'cylinder-diameter';
  dim: Extract<DrawingDimension, { kind: 'cylinder-diameter' }>;
  generator: readonly [XY, XY];
  opposite: readonly [XY, XY];
  anchor: XY;
  axisPoint: XY;
  axisDir: XY;
  radialDir: XY;
  radius: number;
  value: number;
  text: string;
  alt?: string;
}

export interface ResolvedCircleSeparation {
  ok: true;
  kind: 'circle-separation';
  dim: Extract<DrawingDimension, { kind: 'circle-separation' }>;
  centerA: XY;
  centerB: XY;
  radiusA: number;
  radiusB: number;
  pointA: XY;
  pointB: XY;
  mode: 'min' | 'max';
  value: number;
  text: string;
  alt?: string;
}

/** `alt` (11 ③b): on a dual drawing, the same text in the other unit; the sheet sets it, resolving never does. */
export type Resolved = (
  | { ok: true; kind: 'linear'; dim: Extract<DrawingDimension, { kind: 'linear' }>; a: XY; b: XY; value: number; text: string; alt?: string }
  | { ok: true; kind: 'diameter' | 'radius'; dim: Extract<DrawingDimension, { kind: 'diameter' | 'radius' }>; center: XY; radius: number; value: number; text: string; alt?: string; detailArcs?: readonly CircularArc[]; radiusRim?: XY }
  | ResolvedArcLength
  | ResolvedChamfer
  | ResolvedRadialThickness
  | ResolvedCylinderDiameter
  | ResolvedCircleSeparation
  /** `vertex`: where the two lines meet; `from`/`to`: the sector's bounding directions (counter-clockwise from → to); `ends`: each edge's far end from the vertex. */
  | { ok: true; kind: 'angle'; dim: Extract<DrawingDimension, { kind: 'angle' }>; vertex: XY; from: XY; to: XY; ends: [XY, XY]; value: number; text: string; alt?: string }
  /** A pitch circle (R14.5): `center` in the view, `center3` in the model, `radius` (mm), `members` in the view; `value` its diameter. */
  | { ok: true; kind: 'pcd'; dim: Extract<DrawingDimension, { kind: 'pcd' }>; center: XY; center3: Vec3; radius: number; members: XY[]; even: boolean; value: number; text: string; alt?: string }) & { /** Transient common nominal precision selected by the sheet when an explicit tolerance and fit share it. Never authored or saved. */ shownPrecision?: UnitPrecision; /** Transient fractional-inch fallback marker when a nonzero plain inch value is smaller than half the fraction grid. Never authored or saved. */ fractionFallback?: 'below-grid' }
  | { ok: false; dim: DrawingDimension; reason: string };

/** A value to 0.01 mm, leading zero kept and trailing zeros trimmed: the metric rule of both standards (standard.ts `formatNumber` takes another). */
export const fmtMM = (v: number) => formatNumber(v);

/** What a resolved dimension reads, its lengths in `f` (an angle never converts). */
export function valueText(r: { kind: Extract<Resolved, { ok: true }>['kind']; value: number; members?: unknown[]; even?: boolean }, f: LengthFormat): string {
  switch (r.kind) {
    case 'angle': return `${fmtMM(r.value)}°`;
    case 'pcd': return `Ø${f(r.value)} PCD${r.even ? ` · ${r.members!.length}× EQ SP` : ''}`;
    case 'linear': return f(r.value);
    case 'diameter':
    case 'cylinder-diameter': return `Ø${f(r.value)}`;
    case 'arc-length': return `ARC ${f(r.value)}`;
    case 'chamfer': return `${f(r.value)} × 45°`;
    case 'radial-thickness':
    case 'circle-separation': return f(r.value);
    default: return `R${f(r.value)}`;
  }
}

/** Linear value between two model points as the dimension orients it. */
export function linearValue(pr: BrepProjection, a: readonly number[], b: readonly number[], orient: 'horizontal' | 'vertical' | 'aligned') {
  const d = sub3(b, a), du = dot(d, pr.right), dv = dot(d, pr.up);
  return orient === 'horizontal' ? Math.abs(du) : orient === 'vertical' ? Math.abs(dv) : Math.hypot(du, dv);
}

/** A straight edge on the current model: its two ends in view coordinates (null: gone, or not straight). */
export function resolveLine(pr: BrepProjection, ref: EdgeRef): [XY, XY] | null {
  let best: [XY, XY] | null = null, bestD = Infinity;
  for (const e of pr.edges) {
    if (e.name !== ref.edge || !e.ends || (e.kind !== 'line' && e.kind !== 'silhouette') || e.circle) continue;
    const [p, q] = e.ends, m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], d = dist3(m, ref.near);
    if (d < bestD) { bestD = d; best = [inView(pr, p), inView(pr, q)]; }
  }
  return best;
}

/**
 * The angle between two lines in a view, in the sector (of the four they make) that holds `place`:
 * degrees from the model's exact edge ends, as the lines show in the view.
 */
export function angleBetween(a: [XY, XY], b: [XY, XY], place: XY): { vertex: XY; from: XY; to: XY; ends: [XY, XY]; degrees: number } | null {
  const da: XY = [a[1][0] - a[0][0], a[1][1] - a[0][1]], db: XY = [b[1][0] - b[0][0], b[1][1] - b[0][1]];
  const den = da[0] * db[1] - da[1] * db[0], la = Math.hypot(...da), lb = Math.hypot(...db);
  if (Math.abs(den) <= 1e-9 * la * lb) return null; // parallel
  const t = ((b[0][0] - a[0][0]) * db[1] - (b[0][1] - a[0][1]) * db[0]) / den, X: XY = [a[0][0] + da[0] * t, a[0][1] + da[1] * t];
  const far = (l: [XY, XY]): XY => Math.hypot(l[0][0] - X[0], l[0][1] - X[1]) > Math.hypot(l[1][0] - X[0], l[1][1] - X[1]) ? l[0] : l[1];
  const rays = [[da[0] / la, da[1] / la], [-da[0] / la, -da[1] / la], [db[0] / lb, db[1] / lb], [-db[0] / lb, -db[1] / lb]].map(r => ({ r: r as XY, at: Math.atan2(r[1], r[0]) }));
  const at = Math.atan2(place[1] - X[1], place[0] - X[0]), norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // The rays just before and after the placement direction (counter-clockwise), one from each line.
  const sorted = rays.map((r, k) => ({ ...r, line: k < 2 ? 0 : 1, off: norm(r.at - at) })).sort((p, q) => p.off - q.off);
  const to = sorted[0], from = sorted[sorted.length - 1];
  if (to.line === from.line) return null;
  const degrees = norm(to.at - from.at) * 180 / Math.PI;
  return { vertex: X, from: from.r, to: to.r, ends: [far(a), far(b)], degrees };
}

type CircularArc = Extract<ProjectedCurve, { kind: 'arc' }>;
const noDrawableDetailArc = 'No drawable circular arc of the referenced edge remains in this detail.';
function closestCircleEdge(pr: BrepProjection, dim: Pick<Extract<DrawingDimension, { kind: 'diameter' | 'radius' }>, 'edge' | 'near'>): ProjectedEdge | undefined {
  let closest: ProjectedEdge | undefined, distance = Infinity;
  for (const edge of pr.edges) if (edge.name === dim.edge && edge.circle) {
    const next = dist3(edge.circle.center, dim.near);
    if (next < distance) { distance = next; closest = edge; }
  }
  return closest;
}
/** Nearest point to the current label on the selected edge's drawable, clipped circular pieces. */
export function closestDetailRim(arcs: readonly CircularArc[], label: XY): XY | undefined {
  const turn = 2 * Math.PI;
  let best: XY | undefined, distance = Infinity;
  for (const curve of arcs) {
    const [dx, dy] = [label[0] - curve.center[0], label[1] - curve.center[1]];
    const angle = Math.atan2(dx * curve.v[0] + dy * curve.v[1], dx * curve.u[0] + dy * curve.u[1]);
    const lo = Math.min(curve.t0, curve.t1), hi = Math.max(curve.t0, curve.t1);
    const lifted = angle + turn * Math.round(((lo + hi) / 2 - angle) / turn);
    const t = Math.max(lo, Math.min(hi, lifted)), cos = Math.cos(t), sin = Math.sin(t);
    const point: XY = [curve.center[0] + curve.u[0] * cos + curve.v[0] * sin, curve.center[1] + curve.u[1] * cos + curve.v[1] * sin];
    const d = Math.hypot(label[0] - point[0], label[1] - point[1]);
    if (d < distance - 1e-10) { best = point; distance = d; }
  }
  return best;
}
export function resolveDimension(views: Partial<Record<DimView, BrepProjection>> & Pick<DrawingViews, 'nativeTop'>, dim: DrawingDimension, detail?: Pick<DrawingDetail, 'center' | 'radius'>, showHidden = false, detailParent?: BrepProjection, comSources?: ReadonlyMap<string, DrawingBodyMassSource>): Resolved {
  const pr = views[dim.view];
  if (!pr) return { ok: false, dim, reason: `Its view (${dim.view}) is not on the sheet.` };
  // A missing projected reference does not establish that its source feature was deleted.
  const section = isSectionRef(dim.view);
  const missingEdge = section ? 'An edge it measured cannot be found in the current section. Check the section position and the source feature.' : 'An edge it measured is no longer in the part.';
  if (dim.kind === 'angle') {
    if (dim.mode !== undefined) {
      if (dim.mode !== 'reflex' || dim.view !== 'top') return { ok: false, dim, reason: 'Reflex angle: mode must be reflex on an ordinary Top angle dimension.' };
      const g = reflexAngle(pr, views.nativeTop, dim.a, dim.b);
      if (!g.ok) return { ok: false, dim, reason: g.reason };
      return { ok: true, kind: 'angle', dim, vertex: g.vertex, from: g.from, to: g.to, ends: g.ends,
        value: g.degrees, text: valueText({ kind: 'angle', value: g.degrees }, fmtMM) };
    }
    const a = resolveLine(pr, dim.a), b = resolveLine(pr, dim.b);
    if (!a || !b) return { ok: false, dim, reason: missingEdge };
    const g = angleBetween(a, b, dim.place);
    if (!g) return { ok: false, dim, reason: 'Its two edges are now parallel in this view.' };
    return { ok: true, kind: 'angle', dim, vertex: g.vertex, from: g.from, to: g.to, ends: g.ends, value: g.degrees, text: valueText({ kind: 'angle', value: g.degrees }, fmtMM) };
  }
  if (dim.kind === 'pcd') {
    const c = pitchCircle(pr, dim.ring);
    if (!c) return { ok: false, dim, reason: section ? 'Its holes cannot be resolved as one circle in the current section. Check the section position and the source features.' : 'Its holes are gone, or no longer on one circle.' };
    if (Math.abs(dot(c.normal, pr.toward)) < 1 - 1e-6) return { ok: false, dim, reason: 'Its circle no longer shows round in this view.' };
    return { ok: true, kind: 'pcd', dim, center: inView(pr, c.center), center3: c.center, radius: c.radius, members: c.members.map(p => inView(pr, p)), even: c.even, value: 2 * c.radius, text: valueText({ kind: 'pcd', value: 2 * c.radius, members: c.members, even: c.even }, fmtMM) };
  }
  if (dim.kind === 'linear') {
    const hasCom = dim.a.at === 'com' || dim.b.at === 'com';
    if (hasCom && dim.view !== 'front' && dim.view !== 'top' && dim.view !== 'right') {
      return { ok: false, dim, reason: 'Center-of-mass dimensions are supported only on ordinary front, top, and right views.' };
    }
    const a = resolvePoint(pr, dim.a, comSources), b = resolvePoint(pr, dim.b, comSources);
    if (!a || !b) {
      const missingCom = (!a && dim.a.at === 'com') || (!b && dim.b.at === 'com');
      return { ok: false, dim, reason: missingCom ? 'Its center-of-mass source body is unavailable, excluded, or pending exact mass calculation.' : missingEdge };
    }
    const value = linearValue(pr, a, b, dim.orient);
    if (value < 1e-9) return { ok: false, dim, reason: 'Its two points now coincide in this view.' };
    return { ok: true, kind: 'linear', dim, a: inView(pr, a), b: inView(pr, b), value, text: valueText({ kind: 'linear', value }, fmtMM) };
  }
  if (dim.kind === 'circle-separation') {
    const resolved = resolveCircleSeparationEdges(pr, dim.first, dim.second, dim.mode, dim.view);
    if (!resolved.ok) return { ok: false, dim, reason: resolved.reason };
    const g = resolved.geometry;
    return {
      ok: true,
      kind: 'circle-separation',
      dim,
      centerA: g.centerA,
      centerB: g.centerB,
      radiusA: g.radiusA,
      radiusB: g.radiusB,
      pointA: g.pointA,
      pointB: g.pointB,
      mode: g.mode,
      value: g.value,
      text: valueText({ kind: 'circle-separation', value: g.value }, fmtMM),
    };
  }
  if (dim.kind === 'cylinder-diameter') {
    const resolved = resolveCylinderDiameter(pr, dim.cylinder, dim.view);
    if (!resolved.ok) return { ok: false, dim, reason: resolved.reason };
    const g = resolved.geometry;
    return {
      ok: true,
      kind: 'cylinder-diameter',
      dim,
      generator: g.generator,
      opposite: g.opposite,
      anchor: g.anchor,
      axisPoint: g.axisPoint,
      axisDir: g.axisDir,
      radialDir: g.radialDir,
      radius: g.radius,
      value: g.diameter,
      text: valueText({ kind: 'cylinder-diameter', value: g.diameter }, fmtMM),
    };
  }
  if (dim.kind === 'radial-thickness') {
    const resolved = resolveRadialThicknessEdges(pr, dim.first, dim.second, dim.view, dim.place);
    if (!resolved.ok) return { ok: false, dim, reason: resolved.reason };
    const g = resolved.geometry;
    return {
      ok: true,
      kind: 'radial-thickness',
      dim,
      center: g.center,
      innerRadius: g.innerRadius,
      outerRadius: g.outerRadius,
      dir: g.dir,
      innerPoint: g.innerPoint,
      outerPoint: g.outerPoint,
      value: g.thickness,
      text: valueText({ kind: 'radial-thickness', value: g.thickness }, fmtMM),
    };
  }
  if (dim.kind === 'chamfer') {
    if (dim.tol || dim.basic || dim.count !== undefined || dim.auto) {
      return { ok: false, dim, reason: '45° chamfer dimensions do not support tolerances, basic frames, count multipliers, or Auto-dimension.' };
    }
    const resolved = resolveChamferEdges(pr, dim.chamfer, dim.adjacent, dim.view);
    if (!resolved.ok) return { ok: false, dim, reason: resolved.reason };
    const g = resolved.geometry;
    return {
      ok: true,
      kind: 'chamfer',
      dim,
      midpoint: g.midpoint,
      angleDeg: g.angleDeg,
      value: g.setback,
      text: valueText({ kind: 'chamfer', value: g.setback }, fmtMM),
    };
  }
  if (dim.kind === 'arc-length') {
    const resolved = resolveArcLengthEdge(pr, dim.arc, dim.view, showHidden);
    if (!resolved.ok) return { ok: false, dim, reason: resolved.reason };
    const g = resolved.geometry;
    return {
      ok: true,
      kind: 'arc-length',
      dim,
      center: g.center,
      radius: g.radius,
      startAngle: g.startAngle,
      sweep: g.sweep,
      midAngle: g.midAngle,
      ends: g.ends,
      value: g.value,
      text: valueText({ kind: 'arc-length', value: g.value }, fmtMM),
    };
  }
  const best = closestCircleEdge(pr, dim);
  if (!best?.circle) {
    const source = dim.kind === 'diameter' && detail && detailParent && closestCircleEdge(detailParent, dim);
    return { ok: false, dim, reason: source ? noDrawableDetailArc : section ? 'The circle it measured cannot be found in the current section. Check the section position and the source feature.' : 'The circle it measured is no longer in the part.' };
  }
  if (!roundIn(pr, best)) return { ok: false, dim, reason: 'The circle no longer shows round in this view.' };
  const r = best.circle.radius, nominalRadius = best.circle.nominalRadius ?? r;
  const value = dim.kind === 'diameter' ? 2 * nominalRadius : nominalRadius;
  const center = inView(pr, best.circle.center);
  let detailArcs: CircularArc[] | undefined;
  if (dim.kind === 'diameter' && detail && Math.hypot(center[0] - detail.center[0], center[1] - detail.center[1]) + r > detail.radius + 1e-9) {
    detailArcs = [];
    const radius2 = r * r, tolerance = 1e-10 * radius2;
    for (const { curve, visible } of best.pieces) {
      if (curve.kind !== 'arc' || (!visible && !showHidden)) continue;
      const [ux, uy] = curve.u, [vx, vy] = curve.v;
      if (Math.abs(ux * ux + uy * uy - radius2) <= tolerance && Math.abs(vx * vx + vy * vy - radius2) <= tolerance
        && Math.abs(ux * vx + uy * vy) <= tolerance) detailArcs.push(curve);
    }
    if (!detailArcs.length) return { ok: false, dim, reason: noDrawableDetailArc };
  }
  const radiusRim = dim.kind === 'radius' ? closestDetailRim(best.pieces.flatMap(({ curve, visible }) =>
    curve.kind === 'arc' && (visible || showHidden) ? [curve] : []), dim.place) : undefined;
  return { ok: true, kind: dim.kind, dim, center, radius: r, value, ...(radiusRim ? { radiusRim } : {}), text: valueText({ kind: dim.kind, value }, fmtMM), ...(detailArcs ? { detailArcs } : {}) };
}

/**
 * How a linear dimension between two view points reads, from where it is placed: above or below
 * them (within their width) horizontal, beside them vertical, otherwise along them.
 */
export function orientFor(a: XY, b: XY, place: XY): 'horizontal' | 'vertical' | 'aligned' {
  const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), tiny = 1e-6 * Math.max(1, dx, dy);
  if (dy <= tiny) return 'horizontal';
  if (dx <= tiny) return 'vertical';
  const inU = place[0] >= Math.min(a[0], b[0]) && place[0] <= Math.max(a[0], b[0]), inV = place[1] >= Math.min(a[1], b[1]) && place[1] <= Math.max(a[1], b[1]);
  if (inU && !inV) return 'horizontal';
  if (inV && !inU) return 'vertical';
  return 'aligned';
}

/** Existing dimension identities, including missing targets still held by authored control frames. */
export const reservedDimensionIds = (dims: readonly DrawingDimension[], frames: readonly DrawingFrame[] = []): Set<string> =>
  new Set([...dims.map(d => d.id), ...frames.flatMap(frame => frame.dim === undefined ? [] : [frame.dim])]);
export const newDimensionId = (dims: readonly DrawingDimension[], frames: readonly DrawingFrame[] = []) => nextFreeId('d', reservedDimensionIds(dims, frames));

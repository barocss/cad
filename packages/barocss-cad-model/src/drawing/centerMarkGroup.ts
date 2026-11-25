// Source-bound linear center mark group for 3 to 32 distinct, visible, unclipped, coplanar,
// equal-radius, strictly collinear full circular holes in an ordinary unbroken orthographic view
// (`front`, `top`, `right`). Computes ordered center-to-center connecting segments independent of
// pick order without duplicating automatic center crosses or auto-enrolling future holes.
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import { nextFreeId } from '../util/ids';
import type { CentreRef, DrawingCenterMarkGroup, SectionViewId, Vec3, XY } from './types';

export const MIN_CENTER_MARK_GROUP_MEMBERS = 3;
export const MAX_CENTER_MARK_GROUP_MEMBERS = 32;

export interface CenterMarkGroupMemberGeometry {
  /** Resolved persistent edge name. */
  readonly edge: string;
  /** Projected 2D hole center in view coordinates (mm). */
  readonly center: XY;
  /** Exact 3D hole center in model coordinates (mm). */
  readonly center3: Vec3;
  /** Hole radius (mm). */
  readonly radius: number;
}

export interface CenterMarkGroupGeometry {
  /** Resolved members sorted along the canonical row axis. */
  readonly members: readonly CenterMarkGroupMemberGeometry[];
  /** Common hole radius across all members (mm). */
  readonly radius: number;
  /** Canonical unit row direction in view coordinates (mm). */
  readonly axis: XY;
  /** Adjacent center-to-center connecting line segments along the sorted row (view mm). */
  readonly segments: readonly (readonly [XY, XY])[];
}

export type CenterMarkGroupResolveResult =
  | { readonly ok: true; readonly geometry: CenterMarkGroupGeometry }
  | { readonly ok: false; readonly reason: string };

export type CenterMarkGroupCirclePickResult =
  | { readonly ok: true; readonly ref: CentreRef; readonly radius: number; readonly center3: Vec3 }
  | { readonly ok: false; readonly reason: string };

export type ResolvedCenterMarkGroup =
  | { readonly ok: true; readonly item: DrawingCenterMarkGroup; readonly geometry: CenterMarkGroupGeometry }
  | { readonly ok: false; readonly item: DrawingCenterMarkGroup; readonly reason: string };

const TWO_PI = 2 * Math.PI;
const NORMAL_TOL = 1e-6;

function sub3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function projectPoint(pr: BrepProjection, p: readonly number[]): XY {
  return [dot(p, pr.right), dot(p, pr.up)];
}

function isPrincipalOrthoView(view: string): view is SectionViewId {
  return view === 'front' || view === 'top' || view === 'right';
}

function isRoundInView(pr: BrepProjection, edge: ProjectedEdge): boolean {
  return !!edge.circle && Math.abs(dot(edge.circle.normal, pr.toward)) > 1 - NORMAL_TOL;
}

/**
 * True when `edge` is a fully visible, unclipped 360° circular rim (including seam-split
 * 180°+180° rims whose visible pieces together form a complete 2π turn at the same 3D plane).
 */
function isVisibleFullCircleInProjection(pr: BrepProjection, edge: ProjectedEdge): boolean {
  const c = edge.circle;
  if (!c || edge.kind !== 'circle') return false;
  if (!edge.pieces.length || !edge.pieces.every(p => p.visible)) return false;
  if (c.full) return true;
  const tol = 1e-4 * Math.max(1, c.radius);
  let totalVisibleSweep = 0;
  for (const other of pr.edges) {
    if (other.kind !== 'circle' || !other.circle) continue;
    if (!other.pieces.length || !other.pieces.every(p => p.visible)) continue;
    const oc = other.circle;
    if (Math.abs(oc.radius - c.radius) > tol) continue;
    if (dist3(oc.center, c.center) > tol) continue;
    if (Math.abs(dot(oc.normal, c.normal)) < 1 - NORMAL_TOL) continue;
    totalVisibleSweep += oc.full ? TWO_PI : oc.sweep;
    if (totalVisibleSweep >= TWO_PI - 1e-4) return true;
  }
  return false;
}

/** Generate the next unused hole-row center mark group ID (`cmg1`, `cmg2`, ...). */
export function newCenterMarkGroupId(existing: readonly DrawingCenterMarkGroup[] = []): string {
  return nextFreeId('cmg', new Set(existing.map(item => item.id)));
}

/** Validate a single hovered or clicked circular edge for a hole-row center mark group in `view`. */
export function pickCenterMarkGroupCircle(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: string,
): CenterMarkGroupCirclePickResult {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Hole row center mark groups are supported only on ordinary front, top, and right views.' };
  }
  if (edge.kind === 'silhouette') {
    return { ok: false, reason: 'Silhouettes are not supported for hole row center mark groups. Select visible full circular holes.' };
  }
  if (edge.kind !== 'circle' || !edge.circle) {
    return { ok: false, reason: 'Select a visible full circular hole. Straight edges and non-circular curves are not supported.' };
  }
  if (!edge.pieces.length || !edge.pieces.every(p => p.visible)) {
    return { ok: false, reason: 'Select a fully visible, unclipped circular hole in this view.' };
  }
  if (!isRoundInView(pr, edge)) {
    return { ok: false, reason: 'This circle does not show round in this view. Select holes in a view where they show true.' };
  }
  if (!Number.isFinite(edge.circle.radius) || edge.circle.radius <= 1e-6) {
    return { ok: false, reason: 'The selected circle has an invalid radius.' };
  }
  if (!isVisibleFullCircleInProjection(pr, edge)) {
    return { ok: false, reason: 'Partial or clipped arcs are not supported for hole row center mark groups. Select full circular holes.' };
  }
  const center3: Vec3 = [edge.circle.center[0], edge.circle.center[1], edge.circle.center[2]];
  return {
    ok: true,
    ref: { edge: edge.name, near: [...center3] as Vec3 },
    radius: edge.circle.radius,
    center3,
  };
}

function resolveUniqueVisibleFullCircle(
  pr: BrepProjection,
  ref: CentreRef,
  index: number,
): { ok: true; edge: ProjectedEdge } | { ok: false; reason: string } {
  const label = `member #${index + 1}`;
  if (!ref.edge || !Array.isArray(ref.near) || ref.near.length !== 3 || !ref.near.every(Number.isFinite)) {
    return { ok: false, reason: `Hole row ${label} has an invalid reference.` };
  }
  const named = pr.edges.filter(e => e.name === ref.edge);
  if (!named.length) {
    return { ok: false, reason: `Hole row ${label} (${ref.edge}) is no longer in the part.` };
  }
  const valid: { edge: ProjectedEdge; distance: number; radius: number }[] = [];
  let rejectedReason: string | null = null;
  for (const edge of named) {
    if (edge.kind === 'silhouette') {
      rejectedReason ??= `Hole row ${label} is a silhouette, which is not supported.`;
      continue;
    }
    if (edge.kind !== 'circle' || !edge.circle) {
      rejectedReason ??= `Hole row ${label} is no longer a circular edge.`;
      continue;
    }
    if (!edge.pieces.length || !edge.pieces.every(p => p.visible)) {
      rejectedReason ??= `Hole row ${label} is hidden or partially clipped in this view.`;
      continue;
    }
    if (!isRoundInView(pr, edge)) {
      rejectedReason ??= `Hole row ${label} no longer shows round in this view.`;
      continue;
    }
    if (!Number.isFinite(edge.circle.radius) || edge.circle.radius <= 1e-6) {
      rejectedReason ??= `Hole row ${label} has an invalid radius.`;
      continue;
    }
    if (!isVisibleFullCircleInProjection(pr, edge)) {
      rejectedReason ??= `Hole row ${label} is a partial or clipped arc, not a full circular hole.`;
      continue;
    }
    valid.push({ edge, distance: dist3(edge.circle.center, ref.near), radius: edge.circle.radius });
  }
  if (!valid.length) {
    return { ok: false, reason: rejectedReason ?? `Hole row ${label} cannot be resolved.` };
  }
  valid.sort((a, b) => a.distance - b.distance);
  if (valid.length > 1) {
    const tieTol = 1e-4 * Math.max(1, valid[0].radius);
    if (Math.abs(valid[1].distance - valid[0].distance) <= tieTol) {
      return { ok: false, reason: `Multiple circles with reference ${ref.edge} overlap at ${label}.` };
    }
  }
  return { ok: true, edge: valid[0].edge };
}

/**
 * Validate adding `candidate` to an in-progress draft list of `existing` members before creation.
 * Checks coplanarity, equal radius, distinct centers, count limit, and collinearity once 3+ exist.
 */
export function validateCenterMarkGroupCandidate(
  pr: BrepProjection,
  existing: readonly CentreRef[],
  candidate: CentreRef,
  view: string,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Hole row center mark groups are supported only on ordinary front, top, and right views.' };
  }
  if (existing.length >= MAX_CENTER_MARK_GROUP_MEMBERS) {
    return { ok: false, reason: `A hole row can contain at most ${MAX_CENTER_MARK_GROUP_MEMBERS} holes.` };
  }
  const cand = resolveUniqueVisibleFullCircle(pr, candidate, existing.length);
  if (!cand.ok) return cand;
  if (existing.length === 0) return { ok: true };

  const cc = cand.edge.circle!;
  const baseResolved = resolveUniqueVisibleFullCircle(pr, existing[0], 0);
  if (!baseResolved.ok) return baseResolved;
  const bc = baseResolved.edge.circle!;
  const tol = 1e-4 * Math.max(1, bc.radius);

  if (Math.abs(dot(cc.normal, bc.normal)) < 1 - NORMAL_TOL || Math.abs(dot(sub3(cc.center, bc.center), bc.normal)) > tol) {
    return { ok: false, reason: 'All holes in a row must lie in the same 3D plane.' };
  }
  if (Math.abs(cc.radius - bc.radius) > tol) {
    return { ok: false, reason: 'All holes in a row must have the same radius.' };
  }
  for (let i = 0; i < existing.length; i++) {
    const prev = resolveUniqueVisibleFullCircle(pr, existing[i], i);
    if (!prev.ok) return prev;
    if (dist3(cc.center, prev.edge.circle!.center) <= tol) {
      return { ok: false, reason: 'That hole is already in the row. Select a distinct circular hole.' };
    }
  }
  if (existing.length >= 2) {
    const full = resolveCenterMarkGroup(pr, [...existing, candidate], view);
    if (!full.ok) return { ok: false, reason: full.reason };
  }
  return { ok: true };
}

/**
 * Resolve 3 to 32 distinct, visible, unclipped, coplanar, equal-radius, strictly collinear full
 * circular holes in an ordinary orthographic view and return canonical sorted center segments.
 */
export function resolveCenterMarkGroup(
  pr: BrepProjection,
  members: readonly CentreRef[],
  view: string,
): CenterMarkGroupResolveResult {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Hole row center mark groups are supported only on ordinary front, top, and right views.' };
  }
  if (members.length < MIN_CENTER_MARK_GROUP_MEMBERS || members.length > MAX_CENTER_MARK_GROUP_MEMBERS) {
    return { ok: false, reason: `A hole row requires between ${MIN_CENTER_MARK_GROUP_MEMBERS} and ${MAX_CENTER_MARK_GROUP_MEMBERS} circular holes.` };
  }

  const resolved: { edge: ProjectedEdge; center3: Vec3; center: XY; normal: Vec3; radius: number }[] = [];
  for (let i = 0; i < members.length; i++) {
    const r = resolveUniqueVisibleFullCircle(pr, members[i], i);
    if (!r.ok) return r;
    const c = r.edge.circle!;
    const center3: Vec3 = [c.center[0], c.center[1], c.center[2]];
    const normal: Vec3 = [c.normal[0], c.normal[1], c.normal[2]];
    resolved.push({
      edge: r.edge,
      center3,
      center: projectPoint(pr, center3),
      normal,
      radius: c.radius,
    });
  }

  const base = resolved[0];
  const baseTol = 1e-4 * Math.max(1, base.radius);

  // Strict 3D coplanarity & equal positive radius across all members.
  for (let i = 1; i < resolved.length; i++) {
    const cur = resolved[i];
    if (Math.abs(dot(cur.normal, base.normal)) < 1 - NORMAL_TOL) {
      return { ok: false, reason: 'The selected holes do not lie in parallel planes.' };
    }
    if (Math.abs(dot(sub3(cur.center3, base.center3), base.normal)) > baseTol) {
      return { ok: false, reason: 'The selected holes do not lie in the same 3D plane.' };
    }
    if (Math.abs(cur.radius - base.radius) > baseTol) {
      return { ok: false, reason: 'The selected holes do not share the same radius.' };
    }
  }

  // Distinct 3D centers (rejects duplicate rim picks and coincident centers) + find farthest pair.
  let farI = 0;
  let farJ = 1;
  let maxSpan = -1;
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const d = dist3(resolved[i].center3, resolved[j].center3);
      if (d <= baseTol) {
        return { ok: false, reason: 'Duplicate or coincident hole centers are not allowed in a hole row.' };
      }
      if (d > maxSpan) {
        maxSpan = d;
        farI = i;
        farJ = j;
      }
    }
  }
  if (maxSpan <= baseTol) {
    return { ok: false, reason: 'The selected hole centers are too close to define a row axis.' };
  }

  // Strict 3D collinearity relative to the farthest-pair line A -> B.
  const A = resolved[farI].center3;
  const B = resolved[farJ].center3;
  const dir3 = sub3(B, A);
  const u3: Vec3 = [dir3[0] / maxSpan, dir3[1] / maxSpan, dir3[2] / maxSpan];
  const lineTol = 1e-4 * Math.max(1, maxSpan);
  for (const m of resolved) {
    const w = sub3(m.center3, A);
    const t = dot(w, u3);
    const perp = Math.hypot(w[0] - t * u3[0], w[1] - t * u3[1], w[2] - t * u3[2]);
    if (perp > lineTol) {
      return { ok: false, reason: 'The selected hole centers are not collinear.' };
    }
  }

  // Verify true 2D projected span and build canonical order-independent row direction.
  const pA = resolved[farI].center;
  const pB = resolved[farJ].center;
  const dx = pB[0] - pA[0];
  const dy = pB[1] - pA[1];
  const span2 = Math.hypot(dx, dy);
  if (span2 <= baseTol || Math.abs(span2 - maxSpan) > 1e-3 * Math.max(1, maxSpan)) {
    return { ok: false, reason: 'The hole row does not project at true spacing in this view.' };
  }
  let axis: XY = [dx / span2, dy / span2];
  if (axis[0] < -1e-9 || (Math.abs(axis[0]) <= 1e-9 && axis[1] < 0)) {
    axis = [-axis[0], -axis[1]];
  }

  const ordered = [...resolved]
    .sort((a, b) => (a.center[0] * axis[0] + a.center[1] * axis[1]) - (b.center[0] * axis[0] + b.center[1] * axis[1]))
    .map((m): CenterMarkGroupMemberGeometry => ({
      edge: m.edge.name,
      center: m.center,
      center3: m.center3,
      radius: m.radius,
    }));

  const segments: [XY, XY][] = [];
  for (let i = 0; i + 1 < ordered.length; i++) {
    segments.push([ordered[i].center, ordered[i + 1].center]);
  }

  return {
    ok: true,
    geometry: {
      members: ordered,
      radius: base.radius,
      axis,
      segments,
    },
  };
}

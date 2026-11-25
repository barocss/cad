// Cylinder side silhouette diameter drawing dimension geometry: resolves one visible straight
// silhouette generator of a native analytic cylindrical face in an ordinary unbroken orthographic
// view (`front`, `top`, `right`) whose axis lies parallel to the view plane, and measures its
// exact native diameter `2 * r` (mm) independent of display chain order (`~sil0`/`~sil1`).
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import { isOrthographicView } from './foreshorten';
import type { CylinderFaceRef, DimView, Vec3, XY } from './types';

export interface CylinderDiameterGeometry {
  /** 2D endpoints of the chosen visible silhouette generator line (view mm). */
  readonly generator: readonly [XY, XY];
  /** 2D endpoints of the opposite silhouette generator line on the same cylinder (view mm). */
  readonly opposite: readonly [XY, XY];
  /** 2D midpoint of the chosen silhouette generator (view mm). */
  readonly anchor: XY;
  /** 2D point on the cylinder axis opposite `anchor` (view mm). */
  readonly axisPoint: XY;
  /** Unit 2D direction along the cylinder axis in view coordinates. */
  readonly axisDir: XY;
  /** Unit 2D radial direction from cylinder axis outward toward the chosen silhouette. */
  readonly radialDir: XY;
  /** Exact native cylinder radius `r` (mm). */
  readonly radius: number;
  /** Exact native cylinder diameter `2 * r` (mm). */
  readonly diameter: number;
  /** 3D midpoint of the chosen silhouette generator (model mm). */
  readonly anchor3: Vec3;
}

export type CylinderDiameterResolveResult =
  | { readonly ok: true; readonly geometry: CylinderDiameterGeometry }
  | { readonly ok: false; readonly reason: string };

export type CylinderSilhouettePickResult =
  | { readonly ok: true; readonly ref: CylinderFaceRef; readonly radius: number; readonly diameter: number }
  | { readonly ok: false; readonly reason: string };

const AXIS_ORTHO_TOL = 1e-4;

function sub3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function len3(v: readonly number[]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function distPointToSegment3(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const dd = dx * dx + dy * dy + dz * dz;
  const t = dd > 1e-18 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / dd)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t, p[2] - a[2] - dz * t);
}

function projectPoint(pr: BrepProjection, p: readonly number[]): XY {
  return [dot(p, pr.right), dot(p, pr.up)];
}

function geometryFromEdge(pr: BrepProjection, edge: ProjectedEdge): CylinderDiameterResolveResult {
  if (edge.kind !== 'silhouette' || edge.circle || !edge.ends) {
    return { ok: false, reason: 'Select a straight silhouette of a cylindrical face. Non-silhouette edges and circles are not supported.' };
  }
  const cyl = edge.cylinder;
  if (!cyl || !cyl.face) {
    return { ok: false, reason: 'This silhouette does not come from a native cylindrical face.' };
  }
  if (!edge.pieces.some(p => p.visible)) {
    return { ok: false, reason: 'Select a visible cylinder silhouette in this view.' };
  }
  if (!Number.isFinite(cyl.radius) || cyl.radius <= 1e-6) {
    return { ok: false, reason: 'The selected cylinder has an invalid radius.' };
  }
  const axisLen = len3(cyl.axis);
  if (axisLen <= 1e-9) {
    return { ok: false, reason: 'The selected cylinder has an invalid axis.' };
  }
  const axisUnit: Vec3 = [cyl.axis[0] / axisLen, cyl.axis[1] / axisLen, cyl.axis[2] / axisLen];
  // Require the cylinder axis to lie parallel to the view plane (perpendicular to pr.toward).
  if (Math.abs(dot(axisUnit, pr.toward)) > AXIS_ORTHO_TOL) {
    return { ok: false, reason: 'This cylinder is oblique or end-on in this view. Dimension its diameter where its axis shows true in side view.' };
  }
  const [A3, B3] = edge.ends;
  const A2 = projectPoint(pr, A3);
  const B2 = projectPoint(pr, B3);
  const genLen = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]);
  if (genLen <= 1e-4) {
    return { ok: false, reason: 'The cylinder silhouette has negligible length in this view.' };
  }
  const axisU = dot(axisUnit, pr.right);
  const axisV = dot(axisUnit, pr.up);
  const axis2Len = Math.hypot(axisU, axisV);
  if (axis2Len <= 1e-6) {
    return { ok: false, reason: 'The cylinder axis does not project onto this view plane.' };
  }
  const axisDir: XY = [axisU / axis2Len, axisV / axis2Len];
  const anchor3: Vec3 = [(A3[0] + B3[0]) / 2, (A3[1] + B3[1]) / 2, (A3[2] + B3[2]) / 2];
  const rel = sub3(anchor3, cyl.origin);
  const tMid = dot(rel, axisUnit);
  const axisMid3: Vec3 = [
    cyl.origin[0] + axisUnit[0] * tMid,
    cyl.origin[1] + axisUnit[1] * tMid,
    cyl.origin[2] + axisUnit[2] * tMid,
  ];
  const radial3 = sub3(anchor3, axisMid3);
  const radialLen = len3(radial3);
  if (Math.abs(radialLen - cyl.radius) > 1e-3 * Math.max(1, cyl.radius)) {
    return { ok: false, reason: 'The silhouette does not lie at the cylinder radius.' };
  }
  const anchor = projectPoint(pr, anchor3);
  const axisPoint = projectPoint(pr, axisMid3);
  const radDx = anchor[0] - axisPoint[0];
  const radDy = anchor[1] - axisPoint[1];
  const rad2Len = Math.hypot(radDx, radDy);
  if (Math.abs(rad2Len - cyl.radius) > 1e-3 * Math.max(1, cyl.radius)) {
    return { ok: false, reason: 'The cylinder silhouette does not show at true radius in this view.' };
  }
  const radialDir: XY = [radDx / rad2Len, radDy / rad2Len];
  const diameter = 2 * cyl.radius;
  const oppA: XY = [A2[0] - radialDir[0] * diameter, A2[1] - radialDir[1] * diameter];
  const oppB: XY = [B2[0] - radialDir[0] * diameter, B2[1] - radialDir[1] * diameter];
  return {
    ok: true,
    geometry: {
      generator: [A2, B2],
      opposite: [oppA, oppB],
      anchor,
      axisPoint,
      axisDir,
      radialDir,
      radius: cyl.radius,
      diameter,
      anchor3,
    },
  };
}

/** Validate a hovered/clicked projected edge as a native cylinder side silhouette in `view`. */
export function pickCylinderSilhouette(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: DimView,
): CylinderSilhouettePickResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Cylinder side diameter dimensions are supported only on ordinary front, top, and right views.' };
  }
  const res = geometryFromEdge(pr, edge);
  if (!res.ok) return res;
  return {
    ok: true,
    ref: { face: edge.cylinder!.face, near: [...res.geometry.anchor3] as Vec3 },
    radius: res.geometry.radius,
    diameter: res.geometry.diameter,
  };
}

/**
 * Resolve a persisted `CylinderFaceRef` against the current projection, independent of transient
 * `~sil0`/`~sil1` chain ordering, and return its exact native diameter `2 * r`.
 */
export function resolveCylinderDiameter(
  pr: BrepProjection,
  ref: CylinderFaceRef,
  view: DimView,
): CylinderDiameterResolveResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Cylinder side diameter dimensions are supported only on ordinary front, top, and right views.' };
  }
  const matchingFace = pr.edges.filter(e => e.kind === 'silhouette' && e.cylinder?.face === ref.face);
  if (!matchingFace.length) {
    return { ok: false, reason: 'The cylindrical face it measured no longer shows a silhouette in this view.' };
  }
  const valid: { geometry: CylinderDiameterGeometry; distance: number }[] = [];
  let rejectedReason: string | null = null;
  for (const edge of matchingFace) {
    const res = geometryFromEdge(pr, edge);
    if (!res.ok) {
      rejectedReason ??= res.reason;
      continue;
    }
    const [A3, B3] = edge.ends!;
    const distance = distPointToSegment3(ref.near, A3, B3);
    valid.push({ geometry: res.geometry, distance });
  }
  if (!valid.length) {
    return { ok: false, reason: rejectedReason ?? 'The cylindrical face silhouette cannot be resolved in this view.' };
  }
  valid.sort((a, b) => a.distance - b.distance);
  return { ok: true, geometry: valid[0].geometry };
}

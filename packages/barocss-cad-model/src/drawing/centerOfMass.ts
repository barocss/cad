/**
 * Source-bound Center of Mass (CG) drawing annotation & linear-dimension point resolver (D2017, #250).
 *
 * Truth rules:
 * - Binds strictly to an explicit made solid body (`bodyKey`) in a part drawing scope.
 * - Reads live qualified mass properties (`centroid`, `massMethod`, `volume > 0`, `massRef === undefined`).
 * - Never fabricates a fallback point (e.g. `(0,0,0)` or stale `near`), never treats missing `massMethod`
 *   as exact, never guesses `bodies[0]` or silently sums multiple bodies, and never rejects valid hollow
 *   parts whose centroid lies outside solid material.
 * - Presentation-only fields (`hidden`, `diameter`) affect only symbol ink, never dependent dimensions.
 */
import type { BrepProjection } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { dot } from '../engine/vec3';
import { nextFreeId } from '../util/ids';
import type { DrawingScope } from './scope';
import type { Mark } from './sheet';
import { SECTION_VIEWS, type DimView, type DrawingCenterOfMass, type SectionViewId, type Vec3, type XY } from './types';

export const COM_SYMBOL_DEFAULT_MM = 4;
export const COM_SYMBOL_MIN_MM = 2;
export const COM_SYMBOL_MAX_MM = 12;
export const COM_CROSSHAIR_EXTEND = 1.5;

const QUADRANT_ARC_STEPS = 16;

export interface DrawingBodyMassSource {
  readonly key: string;
  readonly centroid: Vec3;
  readonly massMethod: string;
  readonly name?: string;
}

export interface CenterOfMassGeometry {
  readonly bodyKey: string;
  readonly centroid3: Vec3;
  readonly point: XY;
  readonly massMethod: string;
  readonly diameter: number;
}

export type CenterOfMassResolution =
  | { readonly ok: true; readonly geometry: CenterOfMassGeometry }
  | { readonly ok: false; readonly reason: string };

export type ResolvedCenterOfMass =
  | { readonly ok: true; readonly item: DrawingCenterOfMass; readonly geometry: CenterOfMassGeometry }
  | { readonly ok: false; readonly item: DrawingCenterOfMass; readonly reason: string };

export function comDiameterOk(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= COM_SYMBOL_MIN_MM && value <= COM_SYMBOL_MAX_MM;
}

export function newCenterOfMassId(existing?: readonly DrawingCenterOfMass[]): string {
  return nextFreeId('com', new Set((existing ?? []).map(item => item.id)));
}

function isFiniteVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x));
}

function projectToView(pr: BrepProjection, p: readonly number[]): XY {
  return [dot(p, pr.right), dot(p, pr.up)];
}

/**
 * Extract live qualified center-of-mass sources from evaluated part bodies.
 * Excludes assembly scope, bought/infill/mesh/suppressed bodies, pending masses (`massRef !== undefined`),
 * missing `massMethod`, non-positive volume, and non-finite centroids.
 * Does NOT require centroid to lie inside solid material (hollow/U-shaped parts are valid).
 */
export function qualifiedCenterOfMassSources(
  doc: StudioDoc,
  bodies: readonly BodyResult[],
  scope: DrawingScope,
): Map<string, DrawingBodyMassSource> {
  const out = new Map<string, DrawingBodyMassSource>();
  if (scope.kind !== 'part') return out;
  const selectedKey = scope.body?.key;
  for (const body of bodies) {
    if (!body.key) continue;
    if (selectedKey !== undefined && body.key !== selectedKey) continue;
    if (body.ref) {
      const node = doc.nodes[body.ref.node];
      if (!node || node.suppressed || node.bought === true || ('role' in node && node.role === 'infill') || node.kind === 'mesh') continue;
    }
    if (body.massRef !== undefined) continue;
    if (typeof body.massMethod !== 'string' || !body.massMethod.trim()) continue;
    if (typeof body.volume !== 'number' || !Number.isFinite(body.volume) || body.volume <= 0) continue;
    if (!isFiniteVec3(body.centroid)) continue;
    out.set(body.key, {
      key: body.key,
      centroid: [body.centroid[0], body.centroid[1], body.centroid[2]],
      massMethod: body.massMethod,
    });
  }
  return out;
}

/** Resolve a `DimPoint` (`at: 'com'`) to a live 3D centroid, or null if unqualified/unavailable. */
export function resolveCenterOfMassPoint(
  bodyKey: string | undefined,
  sources?: ReadonlyMap<string, DrawingBodyMassSource>,
): Vec3 | null {
  if (!bodyKey || !sources) return null;
  const src = sources.get(bodyKey);
  if (!src || !src.massMethod.trim() || !isFiniteVec3(src.centroid)) return null;
  return [src.centroid[0], src.centroid[1], src.centroid[2]];
}

/** Resolve a persisted `DrawingCenterOfMass` marker in an ordinary orthographic view. */
export function resolveCenterOfMass(
  pr: BrepProjection,
  bodyKey: string,
  view: DimView,
  sources?: ReadonlyMap<string, DrawingBodyMassSource>,
  diameter?: number,
): CenterOfMassResolution {
  if (!SECTION_VIEWS.includes(view as SectionViewId)) {
    return { ok: false, reason: 'Center of mass is supported only on ordinary front, top, and right views.' };
  }
  if (!bodyKey) {
    return { ok: false, reason: 'Center of mass requires an explicit body key.' };
  }
  if (!sources) {
    return { ok: false, reason: 'Qualified body mass properties are unavailable for this sheet.' };
  }
  const src = sources.get(bodyKey);
  if (!src) {
    return { ok: false, reason: `Body ${bodyKey} is unavailable, excluded, or pending exact mass calculation.` };
  }
  if (!src.massMethod.trim() || !isFiniteVec3(src.centroid)) {
    return { ok: false, reason: `Body ${bodyKey} does not have a valid qualified center of mass.` };
  }
  const d = comDiameterOk(diameter) ? diameter : COM_SYMBOL_DEFAULT_MM;
  const centroid3: Vec3 = [src.centroid[0], src.centroid[1], src.centroid[2]];
  return {
    ok: true,
    geometry: {
      bodyKey,
      centroid3,
      point: projectToView(pr, centroid3),
      massMethod: src.massMethod,
      diameter: d,
    },
  };
}

function quadrantFillPoints(center: XY, radius: number, startAngle: number, endAngle: number): XY[] {
  const pts: XY[] = [[center[0], center[1]]];
  for (let i = 0; i <= QUADRANT_ARC_STEPS; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / QUADRANT_ARC_STEPS);
    pts.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return pts;
}

/**
 * Standard ISO/ASME center-of-mass (CG) symbol in sheet mm (y-down):
 * thin circle + extending orthogonal crosshair + alternating filled quadrants (Q1 top-right & Q3 bottom-left).
 */
export function centerOfMassSymbolMarks(center: XY, diameterMM: number = COM_SYMBOL_DEFAULT_MM): Mark[] {
  const d = comDiameterOk(diameterMM) ? diameterMM : COM_SYMBOL_DEFAULT_MM;
  const r = d / 2;
  const ext = r * COM_CROSSHAIR_EXTEND;
  return [
    { kind: 'fill', points: quadrantFillPoints(center, r, -Math.PI / 2, 0) },
    { kind: 'fill', points: quadrantFillPoints(center, r, Math.PI / 2, Math.PI) },
    { kind: 'arc', center, u: [r, 0], v: [0, r], t0: 0, t1: Math.PI * 2, pen: 'thin' },
    { kind: 'line', a: [center[0] - ext, center[1]], b: [center[0] + ext, center[1]], pen: 'thin' },
    { kind: 'line', a: [center[0], center[1] - ext], b: [center[0], center[1] + ext], pen: 'thin' },
  ];
}

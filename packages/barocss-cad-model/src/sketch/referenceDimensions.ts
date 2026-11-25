// Persistent, non-driving sketch reference dimensions on a closed numeric outline.
// Reference dimensions NEVER emit solver equations and are always re-measured from the current
// accepted geometry by stable side/vertex IDs (`polygon.ids` / `sideTags.outer`), never by bare array index.
import type { P2 } from './profile';
import { withIds } from './entityIds';
import { commitDimension, distanceKey, isSettled, removeConstraint, type EditResult, type Polygon } from './rules';

export type ReferenceDimensionKind = 'distance' | 'dx' | 'dy';

export interface SketchReferenceDimension {
  /** Stable record ID inside the outline (`ref1`, `ref2`, ...). */
  id: string;
  /** Local sketch-plane measurement kind. */
  kind: ReferenceDimensionKind;
  /** Stable vertex/side ID of endpoint A (`/^e\d+$/`, matching `polygon.ids[a]`). */
  aId: string;
  /** Stable vertex/side ID of endpoint B (`/^e\d+$/`, matching `polygon.ids[b]`). */
  bId: string;
}

export type ResolvedReferenceDimension =
  | {
      ok: true;
      ref: SketchReferenceDimension;
      a: number;
      b: number;
      value: number;
      label: string;
    }
  | {
      ok: false;
      ref: SketchReferenceDimension;
      reason: 'unresolved' | 'invalid';
      message: string;
      label: string;
    };

export type ReferenceEditResult =
  | { ok: true; shape: Polygon; refId: string }
  | { ok: false; reason: string };

const SIDE_ID = /^e\d+$/;
const REF_KIND_LABEL: Record<ReferenceDimensionKind, string> = {
  distance: 'Reference distance',
  dx: 'Horizontal reference',
  dy: 'Vertical reference',
};

const samePair = (a1: string, b1: string, a2: string, b2: string): boolean =>
  (a1 === a2 && b1 === b2) || (a1 === b2 && b1 === a2);

const finitePoint = (point: readonly number[] | undefined): point is P2 =>
  Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);

export function isValidReferenceDimension(ref: unknown): ref is SketchReferenceDimension {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return false;
  const r = ref as Record<string, unknown>;
  return typeof r.id === 'string' && r.id.length > 0
    && (r.kind === 'distance' || r.kind === 'dx' || r.kind === 'dy')
    && typeof r.aId === 'string' && SIDE_ID.test(r.aId)
    && typeof r.bId === 'string' && SIDE_ID.test(r.bId)
    && r.aId !== r.bId;
}

function ensurePolygonIds(s: Polygon): Polygon {
  const n = s.points.length;
  if (s.ids?.length === n && s.ids.every(id => SIDE_ID.test(id)) && new Set(s.ids).size === n) return s;
  return withIds([s])[0] as Polygon;
}

function nextReferenceId(refs: readonly SketchReferenceDimension[] | undefined): string {
  let max = 0;
  for (const r of refs ?? []) {
    const m = /^ref(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `ref${max + 1}`;
}

/**
 * Resolve one stored reference dimension strictly by its stable endpoint side IDs (`aId`, `bId`).
 * Missing, deleted, duplicated, or non-finite endpoints are reported explicitly as `unresolved`
 * rather than silently retargeted by array index or filled from stale values.
 */
export function resolveReferenceDimension(s: Polygon, ref: SketchReferenceDimension): ResolvedReferenceDimension {
  if (!isValidReferenceDimension(ref)) {
    return {
      ok: false,
      ref,
      reason: 'invalid',
      message: 'Malformed reference dimension record.',
      label: 'Invalid reference (REF)',
    };
  }
  const ids = s.ids;
  if (!ids || ids.length !== s.points.length) {
    return {
      ok: false,
      ref,
      reason: 'unresolved',
      message: `Reference ${ref.id} cannot resolve endpoints (${ref.aId}, ${ref.bId}) without stable outline IDs.`,
      label: `${REF_KIND_LABEL[ref.kind]} (${ref.aId} – ${ref.bId})`,
    };
  }
  const aMatches: number[] = [];
  const bMatches: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === ref.aId) aMatches.push(i);
    if (ids[i] === ref.bId) bMatches.push(i);
  }
  if (aMatches.length !== 1 || bMatches.length !== 1 || aMatches[0] === bMatches[0]) {
    return {
      ok: false,
      ref,
      reason: 'unresolved',
      message: `Reference ${ref.id} endpoints (${ref.aId}, ${ref.bId}) are missing or ambiguous.`,
      label: `${REF_KIND_LABEL[ref.kind]} (${ref.aId} – ${ref.bId})`,
    };
  }
  const a = aMatches[0], b = bMatches[0];
  const pA = s.points[a], pB = s.points[b];
  if (!finitePoint(pA) || !finitePoint(pB)) {
    return {
      ok: false,
      ref,
      reason: 'unresolved',
      message: `Reference ${ref.id} endpoints have non-finite coordinates.`,
      label: `${REF_KIND_LABEL[ref.kind]} point ${a + 1} – point ${b + 1}`,
    };
  }
  const value = ref.kind === 'distance'
    ? Math.hypot(pB[0] - pA[0], pB[1] - pA[1])
    : ref.kind === 'dx'
      ? Math.abs(pB[0] - pA[0])
      : Math.abs(pB[1] - pA[1]);
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      ref,
      reason: 'unresolved',
      message: `Reference ${ref.id} produced a non-finite measurement.`,
      label: `${REF_KIND_LABEL[ref.kind]} point ${a + 1} – point ${b + 1}`,
    };
  }
  return {
    ok: true,
    ref,
    a,
    b,
    value,
    label: `${REF_KIND_LABEL[ref.kind]} point ${a + 1} – point ${b + 1}`,
  };
}

/** Add a read-only reference dimension between two valid outline vertices without changing solver equations. */
export function addReferenceDimension(
  s: Polygon,
  a: number,
  b: number,
  kind: ReferenceDimensionKind,
): ReferenceEditResult {
  if (!isSettled(s)) return { ok: false, reason: 'Close the outline before adding a reference dimension.' };
  const n = s.points.length;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) {
    return { ok: false, reason: 'Select two distinct points on the closed outline.' };
  }
  if (!finitePoint(s.points[a]) || !finitePoint(s.points[b])) {
    return { ok: false, reason: 'Selected points must have finite coordinates.' };
  }
  const tagged = ensurePolygonIds(s);
  const aId = tagged.ids![a], bId = tagged.ids![b];
  if ((tagged.references ?? []).some(r => r.kind === kind && samePair(r.aId, r.bId, aId, bId))) {
    return { ok: false, reason: 'That reference dimension already exists.' };
  }
  const refId = nextReferenceId(tagged.references);
  const next: SketchReferenceDimension = { id: refId, kind, aId, bId };
  return {
    ok: true,
    shape: { ...tagged, references: [...(tagged.references ?? []), next] },
    refId,
  };
}

/** Remove one stored reference dimension by its stable ID without modifying any constraints or geometry. */
export function removeReferenceDimension(s: Polygon, refId: string): Polygon {
  const remaining = (s.references ?? []).filter(r => r.id !== refId);
  if (remaining.length === (s.references ?? []).length) return s;
  const out: Polygon = { ...s };
  if (remaining.length) out.references = remaining;
  else delete out.references;
  return out;
}

/** Whether a constraint list row ID represents a numeric driving dimension convertible to a reference dimension. */
export function isConvertibleToReference(s: Polygon, constraintId: string): boolean {
  if (!isSettled(s)) return false;
  const [kind, arg = ''] = constraintId.split(':');
  const i = Number(arg);
  if (!Number.isInteger(i) || i < 0) return false;
  if (kind === 'len') {
    return i < s.points.length && !s.bulges?.[i] && s.lengths?.[i] !== undefined;
  }
  if (kind === 'rule') {
    const r = s.rules?.[i];
    return !!r && (r.kind === 'distance' || r.kind === 'dx' || r.kind === 'dy');
  }
  return false;
}

/**
 * Convert an existing driving straight edge length or point-to-point distance constraint into a
 * read-only reference dimension. Removes only that solver equation, keeps geometry and all other
 * constraints/IDs identical, and records the reference by stable vertex side IDs.
 */
export function convertDrivingToReference(s: Polygon, constraintId: string): ReferenceEditResult {
  if (!isSettled(s)) return { ok: false, reason: 'Close the outline before converting a dimension.' };
  const [kind, arg = ''] = constraintId.split(':');
  const i = Number(arg);
  const n = s.points.length;
  let a = -1, b = -1, refKind: ReferenceDimensionKind | null = null;
  if (kind === 'len' && Number.isInteger(i) && i >= 0 && i < n && !s.bulges?.[i] && s.lengths?.[i] !== undefined) {
    a = i;
    b = (i + 1) % n;
    refKind = 'distance';
  } else if (kind === 'rule' && Number.isInteger(i) && i >= 0) {
    const r = s.rules?.[i];
    if (r && (r.kind === 'distance' || r.kind === 'dx' || r.kind === 'dy')) {
      a = r.a;
      b = r.b;
      refKind = r.kind;
    }
  }
  if (refKind === null || a < 0 || b < 0 || a >= n || b >= n || a === b) {
    return { ok: false, reason: 'Only numeric straight edge lengths and point-to-point distances can be converted to reference dimensions.' };
  }
  const tagged = ensurePolygonIds(s);
  const aId = tagged.ids![a], bId = tagged.ids![b];
  const unlocked = removeConstraint(tagged, constraintId);
  const existing = (unlocked.references ?? []).find(r => r.kind === refKind && samePair(r.aId, r.bId, aId, bId));
  if (existing) return { ok: true, shape: unlocked, refId: existing.id };
  const refId = nextReferenceId(unlocked.references);
  return {
    ok: true,
    shape: { ...unlocked, references: [...(unlocked.references ?? []), { id: refId, kind: refKind, aId, bId }] },
    refId,
  };
}

/**
 * Explicitly convert a stored reference dimension into a driving constraint using its exact
 * full-precision measured value from current accepted geometry. Any solver refusal (over-defined,
 * conflict, zero length, unresolved endpoints) leaves the sketch and reference record unchanged.
 */
export function convertReferenceToDriving(s: Polygon, refId: string): EditResult {
  if (!isSettled(s)) return { ok: false, reason: 'Close the outline before converting a reference dimension.' };
  const ref = (s.references ?? []).find(r => r.id === refId);
  if (!ref) return { ok: false, reason: 'Unknown reference dimension.' };
  const resolved = resolveReferenceDimension(s, ref);
  if (!resolved.ok) return { ok: false, reason: resolved.message };
  if (!Number.isFinite(resolved.value) || resolved.value < 0.001) {
    return { ok: false, reason: 'Cannot convert a zero-length reference dimension into a driving constraint.' };
  }
  const lo = Math.min(resolved.a, resolved.b), hi = Math.max(resolved.a, resolved.b);
  const key = ref.kind === 'distance'
    ? distanceKey(s, resolved.a, resolved.b)
    : `${ref.kind}${lo}_${hi}`;
  const committed = commitDimension(s, key, resolved.value);
  if (!committed.ok) return committed;
  return { ...committed, shape: removeReferenceDimension(committed.shape, refId) };
}

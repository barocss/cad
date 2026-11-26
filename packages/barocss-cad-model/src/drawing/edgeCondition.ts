/**
 * Drawing edge-condition symbols (D2024, #212).
 *
 * Contract:
 * - Structured manufacturing edge-state requirement bound to one uniquely resolved visible edge (`EdgeRef`) on an
 *   ordinary unbroken orthographic view (`front`, `top`, `right`) of a single part drawing.
 * - Distinct from free notes, GD&T feature control frames, and actual part geometry: never alters B-rep topology,
 *   mass, or feature history, and never claims measured burr inspection, chamfer verification, CAM approval, or
 *   full ISO 13715 standard certification.
 * - Preserves explicit sign (`'+' | '-' | '±' | 'unspecified'`), direction (`'any' | 'horizontal' | 'vertical'`),
 *   optional native model-mm upper/lower magnitudes (strictly positive, `lowerMm <= upperMm`, never normalizing
 *   `unspecified` to `0` and never silently swapping inverted bounds), and optional `allAround: true`.
 * - Separates paper-mm symbol size (scale-invariant across 1:1 / 1:2) from native model-mm requirement values;
 *   inch display truncates conservatively toward zero (4 decimals) so rounding never relaxes declared allowances.
 * - Diagnoses missing (`EDGE_CONDITION_LOST`) and ambiguous (`EDGE_CONDITION_AMBIGUOUS`) targets explicitly without
 *   silently snapping to another nearby edge.
 */
import type { BrepProjection, ProjectedCurve, ProjectedEdge } from '@barocss/cad';
import { inView } from './dimensions';
import type { Mark } from './sheet';
import type { StandardPreset } from './standard';
import type {
  DrawingEdgeCondition,
  EdgeConditionDirection,
  EdgeConditionSign,
  EdgeRef,
  SectionViewId,
  Vec3,
  XY,
} from './types';
import { toSheet, type ViewPlacement } from './views';

export const EDGE_CONDITION_SIGNS: readonly EdgeConditionSign[] = ['+', '-', '±', 'unspecified'];
export const EDGE_CONDITION_DIRECTIONS: readonly EdgeConditionDirection[] = ['any', 'horizontal', 'vertical'];
export const EDGE_CONDITION_MAX_MM = 1000;

export interface EdgeConditionValidationOk {
  readonly ok: true;
}

export interface EdgeConditionValidationErr {
  readonly ok: false;
  readonly reason: string;
}

export type EdgeConditionValidation = EdgeConditionValidationOk | EdgeConditionValidationErr;

export interface ResolvedEdgeConditionOk {
  readonly ok: true;
  readonly item: DrawingEdgeCondition;
  readonly anchor2: XY;
  readonly signLabel: string;
  readonly upperText: string | null;
  readonly lowerText: string | null;
  readonly summaryText: string;
}

export interface ResolvedEdgeConditionErr {
  readonly ok: false;
  readonly item: DrawingEdgeCondition;
  readonly code: 'EDGE_CONDITION_LOST' | 'EDGE_CONDITION_AMBIGUOUS';
  readonly reason: string;
}

export type ResolvedEdgeCondition = ResolvedEdgeConditionOk | ResolvedEdgeConditionErr;

/** Strict validation for edge-condition sign, direction, and native model-mm upper/lower limits. */
export function checkEdgeConditionValues(
  sign: unknown,
  direction: unknown,
  upperMm: unknown,
  lowerMm: unknown,
): EdgeConditionValidation {
  if (typeof sign !== 'string' || !(EDGE_CONDITION_SIGNS as readonly string[]).includes(sign)) {
    return { ok: false, reason: 'Edge-condition sign must be +, -, ±, or unspecified.' };
  }
  if (typeof direction !== 'string' || !(EDGE_CONDITION_DIRECTIONS as readonly string[]).includes(direction)) {
    return { ok: false, reason: 'Edge-condition direction must be any, horizontal, or vertical.' };
  }
  if (sign === 'unspecified') {
    if (upperMm !== undefined || lowerMm !== undefined) {
      return { ok: false, reason: 'Unspecified edge-condition sign cannot carry numeric size limits.' };
    }
    return { ok: true };
  }
  if (upperMm !== undefined) {
    if (typeof upperMm !== 'number' || !Number.isFinite(upperMm) || upperMm <= 0 || upperMm > EDGE_CONDITION_MAX_MM) {
      return { ok: false, reason: `Upper edge-condition size must be a finite number in (0, ${EDGE_CONDITION_MAX_MM}] mm.` };
    }
  }
  if (lowerMm !== undefined) {
    if (upperMm === undefined) {
      return { ok: false, reason: 'Lower edge-condition size requires an upper size.' };
    }
    if (typeof lowerMm !== 'number' || !Number.isFinite(lowerMm) || lowerMm <= 0 || lowerMm > EDGE_CONDITION_MAX_MM) {
      return { ok: false, reason: `Lower edge-condition size must be a finite number in (0, ${EDGE_CONDITION_MAX_MM}] mm.` };
    }
    if (lowerMm > upperMm) {
      return { ok: false, reason: 'Lower edge-condition size cannot exceed upper size (no silent swapping).' };
    }
  }
  return { ok: true };
}

/** Allocates the next unique edge-condition annotation ID (`ec1`, `ec2`, …). */
export function newEdgeConditionId(
  items: readonly Pick<DrawingEdgeCondition, 'id'>[] = [],
  reserved: readonly string[] = [],
): string {
  const used = new Set([...items.map(i => i.id), ...reserved]);
  for (let i = 1; ; i++) {
    const id = `ec${i}`;
    if (!used.has(id)) return id;
  }
}

/**
 * Formats a native model-mm edge-condition magnitude without ever relaxing the declared allowance.
 * In mm: exact up to 4 decimals (trimmed). In inch: truncated toward zero at 4 decimals (`mm / 25.4`).
 */
export function formatEdgeConditionSize(mm: number, preset: StandardPreset): string {
  if (preset.units === 'inch') {
    const raw = mm / 25.4;
    const floored = Math.floor(raw * 1e4 + 1e-9) / 1e4;
    const fixed = floored.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return `${fixed} in`;
  }
  const rounded = Math.round(mm * 1e4) / 1e4;
  return String(rounded);
}

/** Displays the declared sign using typographic minus (`−`) for `-` while keeping `unspecified` explicit (`?`). */
export function edgeConditionSignText(sign: EdgeConditionSign): string {
  if (sign === '-') return '−';
  if (sign === 'unspecified') return '?';
  return sign;
}

function visibleCurveMidpoint(curve: ProjectedCurve): XY {
  if (curve.kind === 'line') return [(curve.a[0] + curve.b[0]) / 2, (curve.a[1] + curve.b[1]) / 2];
  if (curve.kind === 'polyline') {
    const mid = curve.points[Math.floor(curve.points.length / 2)] ?? curve.points[0];
    return [mid[0], mid[1]];
  }
  const tm = (curve.t0 + curve.t1) / 2;
  return [
    curve.center[0] + curve.u[0] * Math.cos(tm) + curve.v[0] * Math.sin(tm),
    curve.center[1] + curve.u[1] * Math.cos(tm) + curve.v[1] * Math.sin(tm),
  ];
}

function edgeMid3D(edge: ProjectedEdge): Vec3 | null {
  if (edge.ends) {
    return [
      (edge.ends[0][0] + edge.ends[1][0]) / 2,
      (edge.ends[0][1] + edge.ends[1][1]) / 2,
      (edge.ends[0][2] + edge.ends[1][2]) / 2,
    ];
  }
  if (edge.circle) {
    return [edge.circle.center[0], edge.circle.center[1], edge.circle.center[2]];
  }
  return null;
}

function edgeAnchor2D(pr: BrepProjection, edge: ProjectedEdge): XY | null {
  const vis = edge.pieces.find(p => p.visible);
  if (vis) return visibleCurveMidpoint(vis.curve);
  const m3 = edgeMid3D(edge);
  return m3 ? inView(pr, m3) : null;
}

function edgeDistance3D(edge: ProjectedEdge, near: Vec3): number {
  const m3 = edgeMid3D(edge);
  if (!m3) return Infinity;
  return Math.hypot(m3[0] - near[0], m3[1] - near[1], m3[2] - near[2]);
}

/** Qualifies a clicked visible edge in an orthographic view for attaching an edge-condition symbol. */
export function pickEdgeConditionEdge(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: SectionViewId,
): { ok: true; ref: EdgeRef; anchor2: XY } | { ok: false; reason: string } {
  if (!edge.pieces.some(p => p.visible)) {
    return { ok: false, reason: 'Edge-condition symbols require a visible edge in the view.' };
  }
  const near = edgeMid3D(edge);
  const anchor2 = edgeAnchor2D(pr, edge);
  if (!near || !anchor2) {
    return { ok: false, reason: `Edge ${edge.name} in ${view} has no resolvable 3D reference anchor.` };
  }
  const duplicates = pr.edges.filter(
    e => e !== edge && e.name === edge.name && e.pieces.some(p => p.visible) && edgeDistance3D(e, near) <= 1e-3,
  );
  if (duplicates.length > 0) {
    return { ok: false, reason: `Edge ${edge.name} is ambiguous at this location in ${view}.` };
  }
  return { ok: true, ref: { edge: edge.name, near }, anchor2 };
}

/** Resolves an authored edge-condition symbol against the live view projection. */
export function resolveEdgeCondition(
  pr: BrepProjection,
  item: DrawingEdgeCondition,
  view: SectionViewId,
  preset: StandardPreset,
): ResolvedEdgeCondition {
  const valid = checkEdgeConditionValues(item.sign, item.direction, item.upperMm, item.lowerMm);
  if (!valid.ok) {
    return { ok: false, item, code: 'EDGE_CONDITION_LOST', reason: valid.reason };
  }
  const candidates = pr.edges
    .filter(e => e.name === item.edge.edge && e.pieces.some(p => p.visible))
    .map(e => ({ edge: e, dist: edgeDistance3D(e, item.edge.near) }))
    .filter(c => Number.isFinite(c.dist))
    .sort((a, b) => a.dist - b.dist);

  if (!candidates.length) {
    return {
      ok: false,
      item,
      code: 'EDGE_CONDITION_LOST',
      reason: `Target edge ${item.edge.edge} is no longer visible in the ${view} view.`,
    };
  }
  if (candidates.length > 1 && Math.abs(candidates[1].dist - candidates[0].dist) <= 1e-4) {
    return {
      ok: false,
      item,
      code: 'EDGE_CONDITION_AMBIGUOUS',
      reason: `Target edge ${item.edge.edge} in the ${view} view matches multiple overlapping visible edges.`,
    };
  }
  const anchor2 = edgeAnchor2D(pr, candidates[0].edge);
  if (!anchor2) {
    return {
      ok: false,
      item,
      code: 'EDGE_CONDITION_LOST',
      reason: `Target edge ${item.edge.edge} has no visible anchor in the ${view} view.`,
    };
  }
  const signLabel = edgeConditionSignText(item.sign);
  const upperText = item.upperMm !== undefined ? formatEdgeConditionSize(item.upperMm, preset) : null;
  const lowerText = item.lowerMm !== undefined ? formatEdgeConditionSize(item.lowerMm, preset) : null;
  const valuePart = upperText !== null ? (lowerText !== null ? `${upperText} / ${lowerText}` : upperText) : '';
  const dirPart = item.direction === 'any' ? '' : ` (${item.direction})`;
  const summaryText = `${signLabel}${valuePart ? ` ${valuePart}` : ''}${dirPart}${item.allAround ? ' ○' : ''}`;
  return { ok: true, item, anchor2, signLabel, upperText, lowerText, summaryText };
}

/**
 * Draws the vector edge-condition symbol strictly in paper mm (invariant to view scale 1:1 / 1:2).
 * Uses a right-angle corner symbol + leader arrowhead + sign + stacked upper/lower limits + optional all-around circle.
 */
export function edgeConditionMarks(v: ViewPlacement, resolved: ResolvedEdgeConditionOk): Mark[] {
  const anchor = toSheet(v, resolved.anchor2);
  const elbow = toSheet(v, resolved.item.place);
  const dx = elbow[0] - anchor[0];
  const dy = elbow[1] - anchor[1];
  const len = Math.hypot(dx, dy);
  const dirX = dx >= 0 ? 1 : -1;
  const barLen = 12;
  const barEnd: XY = [elbow[0] + dirX * barLen, elbow[1]];
  const marks: Mark[] = [
    { kind: 'line', a: anchor, b: elbow, pen: 'thin', role: 'leader' },
    { kind: 'line', a: elbow, b: barEnd, pen: 'thin', role: 'leader' },
  ];

  // Filled arrowhead at target edge anchor (paper mm, fixed size independent of scale)
  if (len > 1e-6) {
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const headLen = 2.4, headHalf = 0.75;
    const p1: XY = [anchor[0] + ux * headLen + nx * headHalf, anchor[1] + uy * headLen + ny * headHalf];
    const p2: XY = [anchor[0] + ux * headLen - nx * headHalf, anchor[1] + uy * headLen - ny * headHalf];
    marks.push({
      kind: 'fill',
      points: [anchor, p1, p2],
      head: { style: 'filled', tip: anchor, dir: [-ux, -uy], length: headLen, width: headHalf * 2 },
    });
  }

  // Optional all-around circle at elbow
  if (resolved.item.allAround) {
    marks.push({ kind: 'arc', center: elbow, u: [1.4, 0], v: [0, 1.4], t0: 0, t1: 2 * Math.PI, pen: 'thin' });
  }

  // Right-angle edge-condition corner glyph (paper mm: 3.2 mm stem + 3.2 mm base, visibly distinct from GD&T/weld)
  const gx = elbow[0] + dirX * 2.2;
  const gy = elbow[1] - 0.6;
  const leg = 3.2;
  marks.push({
    kind: 'polyline',
    points: [[gx, gy - leg], [gx, gy], [gx + dirX * leg, gy]],
    pen: 'visible',
  });

  // Optional direction qualifier tick
  if (resolved.item.direction === 'horizontal') {
    marks.push({ kind: 'line', a: [gx + dirX * 0.6, gy - leg - 1.1], b: [gx + dirX * (leg + 0.6), gy - leg - 1.1], pen: 'thin' });
  } else if (resolved.item.direction === 'vertical') {
    marks.push({ kind: 'line', a: [gx - dirX * 1.1, gy - leg], b: [gx - dirX * 1.1, gy], pen: 'thin' });
  }

  // Declared sign & upper/lower requirement text
  const textX = dirX > 0 ? gx + leg + 1.4 : gx - leg - 1.4;
  const textAnchor: 'start' | 'end' = dirX > 0 ? 'start' : 'end';
  if (resolved.upperText !== null && resolved.lowerText !== null) {
    marks.push({ kind: 'text', at: [textX, gy - 2.6], text: `${resolved.signLabel}${resolved.upperText}`, size: 2.2, anchor: textAnchor, bold: true });
    marks.push({ kind: 'text', at: [textX, gy - 0.2], text: `${resolved.signLabel}${resolved.lowerText}`, size: 2.2, anchor: textAnchor });
  } else {
    const label = resolved.upperText !== null ? `${resolved.signLabel}${resolved.upperText}` : resolved.signLabel;
    marks.push({ kind: 'text', at: [textX, gy - 1.0], text: label, size: 2.4, anchor: textAnchor, bold: true });
  }

  return marks;
}

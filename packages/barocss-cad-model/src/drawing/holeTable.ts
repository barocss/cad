/**
 * Source-bound Drawing Hole Table (D2021, #232).
 *
 * Truth rules:
 * - Bounded v1 profile: one ordinary base-part orthographic view (`front`, `top`, `right`),
 *   one explicit datum `origin: DimPoint`, and 1..3 explicitly selected independent plain-through
 *   Hole features (authored `HoleNode` with explicit `node.id` — never positional fallback).
 * - Visible full-circle rim required (supports 180°+180° seam-split full rims); rejects bosses,
 *   fillets, partial/hidden rims, patterns, blind/threaded/counterbore/countersink holes,
 *   foreign bodies, broken views, and assembly drawings with explicit refusal reasons.
 * - Row identity (`member.id`), user-visible `tag`, and authored feature `owner` are separate from
 *   array order, sort order, and formatted text: re-sorting, table/view movement, scale/sheet
 *   changes, and model edits never silently reassign tags or swap rows.
 * - Coordinates are computed directly from live native projection frame:
 *   `X = dot(C - O, pr.right)`, `Y = dot(C - O, pr.up)` (model mm, invariant to scale,
 *   view placement, zoom, and paper Y-down), formatted with `lengthFormats(preset)` (true mm/in).
 * - Origin loss invalidates the table (`HOLE_TABLE_ORIGIN_LOST`); individual hole suppression,
 *   deletion, owner mismatch, or hidden rim marks only that row unresolved (`HOLE_TABLE_MEMBER_LOST`)
 *   without dropping the row or presenting stale coordinates as current.
 */
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import type { ModelNode, StudioDoc } from '../engine/doc';
type HoleNode = Extract<ModelNode, { kind: 'hole' }>;
import { dot } from '../engine/vec3';
import { nextFreeId } from '../util/ids';
import type { DrawingBodyMassSource } from './centerOfMass';
import { inView, resolvePoint } from './dimensions';
import type { Mark } from './sheet';
import { lengthFormats, type StandardPreset } from './standard';
import { tableLayout, type TableContent, type TableLayout } from './table';
import {
  SECTION_VIEWS,
  type DimView,
  type DrawingHoleTable,
  type DrawingHoleTableMember,
  type EdgeRef,
  type SectionViewId,
  type TableCorner,
  type Vec3,
  type XY,
} from './types';
import { toSheet, type ViewPlacement } from './views';

export const HOLE_TABLE_MAX_MEMBERS = 3;
export const HOLE_TABLE_TAG_RADIUS_MM = 2.4;
export const HOLE_TABLE_TAG_OFFSET_MM = 6.5;
export const HOLE_TABLE_ORIGIN_RADIUS_MM = 1.2;
const ZERO_EPS = 1e-6;
const NORMAL_TOL = 1e-6;
const TWO_PI = 2 * Math.PI;
const PLAIN_HOLE_SIDE = /^(n\d+)\.side\d+(?:#\d+)?$/;
const ANY_HOLE_SIDE = /^(.*?)(n\d+)(_p\d+)?\.side\d+/;

export interface QualifiedHoleRimOk {
  readonly ok: true;
  readonly owner: string;
  readonly rim: EdgeRef;
  readonly center3: Vec3;
  readonly center2: XY;
  readonly radius: number;
  readonly diameter: number;
}

export interface QualifiedHoleRimFail {
  readonly ok: false;
  readonly reason: string;
}

export type QualifiedHoleRim = QualifiedHoleRimOk | QualifiedHoleRimFail;

export interface ResolvedHoleTableMemberOk {
  readonly ok: true;
  readonly member: DrawingHoleTableMember;
  readonly center3: Vec3;
  readonly center2: XY;
  /** Signed coordinates relative to datum origin in model mm (`dot(C - O, right/up)`). */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly diameter: number;
  readonly xText: string;
  readonly yText: string;
  readonly sizeText: string;
}

export interface ResolvedHoleTableMemberLost {
  readonly ok: false;
  readonly member: DrawingHoleTableMember;
  readonly reason: string;
}

export type ResolvedHoleTableMember = ResolvedHoleTableMemberOk | ResolvedHoleTableMemberLost;

export interface ResolvedHoleTableOk {
  readonly ok: true;
  readonly table: DrawingHoleTable;
  readonly origin3: Vec3;
  readonly origin2: XY;
  readonly members: readonly ResolvedHoleTableMember[];
  readonly hasLostMember: boolean;
}

export interface ResolvedHoleTableLost {
  readonly ok: false;
  readonly table: DrawingHoleTable;
  readonly reason: string;
}

export type ResolvedHoleTable = ResolvedHoleTableOk | ResolvedHoleTableLost;

export function newHoleTableId(existing?: readonly DrawingHoleTable[]): string {
  return nextFreeId('ht', new Set((existing ?? []).map(t => t.id)));
}

export function newHoleTableMemberId(existing?: readonly DrawingHoleTableMember[]): string {
  return nextFreeId('hm', new Set((existing ?? []).map(m => m.id)));
}

/** Next available tag (`A1`, `A2`, `A3`, ...) avoiding every tag currently assigned in `existing`. */
export function nextHoleTableTag(existing?: readonly DrawingHoleTableMember[]): string {
  const used = new Set((existing ?? []).map(m => m.tag.toUpperCase()));
  for (let i = 1; i <= 999; i++) {
    const candidate = `A${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `A${(existing?.length ?? 0) + 1}`;
}

export function holeTagOk(tag: unknown): tag is string {
  return typeof tag === 'string' && tag.trim().length >= 1 && tag.trim().length <= 16 && !/[\r\n\t]/.test(tag);
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function sameCenter2(a: readonly unknown[], b: readonly unknown[]): boolean {
  return typeof a[0] === 'number' && typeof a[1] === 'number'
    && typeof b[0] === 'number' && typeof b[1] === 'number'
    && Math.abs(a[0] - b[0]) <= 1e-6 && Math.abs(a[1] - b[1]) <= 1e-6;
}

function isRoundInView(pr: BrepProjection, edge: ProjectedEdge): boolean {
  return !!edge.circle && Math.abs(dot(edge.circle.normal, pr.toward)) > 1 - NORMAL_TOL;
}

/** True when `edge` is a visible, unclipped 360° circular rim (including 180°+180° seam-split rims). */
function isVisibleFullCircle(pr: BrepProjection, edge: ProjectedEdge): boolean {
  const c = edge.circle;
  if (!c || edge.kind !== 'circle') return false;
  if (!edge.pieces.length || !edge.pieces.every(p => p.visible)) return false;
  if (c.full) return true;
  const tol = 1e-4 * Math.max(1, c.radius);
  let sweepSum = 0;
  for (const other of pr.edges) {
    if (other.kind !== 'circle' || !other.circle) continue;
    if (!other.pieces.length || !other.pieces.every(p => p.visible)) continue;
    const oc = other.circle;
    if (Math.abs(oc.radius - c.radius) > tol) continue;
    if (dist3(oc.center, c.center) > tol) continue;
    if (Math.abs(dot(oc.normal, c.normal)) < 1 - NORMAL_TOL) continue;
    sweepSum += oc.full ? TWO_PI : oc.sweep;
  }
  return Math.abs(sweepSum - TWO_PI) <= 1e-4;
}

function isCompoundPartner(nodes: readonly ModelNode[], index: number, node: HoleNode): boolean {
  const prev = nodes[index - 1];
  const next = nodes[index + 1];
  if (prev?.kind === 'hole' && !prev.suppressed && node.parent.node === index - 1 && sameCenter2(node.center, prev.center)) {
    return true;
  }
  if (next?.kind === 'hole' && !next.suppressed && next.parent.node === index && sameCenter2(next.center, node.center)) {
    return true;
  }
  return false;
}

function checkPlainThroughHoleNode(doc: StudioDoc, ownerId: string): { ok: true; node: HoleNode } | { ok: false; reason: string } {
  const index = doc.nodes.findIndex(n => n.id === ownerId);
  if (index < 0) {
    return { ok: false, reason: `Hole ${ownerId} is no longer in the document (authored feature ID required).` };
  }
  const node = doc.nodes[index];
  if (node.kind !== 'hole') {
    return { ok: false, reason: `Feature ${ownerId} is not a Hole feature (bosses, fillets, and cutouts are outside the v1 hole table scope).` };
  }
  if (node.suppressed) {
    return { ok: false, reason: `Hole ${ownerId} is suppressed.` };
  }
  if (node.pattern) {
    return { ok: false, reason: `Hole ${ownerId} is a patterned hole; v1 hole tables accept independent plain-through holes only.` };
  }
  if (node.thread) {
    return { ok: false, reason: `Hole ${ownerId} is threaded; v1 hole tables accept plain-through holes only.` };
  }
  if (node.depth !== undefined) {
    return { ok: false, reason: `Hole ${ownerId} is a blind hole; v1 hole tables accept plain-through holes only.` };
  }
  if (node.countersink !== undefined || node.csk !== undefined) {
    return { ok: false, reason: `Hole ${ownerId} is countersunk; v1 hole tables accept plain-through holes only.` };
  }
  if (isCompoundPartner(doc.nodes, index, node)) {
    return { ok: false, reason: `Hole ${ownerId} is a compound (counterbore/countersink) hole; v1 hole tables accept plain-through holes only.` };
  }
  return { ok: true, node };
}

function extractPlainHoleOwnerFromEdgeName(edgeName: string): { ok: true; owner: string } | { ok: false; reason: string } {
  const faces = edgeName.split('|');
  for (const face of faces) {
    const any = ANY_HOLE_SIDE.exec(face);
    if (!any) continue;
    if (any[1]) return { ok: false, reason: 'Assembly instance holes are outside the v1 base-part hole table scope.' };
    if (any[3]) return { ok: false, reason: 'Patterned hole copies are outside the v1 hole table scope.' };
    const exact = PLAIN_HOLE_SIDE.exec(face);
    if (exact) return { ok: true, owner: exact[1] };
  }
  return { ok: false, reason: 'Selected circle is not an authored Hole feature rim (bosses, fillets, and extrusions are excluded).' };
}

function findMatchingRimEdge(pr: BrepProjection, rim: EdgeRef): ProjectedEdge | null {
  const sameName = pr.edges.filter(e => e.name === rim.edge && e.kind === 'circle' && !!e.circle);
  let best: ProjectedEdge | null = null;
  let bestD = Infinity;
  for (const edge of sameName) {
    const d = dist3(edge.circle!.center, rim.near);
    if (d < bestD) { bestD = d; best = edge; }
  }
  return best;
}

/**
 * Qualify one picked visible full-circle rim edge as an eligible plain-through Hole feature
 * for adding to a v1 hole table.
 */
export function qualifyHoleTableRim(
  doc: StudioDoc,
  pr: BrepProjection,
  view: DimView,
  edge: ProjectedEdge,
): QualifiedHoleRim {
  if (!SECTION_VIEWS.includes(view as SectionViewId)) {
    return { ok: false, reason: 'Hole tables are supported only on ordinary front, top, and right views.' };
  }
  if (edge.kind !== 'circle' || !edge.circle) {
    return { ok: false, reason: 'Select a visible full-circle hole rim.' };
  }
  if (!isRoundInView(pr, edge)) {
    return { ok: false, reason: 'Hole rim must appear true round (perpendicular to the view direction).' };
  }
  if (!isVisibleFullCircle(pr, edge)) {
    return { ok: false, reason: 'Hole rim must be a fully visible, unclipped 360° circle.' };
  }
  const ownerHit = extractPlainHoleOwnerFromEdgeName(edge.name);
  if (!ownerHit.ok) return ownerHit;
  const nodeCheck = checkPlainThroughHoleNode(doc, ownerHit.owner);
  if (!nodeCheck.ok) return nodeCheck;

  const center3: Vec3 = [edge.circle.center[0], edge.circle.center[1], edge.circle.center[2]];
  const radius = edge.circle.radius;
  return {
    ok: true,
    owner: ownerHit.owner,
    rim: { edge: edge.name, near: center3 },
    center3,
    center2: inView(pr, center3),
    radius,
    diameter: radius * 2,
  };
}

function formatSignedCoord(value: number, fmt: (mm: number) => string): string {
  if (Math.abs(value) <= ZERO_EPS) return fmt(0);
  const absText = fmt(Math.abs(value));
  return value < 0 ? `-${absText}` : absText;
}

/** Resolve one hole table against the live document and orthographic view projection. */
export function resolveHoleTable(
  doc: StudioDoc | undefined,
  pr: BrepProjection,
  table: DrawingHoleTable,
  view: DimView,
  preset: StandardPreset,
  comSources?: ReadonlyMap<string, DrawingBodyMassSource>,
): ResolvedHoleTable {
  if (!SECTION_VIEWS.includes(view as SectionViewId)) {
    return { ok: false, table, reason: 'Hole tables are supported only on ordinary front, top, and right views.' };
  }
  if (!doc) {
    return { ok: false, table, reason: 'Hole table source document is not available.' };
  }
  if (!table.members.length || table.members.length > HOLE_TABLE_MAX_MEMBERS) {
    return { ok: false, table, reason: `Hole tables support 1 to ${HOLE_TABLE_MAX_MEMBERS} selected holes.` };
  }
  const origin3 = resolvePoint(pr, table.origin, comSources);
  if (!origin3) {
    return { ok: false, table, reason: 'The hole table origin reference is no longer in the part.' };
  }
  const origin2 = inView(pr, origin3);
  const { primary: fmtPrimary, secondary: fmtAlt } = lengthFormats(preset);

  let hasLostMember = false;
  const members: ResolvedHoleTableMember[] = table.members.map((member): ResolvedHoleTableMember => {
    const nodeCheck = checkPlainThroughHoleNode(doc, member.owner);
    if (!nodeCheck.ok) {
      hasLostMember = true;
      return { ok: false, member, reason: nodeCheck.reason };
    }
    const edge = findMatchingRimEdge(pr, member.rim);
    if (!edge || !edge.circle) {
      hasLostMember = true;
      return { ok: false, member, reason: `Hole ${member.tag} (${member.owner}) rim is no longer visible in ${view}.` };
    }
    const edgeOwner = extractPlainHoleOwnerFromEdgeName(edge.name);
    if (!edgeOwner.ok || edgeOwner.owner !== member.owner) {
      hasLostMember = true;
      return { ok: false, member, reason: `Hole ${member.tag} rim no longer belongs to authored feature ${member.owner}.` };
    }
    if (!isRoundInView(pr, edge) || !isVisibleFullCircle(pr, edge)) {
      hasLostMember = true;
      return { ok: false, member, reason: `Hole ${member.tag} (${member.owner}) is no longer a visible full-circle rim in ${view}.` };
    }

    const center3: Vec3 = [edge.circle.center[0], edge.circle.center[1], edge.circle.center[2]];
    const center2 = inView(pr, center3);
    const rawX = center2[0] - origin2[0];
    const rawY = center2[1] - origin2[1];
    const x = Math.abs(rawX) <= ZERO_EPS ? 0 : rawX;
    const y = Math.abs(rawY) <= ZERO_EPS ? 0 : rawY;
    const radius = edge.circle.radius;
    const diameter = radius * 2;
    const xPrimary = formatSignedCoord(x, fmtPrimary);
    const yPrimary = formatSignedCoord(y, fmtPrimary);
    const xText = fmtAlt ? `${xPrimary} [${formatSignedCoord(x, fmtAlt)}]` : xPrimary;
    const yText = fmtAlt ? `${yPrimary} [${formatSignedCoord(y, fmtAlt)}]` : yPrimary;
    const diaPrimary = fmtPrimary(diameter);
    const sizeText = fmtAlt ? `Ø${diaPrimary} [Ø${fmtAlt(diameter)}] THRU` : `Ø${diaPrimary} THRU`;

    return {
      ok: true,
      member,
      center3,
      center2,
      x,
      y,
      radius,
      diameter,
      xText,
      yText,
      sizeText,
    };
  });

  return { ok: true, table, origin3, origin2, members, hasLostMember };
}

/** Build `TableContent` for a resolved hole table, preserving member order, tags, and unresolved markers. */
export function holeTableContent(resolved: ResolvedHoleTableOk, preset: StandardPreset): TableContent {
  const unit = preset.units === 'inch' ? 'in' : 'mm';
  const rows = resolved.members.map(m => m.ok
    ? [m.member.tag, m.xText, m.yText, m.sizeText]
    : [m.member.tag, 'UNRESOLVED', 'UNRESOLVED', 'UNRESOLVED']);
  const count = resolved.table.members.length;
  return {
    title: resolved.table.title ?? 'HOLE TABLE',
    columns: [
      { key: 'tag', label: 'TAG', align: 'middle' },
      { key: 'x', label: 'X LOC', unit, align: 'end' },
      { key: 'y', label: 'Y LOC', unit, align: 'end' },
      { key: 'size', label: 'SIZE', align: 'start' },
    ],
    rows,
    notes: [
      `Selected holes: ${count} (datum origin O; explicit selection only)`,
      ...(resolved.hasLostMember ? ['Warning: one or more selected holes are unresolved'] : []),
    ],
  };
}

/** View marks (sheet mm, y-down): datum origin crosshair + +X/+Y axes + circular hole tag bubbles with leaders. */
export function holeTableViewMarks(vp: ViewPlacement, resolved: ResolvedHoleTableOk, preset: StandardPreset): Mark[] {
  const marks: Mark[] = [];
  const O = toSheet(vp, resolved.origin2);
  const r = HOLE_TABLE_ORIGIN_RADIUS_MM;
  const arm = 4.5;
  const textH = Math.min(2.4, preset.text);

  // Origin datum O circle + short +X (right) and +Y (up = -sheetY) axes.
  marks.push(
    { kind: 'arc', center: O, u: [r, 0], v: [0, r], t0: 0, t1: TWO_PI, pen: 'thin' },
    { kind: 'line', a: [O[0] - r, O[1]], b: [O[0] + arm, O[1]], pen: 'thin' },
    { kind: 'line', a: [O[0], O[1] + r], b: [O[0], O[1] - arm], pen: 'thin' },
    { kind: 'text', at: [O[0] + arm + 1.2, O[1] + textH * 0.35], text: '+X', size: textH * 0.85, anchor: 'start' },
    { kind: 'text', at: [O[0], O[1] - arm - 1.0], text: '+Y', size: textH * 0.85, anchor: 'middle' },
    { kind: 'text', at: [O[0] - r - 1.2, O[1] + textH + 0.6], text: 'O', size: textH, anchor: 'end', bold: true },
  );

  // Hole tag bubbles + leader lines from each resolved hole's rim.
  const viewCenter: XY = [(vp.box[0] + vp.box[2]) / 2, (vp.box[1] + vp.box[3]) / 2];
  resolved.members.forEach((m, index) => {
    if (!m.ok) return;
    const C = toSheet(vp, m.center2);
    const rimR = m.radius * vp.scale;
    let dx = C[0] - viewCenter[0];
    let dy = C[1] - viewCenter[1];
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      dx /= len;
      dy /= len;
    } else {
      const ang = -Math.PI / 4 + index * (Math.PI / 3);
      dx = Math.cos(ang);
      dy = Math.sin(ang);
    }
    const rimPt: XY = [C[0] + dx * rimR, C[1] + dy * rimR];
    const tagR = HOLE_TABLE_TAG_RADIUS_MM;
    const dist = rimR + HOLE_TABLE_TAG_OFFSET_MM;
    const tagC: XY = [C[0] + dx * dist, C[1] + dy * dist];
    const leaderEnd: XY = [tagC[0] - dx * tagR, tagC[1] - dy * tagR];

    marks.push(
      { kind: 'line', a: rimPt, b: leaderEnd, pen: 'thin' },
      { kind: 'arc', center: tagC, u: [tagR, 0], v: [0, tagR], t0: 0, t1: TWO_PI, pen: 'thin' },
      { kind: 'text', at: [tagC[0], tagC[1] + textH * 0.35], text: m.member.tag, size: textH, anchor: 'middle', bold: true },
    );
  });

  return marks;
}

/** Lay out the hole table grid in sheet mm using `tableLayout`. */
export function holeTableSheetLayout(
  resolved: ResolvedHoleTableOk,
  preset: StandardPreset,
  defaultAnchor: XY,
  defaultCorner: TableCorner = 'bottom-right',
  textHeight = 2.5,
): TableLayout {
  const content = holeTableContent(resolved, preset);
  const at = resolved.table.at ?? defaultAnchor;
  const corner = resolved.table.at ? (resolved.table.corner ?? 'top-left') : defaultCorner;
  return tableLayout(content, at, corner, textHeight);
}

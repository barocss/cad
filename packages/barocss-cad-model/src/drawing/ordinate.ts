/**
 * Source-bound common-origin ordinate dimension groups (D2018, #219).
 *
 * Truth rules:
 * - One explicit datum `origin: DimPoint`, one `axis: 'horizontal' | 'vertical'`, and explicit `members[]`
 *   each carrying its own `id`, `point: DimPoint`, and optional presentation-only `jog` (sheet mm).
 * - Measured values are signed differences in model mm along the chosen view axis (`memberCoord - originCoord`).
 *   Values are completely invariant to whole-part translation, sheet layout, scale, `lineCoord` group moves,
 *   individual `jog` offsets, and display units (mm / inch / dual / precision).
 * - Origin `0` is rendered distinctly (datum circle + `0` label) and is never conflated with a member at 0.
 * - Distinct members sharing the same coordinate are preserved independently (never collapsed/deduplicated).
 * - Origin loss invalidates the whole group (`ORDINATE_ORIGIN_LOST`), whereas a lost member marks only that
 *   member lost (`ORDINATE_MEMBER_LOST`) while keeping all other healthy members live.
 */
import type { BrepProjection } from '@barocss/cad';
import { nextFreeId } from '../util/ids';
import type { DrawingBodyMassSource } from './centerOfMass';
import { inView, resolvePoint } from './dimensions';
import { PENS, type Mark } from './sheet';
import { lengthFormats, type StandardPreset } from './standard';
import {
  SECTION_VIEWS,
  type DimView,
  type DrawingOrdinateGroup,
  type DrawingOrdinateMember,
  type SectionViewId,
  type Vec3,
  type XY,
} from './types';
import { toSheet, type ViewPlacement } from './views';

export const ORDINATE_GAP_MM = 1;
export const ORDINATE_EXT_PAST_MM = 2;
export const ORDINATE_ORIGIN_RADIUS_MM = 0.85;
export const ORDINATE_JOG_MIN_MM = 0.5;
export const ORDINATE_JOG_MAX_MM = 40;
const ZERO_EPS = 1e-6;

export interface ResolvedOrdinateMemberOk {
  readonly ok: true;
  readonly member: DrawingOrdinateMember;
  readonly point3: Vec3;
  readonly point: XY;
  /** Signed coordinate relative to the group origin in model mm. */
  readonly value: number;
  readonly text: string;
  readonly alt?: string;
  readonly jog: number;
}

export interface ResolvedOrdinateMemberLost {
  readonly ok: false;
  readonly member: DrawingOrdinateMember;
  readonly reason: string;
}

export type ResolvedOrdinateMember = ResolvedOrdinateMemberOk | ResolvedOrdinateMemberLost;

export interface ResolvedOrdinateGroupOk {
  readonly ok: true;
  readonly group: DrawingOrdinateGroup;
  readonly origin3: Vec3;
  readonly origin: XY;
  readonly originText: string;
  readonly members: readonly ResolvedOrdinateMember[];
}

export interface ResolvedOrdinateGroupLost {
  readonly ok: false;
  readonly group: DrawingOrdinateGroup;
  readonly reason: string;
}

export type ResolvedOrdinateGroup = ResolvedOrdinateGroupOk | ResolvedOrdinateGroupLost;

export function ordinateJogOk(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && Math.abs(value) >= ORDINATE_JOG_MIN_MM && Math.abs(value) <= ORDINATE_JOG_MAX_MM;
}

export function newOrdinateGroupId(existing?: readonly DrawingOrdinateGroup[]): string {
  return nextFreeId('ord', new Set((existing ?? []).map(g => g.id)));
}

export function newOrdinateMemberId(existing?: readonly DrawingOrdinateMember[]): string {
  return nextFreeId('m', new Set((existing ?? []).map(m => m.id)));
}

function formatSignedValue(value: number, format: (v: number) => string): string {
  if (Math.abs(value) <= ZERO_EPS) return format(0);
  const absText = format(Math.abs(value));
  return value < 0 ? `-${absText}` : absText;
}

/** Resolve one ordinate group against its orthographic view projection. */
export function resolveOrdinateGroup(
  pr: BrepProjection,
  group: DrawingOrdinateGroup,
  view: DimView,
  preset: StandardPreset,
  comSources?: ReadonlyMap<string, DrawingBodyMassSource>,
): ResolvedOrdinateGroup {
  if (!SECTION_VIEWS.includes(view as SectionViewId)) {
    return { ok: false, group, reason: 'Ordinate dimension groups are supported only on ordinary front, top, and right views.' };
  }
  const origin3 = resolvePoint(pr, group.origin, comSources);
  if (!origin3) {
    return { ok: false, group, reason: 'The ordinate origin reference is no longer in the part.' };
  }
  const origin = inView(pr, origin3);
  const coordIndex = group.axis === 'horizontal' ? 0 : 1;
  const originCoord = origin[coordIndex];
  const { primary: fmtPrimary, secondary: fmtAlt } = lengthFormats(preset);
  const originText = fmtPrimary(0);

  const members: ResolvedOrdinateMember[] = group.members.map((member): ResolvedOrdinateMember => {
    const point3 = resolvePoint(pr, member.point, comSources);
    if (!point3) {
      return { ok: false, member, reason: `Member ${member.id}'s reference is no longer in the part.` };
    }
    const point = inView(pr, point3);
    const raw = point[coordIndex] - originCoord;
    const value = Math.abs(raw) <= ZERO_EPS ? 0 : raw;
    const text = formatSignedValue(value, fmtPrimary);
    const alt = fmtAlt ? formatSignedValue(value, fmtAlt) : undefined;
    const jog = member.jog !== undefined && ordinateJogOk(member.jog) ? member.jog : 0;
    return {
      ok: true,
      member,
      point3,
      point,
      value,
      text,
      ...(alt !== undefined ? { alt } : {}),
      jog,
    };
  });

  return { ok: true, group, origin3, origin, originText, members };
}

/** Determine default ordinate axis from origin point and baseline click in view mm. */
export function ordinateAxisFor(origin: XY, click: XY): 'horizontal' | 'vertical' {
  const dx = Math.abs(click[0] - origin[0]);
  const dy = Math.abs(click[1] - origin[1]);
  // Above/below origin -> horizontal measurements (X coordinates with vertical witness lines).
  // Left/right of origin -> vertical measurements (Y coordinates with horizontal witness lines).
  return dy >= dx ? 'horizontal' : 'vertical';
}

/**
 * Render an ordinate group in sheet mm (y-down):
 * - Origin: thin witness line + hollow datum circle at baseline + `0` label.
 * - Each resolved member: straight or 3-segment jogged witness line + formatted value label.
 */
export function ordinateGroupMarks(vp: ViewPlacement, resolved: ResolvedOrdinateGroupOk, preset: StandardPreset): Mark[] {
  const marks: Mark[] = [];
  const textH = preset.text;
  const isHoriz = resolved.group.axis === 'horizontal';
  const lineCoord = resolved.group.lineCoord;
  // Convert the baseline coordinate to sheet mm by sampling a point on the baseline.
  const baseSample = toSheet(vp, isHoriz ? [resolved.origin[0], lineCoord] : [lineCoord, resolved.origin[1]]);
  const lineSheet = isHoriz ? baseSample[1] : baseSample[0];

  const drawWitness = (ptView: XY, label: string, jogMM: number, isOrigin: boolean): void => {
    const P = toSheet(vp, ptView);
    if (isHoriz) {
      // Measured along X (sheet X); witness line runs vertically from P[1] toward lineSheet
      const dirY = lineSheet >= P[1] ? 1 : -1;
      const startY = P[1] + dirY * ORDINATE_GAP_MM;
      const tipY = lineSheet + dirY * ORDINATE_EXT_PAST_MM;
      const labelX = P[0] + jogMM;
      if (Math.abs(jogMM) >= ORDINATE_JOG_MIN_MM && Math.abs(lineSheet - startY) > 2) {
        const knee1Y = startY + (lineSheet - startY) * 0.55;
        const knee2Y = startY + (lineSheet - startY) * 0.8;
        marks.push({ kind: 'line', a: [P[0], startY], b: [P[0], knee1Y], pen: 'thin', role: 'extension' });
        marks.push({ kind: 'line', a: [P[0], knee1Y], b: [labelX, knee2Y], pen: 'thin', role: 'extension' });
        marks.push({ kind: 'line', a: [labelX, knee2Y], b: [labelX, tipY], pen: 'thin', role: 'extension' });
      } else {
        marks.push({ kind: 'line', a: [P[0], startY], b: [labelX, tipY], pen: 'thin', role: 'extension' });
      }
      if (isOrigin) {
        marks.push({
          kind: 'arc',
          center: [labelX, lineSheet],
          u: [ORDINATE_ORIGIN_RADIUS_MM, 0],
          v: [0, ORDINATE_ORIGIN_RADIUS_MM],
          t0: 0,
          t1: Math.PI * 2,
          pen: 'thin',
        });
      }
      const textY = dirY > 0 ? tipY + textH + 0.8 : tipY - 0.8;
      marks.push({
        kind: 'text',
        at: [labelX, textY],
        text: label,
        size: textH,
        anchor: 'middle',
      });
    } else {
      // Measured along Y (sheet Y, inverted); witness line runs horizontally from P[0] toward lineSheet
      const dirX = lineSheet >= P[0] ? 1 : -1;
      const startX = P[0] + dirX * ORDINATE_GAP_MM;
      const tipX = lineSheet + dirX * ORDINATE_EXT_PAST_MM;
      // Positive jog moves label upward in view coordinates (negative sheet Y)
      const labelY = P[1] - jogMM;
      if (Math.abs(jogMM) >= ORDINATE_JOG_MIN_MM && Math.abs(lineSheet - startX) > 2) {
        const knee1X = startX + (lineSheet - startX) * 0.55;
        const knee2X = startX + (lineSheet - startX) * 0.8;
        marks.push({ kind: 'line', a: [startX, P[1]], b: [knee1X, P[1]], pen: 'thin', role: 'extension' });
        marks.push({ kind: 'line', a: [knee1X, P[1]], b: [knee2X, labelY], pen: 'thin', role: 'extension' });
        marks.push({ kind: 'line', a: [knee2X, labelY], b: [tipX, labelY], pen: 'thin', role: 'extension' });
      } else {
        marks.push({ kind: 'line', a: [startX, P[1]], b: [tipX, labelY], pen: 'thin', role: 'extension' });
      }
      if (isOrigin) {
        marks.push({
          kind: 'arc',
          center: [lineSheet, labelY],
          u: [ORDINATE_ORIGIN_RADIUS_MM, 0],
          v: [0, ORDINATE_ORIGIN_RADIUS_MM],
          t0: 0,
          t1: Math.PI * 2,
          pen: 'thin',
        });
      }
      const textX = dirX > 0 ? tipX + 1.0 : tipX - 1.0;
      marks.push({
        kind: 'text',
        at: [textX, labelY + textH * 0.35],
        text: label,
        size: textH,
        anchor: dirX > 0 ? 'start' : 'end',
      });
    }
  };

  drawWitness(resolved.origin, resolved.originText, 0, true);
  for (const m of resolved.members) {
    if (!m.ok) continue;
    const label = m.alt !== undefined ? `${m.text} [${m.alt}]` : m.text;
    drawWitness(m.point, label, m.jog, false);
  }
  void PENS;
  return marks;
}

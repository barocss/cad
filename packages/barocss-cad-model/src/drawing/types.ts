import { readNoteTarget, type NoteTarget } from './noteTargets';
export type { NoteTarget } from './noteTargets';
// A 2D drawing of the part: settings kept in the document (doc.drawing), the views projected from the
// part's B-rep by the kernel's hidden-line projection, and dimensions that refer to model edges by
// their persistent names (so they keep measuring the part as it changes).
import type { BrepProjection } from '@barocss/cad';
import type { DrawingScope } from './scope';
import type { Sig } from '../engine/references';
import { isVec3 } from '../util/guards';
import { readDetails, type DrawingDetail } from './detail';
import { readBreaks, type DrawingBreak } from './breaks';
import { MAX_PRECISION, inchFractionOk, type DrawingStandard, type DrawingUnits, type InchFractionDenominator, type UnitPrecision } from './standard';
import { foreshortenOk, isOrthographicView, type ForeshortenedRadius } from './foreshorten';
export type { ForeshortenedRadius } from './foreshorten';
import { readDatums, type DrawingFace, type DrawingFaceRef } from './datums';
export type { DrawingFaceRef } from './datums';
import { readDatumTargets, type DrawingDatumTarget } from './datumTargets';
export type { DrawingDatumTarget } from './datumTargets';
import { readFrames, type DrawingFrame } from './controls';
export type { DrawingFrame } from './controls';
import { readTitleBlock, readRevisions, type DrawingTitleBlock, type DrawingRevision } from './metadata';
import { readSheets, type DrawingSheet, type SheetContext } from './sheets';
export type { DrawingSheet, SheetContext };
export type { DrawingTitleBlock, DrawingRevision };
export type { DrawingDetail, DrawingBreak };

export type ViewId = 'front' | 'top' | 'right' | 'iso';
export const VIEW_IDS: readonly ViewId[] = ['front', 'top', 'right', 'iso'];
/** O148 X2: where a dimension sits — a view, or a section by its letter (`section:A`). */
export type SectionRef = `section:${string}`;
/** DR-1: a detail view by its letter (`detail:B`). */
export type DetailRef = `detail:${string}`;
export type DimView = ViewId | SectionRef | DetailRef;
export const isSectionRef = (v: string): v is SectionRef => /^section:[A-Z]{1,2}$/.test(v);
export const sectionLetter = (v: SectionRef) => v.slice(8);
export const isDetailRef = (v: string): v is DetailRef => /^detail:[A-Z]{1,2}$/.test(v);
export const detailLetter = (v: DetailRef) => v.slice(7);
/** One of the four views (not a section's or a detail's). */
export const isViewId = (v: string): v is ViewId => (VIEW_IDS as readonly string[]).includes(v);
/** The view whose axes a view, a section or a detail is drawn in (a section's view; a detail's parent's); unknown: the front. */
export function baseViewOf(v: DimView, sections: readonly { id: string; view: ViewId }[], details: readonly { id: string; view: DimView }[] = []): ViewId {
  if (isDetailRef(v)) { const d = details.find(x => x.id === detailLetter(v)); return d && !isDetailRef(d.view) ? baseViewOf(d.view, sections) : 'front'; }
  if (isSectionRef(v)) return sections.find(x => x.id === sectionLetter(v))?.view ?? 'front';
  return v;
}
/** A dimension's view read from a file: a view, a section's letter or a detail's. */
export const isDimView = (v: unknown): v is DimView => typeof v === 'string' && (isViewId(v) || isSectionRef(v) || isDetailRef(v));
// (R7.3c, conventions §10.2: the one Vec3, engine/vec3's.)
import type { Vec3 } from '../engine/vec3';
export type { Vec3 };
export type XY = [number, number];

/**
 * A point of a dimension: an end of an edge (the end nearest `near`, the model point it was picked
 * at) or a circle's centre.
 */
/** A hole's centre by an edge of its circle (R14.5, O6): a member of a pitch circle. */
export interface CentreRef { edge: string; near: Vec3; sig?: Sig; was?: string }
/**
 * `at: 'pcd'` (R14.5, O6): the centre of the circle through the centres of `ring`'s holes (a bolt circle's centre, which
 * no edge has); `edge`/`near` are then its first member's.
 * `at: 'virtual-sharp'`: the theoretical intersection of two non-parallel coplanar straight edges (`edge`/`near` + `second`).
 * `at: 'com'`: the live 3D center of mass of an explicit qualified made solid body (`bodyKey`).
 */
export interface DimPoint { edge: string; at: 'end' | 'center' | 'pcd' | 'virtual-sharp' | 'com'; near: Vec3; sig?: Sig; was?: string; ring?: CentreRef[]; second?: EdgeRef; virtualSharpId?: string; bodyKey?: string; comId?: string }
/** A dimension's tolerance: ± one value, an upper and a lower deviation, or a fit (H7, h6, …). */
export type Tolerance = { kind: 'symmetric'; value: number } | { kind: 'deviation'; upper: number; lower: number } | { kind: 'fit'; code: string };
/**
 * `place`: where the dimension line (or a leader's text) goes, in the view's model coordinates (mm); `tol`: its tolerance.
 * `count` (R14.1, O2): it stands for that many — a diameter for as many equal holes (`4× Ø6.6 THRU`), a linear dimension
 * for as many equal spaces of a row (`3× 20`). `auto`: placed by Auto-dimension. Authored tolerances and controls protect it from replacement.
 * `basic` (R14.4, O5): a theoretically exact dimension, its text boxed (a position tolerance's frame holds the tolerance).
 */
export type LinearArrowSide = 'inside' | 'outside';
export type LinearArrowPlacement = Partial<Record<'a' | 'b', LinearArrowSide>>;

export const DEFAULT_CROSSING_BREAK_GAP = 2;
export const MIN_CROSSING_BREAK_GAP = 1;
export const MAX_CROSSING_BREAK_GAP = 10;

export const DEFAULT_EXTENSION_JOG_OFFSET = -4;
export const MIN_EXTENSION_JOG_OFFSET = 1;
export const MAX_EXTENSION_JOG_OFFSET = 40;
export const DEFAULT_EXTENSION_JOG_AT = 0.5;
export const MIN_EXTENSION_JOG_AT = 0.2;
export const MAX_EXTENSION_JOG_AT = 0.8;

export interface LinearExtensionJog {
  readonly side: 'a' | 'b';
  readonly offset: number;
  readonly at?: number;
}

export function extensionJogOffsetOk(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && Math.abs(value) >= MIN_EXTENSION_JOG_OFFSET && Math.abs(value) <= MAX_EXTENSION_JOG_OFFSET;
}

export function extensionJogAtOk(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= MIN_EXTENSION_JOG_AT && value <= MAX_EXTENSION_JOG_AT;
}

/** Persist only verified endpoint role ('a' | 'b'), bounded nonzero sheet-mm offset, and optional normalized position. */
export function readLinearExtensionJog(raw: unknown): LinearExtensionJog | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.side !== 'a' && r.side !== 'b') return undefined;
  if (!extensionJogOffsetOk(r.offset)) return undefined;
  if (r.at !== undefined && !extensionJogAtOk(r.at)) return undefined;
  const offset = Math.round(r.offset * 1000) / 1000;
  const at = r.at !== undefined ? Math.round(r.at * 1000) / 1000 : undefined;
  return { side: r.side, offset, ...(at !== undefined && Math.abs(at - DEFAULT_EXTENSION_JOG_AT) > 1e-6 ? { at } : {}) };
}

export interface LinearCrossingBreakTarget {
  readonly id: string;
  readonly orient: 'horizontal' | 'vertical' | 'aligned';
  readonly aEdge: string;
  readonly bEdge: string;
}

export interface LinearCrossingBreak {
  readonly over: string;
  readonly gap: number;
  readonly target: LinearCrossingBreakTarget;
}

export function crossingBreakGapOk(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= MIN_CROSSING_BREAK_GAP && value <= MAX_CROSSING_BREAK_GAP;
}

/** Persist only verified target identity and bounded sheet-mm gap; rejects NaN, non-positive gaps, and incomplete targets. */
export function readLinearCrossingBreak(raw: unknown): LinearCrossingBreak | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.over !== 'string' || !r.over) return undefined;
  const gap = r.gap === undefined ? DEFAULT_CROSSING_BREAK_GAP : r.gap;
  if (!crossingBreakGapOk(gap)) return undefined;
  const target = r.target as Record<string, unknown> | undefined;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return undefined;
  if (target.id !== r.over) return undefined;
  if (target.orient !== 'horizontal' && target.orient !== 'vertical' && target.orient !== 'aligned') return undefined;
  if (typeof target.aEdge !== 'string' || !target.aEdge || typeof target.bEdge !== 'string' || !target.bEdge) return undefined;
  return {
    over: r.over,
    gap: Math.round(gap * 1000) / 1000,
    target: { id: target.id, orient: target.orient, aEdge: target.aEdge, bEdge: target.bEdge },
  };
}

/** Persist only explicit, valid A/B overrides; a missing endpoint follows Auto. */
export function readLinearArrowPlacement(raw: unknown): LinearArrowPlacement | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { a, b } = raw as Record<string, unknown>;
  const placement: LinearArrowPlacement = { ...(a === 'inside' || a === 'outside' ? { a } : {}), ...(b === 'inside' || b === 'outside' ? { b } : {}) };
  return placement.a || placement.b ? placement : undefined;
}

export interface ArcLengthDimensionData {
  id: string;
  view: DimView;
  kind: 'arc-length';
  /** Nested arc reference (not top-level `edge`/`near`) so older readers never misread arc length as radius. */
  arc: EdgeRef;
  place: XY;
}

export interface ChamferDimensionData {
  id: string;
  view: DimView;
  kind: 'chamfer';
  /** Nested bevel and adjacent wall references so older readers never misread chamfer as radius or angle. */
  chamfer: EdgeRef;
  adjacent: EdgeRef;
  place: XY;
}

export interface RadialThicknessDimensionData {
  id: string;
  view: DimView;
  kind: 'radial-thickness';
  /** Nested references to two distinct coplanar concentric full circles (no top-level `edge`/`near`). */
  first: EdgeRef;
  second: EdgeRef;
  place: XY;
}

/** A cylindrical face referenced by persistent face name and a 3D point on its picked silhouette generator. */
export interface CylinderFaceRef {
  face: string;
  near: Vec3;
  sig?: Sig;
  was?: string;
}

export interface CylinderDiameterDimensionData {
  id: string;
  view: DimView;
  kind: 'cylinder-diameter';
  /** Nested cylindrical face reference (no top-level `edge`/`near`) so older readers never misread it. */
  cylinder: CylinderFaceRef;
  place: XY;
}

export type CircleSeparationMode = 'min' | 'max';

export interface CircleSeparationDimensionData {
  id: string;
  view: DimView;
  kind: 'circle-separation';
  /** Nested references to two distinct coplanar externally disjoint full circles (no top-level `edge`/`near`). */
  first: EdgeRef;
  second: EdgeRef;
  mode: CircleSeparationMode;
  place: XY;
}

export type DrawingDimension = ({ tol?: Tolerance; count?: number; auto?: true; basic?: true }) & (
  | { id: string; view: DimView; kind: 'linear'; a: DimPoint; b: DimPoint; orient: 'horizontal' | 'vertical' | 'aligned'; place: XY; /** Hide only this reference role’s extension line; omitted means both visible. */ hideExtension?: 'a' | 'b'; arrowPlacement?: LinearArrowPlacement; /** Optional sheet-mm break on this linear dimension line where it crosses one verified sibling linear dimension line. */ crossingBreak?: LinearCrossingBreak; /** Optional display-only jog on one extension line ('a' or 'b'); measured endpoints and value stay unchanged. */ extensionJog?: LinearExtensionJog }
  | { id: string; view: DimView; kind: 'diameter'; edge: string; near: Vec3; place: XY; sig?: Sig; was?: string }
  | { id: string; view: DimView; kind: 'radius'; edge: string; near: Vec3; place: XY; sig?: Sig; was?: string; /** Optional foreshortened display origin in view model coordinates (mm); true radius and center remain native. */ foreshorten?: ForeshortenedRadius }
  | ArcLengthDimensionData
  | ChamferDimensionData
  | RadialThicknessDimensionData
  | CylinderDiameterDimensionData
  | CircleSeparationDimensionData
  /** A pitch circle (R14.5, O6): the circle through the centres of three or more holes, its diameter as `Ø40 PCD`. */
  | { id: string; view: DimView; kind: 'pcd'; ring: CentreRef[]; place: XY }
  /** Between two straight edges (each the one of its name nearest `near`), in the sector holding `place`. */
  | { id: string; view: DimView; kind: 'angle'; a: EdgeRef; b: EdgeRef; place: XY; /** The long angle of one linked native Top corner; omitted keeps the placement-selected ordinary sector. */ mode?: 'reflex' });
/**
 * A note: lines of text with their top left at `at` (sheet mm), and optionally a leader to a point
 * of a view (`leader.at` in the view's model coordinates, so it follows the view).
 */
/**
 * A datum feature (R14.4, O5): its letter in a box at `place` (the view's model coordinates), a leader to a filled triangle
 * on a straight edge of the view (the face seen edge-on).
 */
export type DrawingDatum = { id: string; letter: string; view: ViewId; place: XY } & ({ edge: EdgeRef; face?: never } | { face: DrawingFaceRef; edge?: never });
export interface DrawingNote { id: string; text: string; at: XY; leader?: { view: ViewId; at: XY; target?: NoteTarget }; /** 11 ④: a note without a leader, on this sheet (its id) of a drawing with sheets; absent: the first sheet. */ sheet?: string }
/** A table's column (O49): its header `label [unit]`, numbers shown to `digits` places (absent: up to 2) and aligned right by default. */
export interface TableColumn { key: string; label: string; unit?: string; align?: 'start' | 'middle' | 'end'; digits?: number }
/** A cell: text, a number (formatted by its column), or null (shown as '—'). */
export type TableCell = string | number | null;
export type TableCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
/**
 * A table on the sheet (O49): its content given (`columns`, `rows`) or filled from the part at each build by a named
 * source (`from`: 'bends', R12's bend table; the kernel lane's cut list). `at`: a sheet point (mm, y down) that its
 * `corner` (default top-left) is on; absent, it is laid out above the title block, right-aligned, stacked upward.
 */
export interface DrawingTable { id: string; title?: string; columns?: TableColumn[]; rows?: TableCell[][]; from?: string; at?: XY; corner?: TableCorner; /** FRa (O115): kept whole — never split into blocks (the issue list's sheet and scale fixes then apply). */ whole?: boolean }
/** A straight edge by its persistent name, `near` a model point on it (names can repeat). */
export interface EdgeRef { edge: string; near: Vec3; sig?: Sig; was?: string }

/** A source-bound curved centerline between two distinct concentric partial circular arcs. */
export interface DrawingArcCenterline {
  id: string;
  view: SectionViewId;
  first: EdgeRef;
  second: EdgeRef;
}

/** A source-bound linear center mark group connecting 3 to 32 collinear equal-radius circular holes. */
export interface DrawingCenterMarkGroup {
  id: string;
  kind: 'linear';
  view: SectionViewId;
  members: CentreRef[];
  connectingLines: boolean;
}

/** A source-bound straight centerline bisecting two parallel coplanar equal-span straight edges. */
export interface DrawingBisectorCenterline {
  id: string;
  view: SectionViewId;
  first: EdgeRef;
  second: EdgeRef;
}

/** A source-bound virtual sharp at the theoretical intersection of two non-parallel straight edges. */
export interface DrawingVirtualSharp {
  id: string;
  view: SectionViewId;
  first: EdgeRef;
  second: EdgeRef;
}

/** A source-bound center-of-mass symbol on an orthographic view for one explicit made solid body. */
export interface DrawingCenterOfMass {
  id: string;
  view: SectionViewId;
  bodyKey: string;
  /** Presentation-only: hides the CG symbol while preserving dependent dimensions. */
  hidden?: true;
  /** Optional symbol circle diameter in sheet mm (2..12; default 4). Presentation-only. */
  diameter?: number;
}

export type OrdinateAxis = 'horizontal' | 'vertical';

/** One source-bound member of a common-origin ordinate dimension group. */
export interface DrawingOrdinateMember {
  id: string;
  point: DimPoint;
  /** Optional presentation-only jog offset in sheet mm (0.5..40 magnitude). */
  jog?: number;
}

/** A source-bound ordinate dimension group sharing one datum origin and measurement axis. */
export interface DrawingOrdinateGroup {
  id: string;
  view: SectionViewId;
  axis: OrdinateAxis;
  origin: DimPoint;
  /** Group baseline coordinate in view mm (V for horizontal, U for vertical). */
  lineCoord: number;
  members: DrawingOrdinateMember[];
}

/** The revision after `rev`: A → B … Z → AA, 01 → 02, 1 → 2; none → A. */
export function nextRevision(rev: string | undefined): string {
  if (!rev || rev === '-') return 'A';
  if (/^\d+$/.test(rev)) return String(Number(rev) + 1).padStart(rev.length, '0');
  if (/^[A-Z]+$/.test(rev)) { const n = [...rev].reduce((t, c) => t * 26 + c.charCodeAt(0) - 64, 0) + 1; let s = '', k = n; while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); } return s; }
  return rev + '.1';
}
/** A short fingerprint of a model's features (FNV-1a over their JSON). */
export function modelPrint(nodes: unknown): string {
  let h = 0x811c9dc5; for (const ch of JSON.stringify(nodes)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export interface DrawingSettings {
  /** Drawing-only geometry scope. Absent: base part, or legacy BOM/balloon assembly. */
  scope?: DrawingScope;
  sheet: 'A4' | 'A3';
  /**
   * 11 ④: the sheets after the first, each with the views (standard view names, removed sections `section:B`, details
   * `detail:C`) drawn on it. The first sheet holds every view no other sheet lists. Absent: the one sheet, as always.
   */
  sheets?: DrawingSheet[];
  /** Model mm per sheet mm inverted (2 = 2:1, 0.5 = 1:2); none: the largest standard scale that fits. */
  scale?: number;
  /** Third angle (US) or first angle (ISO) arrangement of the orthographic views. */
  projection: 'third' | 'first';
  /** The drawing standard (11 ③a): lettering, arrowheads, dimension text, projection symbol, datum targets, GD&T notes. Absent: the sheet as it always was. */
  standard?: DrawingStandard;
  /** The unit lengths print in (11 ③b; display only, the model stays in mm). Absent: mm. */
  units?: DrawingUnits;
  /** Show the other unit after the primary value in square brackets (dual dimensioning). */
  dual?: boolean;
  /** Decimal places per unit, 0 to 6. Absent: mm as before (trimmed), inch 3. */
  precision?: UnitPrecision;
  /** Optional fractional-inch denominator (2|4|8|16|32|64) for plain untoleranced inch length dimensions. */
  inchFraction?: InchFractionDenominator;
  /** Hidden edges dashed in the orthographic views (the isometric view shows visible edges only). */
  hidden: boolean;
  /** false: no centre marks and centrelines (shown by default). */
  centers?: boolean;
  /** Tangent edges (a fillet's boundaries) as thin lines (not shown by default). */
  tangent?: boolean;
  /** FRd2 (O119): the frame's weld symbols in the views (not shown by default). */
  weldSymbols?: boolean;
  /** O147 B2: item balloons on the iso view (the front view without it), numbered as the BOM's lines (not shown by default). */
  balloons?: boolean;
  /** Section A–A: the part cut by the plane square to the front view's depth at `y` along it (Y = y from −Y), seen like the front view, under it (none: no section). */
  section?: { y: number };
  /**
   * O148 X1: the sections, each the part cut by the plane square to its view's depth at `at` along it, seen as that view
   * (front, top or right) with the material in front taken away. A file with only `section` reads as `[{ A, front, y }]`
   * (`sectionsOf`); one section A on the front is written back as `section`, so such files stay as they were.
   */
  sections?: DrawingSection[];
  /** DR-1: detail views, each a circle on a view or a section drawn larger (detail.ts). Letters share the sections' namespace. */
  details?: DrawingDetail[];
  /** DR-2: breaks, each a band along a model axis left out of the orthographic views (breaks.ts). */
  breaks?: DrawingBreak[];
  /** The title block's part name (default: the file name). */
  title?: string;
  /** DR-5: neutral title-block template and person-supplied metadata. */
  titleBlock?: DrawingTitleBlock;
  /** DR-5: revision history records; shown by a table with from: revisions. */
  revisions?: DrawingRevision[];
  /** The drawing's revision (A, B, … or 01), shown in the title block's REV cell (default: -). */
  revision?: string;
  /** The model's fingerprint when the revision was set (to tell when the model changed since). */
  revisedModel?: string;
  dimensions: DrawingDimension[];
  notes?: DrawingNote[];
  /** Tables (O49): given content or a named source's (the bend table, a cut list). */
  tables?: DrawingTable[];
  /** The views shown (R14.3, O4): the front and top views always; none: all four. */
  views?: ViewId[];
  /** Extra sheet room (mm) beside a view's sides for its dimensions (R14.3, O4): the layout spaces the views by it. */
  room?: ViewRoom;
  /**
   * The side the front view looks from (R14.3b, O7): none is `y-` (from −Y), as every drawing saved before. Changing it
   * re-maps the annotations to the views that show the same model axes, or is refused (reorient.ts).
   */
  orientation?: 'x+' | 'y+' | 'x-';
  /** How the drawing is toleranced (R14.4, O5): by ± values (default) or geometrically (datums and position). */
  tolerancing?: 'plus-minus' | 'geometric';
  datums?: DrawingDatum[];
  datumTargets?: DrawingDatumTarget[];
  frames?: DrawingFrame[];
  /** Source-bound curved centerlines between concentric partial arcs. */
  arcCenterlines?: DrawingArcCenterline[];
  /** Source-bound linear hole-row center mark groups with toggleable connecting lines. */
  centerMarkGroups?: DrawingCenterMarkGroup[];
  /** Source-bound straight centerlines bisecting two parallel straight edges. */
  bisectorCenterlines?: DrawingBisectorCenterline[];
  /** Source-bound virtual sharps at theoretical straight-edge intersections. */
  virtualSharps?: DrawingVirtualSharp[];
  /** Source-bound center-of-mass symbols on orthographic views. */
  centerOfMass?: DrawingCenterOfMass[];
  /** Source-bound common-origin ordinate dimension groups on orthographic views. */
  ordinateGroups?: DrawingOrdinateGroup[];
  /** Never stored: set on the settings of one sheet of a drawing with sheets (sheets.ts `forSheet`), which then lay out and build as a drawing of that sheet alone. */
  sheetContext?: SheetContext;
}
/**
 * O148 X1: a section — its letter, the view whose depth its plane is square to, and where along that depth (mm).
 * O178, an aligned section: `dir`, the plane's own normal (model axes, any length; the section's depth, away from its
 * viewer) — square to an off-axis feature's axis — with `at` along it (the plane dot(p, dir/|dir|) = at). It is laid out
 * as `view`'s sections are and drawn with `view`'s up (made square to `dir`); its cutting plane shows edge-on in a view
 * whose depth is square to `dir`.
 */
/**
 * DR-3: `half`, a half section — the section on one side of a centreline in the section's view (`line` vertical at
 * u = `at` or horizontal at v = `at`; `cut` the side shown cut: after = greater), the view's exterior on the other.
 * `steps`, an offset (stepped) section — from the section view's coordinate `past` onward (along `along`, horizontal by
 * default) the plane is at depth `at` instead; `past` increasing. Both only for a principal section, not together.
 */
/**
 * DR-4: `removed`, a removed section — only the cut face (its outline exact, hatched), drawn apart from the views at its
 * own scale (absolute; absent: the sheet's) with its centre at `at` on the sheet (absent: in free room), its cutting line
 * on the view as usual. `revolved`, a revolved section — the cut face turned a quarter about its trace onto the view that
 * sees the plane edge-on (a front section's onto the top view, a top's or a right's onto the front view), centred on the
 * trace; principal only. Neither with a half or steps, nor together.
 */
export interface DrawingSection { id: string; view: SectionViewId; at: number; dir?: [number, number, number]; half?: SectionHalf; steps?: SectionStep[]; along?: 'horizontal' | 'vertical'; removed?: SectionRemoved; revolved?: true; hideHatch?: true }
/** Presentation only; no aligned, partial or alternate section forms in this first scope. */
export const sectionHatchVisibilitySupported = (s: DrawingSection): boolean => ['front', 'top', 'right'].includes(s.view) && !s.dir && !s.half && !s.steps && !s.along && !s.removed && !s.revolved;
export interface SectionHalf { line: 'vertical' | 'horizontal'; at: number; cut: 'after' | 'before' }
export interface SectionStep { past: number; at: number }
export interface SectionRemoved { at?: XY; scale?: number }
/** Whether two sections are the same cut: letter, view, place, (an aligned one's) direction, (DR-3) its half or steps, and (DR-4) its form — a removed one's place and scale aside. */
export const sameSection = (a: DrawingSection, b: DrawingSection): boolean => a.id === b.id && a.view === b.view && a.at === b.at && JSON.stringify(a.dir ?? null) === JSON.stringify(b.dir ?? null)
  && JSON.stringify(a.half ?? null) === JSON.stringify(b.half ?? null) && JSON.stringify(a.steps ?? null) === JSON.stringify(b.steps ?? null) && (a.along ?? 'horizontal') === (b.along ?? 'horizontal')
  && !a.removed === !b.removed && !a.revolved === !b.revolved;
const finiteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** DR-4: a removed section's options as given: an optional sheet point and an optional scale in (0, 1000]. */
export const removedOk = (r: unknown): r is SectionRemoved => { const x = r as SectionRemoved; return !!x && typeof x === 'object' && !Array.isArray(x) && (x.at === undefined || (Array.isArray(x.at) && x.at.length === 2 && x.at.every(finiteNum))) && (x.scale === undefined || (finiteNum(x.scale) && x.scale > 0 && x.scale <= 1000)); };
/** DR-4: the form a section is drawn in (full is every other: a plain, half, offset or aligned section in its row). */
export const sectionForm = (s: Pick<DrawingSection, 'removed' | 'revolved'>): 'full' | 'removed' | 'revolved' => s.removed ? 'removed' : s.revolved ? 'revolved' : 'full';
/** DR-3: a half section's centreline as given, or null. */
export const halfOk = (h: unknown): h is SectionHalf => { const x = h as SectionHalf; return !!x && (x.line === 'vertical' || x.line === 'horizontal') && finiteNum(x.at) && (x.cut === 'after' || x.cut === 'before'); };
/** DR-3: an offset section's steps as given: one to 20, finite, `past` strictly increasing. */
export const stepsOk = (st: unknown): st is SectionStep[] => Array.isArray(st) && st.length >= 1 && st.length <= 20 && st.every((x, k) => !!x && finiteNum(x.past) && finiteNum(x.at) && (k === 0 || x.past > st[k - 1].past));
/** A direction an aligned section may have: three finite numbers, not all zero. */
export const sectionDirOk = (d: unknown): d is [number, number, number] => isVec3(d) && Math.hypot(d[0], d[1], d[2]) > 1e-9;
export type SectionViewId = 'front' | 'top' | 'right';
export const SECTION_VIEWS: readonly SectionViewId[] = ['front', 'top', 'right'];
/** The drawing's sections: its list, or the one `section` older files have (A on the front view). */
export const sectionsOf = (s: Pick<DrawingSettings, 'section' | 'sections'>): DrawingSection[] => s.sections ?? (s.section ? [{ id: 'A', view: 'front', at: s.section.y }] : []);
/** The settings with these sections: one A on the front as `section` (as files have always had it), more as `sections`. */
export function withSections(s: DrawingSettings, list: readonly DrawingSection[]): DrawingSettings {
  const rest = { ...s }; delete rest.section; delete rest.sections;
  if (!list.length) return rest;
  if (list.length === 1 && list[0].id === 'A' && list[0].view === 'front' && !list[0].dir && !list[0].half && !list[0].steps && !list[0].removed && !list[0].revolved && !list[0].hideHatch) return { ...rest, section: { y: list[0].at } };
  return { ...rest, sections: list.map(x => ({ ...x })) };
}
/** The next free section letter (A, B, … Z; then AA, AB, …); `also`: letters taken otherwise (DR-1: the details'). */
export function nextSectionId(list: readonly DrawingSection[], also: Iterable<string> = []): string {
  const used = new Set([...list.map(x => x.id), ...also]);
  for (let k = 0; ; k++) { const id = k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(64 + Math.floor(k / 26)) + String.fromCharCode(65 + k % 26); if (!used.has(id)) return id; }
}
/** Detail letters owned by dimensions or standalone frames, including unresolved ones from a saved drawing. */
export function annotatedDetailLetters(s: Pick<DrawingSettings, 'dimensions' | 'frames'>): Set<string> {
  const views = [...s.dimensions.map(d => d.view), ...(s.frames ?? []).map(f => f.view)];
  return new Set(views.filter(v => v !== undefined && isDetailRef(v)).map(detailLetter));
}

/** An absent detail's annotation or sheet assignment still reserves its letter. */
export function reservedDetailLetters(s: Pick<DrawingSettings, 'dimensions' | 'frames' | 'sheets'>): Set<string> {
  const letters = annotatedDetailLetters(s);
  for (const sheet of s.sheets ?? []) for (const view of sheet.views) if (isDetailRef(view)) letters.add(detailLetter(view));
  return letters;
}
/** Retained references reserve an absent section's identity; creating a new cut is not a repair. */
export function reservedSectionLetters(s: Pick<DrawingSettings, 'dimensions' | 'frames' | 'details' | 'sheets'>): Set<string> {
  const views = [...s.dimensions.map(d => d.view), ...(s.frames ?? []).map(f => f.view), ...(s.details ?? []).map(d => d.view), ...(s.sheets ?? []).flatMap(sheet => sheet.views)];
  return new Set(views.filter((v): v is SectionRef => v !== undefined && isSectionRef(v)).map(sectionLetter));
}

export type RoomSide = 'above' | 'below' | 'left' | 'right';
export type ViewRoom = Partial<Record<ViewId, Partial<Record<RoomSide, number>>>>;
export const ROOM_SIDES: readonly RoomSide[] = ['above', 'below', 'left', 'right'];

export const defaultDrawing = (): DrawingSettings => ({ sheet: 'A4', projection: 'third', hidden: true, dimensions: [] });

/** A saved section list: each with a letter (A–Z, two at most), a principal view and a finite position, letters unique; none valid, none. */
function readSections(raw: unknown): DrawingSection[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DrawingSection[] = [];
  for (const x of raw) if (x && typeof x.id === 'string' && /^[A-Z]{1,2}$/.test(x.id) && SECTION_VIEWS.includes(x.view) && typeof x.at === 'number' && Number.isFinite(x.at) && !out.some(o => o.id === x.id) && (x.dir === undefined || sectionDirOk(x.dir))) {
    // (DR-3: a half or the steps kept when valid and the section principal; never both.)
    const half = !x.dir && halfOk(x.half) ? { line: x.half.line, at: x.half.at, cut: x.half.cut } as SectionHalf : null, steps = !x.dir && !half && stepsOk(x.steps) ? x.steps.map((st: SectionStep) => ({ past: st.past, at: st.at })) : null;
    // (DR-4: removed on a plain or aligned section, revolved on a plain principal one; never with a half or steps.)
    const removed = !half && !steps && removedOk(x.removed) ? { ...(x.removed.at ? { at: [x.removed.at[0], x.removed.at[1]] as XY } : {}), ...(x.removed.scale !== undefined ? { scale: x.removed.scale } : {}) } : null;
    const revolved = !half && !steps && !removed && !x.dir && x.revolved === true;
    out.push({ id: x.id, view: x.view, at: x.at, ...(x.dir ? { dir: [x.dir[0], x.dir[1], x.dir[2]] as [number, number, number] } : {}), ...(half ? { half } : {}), ...(steps ? { steps, ...(x.along === 'vertical' ? { along: 'vertical' as const } : {}) } : {}), ...(removed ? { removed } : {}), ...(revolved ? { revolved: true as const } : {}), ...(x.hideHatch === true && sectionHatchVisibilitySupported(x) ? { hideHatch: true as const } : {}) });
  }
  return out.length ? out : null;
}
/** Decimal places kept where each is a whole number 0 to 6 (mm then inch); none valid: none. */
export const precisionOk = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= MAX_PRECISION;
function readPrecision(raw: unknown): UnitPrecision | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { mm, inch } = raw as Record<string, unknown>, out: UnitPrecision = {};
  if (precisionOk(mm)) out.mm = mm;
  if (precisionOk(inch)) out.inch = inch;
  return out.mm === undefined && out.inch === undefined ? null : out;
}
/** Reads drawing settings from a saved file, keeping what is valid. */
export function readDrawing(raw: unknown): DrawingSettings {
  const d = defaultDrawing(), r = (raw ?? {}) as Partial<DrawingSettings>;
  return {
    sheet: r.sheet === 'A3' ? 'A3' : d.sheet,
    ...(r.scope !== undefined ? { scope: r.scope } : {}),
    ...(typeof r.scale === 'number' && r.scale > 0 ? { scale: r.scale } : {}),
    projection: r.projection === 'first' ? 'first' : 'third',
    ...(r.standard === 'iso' || r.standard === 'asme' ? { standard: r.standard } : {}),
    ...(r.units === 'inch' ? { units: 'inch' as const } : {}),
    ...(r.dual === true ? { dual: true } : {}),
    ...(readPrecision(r.precision) ? { precision: readPrecision(r.precision)! } : {}),
    ...(inchFractionOk(r.inchFraction) ? { inchFraction: r.inchFraction } : {}),
    hidden: r.hidden !== false,
    ...(r.centers === false ? { centers: false } : {}),
    ...(r.tangent === true ? { tangent: true } : {}),
    ...(r.weldSymbols === true ? { weldSymbols: true } : {}),
    ...(r.balloons === true ? { balloons: true } : {}),
    ...(r.section && typeof r.section.y === 'number' && Number.isFinite(r.section.y) ? { section: { y: r.section.y } } : {}),
    ...(readSections(r.sections) ? { sections: readSections(r.sections)! } : {}),
    ...(readDetails(r.details) ? { details: readDetails(r.details)! } : {}),
    ...(readBreaks(r.breaks) ? { breaks: readBreaks(r.breaks)! } : {}),
    ...(readTitleBlock(r.titleBlock) ? { titleBlock: readTitleBlock(r.titleBlock)! } : {}),
    ...(readRevisions(r.revisions).length ? { revisions: readRevisions(r.revisions) } : {}),
    ...(typeof r.title === 'string' && r.title ? { title: r.title } : {}),
    ...(typeof r.revision === 'string' && r.revision ? { revision: r.revision.slice(0, 6) } : {}),
    ...(typeof r.revisedModel === 'string' ? { revisedModel: r.revisedModel } : {}),
    dimensions: Array.isArray(r.dimensions) ? r.dimensions.filter(x => x && typeof x.id === 'string' && isDimView(x.view) && (x.kind !== 'pcd' || ringOk(x.ring)) && (x.kind !== 'arc-length' || (x.auto !== true && isOrthographicView(x.view) && isXY(x.place) && edgeRefOk((x as { arc?: unknown }).arc))) && (x.kind !== 'chamfer' || (x.auto !== true && isOrthographicView(x.view) && isXY(x.place) && edgeRefOk((x as { chamfer?: unknown }).chamfer) && edgeRefOk((x as { adjacent?: unknown }).adjacent))) && (x.kind !== 'radial-thickness' || (x.auto !== true && isOrthographicView(x.view) && isXY(x.place) && edgeRefOk((x as { first?: unknown }).first) && edgeRefOk((x as { second?: unknown }).second))) && (x.kind !== 'cylinder-diameter' || (x.auto !== true && isOrthographicView(x.view) && isXY(x.place) && cylinderFaceRefOk((x as { cylinder?: unknown }).cylinder))) && (x.kind !== 'circle-separation' || (x.auto !== true && isOrthographicView(x.view) && isXY(x.place) && ((x as { mode?: unknown }).mode === 'min' || (x as { mode?: unknown }).mode === 'max') && edgeRefOk((x as { first?: unknown }).first) && edgeRefOk((x as { second?: unknown }).second))) && (x.kind !== 'linear' || ((x.a?.at !== 'pcd' || ringOk(x.a.ring)) && (x.b?.at !== 'pcd' || ringOk(x.b.ring)) && (x.a?.at !== 'virtual-sharp' || (isOrthographicView(x.view) && edgeRefOk(x.a) && edgeRefOk(x.a.second))) && (x.b?.at !== 'virtual-sharp' || (isOrthographicView(x.view) && edgeRefOk(x.b) && edgeRefOk(x.b.second))) && (x.a?.at !== 'com' || (isOrthographicView(x.view) && comPointOk(x.a))) && (x.b?.at !== 'com' || (isOrthographicView(x.view) && comPointOk(x.b)))))).map(x => {
      const { tol, count, auto, basic, foreshorten, arrowPlacement, crossingBreak, extensionJog, ...rest } = x as DrawingDimension & { foreshorten?: unknown; arrowPlacement?: unknown; crossingBreak?: unknown; extensionJog?: unknown }; const t = x.kind === 'chamfer' ? null : readTolerance(tol);
      const arrows = x.kind === 'linear' && auto !== true && isOrthographicView(x.view) ? readLinearArrowPlacement(arrowPlacement) : undefined;
      const cBreak = x.kind === 'linear' && auto !== true && isOrthographicView(x.view) ? readLinearCrossingBreak(crossingBreak) : undefined;
      const extJog = x.kind === 'linear' && auto !== true && isOrthographicView(x.view) ? readLinearExtensionJog(extensionJog) : undefined;
      const fs = x.kind === 'radius' && auto !== true && isOrthographicView(x.view) && foreshortenOk(foreshorten)
        ? { origin: [foreshorten.origin[0], foreshorten.origin[1]] as XY } : null;
      const allowCount = x.kind !== 'chamfer' && Number.isInteger(count) && count! >= 2 && count! <= 999;
      const allowBasic = x.kind !== 'chamfer' && basic === true;
      return { ...rest, ...(t ? { tol: t } : {}), ...(allowCount ? { count } : {}), ...(auto === true ? { auto: true } : {}), ...(allowBasic ? { basic: true } : {}), ...(fs ? { foreshorten: fs } : {}), ...(arrows ? { arrowPlacement: arrows } : {}), ...(cBreak ? { crossingBreak: cBreak } : {}), ...(extJog ? { extensionJog: extJog } : {}) } as DrawingDimension;
    }) : [],
    ...(Array.isArray(r.views) && r.views.includes('front') && r.views.includes('top') ? { views: VIEW_IDS.filter(v => r.views!.includes(v)) } : {}),
    ...(readRoom(r.room) ? { room: readRoom(r.room)! } : {}),
    ...(readSheets(r.sheets).length ? { sheets: readSheets(r.sheets) } : {}),
    ...(r.orientation === 'x+' || r.orientation === 'y+' || r.orientation === 'x-' ? { orientation: r.orientation } : {}),
    ...(r.tolerancing === 'geometric' ? { tolerancing: 'geometric' as const } : {}),
    ...(readDatums(r.datums).length ? { datums: readDatums(r.datums) } : {}),
    ...(readDatumTargets(r.datumTargets).length ? { datumTargets: readDatumTargets(r.datumTargets) } : {}),
    ...(readFrames(r.frames).length ? { frames: readFrames(r.frames) } : {}),
    ...(readArcCenterlines(r.arcCenterlines).length ? { arcCenterlines: readArcCenterlines(r.arcCenterlines) } : {}),
    ...(readCenterMarkGroups(r.centerMarkGroups).length ? { centerMarkGroups: readCenterMarkGroups(r.centerMarkGroups) } : {}),
    ...(readBisectorCenterlines(r.bisectorCenterlines).length ? { bisectorCenterlines: readBisectorCenterlines(r.bisectorCenterlines) } : {}),
    ...(readVirtualSharps(r.virtualSharps).length ? { virtualSharps: readVirtualSharps(r.virtualSharps) } : {}),
    ...(readCenterOfMass(r.centerOfMass).length ? { centerOfMass: readCenterOfMass(r.centerOfMass) } : {}),
    ...(readOrdinateGroups(r.ordinateGroups).length ? { ordinateGroups: readOrdinateGroups(r.ordinateGroups) } : {}),
    ...(Array.isArray(r.notes) && r.notes.some(isNote) ? { notes: r.notes.filter(isNote).map(n => ({ id: n.id, text: n.text, at: [n.at[0], n.at[1]] as XY, ...(n.leader && VIEW_IDS.includes(n.leader.view) && isXY(n.leader.at) ? { leader: { view: n.leader.view, at: [n.leader.at[0], n.leader.at[1]] as XY, ...(Object.hasOwn(n.leader, 'target') ? { target: readNoteTarget(n.leader.target) } : {}) } } : {}), ...(typeof n.sheet === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(n.sheet) ? { sheet: n.sheet } : {}) })) } : {}),
    ...(readTables(r.tables).length ? { tables: readTables(r.tables) } : {}),
  };
}

/** Room kept where it is a number of sheet mm from 0 to 200, by a known view and side. */
function readRoom(raw: unknown): ViewRoom | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: ViewRoom = {};
  for (const v of VIEW_IDS) {
    const sides = (raw as Record<string, unknown>)[v];
    if (!sides || typeof sides !== 'object') continue;
    for (const k of ROOM_SIDES) { const x = (sides as Record<string, unknown>)[k]; if (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 200) (out[v] ??= {})[k] = x; }
  }
  return Object.keys(out).length ? out : null;
}
/** A pitch circle's members: three or more holes, each by an edge name and a point. */
const ringOk = (ring: unknown): boolean => Array.isArray(ring) && ring.length >= 3 && ring.length <= 360 && ring.every(m => m && typeof m.edge === 'string' && Array.isArray(m.near) && m.near.length === 3);
/** Strict validation for a persisted geometry signature (`Sig`). */
export function sigOk(raw: unknown): raw is Sig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const s = raw as Partial<Sig>;
  if (typeof s.k !== 'string' || !s.k.trim()) return false;
  if (!isVec3(s.p)) return false;
  if (s.d !== undefined && !isVec3(s.d)) return false;
  if (!finiteNum(s.s)) return false;
  if (s.r !== undefined && !finiteNum(s.r)) return false;
  if (s.n !== undefined && !finiteNum(s.n)) return false;
  return true;
}
function copySig(sig: Sig): Sig {
  return {
    k: sig.k,
    p: [sig.p[0], sig.p[1], sig.p[2]],
    ...(sig.d !== undefined ? { d: [sig.d[0], sig.d[1], sig.d[2]] as Vec3 } : {}),
    s: sig.s,
    ...(sig.r !== undefined ? { r: sig.r } : {}),
    ...(sig.n !== undefined ? { n: sig.n } : {}),
  };
}
const edgeRefOk = (ref: unknown): ref is EdgeRef => !!ref && typeof ref === 'object' && !Array.isArray(ref)
  && typeof (ref as EdgeRef).edge === 'string' && !!(ref as EdgeRef).edge
  && isVec3((ref as EdgeRef).near)
  && ((ref as EdgeRef).sig === undefined || sigOk((ref as EdgeRef).sig));
function copyEdgeRef(ref: EdgeRef): EdgeRef {
  return {
    edge: ref.edge,
    near: [ref.near[0], ref.near[1], ref.near[2]],
    ...(ref.sig !== undefined && sigOk(ref.sig) ? { sig: copySig(ref.sig) } : {}),
    ...(typeof ref.was === 'string' ? { was: ref.was } : {}),
  };
}
function readArcCenterlines(raw: unknown): DrawingArcCenterline[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: DrawingArcCenterline[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const x = item as Partial<DrawingArcCenterline>;
    if (typeof x.id !== 'string' || !x.id.trim() || seen.has(x.id)) continue;
    if (!x.view || !SECTION_VIEWS.includes(x.view)) continue;
    if (!edgeRefOk(x.first) || !edgeRefOk(x.second)) continue;
    seen.add(x.id);
    out.push({ id: x.id, view: x.view, first: copyEdgeRef(x.first), second: copyEdgeRef(x.second) });
  }
  return out;
}
function readCenterMarkGroups(raw: unknown): DrawingCenterMarkGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: DrawingCenterMarkGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const x = item as Partial<DrawingCenterMarkGroup>;
    if (typeof x.id !== 'string' || !x.id.trim() || seen.has(x.id)) continue;
    if (x.kind !== 'linear') continue;
    if (!x.view || !SECTION_VIEWS.includes(x.view)) continue;
    if (typeof x.connectingLines !== 'boolean') continue;
    if (!Array.isArray(x.members) || x.members.length < 3 || x.members.length > 32) continue;
    if (!x.members.every(edgeRefOk)) continue;
    const memberKeys = new Set<string>();
    let hasDuplicate = false;
    for (const m of x.members) {
      const key = `${m.edge}|${m.near[0]}|${m.near[1]}|${m.near[2]}`;
      if (memberKeys.has(key)) { hasDuplicate = true; break; }
      memberKeys.add(key);
    }
    if (hasDuplicate) continue;
    seen.add(x.id);
    out.push({ id: x.id, kind: 'linear', view: x.view, members: x.members.map(copyEdgeRef), connectingLines: x.connectingLines });
  }
  return out;
}
function readBisectorCenterlines(raw: unknown): DrawingBisectorCenterline[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: DrawingBisectorCenterline[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const x = item as Partial<DrawingBisectorCenterline>;
    if (typeof x.id !== 'string' || !x.id.trim() || seen.has(x.id)) continue;
    if (!x.view || !SECTION_VIEWS.includes(x.view)) continue;
    if (!edgeRefOk(x.first) || !edgeRefOk(x.second)) continue;
    if (x.first.edge === x.second.edge && x.first.near[0] === x.second.near[0] && x.first.near[1] === x.second.near[1] && x.first.near[2] === x.second.near[2]) continue;
    seen.add(x.id);
    out.push({ id: x.id, view: x.view, first: copyEdgeRef(x.first), second: copyEdgeRef(x.second) });
  }
  return out;
}
function readVirtualSharps(raw: unknown): DrawingVirtualSharp[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: DrawingVirtualSharp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const x = item as Partial<DrawingVirtualSharp>;
    if (typeof x.id !== 'string' || !x.id.trim() || seen.has(x.id)) continue;
    if (!x.view || !SECTION_VIEWS.includes(x.view)) continue;
    if (!edgeRefOk(x.first) || !edgeRefOk(x.second)) continue;
    if (x.first.edge === x.second.edge && x.first.near[0] === x.second.near[0] && x.first.near[1] === x.second.near[1] && x.first.near[2] === x.second.near[2]) continue;
    seen.add(x.id);
    out.push({ id: x.id, view: x.view, first: copyEdgeRef(x.first), second: copyEdgeRef(x.second) });
  }
  return out;
}
const comPointOk = (ref: unknown): boolean => !!ref && typeof ref === 'object' && !Array.isArray(ref)
  && typeof (ref as DimPoint).bodyKey === 'string' && !!(ref as DimPoint).bodyKey!.trim()
  && isVec3((ref as DimPoint).near);
function readCenterOfMass(raw: unknown): DrawingCenterOfMass[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: DrawingCenterOfMass[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const x = item as Partial<DrawingCenterOfMass>;
    if (typeof x.id !== 'string' || !x.id.trim() || seen.has(x.id)) continue;
    if (!x.view || !SECTION_VIEWS.includes(x.view)) continue;
    if (typeof x.bodyKey !== 'string' || !x.bodyKey.trim()) continue;
    seen.add(x.id);
    const diameter = typeof x.diameter === 'number' && Number.isFinite(x.diameter) && x.diameter >= 2 && x.diameter <= 12
      ? Math.round(x.diameter * 1000) / 1000 : undefined;
    out.push({
      id: x.id,
      view: x.view,
      bodyKey: x.bodyKey,
      ...(x.hidden === true ? { hidden: true as const } : {}),
      ...(diameter !== undefined && Math.abs(diameter - 4) > 1e-6 ? { diameter } : {}),
    });
  }
  return out;
}
function copyDimPoint(p: DimPoint): DimPoint {
  return {
    edge: p.edge,
    at: p.at,
    near: [p.near[0], p.near[1], p.near[2]],
    ...(p.sig !== undefined && sigOk(p.sig) ? { sig: copySig(p.sig) } : {}),
    ...(typeof p.was === 'string' ? { was: p.was } : {}),
    ...(p.ring ? { ring: p.ring.map(copyEdgeRef) } : {}),
    ...(p.second ? { second: copyEdgeRef(p.second) } : {}),
    ...(typeof p.virtualSharpId === 'string' ? { virtualSharpId: p.virtualSharpId } : {}),
    ...(typeof p.bodyKey === 'string' ? { bodyKey: p.bodyKey } : {}),
    ...(typeof p.comId === 'string' ? { comId: p.comId } : {}),
  };
}
function dimPointOk(raw: unknown): raw is DimPoint {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const p = raw as Partial<DimPoint>;
  if (!isVec3(p.near)) return false;
  if (p.sig !== undefined && !sigOk(p.sig)) return false;
  if (p.at === 'com') return typeof p.edge === 'string' && typeof p.bodyKey === 'string' && !!p.bodyKey.trim();
  if (p.at === 'pcd') return typeof p.edge === 'string' && ringOk(p.ring) && (p.ring ?? []).every(m => edgeRefOk(m));
  if (p.at === 'virtual-sharp') {
    const second = p.second;
    return edgeRefOk(p) && edgeRefOk(second);
  }
  if (p.at === 'end' || p.at === 'center') return typeof p.edge === 'string' && !!p.edge;
  return false;
}
function readOrdinateGroups(raw: unknown): DrawingOrdinateGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: DrawingOrdinateGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const x = item as Partial<DrawingOrdinateGroup>;
    if (typeof x.id !== 'string' || !x.id.trim() || seen.has(x.id)) continue;
    if (!x.view || !SECTION_VIEWS.includes(x.view)) continue;
    if (x.axis !== 'horizontal' && x.axis !== 'vertical') continue;
    if (typeof x.lineCoord !== 'number' || !Number.isFinite(x.lineCoord)) continue;
    if (!dimPointOk(x.origin)) continue;
    if (!Array.isArray(x.members)) continue;
    const mSeen = new Set<string>(), members: DrawingOrdinateMember[] = [];
    for (const rawM of x.members) {
      if (!rawM || typeof rawM !== 'object' || Array.isArray(rawM)) continue;
      const m = rawM as Partial<DrawingOrdinateMember>;
      if (typeof m.id !== 'string' || !m.id.trim() || mSeen.has(m.id)) continue;
      if (!dimPointOk(m.point)) continue;
      mSeen.add(m.id);
      const jog = typeof m.jog === 'number' && Number.isFinite(m.jog) && Math.abs(m.jog) >= 0.5 && Math.abs(m.jog) <= 40
        ? Math.round(m.jog * 1000) / 1000 : undefined;
      members.push({ id: m.id, point: copyDimPoint(m.point), ...(jog !== undefined ? { jog } : {}) });
    }
    seen.add(x.id);
    out.push({ id: x.id, view: x.view, axis: x.axis, origin: copyDimPoint(x.origin), lineCoord: x.lineCoord, members });
  }
  return out;
}
const cylinderFaceRefOk = (ref: unknown): ref is CylinderFaceRef => !!ref && typeof ref === 'object' && !Array.isArray(ref) && typeof (ref as CylinderFaceRef).face === 'string' && !!(ref as CylinderFaceRef).face && isVec3((ref as CylinderFaceRef).near);
const isXY = (p: unknown): p is XY => Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'number' && Number.isFinite(x));
const CORNERS: readonly TableCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const cellOk = (c: unknown) => c === null || (typeof c === 'number' && Number.isFinite(c)) || (typeof c === 'string' && c.length <= 120);
const columnOk = (c: unknown) => { const x = c as TableColumn; return !!x && typeof x.key === 'string' && typeof x.label === 'string' && x.label.length <= 120 && (x.unit === undefined || (typeof x.unit === 'string' && x.unit.length <= 20)) && (x.align === undefined || ['start', 'middle', 'end'].includes(x.align)) && (x.digits === undefined || (Number.isInteger(x.digits) && x.digits >= 0 && x.digits <= 6)); };
/** A table kept when whole: 1–20 columns and at most 200 rows each as long (given content), or a source's name. */
const isTable = (v: unknown): v is DrawingTable => {
  const x = v as DrawingTable;
  if (!x || typeof x.id !== 'string' || !x.id || (x.title !== undefined && (typeof x.title !== 'string' || x.title.length > 120)) || (x.at !== undefined && !isXY(x.at)) || (x.corner !== undefined && !CORNERS.includes(x.corner)) || (x.whole !== undefined && typeof x.whole !== 'boolean')) return false;
  if (x.from !== undefined) return typeof x.from === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(x.from) && x.columns === undefined && x.rows === undefined;
  return Array.isArray(x.columns) && x.columns.length >= 1 && x.columns.length <= 20 && x.columns.every(columnOk) && Array.isArray(x.rows) && x.rows.length <= 200 && x.rows.every(r => Array.isArray(r) && r.length === x.columns!.length && r.every(cellOk));
};
function readTables(raw: unknown): DrawingTable[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: DrawingTable[] = [];
  for (const v of raw) if (isTable(v) && !seen.has(v.id)) { seen.add(v.id); out.push(JSON.parse(JSON.stringify({ id: v.id, ...(v.title ? { title: v.title } : {}), ...(v.from ? { from: v.from } : { columns: v.columns, rows: v.rows }), ...(v.whole ? { whole: true } : {}), ...(v.at ? { at: v.at } : {}), ...(v.corner ? { corner: v.corner } : {}) })) as DrawingTable); }
  return out;
}
const isNote = (n: unknown): n is DrawingNote => !!n && typeof (n as DrawingNote).id === 'string' && typeof (n as DrawingNote).text === 'string' && isXY((n as DrawingNote).at);
function readTolerance(t: unknown): Tolerance | null {
  const x = t as Tolerance | undefined, num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (x?.kind === 'symmetric' && num(x.value) && x.value > 0) return { kind: 'symmetric', value: x.value };
  if (x?.kind === 'deviation' && num(x.upper) && num(x.lower) && x.upper >= x.lower) return { kind: 'deviation', upper: x.upper, lower: x.lower };
  if (x?.kind === 'fit' && typeof x.code === 'string' && /^[A-Za-z]{1,2}\d{1,2}$/.test(x.code)) return { kind: 'fit', code: x.code };
  return null;
}

/** Transient native identity for one exact solid's Top edges. Never authored or saved with the drawing. */
export interface NativeTopEdge {
  readonly name: string;
  readonly id: string;
  readonly vertices: readonly [string, string];
  readonly ends: readonly [Vec3, Vec3];
}
export type DrawingViews = Record<ViewId, BrepProjection> & { faces?: DrawingFace[]; nativeTop?: { readonly edges: readonly NativeTopEdge[] } };

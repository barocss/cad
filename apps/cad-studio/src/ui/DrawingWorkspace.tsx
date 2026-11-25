import { currentSheetDimensionsCsv } from '@barocss/cad-model/drawing/currentSheetDimensionsCsv';
import { captureNoteTarget, resolveNoteLeader } from '@barocss/cad-model/drawing/noteTargets';
import { nextStandaloneFrameId } from './drawing/frameIdentity';
import { commitDetailPaperDrag, detailPaperDragAt } from './drawing/detailPaperDrag';
import { pickVisibleDetailRim, reconnectDetailDiameter, visibleDetailRim } from './drawing/detailDiameterReattachment';
import { drawingBrokenEdgeAt, drawingBrokenPick } from './drawing/drawingBrokenPick';
import { editDetailCrop } from './drawing/detailCropEdit';
import { withDatumTargetAreaDraft } from './drawing/datumTargetAreaDraft';
import { drawingFixControlLoss } from '@barocss/cad-model/drawing/fixProtection';
// The Drawing workspace: the part's standard views on a sheet, dimensioned by clicking in a view.
// Tools: Select (click a dimension to select it, drag to move it, Delete removes it), Linear (two
// points, or one straight edge, then where the dimension line goes), Diameter and Radius (a circle
// that shows round in the view, then where the text goes). The sheet exports as SVG, PDF or DXF (R11b, O1);
// section A–A also alone as a 1:1 DXF.
import { drawingCanDeleteSelection } from './drawing/drawingDeletePolicy';
import { drawsMadeOnly } from '@barocss/cad-model/drawing/scope';





import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { modelAnnotations } from '@barocss/cad-model/drawing/annotations3d';


import type { ProjectedEdge } from '@barocss/cad';
import type { EngineClient } from '../engine/client';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { defaultForeshortenOrigin, foreshortenGeometry, foreshortenOk, foreshortenSupported } from '@barocss/cad-model/drawing/foreshorten';
import { DEFAULT_CROSSING_BREAK_GAP, crossingBreakGapOk, eligibleCrossingBreaks, readLinearCrossingBreak } from '@barocss/cad-model/drawing/crossingBreak';
import { extensionJogFromSheetPoint, extensionJogGeometry, readLinearExtensionJog, type LinearExtensionJog } from '@barocss/cad-model/drawing/extensionJog';
import { presetFor } from '@barocss/cad-model/drawing/standard';
import { buildSheet, curveMark, dimensionMarks, placementOf, projectionOf, sheetSections, withShownText } from '@barocss/cad-model/drawing/sheet';
import { marksSvg, sheetGroupsSvg, sheetSvg, type SheetAnnotationSelection } from '@barocss/cad-model/io/svg';

import { pdfMissing, sheetsPdf } from '@barocss/cad-model/io/pdf';
import { forSheet, mergeSheet, moveToSheet, sheetCount, sheetName, sheetOf } from '@barocss/cad-model/drawing/sheets';
import { buildSheets, setIssuesOn } from '@barocss/cad-model/drawing/sheetSet';
import { SheetTabs, SheetsMenu, newSheetId } from './drawing/SheetSet';
import { sectionDxfDocument, sheetDxf } from '@barocss/cad-model/io/dxf';
import { MIN_HOLE_ON_PAPER_MM, autoLayout, frontByInformation } from '@barocss/cad-model/drawing/layout';
import { isRefusal } from '@barocss/cad-model/engine/refusal';
import { reorient, turnSections } from '@barocss/cad-model/drawing/reorient';
import { applyFix, drawingIssues, fixRound, fixRoundsOutcome, fixRoundsStart, type DrawingIssue, type FixRoundStep, type FixRounds, type SheetInputs } from '@barocss/cad-model/drawing/issues';
import { acceptAll, toleranceSuggestions, type ToleranceSuggestion } from '@barocss/cad-model/drawing/tolerance';
import { writeDxf, type DxfVersion } from '@barocss/cad';


import { VIEWS, fromSheet, scaleLabel, toSheet, type Orientation } from '@barocss/cad-model/drawing/views';
import { angleBetween, edgeAt, inView, resolveLine, newDimensionId, orientFor, resolveDimension, roundIn, snapPoints, type SnapPoint } from '@barocss/cad-model/drawing/dimensions';
import { pickArcLengthEdge } from '@barocss/cad-model/drawing/arcLength';
import { DETAIL_PARENTS, type DetailParent, type DrawingDetail } from '@barocss/cad-model/drawing/detail';
import { DetailsList } from './drawing/DetailsList';
import { clipProjectionOutside } from '@barocss/cad-model/drawing/breaks';
import { occurrenceLosses, occurrenceLossText } from './drawing/occurrenceLoss';
import { drawingOccurrencePath } from '@barocss/cad-model/drawing/dimensionReferences';
import { diameterRims } from './drawing/diameterRims';
import { Button } from '@/components/ui/button';
import { BreaksList } from './drawing/BreaksList';
import { VIEW_IDS, annotatedDetailLetters, detailLetter, isDetailRef, isSectionRef, isViewId, nextSectionId, reservedDetailLetters, sameSection, sectionLetter, sectionsOf, withSections, readLinearArrowPlacement, type LinearArrowSide, type DimView, type DimPoint, type DrawingNote, type EdgeRef, type DrawingDimension, type DrawingSettings, type DrawingViews, type Vec3, type ViewId, type XY } from '@barocss/cad-model/drawing/types';
import { downloadBytes } from './files';
import { ShortcutHelp } from './ShortcutHelp';
import { today, useDrawingSheet } from './useDrawingSheet';
import { fastenerSizesOf } from '@barocss/cad-model/engine/fastenerSizeRows';
import { Icon, Kbd } from './atoms';
import { SIDE_NAMES } from './drawing/sheetShared';
import { SheetSettings } from './drawing/SheetSettings';
import { IssuesList } from './drawing/IssuesList';
import { TolerancingList } from './drawing/TolerancingList';
import { DimensionsList } from './drawing/DimensionsList';
import { DatumsEditor } from './drawing/DatumsEditor';
import { nextDatumTargetIdentity } from './drawing/datumTargetIdentity';
import { DatumTargetsEditor, DEFAULT_TARGET_DRAFT, type DatumTargetDraft } from './drawing/DatumTargetsEditor';
import { checkDatumTargetOptions, datumTargetConflicts, datumTargetEndpoint, resolveDatumTarget, type DatumTargetPoint, type DrawingDatumTarget } from '@barocss/cad-model/drawing/datumTargets';
import { FrameEditor } from './drawing/FrameEditor';
import { referenceCandidate } from './drawing/referenceCandidate';
import { committedSheetSettings, commitDrawingSettings } from './drawing/commitSettings';
import { StandaloneFramesEditor } from './drawing/StandaloneFramesEditor';
import { checkDrawingFrames, readFrames, type DrawingFrame } from '@barocss/cad-model/drawing/controls';
import { ToleranceEditor } from './drawing/ToleranceEditor';
import { ToleranceStack } from './drawing/ToleranceStack';
import { NotesList } from './drawing/NotesList';
import { ExportActions } from './drawing/ExportActions';
import { dimensionPairLabelsMoved, dimensionPairPaperDelta, drawingDimensionPair, moveDrawingDimensionPair, type DrawingDimensionPair } from '../app/drawingDimensionGroup';
import '../drawing/drawing.css';

type Tool = 'select' | 'linear' | 'diameter' | 'radius' | 'arc-length' | 'angle' | 'reflex-angle' | 'note' | 'detail' | 'datum-target';
type DimensionGroup = { owner: object; pair: DrawingDimensionPair };
type DimensionGroupDrag = { dimensionGroup: DimensionGroup; pointer: number; start: XY; scale: number; paperDelta: number };
const TOOLS: { tool: Tool; label: string; icon: string; key: string; hint: string }[] = [
  { tool: 'select', label: 'Select', icon: 'arrow_selector_tool', key: 'V', hint: 'Drag a dimension to move it · Shift-click a second parallel dimension in the same view to move both · Delete removes one selected annotation · drag the paper to pan, scroll to zoom' },
  { tool: 'linear', label: 'Linear dimension', icon: 'straighten', key: 'D', hint: 'Click two points (edge ends, circle centres) or one straight edge, then where the dimension goes' },
  { tool: 'diameter', label: 'Diameter', icon: 'radio_button_unchecked', key: 'O', hint: 'Click a circle, then where its diameter goes' },
  { tool: 'radius', label: 'Radius', icon: 'line_end_circle', key: 'R', hint: 'Click a circle or an arc, then where its radius goes' },
  { tool: 'arc-length', label: 'Arc length', icon: 'rounded_corner', key: 'L', hint: 'Click a partial circular arc, then where its arc length goes' },
  { tool: 'angle', label: 'Angle', icon: 'architecture', key: 'A', hint: 'Click two straight edges, then the side of their corner the angle goes on' },
  { tool: 'reflex-angle', label: 'Reflex angle', icon: 'restart_alt', key: 'G', hint: 'Pick two straight edges that share a corner in the Top view' },
  { tool: 'note', label: 'Note', icon: 'sticky_note_2', key: 'N', hint: 'Click on the paper for a note, or on a view for a leader and then where its text goes' },
  { tool: 'detail', label: 'Detail view', icon: 'zoom_in', key: 'E', hint: 'Click the centre of what to enlarge on a view or a section, then how far its circle reaches' },
  { tool: 'datum-target', label: 'Datum target', icon: 'my_location', key: 'T', hint: 'Place a datum target using the kind selected under Datum targets.' },
];
type DiameterReattachment = {
  original: Extract<DrawingDimension, { kind: 'diameter' | 'radius' }>;
  settings: DrawingSettings;
  projection: DrawingViews;
  detailOwner?: object;
  candidate?: { edge: string; near: Vec3; label: string; diameter: number };
};
type DetailMove = { detail: DrawingDetail; owner: DrawingSettings; model: StudioDoc; parentSheet: number };
type Pending =
  | { kind: 'standalone-frame'; view: DimView; frame: Extract<DrawingFrame, { view: DimView }>; moving: boolean; settingsKey: string; sourceDoc: StudioDoc; model: StudioDoc }
  | { kind: 'datum-target'; view: ViewId; target: DrawingDatumTarget; moving: boolean }
  /** A target line's first end, picked in its view (view mm). */
  | { kind: 'datum-line'; view: ViewId; from: XY }
  | { kind: 'linear'; view: DimView; a: DimPoint; b?: DimPoint }
  | { kind: 'diameter' | 'radius'; view: DimView; edge: string; near: Vec3; source?: { projection: DrawingViews; settings: DrawingSettings }; owner?: string }
  | { kind: 'arc-length'; view: DimView; arc: EdgeRef; source: { projection: DrawingViews; settings: DrawingSettings } }
  | { kind: 'angle'; view: DimView; a: EdgeRef; b?: EdgeRef; mode?: 'reflex'; owner?: object }
  | { kind: 'note'; leader: { view: ViewId; at: XY } }
  /** DR-1: a detail's circle, its centre picked on its parent. */
  | { kind: 'detail-center'; view: DetailParent; moving: DetailMove }
  | { kind: 'detail'; view: DetailParent; center: XY; moving?: DetailMove };
/** `q`: the pointer on the sheet (mm); `at`: in the view under it (model mm). */
/** `view` (O148 X2): a view, or a section the sheet placed (`section:B`). */
interface Hover { q: XY; view: DimView; at: XY; snap: SnapPoint | null; edge: ProjectedEdge | null; visibleRimOnly?: boolean; rims?: readonly ProjectedEdge[] }

const viewLabel = (v: DimView) => isSectionRef(v) ? `section ${sectionLetter(v)}–${sectionLetter(v)}` : isDetailRef(v) ? `detail ${detailLetter(v)}` : `${VIEWS[v].label.toLowerCase()} view`;
const detailFor = (settings: DrawingSettings, view: DimView) => isDetailRef(view) ? settings.details?.find(d => d.id === detailLetter(view)) : undefined;
const showDetailHidden = (settings: DrawingSettings, view: DimView) => {
  const detail = detailFor(settings, view);
  return !!(settings.hidden && detail && !isSectionRef(detail.view));
};

export interface DrawingReferencePreview { dimensionId: string; edge?: string; candidateNumber?: number }
export interface DrawingReferenceLabel { dimensionId: string; view: DimView; text: string | null; reason?: string }

export function DrawingWorkspace({ engine, doc: sourceDoc, bodies: sourceBodies, settings: wholeSettings, modelInput, workerSession, sourceCurrent, fileName, onChange: sourceOnChange, onToast, onClearToast, referencePreview, onClearReferencePreview, onReferenceLabels }: {
  engine: EngineClient; doc: StudioDoc; bodies?: readonly BodyResult[]; settings: DrawingSettings; modelInput: StudioDoc; workerSession: number; sourceCurrent: boolean; fileName: string;
  onChange(next: DrawingSettings): boolean; onToast(e: FriendlyError): void; onClearToast(e: FriendlyError): void;
  referencePreview?: DrawingReferencePreview | null; onClearReferencePreview(): void; onReferenceLabels?(labels: readonly DrawingReferenceLabel[]): void;
}) {
  // 11 ④: a drawing of several sheets shows one at a time, as a drawing of its own (its views and what belongs to them); what is
  // edited on it is merged back into the whole drawing's settings. With one sheet `settings` is `wholeSettings`, untouched.
  const [sheetNo, setSheetNo] = useState(0);
  const sheetTotal = sheetCount(wholeSettings), current = Math.min(sheetNo, sheetTotal - 1);
  const selectSheet = (next: number) => {
    if (next !== current) onClearReferencePreview();
    setSheetNo(next);
  };
  const drawingSetWantsBom = !!wholeSettings.balloons || !!wholeSettings.tables?.some(table => table.from === 'bom');
  const settings = useMemo(() => {
    const local = forSheet(wholeSettings, current);
    // A continuation sheet omits the BOM table, but a legacy drawing still uses assembly scope.
    return current > 0 && local.scope === undefined && drawingSetWantsBom
      ? { ...local, scope: { kind: 'assembly' as const } }
      : local;
  }, [wholeSettings, current, drawingSetWantsBom]);
  // (The sheet's pipeline, shared with the viewport's 3D annotations, G24: views, layout, sheet and what they are built from.)
  const { source, bodyScope, scopeRead, scope, scopeKey, doc, model, currentModel, bodies, views, projectionCurrent, cutsMade, sectionList, error, empty, busy, title, cuts, sectionA, cutA, layout, elements, callout, locationOwner, calloutsFor, fitMissOf, followedChanged, threads, wantsBom, bom, bomError, tableContentOf, hasSheet, hasFrame, kinds, hasBought, weldJoints, bodyFaces, svgSectionTextClearance, sheet } = useDrawingSheet(true, { engine, doc: sourceDoc, bodies: sourceBodies, settings, fileName, modelInput, workerSession, sourceCurrent, drawingSetWantsBom, ...(wholeSettings.sheets?.length ? { allSections: sectionsOf(wholeSettings) } : {}) });
  const projectionActionOwner = useMemo(() => ({}), [sourceDoc, wholeSettings, model, workerSession, engine, current, sourceCurrent]);
  const liveProjectionAction = useRef(projectionActionOwner); liveProjectionAction.current = projectionActionOwner;
  /** The whole drawing's next settings, as the file will have them. */
  const commitWhole = (next: DrawingSettings) => {
    if (!scopeRead.scope) { onToast({ title: 'Drawing scope unchanged', hint: scopeRead.error ?? 'Invalid drawing scope', detail: '' }); return false; }
    return commitDrawingSettings(next, scopeRead.scope, sourceOnChange, why => onToast({ title: 'Drawing unchanged', hint: why, detail: '' }));
  };
  /** An edit of the sheet shown. */
  const onChange = (next: DrawingSettings) => commitWhole(mergeSheet(wholeSettings, current, next));
  const cropReady = sourceCurrent && projectionCurrent && !busy && !!scopeRead.scope;
  const cropOwner = useMemo(() => ({}), [wholeSettings, sourceDoc, model, modelInput, workerSession, current, cropReady]);
  const liveCrop = useRef({ owner: cropOwner, settings: wholeSettings, ready: cropReady, model });
  liveCrop.current = { owner: cropOwner, settings: wholeSettings, ready: cropReady, model };
  const crop = {
    owner: cropOwner, ready: cropReady, annotated: annotatedDetailLetters(wholeSettings),
    apply(detail: NonNullable<DrawingSettings['details']>[number], fields: Parameters<typeof editDetailCrop>[2], owner: object) {
      const live = liveCrop.current;
      const result = editDetailCrop(live.settings, detail, fields, owner, live.owner, live.ready && currentModel.current === live.model);
      if ('error' in result) return result.error;
      if (result.settings === live.settings) return null;
      return commitWhole(result.settings) ? null : 'The drawing could not be changed. Reopen the crop editor.';
    },
  };
  const [dxfSection, setDxfSection] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [shortcutHelp, setShortcutHelp] = useState(false);
  const shortcutOpener = useRef<HTMLElement | null>(null);
  const shortcutButton = useRef<HTMLButtonElement>(null);
  const openShortcutHelp = () => {
    shortcutOpener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : shortcutButton.current;
    setShortcutHelp(true);
  };
  const [pending, setPending] = useState<Pending | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [selected, setSelected] = useState<SheetAnnotationSelection | null>(null);
  const [dimensionGroup, setDimensionGroup] = useState<DimensionGroup | null>(null);
  const groupReady = tool === 'select' && sourceCurrent && projectionCurrent && !busy && currentModel.current === model;
  const activeDimensionGroup = groupReady && dimensionGroup?.owner === projectionActionOwner ? dimensionGroup : null;
  const selectedDimensionIds = useMemo(() => activeDimensionGroup?.pair.map(dimension => dimension.id), [activeDimensionGroup]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [rimChoice, setRimChoice] = useState<{ view: DimView; projection: DrawingViews; settings: DrawingSettings; rims: readonly ProjectedEdge[] } | null>(null);
  const currentRimChoice = tool === 'diameter' && views && !busy && rimChoice?.projection === views && rimChoice.settings === settings ? rimChoice : null;
  const rimChoices = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!currentRimChoice) return;
    // Let the sheet pointer event finish its native focus handling first.
    const timer = setTimeout(() => rimChoices.current?.querySelector('button')?.focus(), 0);
    return () => clearTimeout(timer);
  }, [currentRimChoice]);
  const rimLabel = (edge: ProjectedEdge) => {
    const path = drawingOccurrencePath(edge.name);
    if (!path) return 'Base part';
    let instances = model.instances, label = path;
    for (const id of path.split('/')) {
      const instance = instances?.find(part => part.id === id);
      if (!instance) return path;
      label = instance.name;
      instances = instance.doc.instances;
    }
    return `${label} (${path})`;
  };
  const [reattach, setReattach] = useState<DiameterReattachment | null>(null);
  const currentReattachment = tool === 'diameter' && !busy && reattach?.projection === views && reattach.settings === settings
    && (!reattach.detailOwner || (reattach.detailOwner === cropOwner && cropReady && currentModel.current === model)) ? reattach : null;
  useEffect(() => {
    if (!reattach || currentReattachment) return;
    setReattach(null);
    setRimChoice(null);
    if (tool === 'diameter') setTool('select');
  }, [reattach, currentReattachment, tool]);
  const [inspectedTarget, setInspectedTarget] = useState<DrawingDatumTarget | null>(null);
  const [targetChoices, setTargetChoices] = useState<DrawingDatumTarget[]>([]);
  const [reselectTarget, setReselectTarget] = useState<DrawingDatumTarget | null>(null);
  const [targetDraft, setTargetDraft] = useState<DatumTargetDraft>(DEFAULT_TARGET_DRAFT);
  const selectAnnotationRow = (kind: SheetAnnotationSelection['kind'], id: string) => {
    cancel();
    setSelected({ kind, id });
    setSelectedTarget(null);
    setSelectedFrame(null);
    setDrag(null);
    setTolDraft({});
    setTool('select');
  };
  const [radiusMove, setRadiusMove] = useState<{ owner: object; dim: DrawingDimension; preview?: XY } | null>(null);
  const [jogDrag, setJogDrag] = useState<{ owner: object; dim: Extract<DrawingDimension, { kind: 'linear' }>; pointer: number; preview: LinearExtensionJog } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (pending?.kind !== 'diameter' || !pending.source) return;
    if (pending.source.projection === views && pending.source.settings === settings && !busy) return;
    setPending(null);
    setHover(null);
    setMessage('The drawing changed. Select the rim again.');
  }, [pending, views, settings, busy]);
  const [controlDeletion, setControlDeletion] = useState<{ settings: DrawingSettings; model: typeof model; sheet: number; loss: string[]; run(): void } | null>(null);
  const currentControlDeletion = controlDeletion?.settings === wholeSettings && controlDeletion.model === model && controlDeletion.sheet === current ? controlDeletion : null;
  const requestControlDeletion = (loss: string[], run: () => void) => {
    if (!loss.length) { run(); return; }
    setControlDeletion({ settings: wholeSettings, model, sheet: current, loss, run });
  };
  const [drag, setDrag] = useState<DimensionGroupDrag | { id: string; place: XY } | { target: string; original: DrawingDatumTarget; place: XY } | { note: string; at: XY; grab: XY } | { detail: string; original: DrawingDetail; owner: object; initialAt: XY; initialPointer: XY; at: XY; grab: XY } | { removed: string; at: XY; grab: XY } | { pan: XY; box: [number, number, number, number] } | null>(null);
  const cancelDimensionGroupDrag = () => setDrag(current => current && 'dimensionGroup' in current ? null : current);
  const clearDimensionGroup = () => { setDimensionGroup(null); cancelDimensionGroupDrag(); };
  /** The selected note's text while it is typed, and the selected dimension's tolerance fields. */
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [noteAttach, setNoteAttach] = useState<{ note: DrawingNote; owner: object; choices?: { view: ViewId; points: DatumTargetPoint[] } } | null>(null);
  const noteAttachReady = sourceCurrent && projectionCurrent && !busy && scope.kind === 'part' && !scope.part && !scope.body && !!views && !!bodies;
  useEffect(() => {
    if (noteAttach && (noteAttach.owner !== projectionActionOwner || !noteAttachReady || tool !== 'select' || selected?.kind !== 'note' || selected.id !== noteAttach.note.id)) { setNoteAttach(null); setMessage('Endpoint selection cancelled because the drawing or selection changed.'); }
  }, [noteAttach, projectionActionOwner, noteAttachReady, tool, selected]);
  const [tolDraft, setTolDraft] = useState<Record<string, string>>({});
  /** A note just added: its text box takes the keyboard, its placeholder text selected. */
  const noteBox = useRef<HTMLTextAreaElement>(null), [typeNote, setTypeNote] = useState<string | null>(null);
  // (Once the new note has come back in the settings and its text box shows it.)
  const shownNote = selected?.kind === 'note' && settings.notes?.some(n => n.id === selected.id) ? selected.id : null;
  useEffect(() => {
    if (!typeNote || shownNote !== typeNote) return;
    const t = setTimeout(() => { noteBox.current?.focus(); noteBox.current?.select(); setTypeNote(null); }, 0);
    return () => clearTimeout(t);
  }, [typeNote, shownNote]);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    setNoteAttach(null); setPending(pending => pending?.kind === 'detail-center' && pending.moving.parentSheet === current ? pending : null); setSelected(null); setDimensionGroup(null); setSelectedTarget(null); setSelectedFrame(null); setTargetChoices([]); setRimChoice(null); if (reattach) setTool('select'); setReattach(null); setReselectTarget(null); setHover(null); setDrag(null); setNoteDraft(null); setTolDraft({});
  }, [scopeKey, current]);

  const lostOccurrences = useMemo(() => scope.kind === 'assembly' && sheet ? occurrenceLosses(sheet.dimensions, model.instances) : [], [scope.kind, sheet, model.instances]);
  const lossByDimension = useMemo(() => new Map(lostOccurrences.map(loss => [loss.id, loss.reason])), [lostOccurrences]);

  // The drawing's issue list (R14.2, O3): what is wrong on the sheet, then what is missing; fixes where safe.
  const issues = useMemo<DrawingIssue[]>(() => views && layout && sheet ? [...drawingIssues({ views, layout, settings, sheet, callout, locationOwner, fitMiss: fitMissOf, followedChanged, elements, ...(cuts.length ? { sections: cuts } : {}) }),
    // (11 ④: what is missing judged on the whole drawing, and a sheet with no view: this sheet's share.)
    ...(sheetTotal > 1 ? setIssuesOn({ views, settings: wholeSettings, callout, locationOwner, fitMiss: fitMissOf, followedChanged, elements, meta: { title, date: today(), source, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, ...(cuts.length ? { sections: cuts } : {}) }, current) : [])].map(issue => {
      const reason = issue.code === 'DIMENSION_LOST' && issue.dims?.length === 1 ? lossByDimension.get(issue.dims[0]) : undefined;
      return reason ? { ...issue, message: `Dimension ${issue.dims![0]} · ${reason}` } : issue;
    }) : [], [views, layout, settings, wholeSettings, current, sheet, callout, locationOwner, fitMissOf, followedChanged, elements, cuts, lossByDimension]);
  // Tolerance and GD&T suggestions (R14.4, O5): offered with their basis, applied only when accepted.
  const suggestions = useMemo<ToleranceSuggestion[]>(() => views && layout && sheet ? toleranceSuggestions({ views, layout, settings, sheet, callout, locationOwner, fastenerSizes: fastenerSizesOf(doc) }) : [], [views, layout, settings, sheet, callout, locationOwner, doc.fastenerSizes]);
  const acceptEvery = () => {
    if (!views) return;
    const r = acceptAll({ views, settings, fastenerSizes: fastenerSizesOf(doc), callout, locationOwner, fitMiss: fitMissOf, meta: { title, date: today(), source, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, ...(cuts.length ? { sections: cuts } : {}) });
    if (!onChange(r.settings)) return;
    const est = r.accepted.filter(x => x.estimate).length;
    onToast({ title: `${r.accepted.length} suggestion${r.accepted.length === 1 ? '' : 's'} accepted`, hint: est ? `${est} of them ${est === 1 ? 'is an estimate' : 'are estimates'}: check ${est === 1 ? 'it' : 'them'} against your process.` : 'Each from the studio’s data.', detail: r.accepted.map(x => `${x.message} — ${x.basis}`).join('\n') });
  };
  const fixIssue = (issue: DrawingIssue) => {
    const fix = issue.fix;
    if (!views || !layout || !sheet || !fix || (scope.kind === 'assembly' && fix.kind === 'auto-dimension')) return;
    if (issue.code === 'DETAIL_EMPTY' && fix.kind === 'remove-detail') {
      const detail = settings.details?.find(d => d.id === fix.detail);
      const parentSheet = detail ? sheetOf(wholeSettings, detail.view) : current;
      const parent = detail && placementOf(layout, sheet, detail.view);
      if (busy || !detail || (parentSheet === current && (!parent || parent.hidden))) {
        setMessage('Show the current parent view before moving the detail.');
        return;
      }
      cancel();
      setTool('detail');
      setPending({ kind: 'detail-center', view: detail.view, moving: { detail, owner: wholeSettings, model: currentModel.current, parentSheet } });
      if (parentSheet !== current) selectSheet(parentSheet);
      return;
    }
    if (fix.kind === 'remove-detail') { removeDetail(fix.detail); return; }
    requestControlDeletion(drawingFixControlLoss(settings, fix), () => {
      onChange(applyFix({ views, layout, settings, sheet, callout, locationOwner, elements, ...(cuts.length ? { sections: cuts } : {}) }, fix));
    });
  };
  // (O175: Fix all runs the chat's rounds, fixRound: a round that adds a section waits for the worker to cut it, and the
  // next round runs on the sheet with its view — one Fix, as the chat's fix_drawing, not a second click. The rounds stop
  // when the settings change from elsewhere. Each round is its own undo step.)
  const fixing = useRef<{ state: FixRounds; want: string } | null>(null);
  const fixInputs = (): SheetInputs | null => views ? { views, settings, callout, locationOwner, elements, fitMiss: fitMissOf, meta: { title, date: today(), source, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, ...(cuts.length ? { sections: cuts } : {}) } : null;
  const protectedDetails = () => {
    const annotated = annotatedDetailLetters(wholeSettings);
    return new Set((sheet?.detailsMissing ?? []).filter(detail => annotated.has(detail.id)).map(detail => detail.id));
  };
  const fixEveryRound = (state: FixRounds, inputs: SheetInputs) => {
    const protectedLetters = protectedDetails();
    const protectedView = (view: DimView | undefined) => !!view && isDetailRef(view) && protectedLetters.has(detailLetter(view));
    const protectedDimension = (id: string) => protectedView(wholeSettings.dimensions.find(dim => dim.id === id)?.view);
    return fixRound(state, inputs, fix => {
      switch (fix.kind) {
        case 'remove-detail': return !protectedLetters.has(fix.detail);
        case 'remove': return !protectedDimension(fix.dim);
        case 'remove-frame': {
          const frame = wholeSettings.frames?.find(frame => frame.id === fix.frame);
          return !frame || (frame.dim === undefined ? !protectedView(frame.view) : !protectedDimension(frame.dim));
        }
        case 'auto-dimension': return scope.kind !== 'assembly';
        default: return true;
      }
    });
  };
  const fixStep = (step: FixRoundStep) => {
    if (step.next) {
      fixing.current = { state: step.state, want: scopeRead.scope ? JSON.stringify(committedSheetSettings(wholeSettings, current, step.next, scopeRead.scope)) : JSON.stringify(step.next) };
      if (!onChange(step.next)) fixing.current = null;
      return;
    }
    fixing.current = null;
    if (JSON.stringify(step.settings) !== JSON.stringify(settings) && !onChange(step.settings)) return;
    const retained = [...protectedDetails()];
    const preservation = retained.length ? `Detail annotations preserved for ${retained.join(', ')}. ` : '';
    const remaining = step.left.length ? `${step.left.length} issue${step.left.length === 1 ? '' : 's'} left: ${step.left[0].message}` : 'The drawing has no issues.';
    onToast({ title: `${step.applied.length} fix${step.applied.length === 1 ? '' : 'es'} applied`, hint: preservation + remaining, detail: step.left.slice(1).map(x => x.message).join('\n') });
  };
  const fixEvery = () => {
    const i = fixInputs(); if (!i) return;
    fixStep(fixEveryRound(fixRoundsStart(i), i));
  };
  useEffect(() => {
    const f = fixing.current; if (!f) return;
    if (JSON.stringify(settings) !== f.want) { fixing.current = null; return; }
    if (error) { fixStep(fixRoundsOutcome(f.state)); return; }
    // (Settled: every section the settings list cut for them, the views projected.)
    if (busy || !views || !layout || !sheet || !sectionList.every(x => cutsMade?.some(c => sameSection(c, x)))) return;
    const i = fixInputs(); if (i) fixStep(fixEveryRound(f.state, i));
  }, [settings, busy, views, layout, sheet, cutsMade, error, locationOwner]);
  // Reference inspection reads this sheet; it does not change the selected reference or the saved drawing.
  const referenceLabels = useMemo<readonly DrawingReferenceLabel[]>(() => !busy && sheet ? sheet.dimensions.map(r => ({ dimensionId: r.dim.id, view: r.dim.view, text: r.ok ? r.text : null, ...(!r.ok ? { reason: r.reason } : {}) })) : [], [busy, sheet]);
  useEffect(() => { onReferenceLabels?.(referenceLabels); }, [onReferenceLabels, referenceLabels]);
  const referenceInspection = useMemo(() => {
    if (!referencePreview) return null;
    const unavailable = (reason: string, dimensionId: string | null = null) => ({ dimensionId, markup: '', message: `Reference preview unavailable: ${reason}` });
    const matches = wholeSettings.dimensions.filter(d => d.id === referencePreview.dimensionId);
    if (matches.length > 1) return unavailable('the dimension ID is not unique.');
    const dimension = settings.dimensions.find(d => d.id === referencePreview.dimensionId);
    if (!dimension) return unavailable('the dimension is not on this sheet.');
    if (busy || !views || !layout || !sheet) return unavailable('the current sheet is not ready.');
    const placement = placementOf(layout, sheet, dimension.view), projection = projectionOf(views, sheet, dimension.view);
    if (!placement || placement.hidden || !projection) return unavailable('the dimension view is not shown.');
    const resolved = sheet.dimensions.filter(r => r.dim.id === dimension.id);
    if (resolved.length !== 1) return unavailable('the dimension has no display on this sheet.');
    const result = resolved[0];
    if (referencePreview.edge === undefined) {
      if (!result.ok) return unavailable('the dimension has no resolved display on this sheet.');
      return { dimensionId: dimension.id, markup: '', message: dimension.view + ': ' + result.text + '. Dimension highlighted for inspection.' };
    }
    const preview = referenceCandidate(placement, projection, referencePreview.edge);
    if ('reason' in preview) return unavailable(preview.reason, dimension.id);
    const candidate = referencePreview.candidateNumber === undefined ? 'Candidate' : 'Candidate ' + referencePreview.candidateNumber;
    const description = result.ok ? result.text : 'Dimension unresolved. ' + result.reason;
    return {
      dimensionId: dimension.id,
      markup: preview.markup,
      message: candidate + ' highlighted in the ' + viewLabel(dimension.view) + '. ' + description,
    };
  }, [referencePreview, wholeSettings.dimensions, settings.dimensions, busy, views, layout, sheet]);
  const referenceDimensionId = referenceInspection?.dimensionId ?? null;
  useEffect(() => {
    if (!referencePreview) return;
    setSelected(referenceDimensionId === null ? null : { kind: 'dimension', id: referenceDimensionId }); setSelectedTarget(null); setSelectedFrame(null); setTargetChoices([]); setReselectTarget(null); setTool('select'); setPending(null);
  }, [referencePreview, referenceDimensionId]);
  const sheetMarkup = useMemo(() => sheet ? sheetGroupsSvg(sheet, selected, selectedTarget, selectedFrame, selectedDimensionIds) : '',
    [sheet, selected, selectedTarget, selectedFrame, selectedDimensionIds]);
  const [W, H] = layout?.size ?? [297, 210];
  const [box, setBox] = useState<[number, number, number, number] | null>(null);
  useEffect(() => { setBox(null); }, [settings.sheet, current]);
  const viewBox = box ?? [-6, -6, W + 12, H + 12];

  // Pointer position on the sheet (mm), and the view under it.
  const sheetPoint = useCallback((clientX: number, clientY: number): XY | null => {
    const el = svg.current, m = el?.getScreenCTM(); if (!el || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse()); return [p.x, p.y];
  }, []);
  const mmPerPx = () => { const m = svg.current?.getScreenCTM(); return m ? 1 / m.a : 0.3; };
  const viewAt = useCallback((q: XY): DimView | null => {
    if (!layout) return null;
    let best: DimView | null = null, bestD = 30;
    // (DR-4: a revolved section lies on its view: inside its box, it is taken before the view.)
    const near = (id: DimView, [x0, y0, x1, y1]: readonly number[], over = 0) => { const d = Math.max(x0 - q[0], q[0] - x1, y0 - q[1], q[1] - y1, 0); if (d - (d === 0 ? over : 0) < bestD) { bestD = d - (d === 0 ? over : 0); best = id; } };
    for (const id of VIEW_IDS) if (!layout.views[id].hidden) near(id, layout.views[id].box);
    // (O148 X2: the sections as placed, dimensioned as views are.)
    for (const x of sheet?.sections ?? []) near(`section:${x.id}`, x.placement.box, x.form === 'revolved' ? 1 : 0);
    // (DR-1: the details as drawn, dimensioned as views are.)
    for (const x of sheet?.details ?? []) near(`detail:${x.id}`, x.placement.box);
    return best;
  }, [layout, sheet]);
  const snaps = useMemo(() => views ? { ...Object.fromEntries(VIEW_IDS.map(id => [id, snapPoints(views[id])])), ...Object.fromEntries((sheet?.sections ?? []).map(x => [`section:${x.id}`, snapPoints(x.projection)])), ...Object.fromEntries((sheet?.details ?? []).map(x => [`detail:${x.id}`, snapPoints(x.projection)])) } as Partial<Record<DimView, SnapPoint[]>> : null, [views, sheet?.sections, sheet?.details]);
  const placementAt = (v: DimView) => layout ? placementOf(layout, sheet ?? undefined, v) : undefined;
  const projectionAt = (v: DimView) => views ? projectionOf(views, sheet ?? undefined, v) : undefined;

  const hoverAt = useCallback((clientX: number, clientY: number): Hover | null => {
    const q = sheetPoint(clientX, clientY); if (!q || !layout || !views || !snaps) return null;
    const view = viewAt(q), v = view && placementOf(layout, sheet ?? undefined, view), pr = view && projectionOf(views, sheet ?? undefined, view); if (!view || !v || !pr) return null;
    const at = fromSheet(v, q), tol = 9 * mmPerPx() / v.scale;
    if (tool === 'diameter' && isDetailRef(view)) {
      return { q, view, at, snap: null, edge: currentReattachment?.detailOwner
        ? pickVisibleDetailRim(pr, at, 6 * mmPerPx() / v.scale)
        : edgeAt(pr, at, 6 * mmPerPx() / v.scale, !showDetailHidden(settings, view)) };
    }
    if (tool === 'diameter' && isViewId(view)) {
      const visibleRimOnly = !settings.hidden || view === 'iso';
      const projection = v.breaks ? clipProjectionOutside(pr, v.breaks) : pr;
      const rims = diameterRims(projection, at, 6 * mmPerPx() / v.scale, tol, visibleRimOnly, scope.kind === 'assembly');
      return { q, view, at, snap: null, edge: rims[0] ?? null, visibleRimOnly, rims };
    }
    if (tool === 'arc-length') return { q, view, at, snap: null, edge: edgeAt(pr, at, 6 * mmPerPx() / v.scale, true) };
    if (tool === 'reflex-angle') return { q, view, at, snap: null, edge: view === 'top' && !v.breaks?.length
      ? edgeAt(pr, at, 6 * mmPerPx() / v.scale, true) : null };
    const breaks = tool === 'linear' || tool === 'angle' || tool === 'radius' ? v.breaks : undefined;
    return { q, view, at, ...drawingBrokenPick(pr, snaps[view] ?? [], at, tol, 6 * mmPerPx() / v.scale, breaks) };
  }, [sheetPoint, layout, views, snaps, viewAt, sheet, tool, settings, scope.kind, currentReattachment]);

  /** Placing a dimension (its points picked): where it goes, read in its own view wherever the pointer is on the sheet —
   *  beyond the views' reach too (hoverAt finds a view only within 30 mm), so a click out on the paper places it. */
  const placingAt = (clientX: number, clientY: number): Hover | null => {
    if (!pending || pending.kind === 'note' || pending.kind === 'detail-center' || ((pending.kind === 'linear' || pending.kind === 'angle') && !pending.b)) return null;
    const q = sheetPoint(clientX, clientY), v = q && placementAt(pending.view);
    return q && v ? { q, view: pending.view, at: fromSheet(v, q), snap: null, edge: null } : null;
  };

  const commitDims = (dimensions: DrawingDimension[]) => onChange({ ...settings, dimensions });
  const resolveDimensionGroup = (ids: readonly [string, string]) => {
    if (!groupReady || !sheet || !layout || currentModel.current !== model ||
        liveProjectionAction.current !== projectionActionOwner) return;
    const pair = drawingDimensionPair(settings.dimensions, wholeSettings.dimensions, ids,
      dimension => sheet.dimensions.some(result => result.ok && result.dim === dimension));
    const placement = pair && placementOf(layout, sheet, pair[0].view);
    if (pair && placement && !placement.hidden && !placement.breaks && placement.scale > 0) return { pair, scale: placement.scale };
  };
  const previewDimensionGroup = (pair: DrawingDimensionPair, scale: number, paperDelta: number) => {
    if (!views || !layout || !sheet) return;
    const dimensions = moveDrawingDimensionPair(settings.dimensions, pair, scale, paperDelta);
    if (dimensions === settings.dimensions) return;
    const preview = buildSheet(views, layout, { ...settings, dimensions }, { svgSectionTextClearance, title, date: today(), callout, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, cuts);
    if (dimensionPairLabelsMoved(sheet, preview, pair, paperDelta)) return { dimensions, preview };
  };
  const commitFrames = (frames: DrawingFrame[]) => {
    if (!scopeRead.scope) { setMessage(scopeRead.error ?? 'Invalid drawing scope.'); return false; }
    const mergedFrames = mergeSheet(wholeSettings, current, { ...settings, frames }).frames ?? [];
    const why = checkDrawingFrames({ frames: mergedFrames }, wholeSettings.frames ?? [])[0];
    if (why) { setMessage(why.message); return false; }
    onChange({ ...settings, frames: readFrames(frames) }); return true;
  };
  const removeFrame = (frame: DrawingFrame) => {
    if (frame.dim !== undefined) return;
    requestControlDeletion(drawingFixControlLoss(settings, { kind: 'remove-frame', frame: frame.id }), () => {
      if (commitFrames((settings.frames ?? []).filter(row => row !== frame))) { setSelectedFrame(null); setPending(null); setMessage(null); }
    });
  };
  const commitTargets = (datumTargets: DrawingDatumTarget[]) => {
    if (!scopeRead.scope) { setMessage(scopeRead.error ?? 'Invalid drawing scope.'); return false; }
    if (datumTargets.length > 200 || datumTargetConflicts(datumTargets).size) { setMessage('Datum targets need at most 200 rows with unique IDs and letter-number pairs.'); return false; }
    // Saved legacy rows may remain untouched while one row is explicitly repaired. New objects stay strict.
    const existing = new Set(settings.datumTargets ?? []), changed = datumTargets.filter(row => !existing.has(row));
    const mergedTargets = mergeSheet(wholeSettings, current, { ...settings, datumTargets }).datumTargets ?? [];
    const conflicts = datumTargetConflicts(mergedTargets);
    // Other sheets (including unresolved targets) reserve their labels too. Untouched legacy peers stay repairable.
    if (mergedTargets.length > 200 || changed.some(row => conflicts.has(row))) {
      setMessage('Datum targets need at most 200 rows with unique IDs and letter-number pairs across all sheets.'); return false;
    }
    const why = checkDatumTargetOptions({ datumTargets: changed })[0];
    if (why) { setMessage(why.message); return false; }
    onChange({ ...settings, datumTargets }); setPending(null); setTargetChoices([]); return true;
  };
  const cancel = () => { setRadiusMove(null); clearDimensionGroup(); setNoteAttach(null); setReattach(null); setRimChoice(null); setPending(null); setTargetChoices([]); setReselectTarget(null); setMessage(null); };
  const startNoteAttach = (note: DrawingNote) => {
    cancel();
    if (noteDraft !== null && noteDraft.trimEnd() !== note.text) { setMessage('Finish the note text edit, then select Attach to endpoint again.'); return; }
    if (!noteAttachReady || settings.notes?.filter(n => n.id === note.id).length !== 1 || !settings.notes.includes(note)) { setMessage('The note or drawing changed. Select the note again when its drawing is ready.'); return; }
    setTool('select'); setDrag(null); setNoteAttach({ note, owner: projectionActionOwner });
    setMessage('Select a visible straight edge endpoint in a front, top or right view on this sheet. Esc cancels.');
    svg.current?.focus();
  };
  const chooseNoteEndpoint = (view: ViewId, point: DatumTargetPoint) => {
    const session = noteAttach, placement = layout?.views[view];
    if (!session || tool !== 'select' || selected?.kind !== 'note' || selected.id !== session.note.id || session.owner !== liveProjectionAction.current || !noteAttachReady || !views || !placement || placement.hidden || placement.breaks || !['front', 'top', 'right'].includes(view)
      || settings.notes?.filter(n => n.id === session.note.id).length !== 1 || !settings.notes.includes(session.note)) {
      setNoteAttach(null); setMessage('The note or drawing changed. Select Attach to endpoint again.'); return;
    }
    const target = captureNoteTarget(views[view], point.edge, point.near);
    if (!target) { setMessage('The current endpoint could not be verified. Select a current straight edge endpoint.'); return; }
    const { sheet: _sheet, ...kept } = session.note; void _sheet;
    const next: DrawingNote = { ...kept, leader: { view, at: inView(views[view], point.near), target } };
    const resolved = resolveNoteLeader(views, next, settings);
    if (!resolved.ok) { setMessage(resolved.reason); return; }
    if (onChange({ ...settings, notes: settings.notes!.map(n => n === session.note ? next : n) })) {
      setNoteAttach(null); setMessage(null); setSelected({ kind: 'note', id: next.id });
    }
  };
  const chooseTarget = (target: DrawingDatumTarget, moving = false) => {
    setSelectedFrame(null);
    if (reselectTarget && !moving) {
      const current = (settings.datumTargets ?? []).filter(row => row.id === reselectTarget.id);
      if (!views || busy || current.length !== 1 || current[0] !== reselectTarget) { setMessage('The target changed or its current drawing is not ready. Select Reselect endpoint again.'); return; }
      const next = { ...reselectTarget, point: target.point } as DrawingDatumTarget, resolved = resolveDatumTarget(views[next.view], next);
      if (!resolved.ok) { setMessage(`${resolved.code}: ${resolved.reason}`); return; }
      if (commitTargets(settings.datumTargets!.map(row => row === reselectTarget ? next : row))) {
        setReselectTarget(null); setTool('select'); setSelected(null); setSelectedTarget(next.id); setMessage(null);
      }
      return;
    }
    setReselectTarget(null);
    setTargetChoices([]); setPending({ kind: 'datum-target', view: target.view, target, moving });
    setMessage('Click where the target symbol goes. Esc cancels.');
  };
  const placeFrame = (view: DimView, frame?: DrawingFrame) => {
    const placement = placementAt(view);
    if (busy || !views || !placement || placement.hidden) { setMessage('Show the frame view and wait for the current drawing before placing a frame.'); return; }
    if (frame && frame.dim !== undefined) return;
    const id = frame?.id ?? nextStandaloneFrameId(wholeSettings.frames);
    if (id === null) { setMessage('A drawing can contain up to 200 geometric control frames.'); return; }
    cancel(); setSelected(null); setSelectedTarget(null); setSelectedFrame(frame?.id ?? null); setTool('select'); setDrag(null);
    setPending({ kind: 'standalone-frame', view, frame: frame ?? { id, view, place: [0, 0], characteristic: 'position', value: 0.1, datums: [] }, moving: !!frame, settingsKey: JSON.stringify(settings), sourceDoc, model });
    setMessage(`Click the sheet to place the frame. View: ${viewLabel(view)}. Esc cancels.`);
  };

  /** A line or area target: its points are clicked in a view (a snapped edge end or centre, else the exact point). */
  const pickFreeTarget = (h: Hover, view: ViewId) => {
    const identity = nextDatumTargetIdentity(wholeSettings.datumTargets), round = (p: readonly number[]): XY => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
    if (!identity) { setMessage('A drawing can contain up to 200 datum targets and needs an unused A1–A99 number for a new target.'); return; }
    const picked = round(h.snap ? h.snap.at : h.at);
    const head = { ...identity, view, place: round(h.at) };
    if (targetDraft.kind === 'line') {
      if (pending?.kind !== 'datum-line') { setPending({ kind: 'datum-line', view, from: picked }); setMessage('Click the other end of the target line. Esc cancels.'); return; }
      if (pending.view !== view) { setMessage(`Pick the other end in the ${pending.view} view.`); return; }
      if (pending.from[0] === picked[0] && pending.from[1] === picked[1]) { setMessage('A target line needs two distinct points.'); return; }
      chooseTarget({ ...head, kind: 'line', line: { from: pending.from, to: picked } }); return;
    }
    const number = (v: string) => v.trim() ? Number(v) : NaN;
    const area = targetDraft.shape === 'circle' ? { shape: 'circle' as const, at: picked, d: number(targetDraft.d) } : { shape: 'rect' as const, at: picked, w: number(targetDraft.w), h: number(targetDraft.h) };
    const why = checkDatumTargetOptions({ datumTargets: [{ ...head, kind: 'area', area }] })[0];
    if (why) { setMessage(why.message); return; }
    chooseTarget({ ...head, kind: 'area', area });
  };

  const startReattachment = (id: string) => {
    const originals = settings.dimensions.filter(dim => dim.id === id);
    const original = originals[0];
    const detailRepair = original?.kind === 'diameter' && scope.kind === 'part' && isDetailRef(original.view)
      && cropReady && currentModel.current === model && !!detailFor(settings, original.view)
      && !!sheet?.details?.some(d => `detail:${d.id}` === original.view)
      && !!sheet?.dimensions.some(r => r.dim === original && !r.ok);
    if (!views || busy || originals.length !== 1 || wholeSettings.dimensions.filter(dim => dim.id === id).length !== 1
      || original.kind !== 'diameter' || (!detailRepair && (original.view === 'iso' || !isViewId(original.view) || !lossByDimension.has(id)))) return;
    cancel();
    setTool('diameter');
    setSelected({ kind: 'dimension', id });
    setReattach({ original, settings, projection: views, ...(detailRepair ? { detailOwner: cropOwner } : {}) });
  };

  const cancelReattachment = () => {
    cancel();
    setTool('select');
  };

  const confirmReattachment = () => {
    if (!currentReattachment?.candidate || !views) return;
    const { original, candidate } = currentReattachment;
    let next: typeof original;
    if (currentReattachment.detailOwner) {
      const live = liveCrop.current, pr = projectionAt(original.view), detail = detailFor(settings, original.view);
      if (currentReattachment.detailOwner !== live.owner || !live.ready || currentModel.current !== live.model
        || scope.kind !== 'part' || wholeSettings.dimensions.filter(d => d.id === original.id).length !== 1 || !pr || !detail) { cancelReattachment(); return; }
      const repaired = reconnectDetailDiameter(settings, original, pr, detail, candidate);
      if (!repaired) { setMessage('The selected rim is no longer drawable in this detail. Select a current visible rim.'); return; }
      next = repaired;
    } else {
      const { sig: _sig, was: _was, ...retained } = original;
      void _sig; void _was;
      next = { ...retained, edge: candidate.edge, near: candidate.near };
      const resolved = resolveDimension(views, next);
      if (!resolved.ok) { setMessage(resolved.reason); return; }
    }
    if (commitDims(settings.dimensions.map(dim => dim === original ? next : dim))) {
      cancelReattachment();
    }
  };

  const startDiameter = (view: DimView, edge: ProjectedEdge) => {
    if (!edge.circle || !views || busy) return;
    if (currentRimChoice) svg.current?.focus();
    setRimChoice(null);
    if (currentReattachment) {
      if (view !== currentReattachment.original.view) return;
      if (currentReattachment.detailOwner) {
        const pr = projectionAt(view);
        if (!pr || !visibleDetailRim(pr, edge)) { setMessage('Select a visible circular arc in this detail.'); return; }
      }
      setReattach({ ...currentReattachment,
        candidate: { edge: edge.name, near: [...edge.circle.center] as Vec3, label: rimLabel(edge), diameter: 2 * edge.circle.radius } });
      return;
    }
    setPending({ kind: 'diameter', view, edge: edge.name, near: [...edge.circle.center] as Vec3,
      source: { projection: views, settings }, ...(scope.kind === 'assembly' ? { owner: rimLabel(edge) } : {}) });
  };

  const click = (h: Hover) => {
    if (!views) return;
    if (pending?.kind === 'standalone-frame') return; // Placed directly from its explicit view in onPointerDown.
    setMessage(null);
    if (tool === 'datum-target') {
      if (busy) { setMessage('Wait for the current drawing.'); return; }
      if (pending?.kind === 'datum-target') {
        const currentTarget = pending.moving ? pending.target : withDatumTargetAreaDraft(pending.target, targetDraft);
        const target = { ...currentTarget, place: fromSheet(layout!.views[pending.view], h.q) };
        const why = checkDatumTargetOptions({ datumTargets: [target] })[0];
        if (why) { setMessage(why.message); return; }
        const resolved = resolveDatumTarget(views[pending.view], target);
        if (!resolved.ok) { setMessage(`${resolved.code}: ${resolved.reason}`); return; }
        const rows = settings.datumTargets ?? [];
        const current = rows.filter(t => t.id === target.id);
        if (pending.moving && (current.length !== 1 || current[0] !== pending.target)) { setMessage('The target changed. Select it again before moving its symbol.'); return; }
        if (commitTargets(pending.moving ? rows.map(t => t === pending.target ? target : t) : [...rows, target])) {
          setPending(null); setTool('select'); setSelected(null); setSelectedTarget(target.id);
        }
        return;
      }
      if (!isViewId(h.view)) { setMessage('Datum targets use a base view. Select a point on the front, top or right view.'); return; }
      if (!reselectTarget && targetDraft.kind !== 'point') { pickFreeTarget(h, h.view); return; }
      if (reselectTarget && h.view !== reselectTarget.view) { setMessage(`Select a current endpoint in the target's ${reselectTarget.view} view.`); return; }
      if (!bodies) { setMessage('Wait for the current drawing bodies before selecting a target endpoint.'); return; }
      const identity = nextDatumTargetIdentity(wholeSettings.datumTargets);
      if (!reselectTarget && !identity) { setMessage('A drawing can contain up to 200 datum targets and needs an unused A1–A99 number for a new target.'); return; }
      const pr = views[h.view], placement = layout!.views[h.view];
      const picked = endpointSnap(pr, h.at, 9 * mmPerPx() / placement.scale, bodies);
      if (picked.error) { setMessage(picked.error); return; }
      const candidates = picked.points.map((point): DrawingDatumTarget => reselectTarget ? { ...reselectTarget, point } as DrawingDatumTarget : { ...identity!, view: h.view as ViewId, place: [...h.at] as XY, point, ...(targetDraft.moveable ? { moveable: true as const } : {}) });
      if (!candidates.length) { setMessage('Select a visible straight edge endpoint. Circle centres and curved edges are not supported.'); return; }
      if (candidates.length > 1) { setTargetChoices(candidates); setMessage('Endpoints overlap here. Choose the exact edge and endpoint in Point datum targets.'); return; }
      const resolved = resolveDatumTarget(pr, candidates[0]);
      if (!resolved.ok) { setMessage(`${resolved.code}: ${resolved.reason}`); return; }
      chooseTarget(candidates[0]); return;
    }
    // Where a dimension goes is read in its own view, wherever the pointer is.
    if (pending?.kind === 'note') { addNote(h.q, pending.leader); return; }
    if (tool === 'detail') { pickDetail(h); return; }
    const placing = pending && ((pending.kind !== 'linear' && pending.kind !== 'angle') || pending.b);
    const into = placing ? placementAt(pending.view) : null, place = placing && into ? fromSheet(into, h.q) : h.at;
    if (h.view === 'iso' && !placing) { setMessage('Dimensions go on the front, top and right views.'); return; }
    const pr = projectionAt(placing ? pending.view : h.view); if (!pr) return;
    if (tool === 'linear') {
      if (pending?.kind === 'linear' && pending.b) {
        const a = pointIn(pr, pending.a), b = pointIn(pr, pending.b);
        commitDims([...settings.dimensions, { id: newDimensionId(wholeSettings.dimensions, wholeSettings.frames), view: pending.view, kind: 'linear', a: pending.a, b: pending.b, orient: orientFor(a, b, place), place }]);
        setPending(null); return;
      }
      if (pending?.kind === 'linear' && pending.view !== h.view) { setMessage('Pick the second point in the same view.'); return; }
      if (h.snap) {
        if (!pending || pending.kind !== 'linear') { setPending({ kind: 'linear', view: h.view, a: h.snap.ref }); return; }
        const a = pointIn(pr, pending.a);
        if (Math.hypot(a[0] - h.snap.at[0], a[1] - h.snap.at[1]) < 1e-9) { setMessage('Pick a different point.'); return; }
        setPending({ ...pending, b: h.snap.ref }); return;
      }
      if (h.edge && !pending && h.edge.ends && h.edge.kind !== 'circle' && h.edge.kind !== 'curve') {
        const [p, q] = h.edge.ends;
        setPending({ kind: 'linear', view: h.view, a: { edge: h.edge.name, at: 'end', near: [...p] as Vec3 }, b: { edge: h.edge.name, at: 'end', near: [...q] as Vec3 } }); return;
      }
      setMessage(pending ? 'Click an edge end or a circle centre.' : 'Click an edge end, a circle centre or a straight edge.'); return;
    }
    if (tool === 'angle' || tool === 'reflex-angle') {
      const reflex = tool === 'reflex-angle';
      if (reflex && scope.kind !== 'part') { setMessage('Reflex angles use a part drawing.'); return; }
      if (reflex && (busy || !projectionCurrent || (pending?.kind === 'angle' && pending.owner !== projectionActionOwner))) {
        setPending(null); setMessage('The drawing changed. Pick both reflex angle edges again.'); return;
      }
      if (pending?.kind === 'angle' && pending.b) {
        const dim: DrawingDimension = { id: newDimensionId(wholeSettings.dimensions, wholeSettings.frames), view: pending.view, kind: 'angle',
          a: pending.a, b: pending.b, place, ...(pending.mode ? { mode: pending.mode } : {}) };
        if (reflex) {
          const resolved = resolveDimension(views, dim);
          if (!resolved.ok) { setMessage(resolved.reason); return; }
        }
        commitDims([...settings.dimensions, dim]);
        setPending(null); return;
      }
      if (reflex && (h.view !== 'top' || placementAt(h.view)?.breaks?.length)) {
        setMessage('Pick two straight edges in an unbroken Top view.'); return;
      }
      // A straight edge under the pointer, including near its ends.
      const e = h.edge ?? (reflex ? null : drawingBrokenEdgeAt(pr, h.at, 6 * mmPerPx() / (placementAt(h.view)?.scale ?? 1), placementAt(h.view)?.breaks));
      if (!e || !e.ends || e.circle || (e.kind !== 'line' && (reflex || e.kind !== 'silhouette'))) { setMessage('Click a straight edge.'); return; }
      const ref: EdgeRef = { edge: e.name, near: [0, 1, 2].map(k => (e.ends![0][k] + e.ends![1][k]) / 2) as Vec3 };
      if (pending?.kind !== 'angle') {
        setPending({ kind: 'angle', view: h.view, a: ref, ...(reflex ? { mode: 'reflex', owner: projectionActionOwner } : {}) }); return;
      }
      if (pending.view !== h.view) { setMessage('Pick the second edge in the same view.'); return; }
      if (reflex) {
        const resolved = resolveDimension(views, { id: 'preview', view: pending.view, kind: 'angle', mode: 'reflex', a: pending.a, b: ref, place: h.at });
        if (!resolved.ok) { setMessage(resolved.reason); return; }
      } else {
        const a = resolveLine(pr, pending.a), b = resolveLine(pr, ref);
        if (!a || !b || !angleBetween(a, b, h.at)) { setMessage('These edges are parallel here — pick one that meets the first at an angle.'); return; }
      }
      setPending({ ...pending, b: ref }); return;
    }
    if (tool === 'diameter' || tool === 'radius') {
      if (pending && pending.kind === tool) {
        if (pending.source && (pending.source.projection !== views || pending.source.settings !== settings || busy)) {
          cancel(); setMessage('The drawing changed. Select the rim again.'); return;
        }
        const dim: DrawingDimension = { id: newDimensionId(wholeSettings.dimensions, wholeSettings.frames), view: pending.view, kind: tool, edge: pending.edge, near: pending.near, place };
        if (tool === 'diameter' && isDetailRef(dim.view)) {
          const resolved = resolveDimension({ [dim.view]: pr }, dim, detailFor(settings, dim.view), showDetailHidden(settings, dim.view));
          if (!resolved.ok) { setMessage(resolved.reason); return; }
        }
        commitDims([...settings.dimensions, dim]);
        setPending(null); return;
      }
      if (tool === 'diameter' && reattach && !currentReattachment) { cancelReattachment(); return; }
      if (tool === 'diameter' && (currentRimChoice || currentReattachment?.candidate)) return;
      if (tool === 'diameter' && currentReattachment && h.view !== currentReattachment.original.view) {
        setMessage(`Select a rim in the ${viewLabel(currentReattachment.original.view)}.`); return;
      }
      if (tool === 'diameter' && h.rims && h.rims.length > 1) {
        setRimChoice({ view: h.view, projection: views, settings, rims: h.rims }); return;
      }
      const e = h.edge ?? (h.snap ? pr.edges.find(x => x.name === h.snap!.ref.edge && x.circle) ?? null : null);
      if (!e?.circle) { setMessage('Click a circle or an arc.'); return; }
      if (!roundIn(pr, e)) { setMessage(`This circle is not round in the ${viewLabel(h.view)} — dimension it where it shows as a circle.`); return; }
      if (tool === 'diameter' && (h.rims || currentReattachment)) startDiameter(h.view, e);
      else setPending({ kind: tool, view: h.view, edge: e.name, near: [...e.circle.center] as Vec3 });
      return;
    }
    if (tool === 'arc-length') {
      if (pending?.kind === 'arc-length') {
        if (pending.source.projection !== views || pending.source.settings !== settings || busy) {
          cancel(); setMessage('The drawing changed. Select the circular arc again.'); return;
        }
        if (placementAt(pending.view)?.breaks?.length) {
          cancel(); setMessage('Arc length dimensions are not supported on a broken view.'); return;
        }
        const dim: DrawingDimension = {
          id: newDimensionId(wholeSettings.dimensions, wholeSettings.frames),
          view: pending.view,
          kind: 'arc-length',
          arc: pending.arc,
          place,
        };
        const resolved = resolveDimension(views, dim);
        if (!resolved.ok) { setMessage(resolved.reason); return; }
        commitDims([...settings.dimensions, dim]);
        setPending(null); return;
      }
      if (placementAt(h.view)?.breaks?.length) {
        setMessage('Arc length dimensions are not supported on a broken view.'); return;
      }
      if (!isViewId(h.view) || h.view === 'iso') {
        setMessage('Arc length dimensions are supported only on ordinary front, top, and right views.'); return;
      }
      if (!h.edge) {
        setMessage('Click a partial circular arc edge.'); return;
      }
      const picked = pickArcLengthEdge(pr, h.edge, h.view, false);
      if (!picked.ok) { setMessage(picked.reason); return; }
      setPending({ kind: 'arc-length', view: h.view, arc: picked.ref, source: { projection: views, settings } });
      return;
    }
  };

  /** DR-1: the detail tool — its centre on a view or a section, then a point its circle reaches; the next free letter, its scale and place automatic. */
  const pickDetail = (h: Hover) => {
    const moving = pending?.kind === 'detail-center' || pending?.kind === 'detail' ? pending.moving : undefined;
    if (moving && (busy || moving.owner !== wholeSettings || moving.model !== currentModel.current)) {
      cancel();
      setMessage('The drawing changed. Select Move again.');
      return;
    }
    if (pending?.kind === 'detail') {
      const into = placementAt(pending.view);
      if (!into || into.hidden) return;
      const at = fromSheet(into, h.q), radius = Math.round(Math.hypot(at[0] - pending.center[0], at[1] - pending.center[1]) * 100) / 100;
      if (!(radius > 0)) { setMessage('Click away from the centre: that is how far the circle reaches.'); return; }
      if (moving) {
        const detail = { ...moving.detail, center: pending.center, radius };
        if (commitWhole({ ...wholeSettings, details: wholeSettings.details?.map(d => d.id === detail.id ? detail : d) })) {
          setPending(null);
          setTool('select');
        }
        return;
      }
      // (A stays the front section's, by its checkbox, as added sections leave it.)
      const used = [...(wholeSettings.details ?? []).map(d => d.id), ...reservedDetailLetters(wholeSettings)];
      const id = nextSectionId([{ id: 'A', view: 'front', at: 0 }, ...sectionsOf(wholeSettings)], used);
      onChange({ ...settings, details: [...(settings.details ?? []), { id, view: pending.view, center: pending.center, radius }] });
      setPending(null); return;
    }
    if (moving && h.view !== moving.detail.view) {
      setMessage(`Select the centre of Detail ${moving.detail.id} on the ${viewLabel(moving.detail.view)}.`);
      return;
    }
    if (!(DETAIL_PARENTS as readonly string[]).includes(h.view) && !isSectionRef(h.view)) { setMessage('A detail enlarges part of the front, top or right view, or of a section.'); return; }
    const c = h.snap?.at ?? h.at;
    setPending({ kind: 'detail', view: h.view as DetailParent, center: [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100], ...(moving ? { moving } : {}) });
  };

  const removeDetail = (id: string) => {
    if (annotatedDetailLetters(wholeSettings).has(id)) {
      setMessage(`Detail ${id} has dimensions or geometric controls. Remove those annotations first.`);
      return;
    }
    const details = (wholeSettings.details ?? []).filter(d => d.id !== id), next = { ...wholeSettings };
    delete next.details;
    if (details.length) next.details = details;
    if (next.sheets) next.sheets = moveToSheet(wholeSettings, `detail:${id}`, 0);
    if (commitWhole(next)) setMessage(null);
  };

  const newNoteId = () => {
    const ids = new Set((wholeSettings.notes ?? []).map(note => note.id));
    let index = 1;
    while (ids.has(`n${index}`)) index++;
    return `n${index}`;
  };

  /** A new note at a sheet point (with a leader to a view point), selected with its text ready to type. */
  const addNote = (at: XY, leader?: DrawingNote['leader']) => {
    const note: DrawingNote = { id: newNoteId(), text: 'NOTE', at: [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10], ...(leader ? { leader } : {}) };
    if (!onChange({ ...settings, notes: [...(settings.notes ?? []), note] })) return;
    selectAnnotationRow('note', note.id);
    setNoteDraft(note.text);
    setTypeNote(note.id);
  };

  const removeNoteLeader = (note: DrawingNote) => {
    if (!note.leader) return;
    const detached = { ...note };
    delete detached.leader;
    delete detached.sheet;
    const owner = current > 0 ? wholeSettings.sheets?.[current - 1]?.id : undefined;
    const next = owner ? { ...detached, sheet: owner } : detached;
    onChange({ ...settings, notes: settings.notes?.map(row => row === note ? next : row) });
  };

  const duplicateNote = (note: DrawingNote) => {
    const copy: DrawingNote = { ...note, id: newNoteId(), at: [note.at[0] + 5, note.at[1] + 5] };
    if (!onChange({ ...settings, notes: [...(settings.notes ?? []), copy] })) return;
    selectAnnotationRow('note', copy.id);
    setNoteDraft(copy.text);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (radiusMove) {
      e.preventDefault();
      if (!currentRadiusMove) { setRadiusMove(null); return; }
      const point = radiusPoint(e.clientX, e.clientY);
      if (point && editRadius(currentRadiusMove.dim.id, 'move', point)) setRadiusMove(null);
      return;
    }
    if (noteAttach) {
      e.preventDefault();
      if (tool !== 'select' || selected?.kind !== 'note' || selected.id !== noteAttach.note.id || noteAttach.owner !== liveProjectionAction.current || !noteAttachReady) { setNoteAttach(null); setMessage('The drawing changed. Select Attach to endpoint again.'); return; }
      const h = hoverAt(e.clientX, e.clientY);
      if (!h || !isViewId(h.view) || !['front', 'top', 'right'].includes(h.view) || !views || !bodies) { setMessage('Select a front, top or right endpoint on this sheet.'); return; }
      const placement = layout?.views[h.view];
      if (!placement || placement.hidden || placement.breaks) { setMessage('Show an unbroken view on this sheet before connecting the note.'); return; }
      const picked = endpointSnap(views[h.view], h.at, 9 * mmPerPx() / placement.scale, bodies);
      if (picked.error || !picked.points.length) { setMessage(picked.error ?? 'Select a visible straight edge endpoint.'); return; }
      if (picked.points.length > 1) { setNoteAttach({ ...noteAttach, choices: { view: h.view, points: picked.points } }); setMessage('Endpoints overlap. Choose the exact edge and endpoint below Notes.'); return; }
      chooseNoteEndpoint(h.view, picked.points[0]); return;
    }

    if (pending?.kind === 'standalone-frame') {
      const q = sheetPoint(e.clientX, e.clientY), placement = placementAt(pending.view);
      const before = pending.sourceDoc;
      const documentChanged = sourceDoc.nodes !== before.nodes || sourceDoc.outputs !== before.outputs || sourceDoc.parameters !== before.parameters || sourceDoc.instances !== before.instances;
      if (busy || !views || !q || !placement || placement.hidden || documentChanged || currentModel.current !== pending.model || JSON.stringify(settings) !== pending.settingsKey) { setMessage('The drawing changed or the frame view is not ready. Select Add or Move frame again.'); return; }
      const rows = settings.frames ?? [], current = rows.filter(row => row.id === pending.frame.id);
      if (pending.moving && (current.length !== 1 || current[0] !== pending.frame)) { setMessage('The frame changed. Select it again before moving it.'); return; }
      const next: DrawingFrame = { ...pending.frame, view: pending.view, place: fromSheet(placement, q) };
      if (commitFrames(pending.moving ? rows.map(row => row === pending.frame ? next : row) : [...rows, next])) {
        setPending(null); setSelectedFrame(next.id); setMessage(null);
      }
      return;
    }
    if (tool === 'note') e.preventDefault(); // (the note's text box keeps the focus it is given)
    if (tool === 'note' && !pending) {
      // On (or right by) a view: the leader's point first; elsewhere the note itself.
      const q = sheetPoint(e.clientX, e.clientY), h = hoverAt(e.clientX, e.clientY); if (!q || !layout) return;
      const hv = h && isViewId(h.view) ? h.view : null, [x0, y0, x1, y1] = hv ? layout.views[hv].box : [0, 0, 0, 0], on = hv && q[0] >= x0 - 3 && q[0] <= x1 + 3 && q[1] >= y0 - 3 && q[1] <= y1 + 3;
      if (h && hv && on) { setPending({ kind: 'note', leader: { view: hv, at: h.snap?.at ?? h.at } }); setMessage(null); } else addNote(q);
      return;
    }
    if (tool === 'note' && pending?.kind === 'note') { const q = sheetPoint(e.clientX, e.clientY); if (q) addNote(q, pending.leader); return; }
    if (tool === 'select') {
      const hit = e.target as Element;
      // Section marks are read-only ink. Keep removed-section and detail dragging on their sheet-space paths.
      const selectable = 'g.dimension[data-dim], g.note[data-dim], [data-standalone-frame], [data-datum-target]';
      const picked = hit.closest('g.section')
        ? document.elementsFromPoint(e.clientX, e.clientY).filter(element => e.currentTarget.contains(element))
          .map(element => element.closest(selectable)).find(Boolean)
        : hit.closest(selectable);
      const target = picked?.hasAttribute('data-dim') ? picked : undefined;
      if (!target?.matches('g.dimension')) clearDimensionGroup();
      const frameId = picked?.getAttribute('data-standalone-frame');
      const frames = frameId ? (settings.frames ?? []).filter(frame => frame.dim === undefined && frame.id === frameId) : [];
      if (frames.length === 1) { setSelected(null); setSelectedTarget(null); setSelectedFrame(frames[0].id); setDrag(null); return; }
      setSelectedFrame(null);
      const targetId = picked?.getAttribute('data-datum-target');
      const targets = targetId ? (settings.datumTargets ?? []).filter(t => t.id === targetId) : [];
      if (targets.length === 1) {
        setSelected(null); setSelectedTarget(targets[0].id); setDrag({ target: targets[0].id, original: targets[0], place: targets[0].place });
        (e.currentTarget as Element).setPointerCapture(e.pointerId); return;
      }
      setSelectedTarget(null);
      // (DR-1: a detail grabbed anywhere in its square — not on one of its dimensions — moves it on the sheet.)
      const qd = sheetPoint(e.clientX, e.clientY);
      const det = !target && qd ? sheet?.details?.find(x => qd[0] >= x.placement.box[0] && qd[0] <= x.placement.box[2] && qd[1] >= x.placement.box[1] && qd[1] <= x.placement.box[3]) : undefined;
      const sd = det && settings.details?.find(x => x.id === det.id);
      if (det && sd && qd) {
        const at = toSheet(det.placement, sd.center);
        setSelected(null); setDrag({ detail: det.id, original: sd, owner: cropOwner, initialAt: at, initialPointer: qd, at, grab: [qd[0] - at[0], qd[1] - at[1]] }); (e.currentTarget as Element).setPointerCapture(e.pointerId); return;
      }
      // (DR-4: a removed section grabbed anywhere in its box moves it; its place is its box's centre.)
      const rem = !target && qd ? sheet?.sections?.find(x => x.form === 'removed' && qd[0] >= x.placement.box[0] && qd[0] <= x.placement.box[2] && qd[1] >= x.placement.box[1] && qd[1] <= x.placement.box[3]) : undefined;
      if (rem && qd) {
        const b = rem.placement.box, at: XY = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        setSelected(null); setDrag({ removed: rem.id, at, grab: [qd[0] - at[0], qd[1] - at[1]] }); (e.currentTarget as Element).setPointerCapture(e.pointerId); return;
      }
      const id = target?.getAttribute('data-dim') ?? null;
      const d = target?.matches('g.dimension') ? settings.dimensions.find(x => x.id === id) : undefined;
      const n = target?.matches('g.note') ? settings.notes?.find(x => x.id === id) : undefined;
      if (d && e.shiftKey) {
        if (activeDimensionGroup) {
          const pair = activeDimensionGroup.pair;
          if (pair.some(dimension => dimension === d)) {
            const retained = pair[0] === d ? pair[1] : pair[0];
            clearDimensionGroup();
            setSelected({ kind: 'dimension', id: retained.id });
          }
          return;
        }
        if (selected?.kind === 'dimension' && selected.id !== d.id) {
          const group = resolveDimensionGroup([selected.id, d.id]);
          if (group) {
            setDimensionGroup({ owner: projectionActionOwner, pair: group.pair });
            setSelected(null); setNoteDraft(null); setTolDraft({});
          }
          return;
        }
      }
      if (d && qd && activeDimensionGroup?.pair.some(dimension => dimension === d)) {
        const [a, b] = activeDimensionGroup.pair;
        const group = resolveDimensionGroup([a.id, b.id]);
        if (!group) return;
        setDrag({ dimensionGroup: activeDimensionGroup, pointer: e.pointerId, start: qd, scale: group.scale, paperDelta: 0 });
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        return;
      }
      clearDimensionGroup();
      setSelected(d ? { kind: 'dimension', id: d.id } : n ? { kind: 'note', id: n.id } : null);
      setNoteDraft(null); setTolDraft({});
      if (n) setNoteDraft(n.text);
      if (d) setDrag({ id: d.id, place: d.place });
      else if (n && qd) setDrag({ note: n.id, at: n.at, grab: [qd[0] - n.at[0], qd[1] - n.at[1]] });
      else setDrag({ pan: [e.clientX, e.clientY], box: [...viewBox] as [number, number, number, number] });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    const h = hoverAt(e.clientX, e.clientY) ?? placingAt(e.clientX, e.clientY); if (h) click(h);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (currentJogDrag) {
      if (e.pointerId !== currentJogDrag.pointer || !selectedLinearGeom) return;
      const q = sheetPoint(e.clientX, e.clientY);
      if (!q) return;
      const P = currentJogDrag.preview.side === 'a' ? selectedLinearGeom.A : selectedLinearGeom.B;
      const Q = currentJogDrag.preview.side === 'a' ? selectedLinearGeom.A2 : selectedLinearGeom.B2;
      const next = extensionJogFromSheetPoint(P, Q, selectedLinearGeom.axis, currentJogDrag.preview.side, q);
      if (next) setJogDrag({ ...currentJogDrag, preview: next });
      return;
    }
    if (currentRadiusMove) {
      const preview = radiusPoint(e.clientX, e.clientY);
      setRadiusMove({ ...currentRadiusMove, preview: preview && checkRadiusOrigin(preview)?.ok ? preview : undefined });
      return;
    }
    if (drag && 'dimensionGroup' in drag) {
      if (e.pointerId !== drag.pointer || drag.dimensionGroup !== activeDimensionGroup) return;
      const q = sheetPoint(e.clientX, e.clientY);
      if (q) setDrag({ ...drag, paperDelta: dimensionPairPaperDelta(drag.dimensionGroup.pair, drag.start, q) });
      return;
    }
    if (drag && 'pan' in drag) {
      const k = mmPerPx(); setBox([drag.box[0] - (e.clientX - drag.pan[0]) * k, drag.box[1] - (e.clientY - drag.pan[1]) * k, drag.box[2], drag.box[3]]); return;
    }
    if (drag && ('note' in drag || 'detail' in drag || 'removed' in drag)) {
      const q = sheetPoint(e.clientX, e.clientY);
      if (q) setDrag({ ...drag, at: 'detail' in drag ? detailPaperDragAt(drag.initialAt, drag.initialPointer, q)
        : [Math.round((q[0] - drag.grab[0]) * 10) / 10, Math.round((q[1] - drag.grab[1]) * 10) / 10] });
      return;
    }
    if (drag && 'target' in drag) {
      const target = settings.datumTargets?.find(t => t.id === drag.target), q = sheetPoint(e.clientX, e.clientY);
      if (target && q && layout) setDrag({ ...drag, place: fromSheet(layout.views[target.view], q) });
      return;
    }
    if (drag && layout) {
      const q = sheetPoint(e.clientX, e.clientY), d = settings.dimensions.find(x => x.id === drag.id);
      const at = d && placementOf(layout, sheet ?? undefined, d.view);
      if (q && d && at) setDrag({ id: drag.id, place: fromSheet(at, q) });
      return;
    }
    setHover(hoverAt(e.clientX, e.clientY) ?? placingAt(e.clientX, e.clientY));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (jogDrag) {
      if (e.pointerId !== jogDrag.pointer) return;
      const active = currentJogDrag;
      setJogDrag(null);
      if (active && liveExtensionOwner.current === active.owner) changeExtensionJog(active.dim.id, active.preview);
      return;
    }
    if (drag && 'dimensionGroup' in drag) {
      if (e.pointerId !== drag.pointer) return;
      setDrag(null);
      if (drag.dimensionGroup !== activeDimensionGroup) return;
      const [a, b] = drag.dimensionGroup.pair;
      const group = resolveDimensionGroup([a.id, b.id]);
      const q = sheetPoint(e.clientX, e.clientY);
      if (!group || !q || group.pair[0] !== a || group.pair[1] !== b || group.scale !== drag.scale) return;
      const delta = dimensionPairPaperDelta(group.pair, drag.start, q);
      if (!delta) return;
      const moved = previewDimensionGroup(group.pair, group.scale, delta);
      if (moved) { if (commitDims(moved.dimensions)) setMessage(null); }
      else setMessage('The labels cannot keep their spacing at that position.');
      return;
    }
    if (drag && 'target' in drag) {
      const targets = (settings.datumTargets ?? []).filter(t => t.id === drag.target), target = targets[0];
      if (targets.length === 1 && target === drag.original && views && !busy) {
        const resolved = resolveDatumTarget(views[target.view], target);
        if (!resolved.ok) setMessage(`${resolved.code}: ${resolved.reason}`);
        else if (target.place[0] !== drag.place[0] || target.place[1] !== drag.place[1]) commitTargets(settings.datumTargets!.map(t => t === target ? { ...t, place: drag.place } : t));
      } else setMessage('The current target is not ready or has changed. Select it again.');
      setDrag(null); return;
    }
    if (drag && 'removed' in drag) {
      const list = sectionsOf(settings), x = list.find(y => y.id === drag.removed);
      if (x?.removed && (x.removed.at?.[0] !== drag.at[0] || x.removed.at?.[1] !== drag.at[1])) onChange(withSections(settings, list.map(y => y === x ? { ...y, removed: { ...y.removed, at: drag.at } } : y)));
      setDrag(null); return;
    }
    if (drag && 'detail' in drag) {
      const live = liveCrop.current;
      if (drag.owner === live.owner && live.ready && currentModel.current === live.model) {
        const next = commitDetailPaperDrag(settings, drag.original, drag.initialAt, drag.at);
        if (next !== settings) onChange(next);
      }
      setDrag(null); return;
    }
    if (drag && 'note' in drag) {
      const n = settings.notes?.find(x => x.id === drag.note);
      if (n && (n.at[0] !== drag.at[0] || n.at[1] !== drag.at[1])) onChange({ ...settings, notes: settings.notes!.map(x => x.id === n.id ? { ...x, at: drag.at } : x) });
      setDrag(null); return;
    }
    if (drag && !('pan' in drag)) {
      const d = settings.dimensions.find(x => x.id === drag.id);
      if (d && (d.place[0] !== drag.place[0] || d.place[1] !== drag.place[1])) {
        commitDims(settings.dimensions.map(x => x.id !== d.id ? x : x.kind === 'linear' && views
          ? { ...x, place: drag.place, orient: orientFor(pointIn(projectionOf(views, sheet ?? undefined, x.view)!, x.a), pointIn(projectionOf(views, sheet ?? undefined, x.view)!, x.b), drag.place) } : { ...x, place: drag.place }));
      }
    }
    setDrag(null);
  };
  const onWheel = (e: React.WheelEvent) => {
    const q = sheetPoint(e.clientX, e.clientY); if (!q) return;
    const k = Math.exp(e.deltaY * 0.0015), [x, y, w, h] = viewBox, nw = Math.min(W * 4, Math.max(20, w * k)), f = nw / w;
    setBox([q[0] - (q[0] - x) * f, q[1] - (q[1] - y) * f, nw, h * f]);
  };

  const removeAnnotation = ({ kind, id }: SheetAnnotationSelection) => {
    if (kind === 'note') {
      if (settings.notes?.filter(note => note.id === id).length !== 1) return;
      const notes = settings.notes.filter(note => note.id !== id);
      const next = { ...settings };
      if (notes.length) next.notes = notes;
      else delete next.notes;
      if (!onChange(next)) return;
    } else {
      if (settings.dimensions.filter(dim => dim.id === id).length !== 1) return;
      const loss = drawingFixControlLoss(settings, { kind: 'remove', dim: id });
      if (loss.length) {
        requestControlDeletion(loss, () => {
          if (onChange({ ...settings, dimensions: settings.dimensions.filter(dim => dim.id !== id),
            ...(settings.frames?.some(frame => frame.dim === id) ? { frames: settings.frames.filter(frame => frame.dim !== id) } : {}) })) setSelected(null);
        });
        return;
      }
      if (!commitDims(settings.dimensions.filter(dim => dim.id !== id))) return;
    }
    if (selected?.kind === kind && selected.id === id) setSelected(null);
    if (kind === 'note') setNoteDraft(null);
  };
  const canDeleteSelection = drawingCanDeleteSelection({ tool, pending: !!pending || !!noteAttach || !!radiusMove, drag: !!drag, reattach: !!reattach, rimChoice: !!currentRimChoice, targetChoices: targetChoices.length, reselectTarget: !!reselectTarget, hasSelection: !!(selected || selectedTarget || selectedFrame) });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutHelp || e.defaultPrevented || e.isComposing || e.target instanceof HTMLInputElement
        || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      if (e.key === '?') { e.preventDefault(); openShortcutHelp(); return; }
      if (e.key === 'Escape') {
        if (currentRimChoice) { e.preventDefault(); svg.current?.focus(); }
        setControlDeletion(null);
        setDrag(null);
        setDimensionGroup(null);
        onClearReferencePreview();
        if (radiusMove) { setRadiusMove(null); setMessage(null); }
        if (jogDrag) { setJogDrag(null); setMessage(null); }
        else if (reattach) cancelReattachment();
        else if (noteAttach || pending || currentRimChoice || targetChoices.length || reselectTarget) cancel();
        else { setSelected(null); setSelectedTarget(null); setSelectedFrame(null); setTool('select'); setMessage(null); }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !canDeleteSelection) { e.preventDefault(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFrame) {
        e.preventDefault();
        const frames = (settings.frames ?? []).filter(frame => frame.dim === undefined && frame.id === selectedFrame);
        if (frames.length === 1) removeFrame(frames[0]);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTarget) {
        e.preventDefault();
        if (commitTargets((settings.datumTargets ?? []).filter(t => t.id !== selectedTarget))) setSelectedTarget(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeAnnotation(selected); return; }
      const next = TOOLS.find(item => item.key.toLowerCase() === e.key.toLowerCase());
      if (next) { setTool(next.tool); cancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Dev/test hooks: a view point (model mm in the view) in client pixels, and the sheet's state.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__studioDrawingAt = (view: DimView, u: number, v: number) => {
      const m = svg.current?.getScreenCTM(), at = layout && placementOf(layout, sheet ?? undefined, view); if (!m || !at) return null;
      const q = toSheet(at, [u, v]), p = new DOMPoint(q[0], q[1]).matrixTransform(m); return { x: p.x, y: p.y };
    };
    w.__studioDrawing = () => sheet && { scale: layout?.scale, dimensions: sheet.dimensions.map(r => r.ok ? { id: r.dim.id, text: r.text, value: r.value } : { id: r.dim.id, lost: r.reason }),
      hidden: Object.fromEntries(VIEW_IDS.map(id => [id, views![id].edges.reduce((n, e) => n + e.pieces.filter(p => !p.visible).length, 0)])),
      section: cutA ? (cutA.result.ok ? { rings: cutA.result.rings.length, edges: cutA.result.projection.edges.length } : { error: cutA.result.error }) : null,
      sections: (cutsMade ?? []).map(c => ({ id: c.id, view: c.view, at: c.at, ...(c.result.ok ? { rings: c.result.rings.length, edges: c.result.projection.edges.length } : { error: c.result.error }) })),
      placedSections: (layout?.sections ?? []).map(p => ({ id: p.section, of: p.of, box: p.box })),
      apartSections: (sheet.sections ?? []).filter(x => x.form).map(x => ({ id: x.id, form: x.form, ...(x.on ? { on: x.on } : {}), scale: x.placement.scale, box: x.placement.box, edges: x.projection.edges.length })),
      details: (sheet.details ?? []).map(d => ({ id: d.id, view: d.view, scale: d.scale, box: d.placement.box, edges: d.projection.edges.length })),
      boxes: Object.fromEntries(VIEW_IDS.map(id => [id, layout!.views[id].box])), breaks: Object.fromEntries(VIEW_IDS.filter(id => layout!.views[id].breaks).map(id => [id, layout!.views[id].breaks])),
      issues: issues.map(x => ({ code: x.code, severity: x.severity, ...(x.fix ? { fix: x.fix.kind } : {}), ...(x.tables ? { tables: x.tables } : {}) })),
      tables: (sheet.tables ?? []).map(x => ({ id: x.id, box: x.box, ...(x.error ? { error: x.error } : {}) })),
      ...(sheet.welds ? { welds: { placed: sheet.welds.placed.map(p => ({ label: p.label, view: p.view })), unshown: sheet.welds.unshown } } : {}),
      ...(sheet.balloons ? { balloons: { placed: sheet.balloons.placed.map(p => ({ no: p.no, item: p.item, view: p.view, edge: p.edge })), unclear: sheet.balloons.unclear, noEdge: sheet.balloons.noEdge } } : {}),
      suggestions: suggestions.map(x => ({ id: x.id, kind: x.kind, estimate: x.estimate })) };
    // (G24: the drawing's annotations on the model, for the GPU lane's 3D display and the flow.)
    w.__studioAnnotations = () => sheet && layout && views ? modelAnnotations({ views, layout, settings, sheet, ...(weldJoints ? { welds: weldJoints } : {}) }) : null;
    return () => { delete w.__studioDrawingAt; delete w.__studioDrawing; delete w.__studioAnnotations; };
  }, [layout, sheet, views, cutsMade, issues, suggestions, settings, weldJoints]);

  // (11 ④: the SVG and the DXF are of the sheet shown, named by its number when there are several; the PDF has every sheet.)
  const sheetSuffix = sheetTotal > 1 ? `-sheet-${current + 1}` : '';
  const exportableSheet = !wantsBom || bom ? sheet : null;
  const canExportPdf = !!sheet && (!drawingSetWantsBom || !!bom);
  // Read-only current-sheet delivery, not an issued inspection register. Keep this
  // authority separate from the existing drawing-file exporters and confirmations.
  const dimensionCsvReady = !!sheet && !!layout && !busy && projectionCurrent && sourceCurrent
    && !!scopeRead.scope && scope.kind === 'part' && scope.part === undefined && scope.body === undefined;
  const dimensionCsvOwner = useMemo(() => ({}), [projectionActionOwner, sheet, layout, dimensionCsvReady, fileName]);
  const liveDimensionCsvOwner = useRef(dimensionCsvOwner); liveDimensionCsvOwner.current = dimensionCsvOwner;
  const exportDimensionCsv = () => {
    const currentCsv = () => dimensionCsvReady && liveDimensionCsvOwner.current === dimensionCsvOwner
      && liveProjectionAction.current === projectionActionOwner && currentModel.current === model;
    if (!currentCsv() || !sheet) {
      onToast({ title: 'Dimension CSV not written', hint: 'Wait for the current base-part sheet to finish updating. Nothing was downloaded.', detail: '' });
      return;
    }
    try {
      const result = currentSheetDimensionsCsv({ resolved: sheet.dimensions, settings, wholeSettings, sheetNumber: current + 1 });
      if (!result.ok) {
        onToast({ title: 'Dimension CSV not written', hint: result.error, detail: 'Nothing was downloaded. Unsupported dimensions are not silently omitted.' });
        return;
      }
      // Finish serialization before delivery, then recheck the same source/sheet owner.
      const bytes = new TextEncoder().encode(result.csv);
      if (!currentCsv()) return;
      downloadBytes(bytes, `${fileName}-sheet-${current + 1}-dimensions.csv`, 'text/csv;charset=utf-8');
    } catch (error) {
      onToast({ title: 'Dimension CSV not written', hint: 'The current sheet could not be serialized. Nothing was downloaded.', detail: error instanceof Error ? error.message : String(error) });
    }
  };

  const [dxfVersion, setDxfVersion] = useState<DxfVersion>('AC1015');
  type ExportFormat = 'SVG' | 'PDF' | 'DXF';
  const [exportLoss, setExportLoss] = useState<{ format: ExportFormat; sheet: NonNullable<typeof sheet>; name: string; settings: DrawingSettings; version?: DxfVersion; messages: string[]; write: () => void } | null>(null);
  const exportConfirmation = sheet && exportLoss?.sheet === sheet && exportLoss.name === fileName && exportLoss.settings === wholeSettings && (exportLoss.version === undefined || exportLoss.version === dxfVersion) && !busy ? exportLoss : null;
  const confirmExport = (format: ExportFormat, messages: string[], write: () => void) => {
    if (!sheet) return;
    if (messages.length) setExportLoss({ format, sheet, name: fileName, settings: wholeSettings, ...(format === 'DXF' ? { version: dxfVersion } : {}), messages, write });
    else { setExportLoss(null); write(); }
  };
  const exportSvg = () => {
    if (!exportableSheet) return;
    try {
      // Complete serialization before offering confirmation or initiating any file delivery.
      const bytes = new TextEncoder().encode(sheetSvg(exportableSheet, title));
      confirmExport('SVG', lostOccurrences.map(occurrenceLossText), () =>
        downloadBytes(bytes, `${fileName}${sheetSuffix}.svg`, 'image/svg+xml'));
    } catch (error) {
      setExportLoss(null);
      onToast({ title: 'SVG not written', hint: 'Remove the unsupported character from the drawing text, then export again. Nothing was downloaded.', detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const exportPdf = () => {
    if (!sheet || !canExportPdf) return;
    const all = sheetTotal > 1 && views ? buildSheets(views, wholeSettings, { title, date: today(), source, callout, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, cuts).map(x => x.sheet) : [sheet];
    const missingFits = all.flatMap((page, index) => page.dimensions.flatMap(dimension => {
      if (!dimension.ok || dimension.kind !== 'diameter') return [];
      const reason = fitMissOf(dimension.dim.edge, 2 * dimension.radius);
      return reason ? [`${sheetName(wholeSettings, index)}: ${dimension.text}. ${reason}`] : [];
    }));
    if (missingFits.length) {
      onToast({ title: 'PDF not written', hint: 'Load fit rows for the listed dimensions, then export again.', detail: missingFits.join('\n') });
      return;
    }
    const losses = scope.kind === 'assembly' ? all.flatMap((page, index) => occurrenceLosses(page.dimensions, model.instances)
      .map(loss => `${sheetName(wholeSettings, index)} · ${occurrenceLossText(loss)}`)) : [];
    confirmExport('PDF', losses, () => {
      downloadBytes(sheetsPdf(all, title), `${fileName}.pdf`, 'application/pdf');
      const missing = [...new Set(all.flatMap(pdfMissing))];
      if (missing.length) onToast({ title: 'PDF written, with some characters as ?', hint: `The PDF's standard fonts cannot show ${missing.map(c => `“${c}”`).join(' ')}: they print as ?. The SVG export keeps them.`, detail: '' });
    });
  };
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  /**
   * Auto (R14.1–R14.3, O2–O4): the views chosen and laid out with room for their dimensions, the scale and sheet that
   * give a clean drawing, then Auto-dimension; keeps manual dimensions and those with authored controls.
   */
  const autoDimension = async () => {
    if (!views || !sourceCurrent || scope.kind === 'assembly') return;
    const owner = projectionActionOwner;
    // The front's side by information (R14.3b), when nothing placed by hand ties it: the part projected for it first.
    let base = { views, settings, sections: cuts };
    const pick = frontByInformation(views, settings);
    // (O174: the turned part projected as the sheet is, its bought elements out.)
    if (pick) {
      const ts = turnSections(settings, pick.orientation), list = Array.isArray(ts) ? ts : [];
      const r = await engine.drawing(model, { tangentEdges: !!settings.tangent, ...(list.length ? { sections: list } : {}), ...(pick.orientation !== 'y-' ? { orientation: pick.orientation as 'x+' } : {}), made: drawsMadeOnly(settings), ...(scope.kind === 'part' && scope.body ? { body: scope.body } : {}) });
      if (currentModel.current !== model || liveProjectionAction.current !== owner) return;
      const turned = r.ok ? reorient(views, r.views, settings, pick.orientation) : null;
      if (r.ok && turned?.ok) base = { views: r.views, settings: turned.settings, sections: sheetSections(r.sections ?? []) };
    }
    let result: ReturnType<typeof autoLayout>;
    try {
      result = autoLayout({ views: base.views, settings: base.settings, elements, ...calloutsFor(base.views), fitMiss: fitMissOf, meta: { title, date: today(), source, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, ...(base.sections.length ? { sections: base.sections } : {}) });
    } catch (error) {
      if (!isRefusal(error, 'VIEWS_DONT_FIT')) throw error;
      onToast({ title: 'Could not lay out the drawing', hint: error.message.replace(/^\[VIEWS_DONT_FIT\] /, ''), detail: '' });
      return;
    }
    const { settings: next, report } = result;
    if (!onChange(next)) return;
    const a = report.dimensions.added, n = a.overall + a.levels + a.holePositions + a.pitches + a.callouts + report.dimensions.keys;
    const side = base.views !== views && pick ? `, the front seen from ${SIDE_NAMES[pick.orientation]} (${pick.why})` : '';
    const where = `${report.sheet} at ${scaleLabel(report.scale)}${side}${report.dropped.length ? `, without the ${report.dropped.join(' and ')} view (it shows nothing the others do)` : ''}`;
    const notes = [...report.dimensions.skipped.map(x => `${x.what} (${x.view}): ${x.why}`), ...report.left.map(x => x.message), ...(report.readable ? [] : [`The smallest hole is under ${MIN_HOLE_ON_PAPER_MM} mm on paper at this scale: a larger sheet reads better.`])];
    onToast({ title: `${n} dimension${n === 1 ? '' : 's'} placed · ${where}`, hint: `${a.overall} overall, ${plural(a.levels, 'step')}, ${plural(a.holePositions + a.pitches, 'hole position')}, ${plural(a.callouts, 'callout')}${report.dimensions.kept ? `; ${report.dimensions.kept} of yours kept` : ''}${report.left.length ? `; ${plural(report.left.length, 'issue')} left` : ''}.`, detail: notes.join('\n') });
  };
  /** Another front side (R14.3b, O7): the annotations re-mapped to the views showing their axes, or refused, typed. */
  const turnTo = async (o: Orientation) => {
    if (!views || !sourceCurrent || o === (settings.orientation ?? 'y-')) return;
    const owner = projectionActionOwner;
    // (O174: projected as the sheet is — a part's without its bought elements.)
    const r = await engine.drawing(model, { tangentEdges: !!settings.tangent, ...(o !== 'y-' ? { orientation: o as 'x+' } : {}), made: drawsMadeOnly(settings), ...(scope.kind === 'part' && scope.body ? { body: scope.body } : {}) });
    if (currentModel.current !== model || liveProjectionAction.current !== owner) return;
    if (!r.ok) { onToast({ title: 'Could not turn the drawing', hint: r.error, detail: '' }); return; }
    const t = reorient(views, r.views, wholeSettings, o);
    if (!t.ok) { onToast({ title: 'The drawing was not turned', hint: t.message, detail: t.code === 'ORIENTATION_REMAP_FAILED' ? t.failed.map(f => `${f.dim}: ${f.was} → ${f.now}`).join('\n') : '' }); return; }
    if (!commitWhole(t.settings)) return;
    if (t.moved.length) onToast({ title: `Front now seen from ${SIDE_NAMES[o]}`, hint: `Annotations moved with their axes: ${t.moved.map(m => `${m.from} → ${m.to}`).join(', ')}.`, detail: '' });
  };
  const dxfFailed = (e: unknown) => onToast({ title: 'Could not write the DXF', hint: 'Nothing was downloaded.', detail: e instanceof Error ? e.message : String(e) });
  const exportDxf = () => {
    if (!exportableSheet || !layout) return;
    confirmExport('DXF', lostOccurrences.map(occurrenceLossText), () => {
      try {
        const r = sheetDxf(exportableSheet, layout, dxfVersion);
        downloadBytes(r.bytes, `${fileName}${sheetSuffix}.dxf`, 'image/vnd.dxf');
        // R12 has no ellipses, splines, hatches, line weights or units: say what was changed to fit it.
        if (r.report.r12) { const x = r.report.r12, n = x.ellipses + x.splines; onToast({ title: 'DXF R12 written', hint: `${n ? `${n} curve${n > 1 ? 's' : ''} as polylines within 0.001 mm; ` : ''}${x.hatches ? 'hatching as lines; ' : ''}no line weights or units in R12 (the drawing is in mm).`, detail: '' }); }
      } catch (e) { dxfFailed(e); }
    });
  };
  // (O148 X1: the section chosen — the first by default — alone as a 1:1 DXF.)
  const dxfCut = cuts.find(c => c.id === dxfSection) ?? cuts[0];
  const exportSectionDxf = () => {
    if (!dxfCut) return;
    try { downloadBytes(writeDxf(sectionDxfDocument(dxfCut), { version: dxfVersion }).bytes, `${fileName}-section-${dxfCut.id}-${dxfCut.id}.dxf`, 'image/vnd.dxf'); } catch (e) { dxfFailed(e); }
  };
  useEffect(() => {
    if (!error || empty) return;
    const owned = { title: 'Could not draw the part', hint: 'Fix the model’s errors first, then open the drawing again.', detail: error };
    onToast(owned);
    // Recovery, empty results and unmount retire only this effect's exact notice.
    // Keep it while the existing projection pipeline is pending, as with its inline error.
    return () => onClearToast(owned);
  }, [error, empty, onToast, onClearToast]);

  // What follows the cursor: the snap, the hovered edge, and the dimension being placed or dragged.
  const overlay = useMemo(() => {
    if (!layout || !views) return '';
    const parts: string[] = [];
    const P = (x: DimView) => placementOf(layout, sheet ?? undefined, x)!, R = (x: DimView) => projectionOf(views, sheet ?? undefined, x)!;
    const v = hover ? P(hover.view) : null;
    if (inspectedTarget && targetChoices.includes(inspectedTarget)) {
      const pr = views[inspectedTarget.view], resolved = resolveDatumTarget(pr, inspectedTarget);
      const edge = resolved.ok ? pr.edges.find(e => e.name === inspectedTarget.point?.edge) : undefined;
      const placement = P(inspectedTarget.view);
      if (edge?.ends && placement && !placement.hidden) {
        const [a, b] = edge.ends.map(p => toSheet(placement, inView(pr, p)));
        return `<g class="dw-hover" aria-label="Datum endpoint candidate preview" pointer-events="none">${marksSvg([{ kind: 'line', a, b, pen: 'visible' }])}</g>`;
      }
    }
    if (pending?.kind === 'note' && hover) {
      const t = toSheet(layout.views[pending.leader.view], pending.leader.at);
      parts.push(`<g class="dw-preview"><line x1="${t[0]}" y1="${t[1]}" x2="${hover.q[0]}" y2="${hover.q[1]}" stroke-width="0.25"/></g><circle class="dw-pick" cx="${t[0]}" cy="${t[1]}" r="0.9"/>`);
      return parts.join('');
    }
    if (pending?.kind === 'detail-center') return '';
    if (pending?.kind === 'detail') {
      const placement = P(pending.view); if (!placement || placement.hidden) return '';
      const c = toSheet(placement, pending.center), r = hover ? Math.hypot(hover.q[0] - c[0], hover.q[1] - c[1]) : 0;
      parts.push(`<circle class="dw-pick" cx="${c[0]}" cy="${c[1]}" r="0.9"/>`);
      if (r > 0) parts.push(`<g class="dw-preview"><circle cx="${c[0]}" cy="${c[1]}" r="${r}" fill="none" stroke-width="0.25"/></g>`);
      return parts.join('');
    }
    if (pending?.kind === 'datum-line') {
      const q = toSheet(P(pending.view), pending.from);
      parts.push(`<circle class="dw-pick" cx="${q[0]}" cy="${q[1]}" r="0.9"/>`);
      if (hover) parts.push(`<g class="dw-preview"><line x1="${q[0]}" y1="${q[1]}" x2="${hover.q[0]}" y2="${hover.q[1]}" stroke-width="0.25"/></g>`);
      return parts.join('');
    }
    if (pending?.kind === 'datum-target') {
      const resolved = resolveDatumTarget(views[pending.view], pending.target);
      if (resolved.ok) {
        const q = toSheet(P(pending.view), inView(views[pending.view], resolved.at));
        parts.push(`<circle class="dw-pick" cx="${q[0]}" cy="${q[1]}" r="0.9"/>`);
        if (hover) parts.push(`<g class="dw-preview"><line x1="${q[0]}" y1="${q[1]}" x2="${hover.q[0]}" y2="${hover.q[1]}" stroke-width="0.25"/></g>`);
      }
      return parts.join('');
    }
    if (pending?.kind === 'standalone-frame') {
      if (hover) parts.push(`<circle class="dw-pick" cx="${hover.q[0]}" cy="${hover.q[1]}" r="0.9"/>`);
      return parts.join('');
    }
    const placing = pending && hover && pending.kind !== 'note' && ((pending.kind !== 'linear' && pending.kind !== 'angle') || pending.b);
    if (pending?.kind === 'angle' && pending.mode && pending.owner !== projectionActionOwner) return '';
    if (pending?.kind === 'angle') for (const ref of [pending.a, ...(pending.b ? [pending.b] : [])]) {
      const l = resolveLine(R(pending.view), ref);
      if (l) parts.push(`<g class="dw-hover">${marksSvg([{ kind: 'line', a: toSheet(P(pending.view), l[0]), b: toSheet(P(pending.view), l[1]), pen: 'visible' }])}</g>`);
    }
    if (pending?.kind === 'linear') for (const ref of [pending.a, ...(pending.b ? [pending.b] : [])]) {
      const q = toSheet(P(pending.view), pointIn(R(pending.view), ref)); parts.push(`<circle class="dw-pick" cx="${q[0]}" cy="${q[1]}" r="0.9"/>`);
    }
    if (placing && hover) {
      const at = fromSheet(P(pending.view), hover.q);
      const d: DrawingDimension = pending.kind === 'linear'
        ? { id: 'preview', view: pending.view, kind: 'linear', a: pending.a, b: pending.b!, orient: orientFor(pointIn(R(pending.view), pending.a), pointIn(R(pending.view), pending.b!), at), place: at }
        : pending.kind === 'angle' ? { id: 'preview', view: pending.view, kind: 'angle', a: pending.a, b: pending.b!, place: at, ...(pending.mode ? { mode: pending.mode } : {}) }
        : pending.kind === 'arc-length' ? { id: 'preview', view: pending.view, kind: 'arc-length', arc: pending.arc, place: at }
        : { id: 'preview', view: pending.view, kind: pending.kind, edge: pending.edge, near: pending.near, place: at };
      const r = resolveDimension({ ...views, [pending.view]: R(pending.view) }, d, detailFor(settings, pending.view), showDetailHidden(settings, pending.view));
      if (r.ok) { const preset = presetFor(settings); parts.push(`<g class="dw-preview">${marksSvg(dimensionMarks(P(pending.view), withShownText(r, undefined, preset) as typeof r, preset))}</g>`); }
    } else if (hover && v && tool === 'datum-target' && isViewId(hover.view)) {
      for (const point of (bodies ? endpointSnap(views[hover.view], hover.at, 9 * mmPerPx() / v.scale, bodies).points : [])) {
        const q = toSheet(v, inView(views[hover.view], point.near));
        parts.push(`<circle class="dw-snap" cx="${q[0]}" cy="${q[1]}" r="1.4"/>`);
      }
    } else if (hover && v && tool !== 'select') {
      if (hover.snap && tool === 'linear') { const q = toSheet(v, hover.snap.at); parts.push(`<circle class="dw-snap" cx="${q[0]}" cy="${q[1]}" r="1.4"/>`); }
      else if (hover.edge && (tool !== 'linear' || !pending)) {
        const ok = tool === 'reflex-angle' ? hover.edge.kind === 'line'
          : tool === 'arc-length' ? !v.breaks?.length && pickArcLengthEdge(R(hover.view), hover.edge, hover.view, false).ok
          : tool === 'linear' || tool === 'angle' ? hover.edge.kind !== 'circle' && hover.edge.kind !== 'curve'
          : !!hover.edge.circle && roundIn(R(hover.view), hover.edge);
        const pieces = tool === 'reflex-angle' || tool === 'arc-length' || hover.visibleRimOnly || (tool === 'diameter' && isDetailRef(hover.view) && !showDetailHidden(settings, hover.view))
          ? hover.edge.pieces.filter(piece => piece.visible) : hover.edge.pieces;
        if (ok) parts.push(`<g class="dw-hover">${marksSvg(pieces.map(p => curveMark(v, p.curve, 'visible')))}</g>`);
      }
    }
    return parts.join('');
  }, [layout, views, bodies, hover, pending, tool, settings, inspectedTarget, targetChoices, projectionActionOwner]);

  // The dimension being dragged is drawn where it goes.
  const shownMarkup = useMemo(() => {
    if (!drag || 'pan' in drag || !views || !layout || !sheet) return sheetMarkup;
    if ('dimensionGroup' in drag) {
      if (drag.dimensionGroup !== activeDimensionGroup) return sheetMarkup;
      const moved = previewDimensionGroup(drag.dimensionGroup.pair, drag.scale, drag.paperDelta);
      return moved ? sheetGroupsSvg(moved.preview, null, null, null, selectedDimensionIds) : sheetMarkup;
    }
    if ('target' in drag) return sheetGroupsSvg(buildSheet(views, layout, { ...settings, datumTargets: (settings.datumTargets ?? []).map(t => t.id === drag.target ? { ...t, place: drag.place } : t) }, { svgSectionTextClearance, title, date: today(), callout, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, cuts), selected, selectedTarget);
    if ('detail' in drag) return sheetGroupsSvg(buildSheet(views, layout, { ...settings, details: (settings.details ?? []).map(d => d.id === drag.detail ? { ...d, at: drag.at } : d) }, { svgSectionTextClearance, title, date: today(), callout, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, cuts), selected, selectedTarget);
    if ('removed' in drag) return sheetGroupsSvg(buildSheet(views, layout, withSections(settings, sectionsOf(settings).map(x => x.id === drag.removed && x.removed ? { ...x, removed: { ...x.removed, at: drag.at } } : x)), { svgSectionTextClearance, title, date: today(), callout, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, cuts), selected, selectedTarget);
    if ('note' in drag) return sheetGroupsSvg(buildSheet(views, layout, { ...settings, notes: (settings.notes ?? []).map(n => n.id === drag.note ? { ...n, at: drag.at } : n) }, { svgSectionTextClearance, title, date: today(), callout, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, cuts), selected, selectedTarget);
    const dims = settings.dimensions.map(d => d.id === drag.id ? (d.kind === 'linear' ? { ...d, place: drag.place, orient: orientFor(pointIn(projectionOf(views, sheet ?? undefined, d.view)!, d.a), pointIn(projectionOf(views, sheet ?? undefined, d.view)!, d.b), drag.place) } : { ...d, place: drag.place }) : d);
    return sheetGroupsSvg(buildSheet(views, layout, { ...settings, dimensions: dims }, { svgSectionTextClearance, title, date: today(), callout, threads, tableContent: tableContentOf, welds: weldJoints, bodyFaces, ...(bom ? { bom } : {}) }, cuts), selected, selectedTarget);
  }, [drag, views, layout, sheet, sheetMarkup, settings, title, selected, selectedTarget, weldJoints, bom, svgSectionTextClearance,
    activeDimensionGroup, selectedDimensionIds]);

  const hint = message ?? (radiusMove ? "Click the sheet to move the shortened leader origin. Esc cancels." : null) ?? (currentReattachment ? `Select a rim in the ${viewLabel(currentReattachment.original.view)} · Esc cancels` : null) ?? (pending ? (pending.kind === 'standalone-frame' ? `Click the sheet to place the frame. View: ${viewLabel(pending.view)}. Esc cancels.` : pending.kind === 'datum-target' ? 'Click where the target symbol goes · Esc cancels' : pending.kind === 'datum-line' ? 'Now the other end of the target line · Esc cancels' : pending.kind === 'note' ? 'Click where the note’s text goes · Esc cancels' : pending.kind === 'detail-center' ? `Select the centre of Detail ${pending.moving.detail.id} on the ${viewLabel(pending.view)} · Esc cancels` : pending.kind === 'detail' ? 'Now how far the detail’s circle reaches · Esc cancels' : pending.kind === 'angle' ? (pending.b ? (pending.mode ? 'Click to place the reflex angle · Esc cancels' : 'Choose the side of the corner to measure, then click to place the angle · Esc cancels') : 'Now the second edge · Esc cancels') : pending.kind === 'linear' && !pending.b ? 'Now the second point · Esc cancels' : pending.kind === 'diameter' && pending.owner ? `${pending.owner} · Click where the dimension goes · Esc cancels` : 'Click where the dimension goes · Esc cancels') : tool === 'select' ? null : tool === 'datum-target' ? (targetDraft.kind === 'point' ? 'Click a straight edge endpoint · Esc cancels' : targetDraft.kind === 'line' ? 'Click the first end of the target line · Esc cancels' : 'Click the centre of the target area · Esc cancels') : TOOLS.find(t => t.tool === tool)!.hint);
  const selDim = selected?.kind === 'dimension' ? settings.dimensions.find(d => d.id === selected.id) : undefined;
  const extensionReady = !busy && projectionCurrent && sourceCurrent !== false;
  const extensionOwner = useMemo(() => ({}), [projectionActionOwner, selected, sheet, extensionReady]);
  const liveExtensionOwner = useRef(extensionOwner); liveExtensionOwner.current = extensionOwner;
  const [extensionPreview, setExtensionPreview] = useState<{ owner: object; side: 'a' | 'b' } | null>(null);
  const extensionResolved = sheet?.dimensions.find(r => r.dim === selDim);
  const supportedExtension = selDim?.kind === 'linear' && !selDim.auto && ['front', 'top', 'right'].includes(selDim.view) && scope.kind === 'part';
  const radiusReady = extensionReady && !!selDim && foreshortenSupported(selDim, scope.kind)
    && extensionResolved?.ok && extensionResolved.kind === 'radius';
  const radiusPlacement = radiusReady && selDim ? placementAt(selDim.view) : undefined;
  const currentRadiusMove = radiusMove?.owner === extensionOwner && radiusMove.dim === selDim
    && radiusReady && radiusPlacement && !radiusPlacement.hidden && !radiusPlacement.breaks?.length && tool === 'select' ? radiusMove : null;
  const radiusPoint = (x: number, y: number) => {
    const q = sheetPoint(x, y);
    if (!radiusPlacement || !layout || !q || q[0] < 0 || q[1] < 0 || q[0] > layout.size[0] || q[1] > layout.size[1]) return;
    const point = fromSheet(radiusPlacement, q).map(n => Math.round(n * 1000) / 1000) as XY;
    return point;
  };
  const checkRadiusOrigin = (origin: XY) => {
    const r = extensionResolved, v = radiusPlacement;
    if (!r?.ok || r.kind !== 'radius' || !r.radiusRim || !v || v.hidden || v.breaks?.length || !foreshortenOk({ origin })) return;
    return foreshortenGeometry(toSheet(v, r.center), r.radius * v.scale, toSheet(v, r.dim.place),
      toSheet(v, origin), presetFor(settings).arrowLength, toSheet(v, r.radiusRim));
  };
  const editRadius = (id: string, action: 'add' | 'move' | 'remove', origin?: XY) => {
    const r = extensionResolved, v = radiusPlacement;
    if (liveExtensionOwner.current !== extensionOwner || !radiusReady || !r?.ok || r.kind !== 'radius'
      || r.dim.kind !== 'radius' || r.dim.id !== id || settings.dimensions.filter(d => d.id === id).length !== 1) return false;
    const { foreshorten, ...ordinary } = r.dim;
    if (action === 'remove') {
      if (!foreshorten) return false;
      commitDims(settings.dimensions.map(d => d === r.dim ? ordinary : d));
    } else {
      if (!v || v.hidden || v.breaks?.length || !r.radiusRim) { setMessage('Show an unbroken view with a visible source arc.'); return false; }
      if (action === 'add') {
        if (foreshorten) return false;
        const initial = defaultForeshortenOrigin(r.center, r.radius, r.radiusRim, v.scale, presetFor(settings).arrowLength);
        if (!initial.ok) { setMessage(initial.reason); return false; }
        origin = initial.origin;
      } else if (!foreshorten || !currentRadiusMove) return false;
      if (!origin) return false;
      const checked = checkRadiusOrigin(origin);
      if (!checked?.ok) { setMessage(checked?.reason ?? 'Choose a valid origin for this radius.'); return false; }
      if (origin[0] !== foreshorten?.origin[0] || origin[1] !== foreshorten?.origin[1]) {
        const next: DrawingDimension = { ...r.dim, foreshorten: { origin } };
        commitDims(settings.dimensions.map(d => d === r.dim ? next : d));
      }
    }
    setMessage(null);
    return true;
  };
  useEffect(() => {
    if (radiusMove && !currentRadiusMove) { setRadiusMove(null); setMessage(null); }
  }, [radiusMove, currentRadiusMove]);
  const radiusPreview = currentRadiusMove?.preview && extensionResolved?.ok && extensionResolved.kind === 'radius' && radiusPlacement
    ? checkRadiusOrigin(currentRadiusMove.preview) : null;
  const extensionMarkers = supportedExtension && extensionReady && layout && extensionResolved?.ok && extensionResolved.kind === 'linear'
    ? (['a', 'b'] as const).map(side => ({ side, point: toSheet(layout.views[selDim.view as 'front' | 'top' | 'right'], extensionResolved[side]) })) : [];
  const changeExtension = (id: string, side: 'a' | 'b' | undefined) => {
    if (liveExtensionOwner.current !== extensionOwner || !extensionReady || !supportedExtension || selDim?.id !== id || !extensionResolved?.ok) return;
    if (selDim.hideExtension === side) return;
    const { hideExtension: _old, ...rest } = selDim; void _old;
    const next = side ? { ...rest, hideExtension: side } : rest;
    commitDims(settings.dimensions.map(d => d === selDim ? next : d));
  };
  const selectedLinearPlacement = supportedExtension && selDim ? placementAt(selDim.view) : undefined;
  const arrowReady = extensionReady && !!selectedLinearPlacement && !selectedLinearPlacement.hidden && !selectedLinearPlacement.breaks?.length;
  const changeArrow = (id: string, side: 'a' | 'b', placement: LinearArrowSide | 'auto') => {
    if (liveExtensionOwner.current !== extensionOwner || !arrowReady || selDim?.kind !== 'linear' || selDim.id !== id
      || !extensionResolved?.ok || extensionResolved.kind !== 'linear'
      || wholeSettings.dimensions.filter(d => d.id === id).length !== 1) return;
    if ((selDim.arrowPlacement?.[side] ?? 'auto') === placement) return;
    const { arrowPlacement, ...ordinary } = selDim;
    const arrows = readLinearArrowPlacement({ ...arrowPlacement, [side]: placement });
    const next = arrows ? { ...ordinary, arrowPlacement: arrows } : ordinary;
    if (commitDims(settings.dimensions.map(d => d === selDim ? next : d))) setMessage(null);
  };
  const crossingBreakCandidates = useMemo(() => (
    arrowReady && selDim?.kind === 'linear' && sheet && layout
      ? eligibleCrossingBreaks(sheet.groups, sheet.dimensions, settings, layout, selDim.id, selDim.crossingBreak?.gap ?? DEFAULT_CROSSING_BREAK_GAP)
      : []
  ), [arrowReady, selDim, sheet, layout, settings]);
  const changeCrossingBreak = (id: string, overId: string | null, gap?: number) => {
    if (liveExtensionOwner.current !== extensionOwner || !arrowReady || selDim?.kind !== 'linear' || selDim.id !== id
      || !sheet || !layout || wholeSettings.dimensions.filter(d => d.id === id).length !== 1) return;
    if (overId === null) {
      if (!selDim.crossingBreak) return;
      const { crossingBreak: _old, ...ordinary } = selDim; void _old;
      if (commitDims(settings.dimensions.map(d => d === selDim ? ordinary : d))) setMessage(null);
      return;
    }
    if (!extensionResolved?.ok || extensionResolved.kind !== 'linear') return;
    const nextGap = gap ?? selDim.crossingBreak?.gap ?? DEFAULT_CROSSING_BREAK_GAP;
    if (!crossingBreakGapOk(nextGap)) {
      setMessage('Crossing break gap must be between 1 and 10 mm on paper.');
      return;
    }
    const candidates = eligibleCrossingBreaks(sheet.groups, sheet.dimensions, settings, layout, id, nextGap);
    const candidate = candidates.find(c => c.id === overId);
    if (!candidate) {
      setMessage(`Dimension ${id} does not have a single clear interior crossing with ${overId} at a ${nextGap} mm gap.`);
      return;
    }
    if (candidate.conflict) {
      setMessage(`Dimension ${candidate.id} already breaks over ${id}. Clear that break first.`);
      return;
    }
    const nextBreak = readLinearCrossingBreak({ over: candidate.id, gap: nextGap, target: candidate.target });
    if (!nextBreak) return;
    if (selDim.crossingBreak?.over === nextBreak.over && selDim.crossingBreak.gap === nextBreak.gap
      && selDim.crossingBreak.target.orient === nextBreak.target.orient
      && selDim.crossingBreak.target.aEdge === nextBreak.target.aEdge
      && selDim.crossingBreak.target.bEdge === nextBreak.target.bEdge) return;
    const { crossingBreak: _old, ...ordinary } = selDim; void _old;
    if (commitDims(settings.dimensions.map(d => d === selDim ? { ...ordinary, crossingBreak: nextBreak } : d))) setMessage(null);
  };
  const selectedLinearGeom = useMemo(() => {
    if (!arrowReady || selDim?.kind !== 'linear' || !selectedLinearPlacement || !extensionResolved?.ok || extensionResolved.kind !== 'linear') return null;
    const A = toSheet(selectedLinearPlacement, extensionResolved.a);
    const B = toSheet(selectedLinearPlacement, extensionResolved.b);
    const place = toSheet(selectedLinearPlacement, selDim.place);
    const d: XY = selDim.orient === 'horizontal' ? [1, 0] : selDim.orient === 'vertical' ? [0, 1] : (() => { const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; })();
    const n: XY = [-d[1], d[0]];
    const dotN = (q: XY, p: XY) => (q[0] - p[0]) * n[0] + (q[1] - p[1]) * n[1];
    const A2: XY = [A[0] + n[0] * dotN(place, A), A[1] + n[1] * dotN(place, A)];
    const B2: XY = [B[0] + n[0] * dotN(place, B), B[1] + n[1] * dotN(place, B)];
    const along: XY = [B2[0] - A2[0], B2[1] - A2[1]];
    const al = Math.hypot(along[0], along[1]);
    const axis: XY = al > 1e-9 ? [along[0] / al, along[1] / al] : d;
    return { A, B, A2, B2, axis };
  }, [arrowReady, selDim, selectedLinearPlacement, extensionResolved]);
  const currentJogDrag = jogDrag?.owner === extensionOwner && jogDrag.dim === selDim && !!selectedLinearGeom && tool === 'select' ? jogDrag : null;
  useEffect(() => {
    if (jogDrag && !currentJogDrag) setJogDrag(null);
  }, [jogDrag, currentJogDrag]);
  const activeExtensionJog = currentJogDrag?.preview ?? (selDim?.kind === 'linear' ? selDim.extensionJog : undefined);
  const jogHandle = useMemo(() => {
    if (!selectedLinearGeom || !activeExtensionJog || selDim?.kind !== 'linear' || selDim.hideExtension === activeExtensionJog.side) return null;
    const P = activeExtensionJog.side === 'a' ? selectedLinearGeom.A : selectedLinearGeom.B;
    const Q = activeExtensionJog.side === 'a' ? selectedLinearGeom.A2 : selectedLinearGeom.B2;
    return extensionJogGeometry(P, Q, selectedLinearGeom.axis, activeExtensionJog);
  }, [selectedLinearGeom, activeExtensionJog, selDim]);
  const changeExtensionJog = (id: string, jog: LinearExtensionJog | null) => {
    if (liveExtensionOwner.current !== extensionOwner || !arrowReady || selDim?.kind !== 'linear' || selDim.id !== id
      || wholeSettings.dimensions.filter(d => d.id === id).length !== 1) return;
    if (jog === null) {
      if (!selDim.extensionJog) return;
      const { extensionJog: _old, ...ordinary } = selDim; void _old;
      if (commitDims(settings.dimensions.map(d => d === selDim ? ordinary : d))) setMessage(null);
      return;
    }
    if (!selectedLinearGeom || !extensionResolved?.ok || extensionResolved.kind !== 'linear') return;
    const clean = readLinearExtensionJog(jog);
    if (!clean) {
      setMessage('Extension jog requires side A or B and a paper offset between 1 and 40 mm.');
      return;
    }
    if (selDim.hideExtension === clean.side) {
      setMessage(`Extension ${clean.side.toUpperCase()} is hidden. Show it before editing its jog.`);
      return;
    }
    const P = clean.side === 'a' ? selectedLinearGeom.A : selectedLinearGeom.B;
    const Q = clean.side === 'a' ? selectedLinearGeom.A2 : selectedLinearGeom.B2;
    const geom = extensionJogGeometry(P, Q, selectedLinearGeom.axis, clean);
    if (!geom.ok) {
      setMessage(geom.reason);
      return;
    }
    if (selDim.extensionJog?.side === clean.side && selDim.extensionJog.offset === clean.offset && selDim.extensionJog.at === clean.at) return;
    const { extensionJog: _old, ...ordinary } = selDim; void _old;
    if (commitDims(settings.dimensions.map(d => d === selDim ? { ...ordinary, extensionJog: clean } : d))) setMessage(null);
  };
  const previewExtension = (side: 'a' | 'b' | null) => {
    if (liveExtensionOwner.current !== extensionOwner) return;
    setExtensionPreview(side && extensionReady ? { owner: extensionOwner, side } : null);
  };

  const selNote = selected?.kind === 'note' ? settings.notes?.find(n => n.id === selected.id) : undefined;
  const changeFrame = (next: DrawingSettings) => {
    if (!selectedFrame && selDim && wholeSettings.dimensions.filter(dim => dim.id === selDim.id).length !== 1) {
      setMessage('Dimension ' + selDim.id + ' has a duplicate ID. Remove the duplicate dimension before changing its geometric control.');
      return false;
    }
    const mergedFrames = mergeSheet(wholeSettings, current, next).frames ?? [];
    const why = checkDrawingFrames({ frames: mergedFrames }, wholeSettings.frames ?? [])[0];
    if (why) { setMessage(why.message); return false; }
    if (!onChange(next)) return false;
    setMessage(null);
    return true;
  };

  return (
    <div className="dw" aria-label="Drawing">
      <nav className="card dw-tools" aria-label="Drawing tools">
        {TOOLS.map(t => <button key={t.tool} className={'tool' + (tool === t.tool ? ' on' : '')} aria-label={t.label} aria-pressed={tool === t.tool}
          data-tip={t.label} data-tip-key={t.key} data-tip-desc={t.hint} data-tip-focus
          onClick={() => { setTool(t.tool); cancel(); }}><Icon name={t.icon} /></button>)}
        <button ref={shortcutButton} className="tool" aria-label="Drawing keyboard shortcuts"
          data-tip="Drawing keyboard shortcuts" data-tip-key="?" data-tip-focus onClick={openShortcutHelp}>?</button>
        <div className="sep" />
        <button className="tool" aria-label="Fit sheet" title="Fit the sheet" onClick={() => setBox(null)}><Icon name="fit_screen" /></button>
      </nav>
      {shortcutHelp && <ShortcutHelp drawingTools={TOOLS} returnFocus={shortcutOpener.current} onClose={() => setShortcutHelp(false)} />}

      <div className="dw-canvas">
        <div className="dw-paper">
          {layout && <svg ref={svg} tabIndex={-1} viewBox={viewBox.join(' ')} className={drag && 'pan' in drag ? 'dw-pan' : ''} aria-label="Drawing sheet" data-scale={layout.scale}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerCancel={() => { cancelDimensionGroupDrag(); setRadiusMove(null); setJogDrag(null); setMessage(null); }} onLostPointerCapture={() => { cancelDimensionGroupDrag(); setJogDrag(null); }}
            onBlur={() => { cancelDimensionGroupDrag(); setJogDrag(null); }} onPointerLeave={() => setHover(null)} onWheel={onWheel}>
            <rect className="dw-sheet" x={0} y={0} width={W} height={H} fill="#fff" />
            <g fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" fontFamily="Helvetica, Arial, sans-serif" dangerouslySetInnerHTML={{ __html: shownMarkup }} />
            <g dangerouslySetInnerHTML={{ __html: overlay }} />
            {radiusPreview?.ok && <g className="dw-hover" pointerEvents="none" aria-label="Foreshortened radius origin preview" dangerouslySetInnerHTML={{ __html: marksSvg([{ kind: 'polyline', points: [...radiusPreview.geometry.polyline], pen: 'thin' }]) }} />}
            {!!extensionMarkers.length && <g pointerEvents="none" aria-label="Dimension endpoint roles" fill="#075985" stroke="#fff" strokeWidth="0.25">
              {extensionMarkers.map(({ side, point }) => <g key={side} aria-label={`Extension endpoint ${side.toUpperCase()}`}>
                <circle cx={point[0]} cy={point[1]} r={extensionPreview?.owner === extensionOwner && extensionPreview.side === side ? 1.8 : 1.1} />
                <text x={point[0] + 2} y={point[1] - 2} fontSize="3" stroke="none">{side.toUpperCase()}</text>
              </g>)}
            </g>}
            {jogHandle?.ok && selDim?.kind === 'linear' && tool === 'select' && <g aria-label={`Extension jog handle ${selDim.id}`}>
              {currentJogDrag && <g className="dw-hover" pointerEvents="none" aria-label="Extension jog preview"
                dangerouslySetInnerHTML={{ __html: marksSvg(jogHandle.geometry.segments.map(([a, b]) => ({ kind: 'line' as const, a, b, pen: 'thin' as const, role: 'extension' as const }))) }} />}
              <circle data-jog-handle={selDim.id} cx={jogHandle.geometry.handle[0]} cy={jogHandle.geometry.handle[1]} r={1.8}
                fill="#0284c7" stroke="#fff" strokeWidth="0.35" style={{ cursor: 'grab' }}
                onPointerDown={e => {
                  if (e.button !== 0 || !arrowReady || !selDim.extensionJog) return;
                  e.stopPropagation();
                  e.preventDefault();
                  setJogDrag({ owner: extensionOwner, dim: selDim, pointer: e.pointerId, preview: selDim.extensionJog });
                  svg.current?.setPointerCapture(e.pointerId);
                }} />
            </g>}
            {selectedTarget && !(drag && 'target' in drag) && sheet?.groups.filter(g => g.datumTarget && g.id === selectedTarget).length === 1 && <g className="dw-hover" pointerEvents="none" aria-label="Selected datum target" dangerouslySetInnerHTML={{ __html: marksSvg(sheet.groups.find(g => g.datumTarget && g.id === selectedTarget)!.marks) }} />}
            {selectedFrame && sheet?.groups.filter(g => g.standaloneFrame && g.id === selectedFrame).length === 1 && <g className="dw-hover" pointerEvents="none" aria-label="Selected standalone frame" dangerouslySetInnerHTML={{ __html: marksSvg(sheet.groups.find(g => g.standaloneFrame && g.id === selectedFrame)!.marks) }} />}
            {referenceInspection?.markup && <g className="dw-hover" pointerEvents="none" aria-label="Reference candidate preview" dangerouslySetInnerHTML={{ __html: referenceInspection.markup }} />}
          </svg>}
          {busy && !views && <div className="dw-busy">Projecting views…</div>}
          {!busy && !views && <div className="dw-busy">{error ?? 'Nothing to draw.'}</div>}
        </div>
        {!!lostOccurrences.length && <div className="card dw-hint warn" role="status" aria-label="Drawing occurrence references">
          {lostOccurrences.map(loss => <span key={loss.id}>{occurrenceLossText(loss)}</span>)}
        </div>}
        {currentControlDeletion && <div className="card dw-hint warn" style={{ pointerEvents: 'auto' }} role="group" aria-label="Confirm drawing control removal">
          <span>Remove this annotation and its authored controls? Undo can restore them.</span>
          <ul>{currentControlDeletion.loss.map((loss, index) => <li key={index}>{loss}</li>)}</ul>
          <Button variant="ghost" onClick={() => setControlDeletion(null)}>Cancel removal</Button>
          <Button variant="destructive" onClick={() => {
            setControlDeletion(null);
            if (currentControlDeletion.model === currentModel.current) currentControlDeletion.run();
          }}>Remove annotation and controls</Button>
        </div>}
        <SheetTabs whole={wholeSettings} current={current} onSelect={selectSheet} onAdd={() => { if (commitWhole({ ...wholeSettings, sheets: [...(wholeSettings.sheets ?? []), { id: newSheetId(wholeSettings), views: [] }] })) selectSheet(sheetTotal); }} />
        {(currentReattachment?.candidate || currentRimChoice || bomError || hint || selected || selectedTarget || selectedFrame) &&
        <div className={'card dw-hint' + (bomError || message ? ' warn' : '')} role="status">
          {currentReattachment?.candidate
            ? <div className="dw-rim-choice" role="group" aria-label="Confirm diameter reattachment">
              <span>{currentReattachment.candidate.label} · Ø{Number(currentReattachment.candidate.diameter.toFixed(6))} mm</span>
              <Button variant="ghost" onClick={cancelReattachment}>Cancel</Button>
              <Button variant="default" onClick={confirmReattachment}>Reattach</Button>
            </div>
            : currentRimChoice
            ? <div ref={rimChoices} className="dw-rim-choice" role="group" aria-label="Choose diameter rim">
              {currentRimChoice.rims.map(edge => <Button key={edge.name} variant="outline"
                onClick={() => startDiameter(currentRimChoice.view, edge)}>{rimLabel(edge)}</Button>)}
            </div>
            : <span>{bomError ?? hint}</span>}
          {canDeleteSelection && <span><Kbd>Del</Kbd> remove</span>}
        </div>}
      </div>

      <aside className="card dw-panel" aria-label="Drawing settings">
        {referenceInspection && <div role="status" aria-label="Reference preview" style={{ marginBottom: 8 }}>{referenceInspection.message}</div>}
        <SheetSettings sheet={{ bodyScope, scopeRead, scope, views, layout, sectionA, sectionList, cutA, cutsMade, hasSheet, hasFrame, kinds, hasBought, doc, title, busy }} settings={settings} wholeSettings={wholeSettings} sourceDoc={sourceDoc} fileName={fileName} onChange={onChange} onToast={onToast}
          onScopeChanged={() => { setPending(null); setSelected(null); setSelectedTarget(null); setSelectedFrame(null); setTargetChoices([]); setReselectTarget(null); setHover(null); setDrag(null); }} turnTo={turnTo} later={current > 0} />

        <SheetsMenu whole={wholeSettings} current={current} onChange={(next, then) => { if (commitWhole(next) && then !== undefined) selectSheet(then); }} />

        <DetailsList crop={crop} settings={settings} sheet={sheet} layout={layout} onChange={onChange} onRemove={removeDetail} />

        <BreaksList settings={settings} views={views} onChange={onChange} onRefused={why => onToast({ title: 'Break unchanged', hint: why, detail: '' })} />

        <DatumsEditor settings={settings} allDatums={wholeSettings.datums ?? []} availableViews={(['front', 'top', 'right'] as const).filter(id => { const placement = placementAt(id); return !!placement && !placement.hidden; })} views={views} scale={layout?.scale ?? 1} onChange={onChange} onRefused={setMessage} />

        <DatumTargetsEditor draft={targetDraft} onDraft={next => {
          if (next.kind !== targetDraft.kind && (pending?.kind === 'datum-line' || (pending?.kind === 'datum-target' && !pending.moving))) cancel();
          else if (pending?.kind === 'datum-target' && !pending.moving && pending.target.kind === 'area') {
            const target = withDatumTargetAreaDraft(pending.target, next);
            const why = checkDatumTargetOptions({ datumTargets: [target] })[0];
            if (why) setMessage(why.message);
            else { setPending({ ...pending, target }); setMessage('Click where the target symbol goes. Esc cancels.'); }
          }
          setTargetDraft(next);
        }} settings={settings} views={busy ? null : views} hiddenViews={VIEW_IDS.filter(id => !!layout?.views[id].hidden)} selected={selectedTarget} choices={targetChoices} onInspect={setInspectedTarget} onChoose={target => { chooseTarget(target); svg.current?.focus(); }} onSelect={id => { setSelectedTarget(id); setSelected(null); setSelectedFrame(null); setTool('select'); cancel(); }}
          onAdd={() => { setTool('datum-target'); cancel(); }} onMove={target => { setTool('datum-target'); chooseTarget(target, true); }}
          onReselect={target => { cancel(); if (layout?.views[target.view].hidden) { setMessage('Show the target view before selecting its endpoint again.'); return; } setTool('datum-target'); setReselectTarget(target); setSelected(null); setSelectedTarget(target.id); setMessage(`Select the target endpoint again in the ${target.view} view. Its symbol position will be kept. Esc cancels.`); }}
          onCommit={commitTargets} onRefused={setMessage} />

        <StandaloneFramesEditor settings={settings} ready={!busy && !!views && !!layout} selected={selectedFrame}
          availableViews={([...VIEW_IDS, ...(sheet?.sections ?? []).map(x => `section:${x.id}` as DimView), ...(sheet?.details ?? []).map(x => `detail:${x.id}` as DimView)]).filter(id => { const placement = placementAt(id); return !!placement && !placement.hidden; })}
          onSelect={id => { cancel(); setSelected(null); setSelectedTarget(null); setSelectedFrame(id); setDrag(null); setTool('select'); }}
          onAdd={view => placeFrame(view)} onMove={frame => { if (frame.dim === undefined) placeFrame(frame.view, frame); }} onRemove={removeFrame} />

        <IssuesList sheetLabel={sheetTotal > 1 ? `${sheetName(wholeSettings, current)} of ${sheetTotal}` : undefined} issues={issues} scope={scope} views={views} fixIssue={fixIssue} fixEvery={fixEvery} onSelectDimension={id => selectAnnotationRow('dimension', id)} onSelectTarget={id => {
          const target = settings.datumTargets?.find(t => t.id === id);
          if (!target) return;
          cancel(); setSelectedTarget(id); setSelected(null); setSelectedFrame(null); setDrag(null); setTool('select');
          const editor = document.querySelector<HTMLDetailsElement>('details[aria-label="Datum targets"]');
          if (editor) { editor.open = true; editor.querySelector<HTMLButtonElement>(`button[data-target-id="${CSS.escape(id)}"]`)?.focus(); }
        }} />

        <TolerancingList suggestions={suggestions} settings={settings} views={views} onChange={onChange} acceptEvery={acceptEvery} />

        <DimensionsList foreshortenMovingId={currentRadiusMove?.dim.id} onForeshorten={id => { editRadius(id, 'add'); }}
          onForeshortenMove={id => { if (radiusReady && selDim?.id === id && radiusPlacement && !radiusPlacement.hidden && !radiusPlacement.breaks?.length) {
            cancel(); setDrag(null); setTool('select'); setRadiusMove({ owner: extensionOwner, dim: selDim }); svg.current?.focus();
          } }} onForeshortenRemove={id => { setRadiusMove(null); editRadius(id, 'remove'); }} extensionReady={extensionReady} arrowReady={arrowReady} onArrow={changeArrow} crossingBreakReady={arrowReady} crossingBreakCandidates={crossingBreakCandidates} onCrossingBreak={changeCrossingBreak} extensionJogReady={arrowReady} onExtensionJog={changeExtensionJog} onExtension={changeExtension} onExtensionPreview={previewExtension} sheet={sheet} views={views} layout={layout} scope={scope} settings={settings} occurrenceReasons={lossByDimension} onReattach={startReattachment} selected={selDim?.id ?? null} onSelect={id => { selectAnnotationRow('dimension', id); setNoteDraft(null); }} remove={id => removeAnnotation({ kind: 'dimension', id })} autoDimension={autoDimension} />

        <ToleranceEditor selDim={selDim} settings={settings} tolDraft={tolDraft} setTolDraft={setTolDraft} commitDims={commitDims} setMessage={setMessage} />

        <ToleranceStack key={JSON.stringify([current > 0 ? wholeSettings.sheets?.[current - 1]?.id ?? current : null, scopeKey])}
          dimensions={sourceCurrent && projectionCurrent && !busy ? sheet?.dimensions ?? null : null} settings={settings} />

        <FrameEditor key={selectedFrame ? `frame:${selectedFrame}` : selDim?.id ?? 'none'} dim={selectedFrame ? undefined : selDim?.id} frameId={selectedFrame ?? undefined} settings={settings} allFrames={wholeSettings.frames ?? []} onChange={changeFrame} onRefused={setMessage} />

        <NotesList onAttach={startNoteAttach} attachReady={noteAttachReady} attachmentStatus={note => { if (!note.leader?.target) return note.leader ? 'Free-coordinate leader' : 'Paper note'; if (!noteAttachReady || !views) return 'Needs confirmation: current drawing not ready'; const r = resolveNoteLeader(views, note, settings); return r.ok ? 'Connected endpoint' : `Needs confirmation: ${r.reason}`; }} settings={settings} selected={selNote?.id ?? null} selNote={selNote} noteDraft={noteDraft} setNoteDraft={setNoteDraft} noteBox={noteBox} onSelect={n => { cancel(); selectAnnotationRow('note', n.id); setNoteDraft(n.text); }} remove={id => removeAnnotation({ kind: 'note', id })} onRemoveLeader={removeNoteLeader} onDuplicate={duplicateNote} onChange={onChange} />
        {noteAttach && <div role="group" aria-label="Note endpoint selection">
          <Button variant="ghost" onClick={cancel}>Cancel note endpoint selection</Button>
          {noteAttach.choices?.points.map((point, i) => <Button key={i} variant="ghost" onClick={() => chooseNoteEndpoint(noteAttach.choices!.view, point)}>{point.edge} · {point.endpoint} · {point.near.join(', ')}</Button>)}
        </div>}

        <ExportActions canExportDimensionCsv={!!dimensionCsvReady} exportDimensionCsv={exportDimensionCsv} sheets={sheetTotal} sheet={exportableSheet} canExportPdf={canExportPdf} layout={layout} views={views} cuts={cuts} settings={settings} dxfVersion={dxfVersion} setDxfVersion={version => { setExportLoss(null); setDxfVersion(version); }} dxfCut={dxfCut} setDxfSection={setDxfSection} exportSvg={exportSvg} exportPdf={exportPdf} exportDxf={exportDxf} exportSectionDxf={exportSectionDxf}
          confirmation={exportConfirmation && { format: exportConfirmation.format, messages: exportConfirmation.messages,
            onCancel: () => setExportLoss(null), onConfirm: () => { setExportLoss(null); exportConfirmation.write(); } }} />
      </aside>
    </div>
  );
}

/** Keep every visible straight-edge endpoint near the pointer. A 2D overlap is a choice, not a 3D match. */
function endpointSnap(pr: DrawingViews[ViewId], at: XY, tolerance: number, bodies: readonly BodyResult[]): { points: DatumTargetPoint[]; error?: string } {
  const out: DatumTargetPoint[] = [];
  for (const edge of pr.edges) {
    if (edge.kind !== 'line' || edge.circle || !edge.ends || !edge.pieces.some(piece => piece.visible)) continue;
    // Apply the existing snap routine per edge so it cannot discard another edge's overlapping endpoint.
    const nearby = snapPoints({ ...pr, edges: [edge] }).some(snap => snap.ref.at === 'end' && Math.hypot(snap.at[0] - at[0], snap.at[1] - at[1]) < tolerance);
    if (!nearby) continue;
    const matches = bodies.flatMap(body => body.mesh.edges.filter(e => e.names.includes(edge.name)).map(e => ({ body, edge: e })));
    if (matches.length !== 1 || !matches[0].edge.straight) return { points: [], error: 'The target edge needs one current straight edge in the drawing bodies. No target was added.' };
    const signature = signaturesOf(matches[0].body).edges.get(edge.name);
    if (!signature || signature.kind !== 'line') return { points: [], error: 'The current target edge has no unique straight-edge signature. No target was added.' };
    // A view along the edge can project both 3D ends to the same 2D snap. Keep both choices.
    for (const point of edge.ends) {
      const q = inView(pr, point);
      if (Math.hypot(q[0] - at[0], q[1] - at[1]) < tolerance) {
        const endpoint = datumTargetEndpoint(edge.ends, point);
        if (!endpoint) return { points: [], error: 'The current target endpoint has no distinct min/max identity. No target was added.' };
        out.push({ edge: edge.name, at: 'end', near: [...point] as Vec3, endpoint, sig: toSig(signature) });
      }
    }
  }
  return { points: out };
}

/** A dimension point in a view's coordinates, by its stored model point (it may since have moved). */
function pointIn(pr: DrawingViews[ViewId], ref: DimPoint): XY {
  for (const e of pr.edges) if (e.name === ref.edge) {
    const cands = ref.at === 'center' ? (e.circle ? [e.circle.center] : []) : (e.ends ?? []);
    let best: readonly number[] | null = null, bd = Infinity;
    for (const p of cands) { const d = Math.hypot(p[0] - ref.near[0], p[1] - ref.near[1], p[2] - ref.near[2]); if (d < bd) { bd = d; best = p; } }
    if (best) return inView(pr, best);
  }
  return inView(pr, ref.near);
}

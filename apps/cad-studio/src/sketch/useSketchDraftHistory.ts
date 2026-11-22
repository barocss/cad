import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { ellipseError } from '@barocss/cad-model/sketch/ellipse';
import { shapeNode } from '@barocss/cad-model/sketch/loops';
import { isSettled } from '@barocss/cad-model/sketch/rules';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import { joinOpen } from '@barocss/cad-model/sketch/trim';
import { bezierEdit, detachSketchLink, draftShapeOrder } from '../app/sketchControls';
import { coordinateMessage, type CoordinateFeedback, type CoordinateIntent } from './coordinateFeedback';
import { canRecordOpenSplineFitPointDraft, isOpenSplineFitPointChange } from './openSplineFitPointHistory';
import { canRecordOpenArcRadiusDraft, isOpenArcRadiusChange } from './openArcRadiusHistory';
import { canEditOpenPolylineTerminalDraft, isOpenPolylineTerminalLengthChange } from './openPolylineTerminalLength';
import { isOpenLineLengthChange } from './openLineLength';
import { createDraftHistory, draftHistoryState, outlineHistoryState, restoreDraftHistory } from './draftHistory';

interface SketchDraftHistoryOptions {
  doc: StudioDoc;
  docNow: RefObject<StudioDoc>;
  sketch: SketchState | null;
  sketchGeneration: RefObject<number>;
  setSketch: Dispatch<SetStateAction<SketchState | null>>;
}

type SketchEditOrigin = 'panel' | 'open-line-length' | 'open-arc-radius' | 'open-spline-fit-point'
  | 'line-point' | 'chord-circle' | 'ellipse-finish' | 'centre-arc-finish'
  | `${'rectangle' | 'circle' | 'slot' | 'arc'}-${'start' | 'preview' | 'finish'}`;

/** Draft shape changes and their history belong to the current document and sketch session. */
export function useSketchDraftHistory({ doc, docNow, sketch, setSketch, sketchGeneration }: SketchDraftHistoryOptions) {
  const [coordinateFeedback, setCoordinateFeedback] = useState<CoordinateFeedback | null>(null);
  const [sketchIssue, setSketchIssue] = useState<{ reason: string; ellipse?: { doc: StudioDoc; draft: SketchState }; conflict?: { doc: StudioDoc; source: SketchShape; ids: readonly string[] } } | null>(null);
  const setSketchError = useCallback((reason: string | null) => setSketchIssue(reason ? { reason } : null), []);
  // The last shape handed to the sketch, ahead of React's batched re-render (rapid pointer events).
  const liveShape = useRef<SketchShape | null>(null);
  useEffect(() => { liveShape.current = sketch?.shape ?? null; }, [sketch?.shape]);
  /** Every profile edit (viewport or panel) is settled against its constraints before it is shown. */
  // A new shape keeps the current one beside it when that one is closed (one profile of several loops).
  const [sketchHistory] = useState(createDraftHistory);
  const shapePlacement = useRef<{ doc: StudioDoc; generation: number; kind: 'rectangle' | 'circle' | 'slot' | 'polygon'; before: ReturnType<typeof draftHistoryState> } | null>(null);
  const queuedSketchHistory = useRef<{ doc: StudioDoc; generation: number; draft: SketchState } | null>(null);
  const renderedSketch = useRef({ draft: sketch, generation: sketchGeneration.current });
  renderedSketch.current = { draft: sketch, generation: sketchGeneration.current };
  const constructRef = useRef(false); constructRef.current = !!sketch?.construct;
  const updateShape = useCallback((shape: SketchShape | null, fresh = false, origin?: SketchEditOrigin, coordinate?: CoordinateIntent) => {
    const placementEvent = origin === 'rectangle-start' || origin === 'rectangle-preview' || origin === 'rectangle-finish'
      || origin === 'circle-start' || origin === 'circle-preview' || origin === 'circle-finish'
      || origin === 'slot-start' || origin === 'slot-preview' || origin === 'slot-finish'
      || origin === 'arc-start' || origin === 'arc-preview' || origin === 'arc-finish';
    const placementFinished = origin === 'rectangle-finish' || origin === 'circle-finish' || origin === 'slot-finish' || origin === 'arc-finish';
    const fromPanel = origin === 'open-spline-fit-point' || origin === 'panel' || origin === 'open-line-length' || origin === 'open-arc-radius';
    // (An open line or arc stays too: pieces meeting end to end join, and close into an outline.)
    const prev = liveShape.current, keep = fresh && prev && (shapeNode(prev) || prev.construction || prev.kind === 'bezier' || (prev.kind === 'polygon' && !prev.closed && !prev.pending && prev.points.length >= 2)) ? prev : null;
    if (origin === 'open-line-length') {
      const rendered = renderedSketch.current;
      if (fresh || !rendered.draft || rendered.generation !== sketchGeneration.current || rendered.draft?.shape !== prev
        || rendered.draft.association || rendered.draft.band || rendered.draft.anchor?.face?.linkSource
        || !(isOpenLineLengthChange(prev, shape) || canEditOpenPolylineTerminalDraft(rendered.draft) && isOpenPolylineTerminalLengthChange(prev, shape))) return;
    }
    if (origin === 'open-arc-radius') {
      const rendered = renderedSketch.current;
      if (fresh || !rendered.draft || rendered.generation !== sketchGeneration.current || rendered.draft.shape !== prev
        || !canRecordOpenArcRadiusDraft(rendered.draft) || !isOpenArcRadiusChange(prev, shape)) return;
    }
    if (origin === 'open-spline-fit-point') {
      const rendered = renderedSketch.current;
      if (fresh || !rendered.draft || rendered.generation !== sketchGeneration.current || rendered.draft.shape !== prev
        || !canRecordOpenSplineFitPointDraft(rendered.draft) || !isOpenSplineFitPointChange(prev, shape)) return;
    }
    if (!placementEvent) shapePlacement.current = null;
    // A new shape is construction while the mode is on; the one being drawn stays what it began as.
    // A Bézier curve with no usable curve is refused (the reason shows in the panel), and is never construction: it stays the curve it is (D354).
    // An ellipse the model cannot build (no narrower than 1 : 5, within the kernel's range) is refused with the reason and the sketch stays.
    if (shape?.kind === 'polygon' && shape.ellipse) { const why = ellipseError(shape.ellipse); if (why) { setSketchError(why); return; } }
    if (shape?.kind === 'bezier') { const b = bezierEdit(shape); if ('error' in b) { setSketchError(b.error); return; } shape = b.shape; }
    else if (shape) { const c = !prev || fresh ? constructRef.current : !!prev.construction; shape = c ? { ...shape, construction: true } : shape.construction ? (({ construction: _c, ...rest }) => rest as SketchShape)(shape) : shape; }
    const r = settleShape(shape, keep ? null : prev); liveShape.current = r.shape;
    const coordinateReason = fromPanel && renderedSketch.current.draft?.shape === prev
      && renderedSketch.current.generation === sketchGeneration.current ? coordinateMessage(coordinate, prev, r.shape, r.error) : null;
    setCoordinateFeedback(coordinateReason && r.shape ? { doc: docNow.current, shape: r.shape,
      generation: sketchGeneration.current + 1, message: coordinateReason } : null);
    const resizedRectangle = fromPanel && prev?.kind === 'rectangle' && r.shape?.kind === 'rectangle'
      && !!shapeNode(prev) && !!shapeNode(r.shape)
      && (prev.a[0] !== r.shape.a[0] || prev.a[1] !== r.shape.a[1] || prev.b[0] !== r.shape.b[0] || prev.b[1] !== r.shape.b[1]);
    const changedCircle = fromPanel && prev?.kind === 'circle' && r.shape?.kind === 'circle'
      && (prev.r !== r.shape.r || prev.c[0] !== r.shape.c[0] || prev.c[1] !== r.shape.c[1]);
    const bezier = r.shape?.kind === 'bezier' ? r.shape : null;
    const changedSlot = fromPanel && prev?.kind === 'slot' && r.shape?.kind === 'slot'
      && !!shapeNode(prev) && !!shapeNode(r.shape)
      && (prev.r !== r.shape.r || prev.a[0] !== r.shape.a[0] || prev.a[1] !== r.shape.a[1]
        || prev.b[0] !== r.shape.b[0] || prev.b[1] !== r.shape.b[1]);
    const changedBezier = fromPanel && prev?.kind === 'bezier' && bezier && prev.poles.length === bezier.poles.length
      && prev.poles.some(([x, y], i) => x !== bezier.poles[i][0] || y !== bezier.poles[i][1]);
    const draftDoc = docNow.current, generation = sketchGeneration.current;
    const queued = queuedSketchHistory.current, rendered = renderedSketch.current;
    const draft = queued?.doc === draftDoc && queued.generation === generation ? queued.draft
      : rendered.generation === generation ? rendered.draft : null;
    // Rectangle/Circle/Slot placements and an Arc endpoint-to-bend span each form one step.
    // Capture the complete draft before parking its previous outline; only the final click
    // commits history, even when its coordinates equal the last pointer preview.
    if (origin === 'rectangle-start' || origin === 'circle-start' || origin === 'slot-start' || origin === 'arc-start') shapePlacement.current = draft
      ? { doc: draftDoc, generation, kind: origin === 'arc-start' ? 'polygon' : origin === 'slot-start' ? 'slot' : origin === 'circle-start' ? 'circle' : 'rectangle', before: draftHistoryState(draftDoc, draft, prev) } : null;
    const placement = shapePlacement.current;
    if (placementEvent && draft && placement?.doc === draftDoc && placement.generation === generation && placement.kind === r.shape?.kind) {
      const next = { ...detachSketchLink(draft), editDim: null, shape: r.shape,
        ...(keep ? { done: joinOpen(draftShapeOrder({ ...draft, shape: keep })), activeOutlineIndex: undefined } : {}) };
      // Draft history also records a degenerate two-click rectangle. Geometry validation
      // belongs to Finish; silently skipping this state would break the earlier Undo chain.
      if (placementFinished) {
        sketchHistory.push(placement.before, draftHistoryState(draftDoc, next));
      }
      setSketch(next);
      queuedSketchHistory.current = { doc: draftDoc, generation: sketchGeneration.current, draft: next };
      shapePlacement.current = placementFinished ? null : { ...placement, generation: sketchGeneration.current };
      setSketchError(r.error);
      return;
    }
    shapePlacement.current = null;
    const recordEdit = !keep && ((isSettled(prev) && isSettled(r.shape)) || resizedRectangle || changedCircle || changedSlot || changedBezier);
    const geometryChanged = prev !== r.shape && JSON.stringify(prev) !== JSON.stringify(r.shape);
    const confirmedPlacement = origin === 'open-spline-fit-point' || origin === 'open-arc-radius' || origin === 'open-line-length' || origin === 'line-point' || origin === 'chord-circle' || origin === 'ellipse-finish' || origin === 'centre-arc-finish';
    if (draft && (confirmedPlacement || (recordEdit && (draft.association || draft.associationDetached))) && (geometryChanged || keep)) {
      const next = { ...detachSketchLink(draft), editDim: null, shape: r.shape,
        ...(keep ? { done: joinOpen(draftShapeOrder({ ...draft, shape: keep })), activeOutlineIndex: undefined } : {}) };
      sketchHistory.push(draftHistoryState(draftDoc, draft, prev), draftHistoryState(draftDoc, next));
      setSketch(next);
      queuedSketchHistory.current = { doc: draftDoc, generation: sketchGeneration.current, draft: next };
      setSketchError(r.error);
      return;
    }
    if (recordEdit && prev && r.shape) {
      sketchHistory.push(outlineHistoryState(prev), outlineHistoryState(r.shape));
    }
    setSketchError(r.error);
    setSketch(s => {
      if (!s) return s;
      const changed = keep || JSON.stringify(s.shape) !== JSON.stringify(r.shape);
      return {
        ...(changed ? { ...detachSketchLink(s), editDim: null } : s),
        shape: r.shape,
        ...(keep ? { done: joinOpen(draftShapeOrder({ ...s, shape: keep })), activeOutlineIndex: undefined } : {}),
      };
    });
  }, [docNow, setSketchError, setSketch, sketchGeneration, sketchHistory]);
  useEffect(() => { if (!sketch) { setSketchError(null); sketchHistory.clear(); queuedSketchHistory.current = null; shapePlacement.current = null; } }, [sketch, sketchHistory, setSketchError]);

  const recordSketchDraft = (before: SketchState, after: SketchState) => {
    sketchHistory.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
    liveShape.current = after.shape;
    queuedSketchHistory.current = { doc, generation: sketchGeneration.current, draft: after };
  };
  const setActiveOutline = (next: SketchState) => {
    liveShape.current = next.shape;
    setSketchError(null);
    setSketch(next);
  };
  const sketchHistoryAvailable = sketch ? sketchHistory.available(draftHistoryState(doc, sketch)) : null;
  const sketchHistoryGeneration = sketchGeneration.current;
  const replaySketchHistory = (forward: boolean, beforeReplay: () => void, frameRestoredPlane: (plane: SketchState['plane']) => void) => {
    if (!sketch || docNow.current !== doc) return;
    const queued = queuedSketchHistory.current, generation = sketchGeneration.current;
    // Consecutive history keys may arrive before React renders the preceding full draft.
    const pending = queued?.doc === doc && queued.generation === generation ? queued.draft : null;
    const draft = pending ?? (generation === sketchHistoryGeneration ? sketch : null);
    if (!draft) return;
    // A corner/centre, Slot width or Arc bend stage is still a preview: keyboard Undo/Redo, like the disabled buttons,
    // must not clear earlier completed history against this uncommitted shape.
    if (shapePlacement.current?.doc === doc && shapePlacement.current.generation === generation) return;
    beforeReplay();
    const current = draftHistoryState(doc, draft, pending ? pending.shape : liveShape.current);
    const step = forward ? sketchHistory.redo(current) : sketchHistory.undo(current);
    if (!step) return;
    const next = restoreDraftHistory(draft, step);
    if (next.plane !== draft.plane) frameRestoredPlane(next.plane);
    liveShape.current = next.shape;
    setSketchError(null);
    setSketch(next);
    queuedSketchHistory.current = { doc, generation: sketchGeneration.current, draft: next };
  };

  return { coordinateFeedback, sketchIssue, setSketchIssue, setSketchError, liveShape, renderedSketch,
    updateShape, recordSketchDraft, setActiveOutline, sketchHistoryAvailable, replaySketchHistory };
}

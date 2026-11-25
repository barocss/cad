import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { markedReferences, type Problem } from '@barocss/cad-model/engine/references';
import type { DrawingReferenceLabel, DrawingReferencePreview } from '../ui/DrawingWorkspace';
import { handoffReferenceFocus, type ReferenceFocusReceipt } from '../ui/referenceFocus';
import { createReferenceDecisions, createReferencePreview, type ReferenceChoices } from '../state/referenceDecisions';
import type { OpenScope } from '../state/openOwnership';
import type { StudioNotice } from './studioNotice';

type ReferenceLabelOwner = { doc: StudioDoc; model: StudioDoc };

interface ReferenceReviewOptions {
  source: {
    doc: StudioDoc;
    evaluated: StudioDoc;
    bodies: readonly BodyResult[];
    problems: readonly Problem[];
    ready: boolean;
    drawing: boolean;
    edgeBlocked(): boolean;
    faceReady(): boolean;
  };
  owner: {
    document: RefObject<StudioDoc>;
    open: RefObject<OpenScope>;
    dispatch: RefObject<object>;
    canSettle(): boolean;
  };
  confirmation: {
    pushUndo(): void;
    setDoc(doc: StudioDoc): boolean;
    remember(doc: StudioDoc, problems: Problem[]): void;
    setDirty(dirty: boolean): void;
  };
  navigation: {
    switchDrawing(ready: () => void): void;
    showDrawing(): void;
    showModel(edges: Selection['edges'], faces?: Selection['faces']): void;
  };
  readPart(doc: StudioDoc): Promise<EvalResult>;
  onNotice(notice: StudioNotice): void;
}

/** Keep reference choices, previews, labels and focus bound to their accepted document. */
export function useStudioReferenceReview({ source, owner, confirmation, navigation, readPart, onNotice }: ReferenceReviewOptions) {
  const { doc, evaluated, bodies, problems, ready, drawing, edgeBlocked, faceReady } = source;
  const openIntent = owner.open;
  const referenceBrowser = useRef<HTMLElement>(null);
  const referenceFocus = useRef<ReferenceFocusReceipt<StudioDoc, OpenScope> | null>(null);
  const referenceFocusRequest = useRef(0);
  useLayoutEffect(() => {
    const receipt = referenceFocus.current;
    referenceFocus.current = null;
    if (receipt) handoffReferenceFocus(receipt, doc, openIntent.current, referenceBrowser.current, document);
  }, [doc]);

  const [referenceChoices, setRefChoices] = useState<ReferenceChoices | null>(null);
  const clearReferenceChoices = useCallback(() => setRefChoices(null), []);
  const refChoices = referenceChoices?.doc === doc ? referenceChoices : null;
  const [referencePreview, setReferencePreview] = useState<(DrawingReferencePreview & { owner: StudioDoc }) | null>(null);
  const [referenceLabelCache, setReferenceLabelCache] = useState<{ owner: ReferenceLabelOwner; labels: readonly DrawingReferenceLabel[] } | null>(null);
  const clearReferencePreview = useCallback(() => setReferencePreview(null), []);
  useEffect(clearReferencePreview, [doc, clearReferencePreview]);
  useEffect(() => { if (!drawing) clearReferencePreview(); }, [drawing, clearReferencePreview]);

  // Labels outlive the Drawing view, but only for the exact accepted document and displayed model.
  // Do not bind to DrawingWorkspace's spread prop: that wrapper is new on every render.
  const referenceLabelOwner = useMemo<ReferenceLabelOwner>(() => ({ doc, model: evaluated }), [doc, evaluated]);
  const referenceLabelOwnerNow = useRef(referenceLabelOwner); referenceLabelOwnerNow.current = referenceLabelOwner;
  const receiveReferenceLabels = useCallback((labels: readonly DrawingReferenceLabel[]) => {
    if (referenceLabelOwnerNow.current !== referenceLabelOwner) return;
    setReferenceLabelCache(previous => previous?.owner === referenceLabelOwner && JSON.stringify(previous.labels) === JSON.stringify(labels) ? previous : { owner: referenceLabelOwner, labels });
  }, [referenceLabelOwner]);
  const referenceLabels = referenceLabelCache?.owner === referenceLabelOwner ? referenceLabelCache.labels : [];
  const refMarks = useMemo(() => markedReferences(doc), [doc]);
  const previewReference = createReferencePreview({
    model: { doc, bodies, ready, edgeBlocked, faceReady },
    owner: { document: owner.document, switchDrawing: navigation.switchDrawing },
    changes: { setPreview: setReferencePreview, notice: onNotice,
      showDrawing: navigation.showDrawing, showModel: navigation.showModel },
  });
  const { settleRef, showRefChoices } = createReferenceDecisions({
    model: { doc, bodies, problems }, owner,
    focus: { request: referenceFocusRequest, receipt: referenceFocus }, readPart,
    changes: { ...confirmation, setChoices: setRefChoices, notice: onNotice },
  });

  return { referenceBrowser, refMarks, refChoices, referenceLabels, previewReference, settleRef, showRefChoices,
    referencePreview, clearReferencePreview, clearReferenceChoices, receiveReferenceLabels };
}

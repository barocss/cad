import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  addAssemblyStep, assemblyStepProblems, deleteAssemblyStep, editAssemblyStep,
  moveAssemblyStep, moveAssemblyStepParts, stepsOf, type EditAssemblyStepOptions,
} from '@barocss/cad-model/assembly/steps';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { hostsOf } from '../assembly/nestedSelection';
import type { OpenScope } from '../state/openOwnership';
import type { ValueStore } from '../state/valueStore';
import type { ViewportHandle } from '../viewport/Viewport';
import {
  cameraOfView, canSelectStepPart, clampStep, stepBatchTakeOutOffer, stepBatchTransferOffer, stepOffer, stepsDisplay, viewOfCamera,
} from './assemblySteps';

interface AssemblyStepReviewOptions {
  doc: StudioDoc;
  docGeneration: number;
  available: boolean;
  selection: {
    selectedParts: readonly string[];
    editor: object | null;
    editorPending: boolean;
    pickPart(id: string): void;
  };
  source: {
    docNow: RefObject<StudioDoc>;
    openIntent: RefObject<OpenScope>;
    workerSessionNow: RefObject<number>;
    workerSession: number;
    opening(): boolean;
  };
  viewport: RefObject<Pick<ViewportHandle, 'getCamera' | 'setCamera'> | null>;
  explodeStore: ValueStore<number>;
  commit(next: StudioDoc): boolean;
  onNotice(notice: FriendlyError): void;
}

/** Session display and authoring for the Steps panel. App owns shared selection and history. */
export function useAssemblyStepReview({
  doc, docGeneration, available, selection, source, viewport, explodeStore, commit, onNotice,
}: AssemblyStepReviewOptions) {
  const { selectedParts, editor, editorPending, pickPart } = selection;
  const { docNow, openIntent, workerSessionNow, workerSession, opening } = source;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(0);
  const [faded, setFaded] = useState(false);
  const openPanel = useCallback(() => setOpen(true), []);
  const shown = open && available;
  const steps = stepsOf(doc);
  const index = clampStep(position, steps.length);
  const display = useMemo(() => shown ? stepsDisplay(doc, index, faded) : null, [shown, doc.assemblySteps, doc.instances, index, faded]);

  const explodeBefore = useRef<number | null>(null);
  const stepExplode = display?.explode;
  useEffect(() => {
    if (stepExplode === undefined) {
      if (explodeBefore.current !== null) {
        explodeStore.set(explodeBefore.current);
        explodeBefore.current = null;
      }
      return;
    }
    if (explodeBefore.current === null) explodeBefore.current = explodeStore.get();
    explodeStore.set(stepExplode);
  }, [explodeStore, stepExplode]);

  const view = display?.state.step.view;
  const viewRef = useRef(view);
  viewRef.current = view;
  const resetView = useCallback(() => {
    const camera = viewport.current;
    const saved = viewRef.current;
    if (camera && saved) camera.setCamera(cameraOfView(saved, camera.getCamera()));
  }, [viewport]);
  // A step ID belongs to one document session. Re-enter when another document reuses it.
  // Editing a step within the same document preserves the current camera.
  const displayedStepId = display?.state.step.id;
  useEffect(() => { if (displayedStepId) resetView(); }, [docGeneration, displayedStepId, resetView]);

  const applyEdit = (edit: (current: StudioDoc) => { doc: StudioDoc }, afterCommit?: () => void) => {
    let next: StudioDoc;
    try {
      next = edit(doc).doc;
    } catch (error) {
      onNotice({ title: 'Step not changed', hint: error instanceof Error ? error.message : String(error), detail: '' });
      return;
    }
    if (commit(next)) afterCommit?.();
  };

  // Keep delayed member actions bound to the step and selection the panel showed.
  const openScope = openIntent.current;
  const nextScope = { doc, docGeneration, selectedParts, index, shown, openScope, workerSession };
  const actionScope = useRef(nextScope);
  const previous = actionScope.current;
  if (previous.doc !== doc || previous.docGeneration !== docGeneration || previous.selectedParts !== selectedParts
    || previous.index !== index || previous.shown !== shown || previous.openScope !== openScope
    || previous.workerSession !== workerSession) actionScope.current = nextScope;
  const ownedAction = actionScope.current;
  const currentAction = () => actionScope.current === ownedAction && docNow.current === doc && shown
    && openIntent.current === ownedAction.openScope && workerSessionNow.current === ownedAction.workerSession && !opening();

  const pickScope = useRef({ action: ownedAction, editor, editorPending });
  if (pickScope.current.action !== ownedAction || pickScope.current.editor !== editor
    || pickScope.current.editorPending !== editorPending) pickScope.current = { action: ownedAction, editor, editorPending };
  const ownedPick = pickScope.current;
  const selectionDisabled = !!editor || editorPending;
  const currentPick = () => pickScope.current === ownedPick && !selectionDisabled && currentAction();

  // Text belongs to the document session and step even when the accepted document or selection changes.
  const stepId = steps[index]?.id;
  const nextTextDraft = { docGeneration, index, stepId, shown, openScope, workerSession, pending: false };
  const textDraft = useRef(nextTextDraft);
  const previousText = textDraft.current;
  if (previousText.docGeneration !== docGeneration || previousText.index !== index || previousText.stepId !== stepId
    || previousText.shown !== shown || previousText.openScope !== openScope || previousText.workerSession !== workerSession) {
    textDraft.current = nextTextDraft;
  }
  const ownedTextDraft = textDraft.current;
  const changeTextDraft = (pending: boolean) => {
    if (textDraft.current === ownedTextDraft) ownedTextDraft.pending = pending;
  };
  const transferSelected = (id: string) => {
    if (!currentAction()) return;
    const offer = stepBatchTransferOffer(doc, selectedParts, index);
    if (!offer || offer.target !== id) return;
    applyEdit(current => moveAssemblyStepParts(current, id, offer.parts));
  };
  const takeOutSelected = (id: string) => {
    if (!currentPick() || textDraft.current !== ownedTextDraft || ownedTextDraft.pending) return;
    const offer = stepBatchTakeOutOffer(doc, selectedParts, index);
    if (!offer || offer.target !== id) return;
    const remove = new Set(offer.parts), step = steps[index];
    applyEdit(current => editAssemblyStep(current, { id, add: step.add.filter(part => !remove.has(part)) }));
  };
  const selectPart = (id: string, part: string) => {
    if (currentPick() && canSelectStepPart(doc, index, id, part)) pickPart(part);
  };

  const change = (options: EditAssemblyStepOptions) => applyEdit(current => editAssemblyStep(current, options));
  const selectedHosts = () => hostsOf(selectedParts).filter(id => doc.instances?.some(instance => instance.id === id));
  const createStep = () => {
    const add = selectedHosts();
    if (!add.length) {
      onNotice({ title: 'Step not added', hint: 'Select the parts the step adds first, in the Browser or the view.', detail: '' });
      return;
    }
    applyEdit(current => addAssemblyStep(current, { add }), () => setPosition(steps.length));
  };
  const addSelected = (id: string) => {
    const step = steps.find(item => item.id === id);
    if (!step) return;
    const add = selectedHosts();
    if (!add.length) {
      onNotice({ title: 'Step not changed', hint: 'Select the parts to add first, in the Browser or the view.', detail: '' });
      return;
    }
    change({ id, add: [...step.add, ...add.filter(part => !step.add.includes(part))] });
  };
  const takeOut = (id: string, part: string) => {
    const step = steps.find(item => item.id === id);
    if (step) change({ id, add: step.add.filter(member => member !== part) });
  };
  const captureView = (id: string) => {
    const camera = viewport.current?.getCamera();
    if (camera) change({ id, view: viewOfCamera(camera) });
  };
  const problems = useMemo(() => assemblyStepProblems(doc).map(problem => problem.message), [doc.assemblySteps, doc.instances]);

  return {
    shown, openPanel, display,
    panelProps: {
      doc, index, selectedParts, faded, problems,
      offer: shown ? stepOffer(doc, selectedParts, index) : null,
      batchOffer: shown ? stepBatchTransferOffer(doc, selectedParts, index) : null,
      takeOutOffer: shown ? stepBatchTakeOutOffer(doc, selectedParts, index) : null,
      textDraftScope: ownedTextDraft,
      onTextDraftChange: changeTextDraft,
      onTransferSelected: transferSelected,
      onTakeOutSelected: takeOutSelected,
      selectionDisabled,
      onSelectPart: selectPart,
      onGo: (to: number) => setPosition(clampStep(to, steps.length)),
      onFaded: setFaded,
      onNew: createStep,
      onRename: (id: string, name: string) => change({ id, name }),
      onNote: (id: string, note: string) => change({ id, note: note.trim() ? note : null }),
      onExplode: (id: string, explode: number) => change({ id, explode: explode || null }),
      onAddSelected: addSelected,
      onTransfer: (id: string, part: string) => applyEdit(current => moveAssemblyStepParts(current, id, [part])),
      onTakeOut: takeOut,
      onCaptureView: captureView,
      onResetView: resetView,
      onClearView: (id: string) => change({ id, view: null }),
      onMove: (id: string, to: number) => applyEdit(current => moveAssemblyStep(current, id, to), () => setPosition(to)),
      onDelete: (id: string) => applyEdit(current => deleteAssemblyStep(current, id), () => {
        setPosition(previous => clampStep(previous, steps.length - 1));
      }),
      onClose: () => setOpen(false),
    },
  };
}

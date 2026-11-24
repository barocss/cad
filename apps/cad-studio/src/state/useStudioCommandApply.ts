import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { carrySelection, patchValues, type Command, type Selection, type Values } from '@barocss/cad-model/app/commands';
import { OFFSET_FACE_EDIT } from '@barocss/cad-model/app/offsetFaceEdit';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Active } from '../app/commandState';
import type { FontUpload } from '../app/fontUpload';
import { LINKED_INSET_EXTRUDE } from '../app/roundedInsetCommand';
import { SHARED_HOLE_LAYOUT_EDIT } from '../app/sharedHoleLayout';
import { emptySel } from '../app/studioConstants';
import type { StudioNotice } from '../app/studioNotice';
import { commandApplyReadiness, type createCommandApplyQueue } from './commandApply';
import type { useCommandPreview } from './useCommandPreview';
import type { ValueStore } from './valueStore';

interface StudioCommandApplyOptions {
  command: {
    activeStore: ValueStore<Active | null>;
    activeCommand?: Command;
    commandApply: ReturnType<typeof createCommandApplyQueue>;
    bearingRootCurrent: boolean;
    commandDoc: StudioDoc;
  };
  model: {
    doc: StudioDoc;
    evaluated: StudioDoc;
    docNow: RefObject<StudioDoc>;
    evaluatedRef: RefObject<StudioDoc>;
    markerNow: RefObject<number | null>;
    acceptanceScope: object;
    fresh: boolean;
    busy: boolean;
    massReady: boolean;
    canChangeDocument(): boolean;
    commitApply(commandId: string, next: StudioDoc): boolean;
    stageFeatureCandidate(candidate: { next: StudioDoc; input: StudioDoc; failureTitle: string; roundedInset: 'create' }): void;
  };
  view: {
    commandPreview: Pick<ReturnType<typeof useCommandPreview>, 'retire' | 'lastTyped' | 'handleDrag'>;
    bodies: BodyResult[];
    previewBodies: BodyResult[] | null;
    claimBodies: RefObject<boolean>;
    setBodies(bodies: BodyResult[]): void;
    setPreviewBodies(bodies: BodyResult[] | null): void;
    setSelection: Dispatch<SetStateAction<Selection>>;
    setDirectSel(selection: string[]): void;
    setSketch(sketch: null): void;
    setToast(notice: StudioNotice): void;
    holeCloseFocus(active: Active): void;
  };
  draft: {
    fontUpload: FontUpload;
    hudValues: RefObject<Values | null>;
    setRestart(command: null): void;
  };
}

/** Apply the current Studio command and manage its pending preview and file inputs. */
export function useStudioCommandApply({ command, model, view, draft }: StudioCommandApplyOptions) {
  const { activeStore, activeCommand, commandApply, bearingRootCurrent, commandDoc } = command;
  const { doc, evaluated, docNow, evaluatedRef, acceptanceScope, markerNow, fresh, busy, massReady,
    canChangeDocument, commitApply, stageFeatureCandidate } = model;
  const { commandPreview, bodies, previewBodies, claimBodies, setBodies, setPreviewBodies, setSelection,
    setDirectSel, setSketch, setToast, holeCloseFocus } = view;
  const { fontUpload, hudValues, setRestart } = draft;
  const { lastTyped, handleDrag } = commandPreview;
  const setActive = activeStore.set;
  const discardFeatureDraft = useCallback(() => {
    if (!activeStore.get()) return;
    commandApply.clear();
    setRestart(null);
    commandPreview.retire();
    activeStore.set(null);
  }, [activeStore, commandApply, commandPreview.retire]);
  const apply = useCallback(() => {
    // Read the current command and preview from the store at the time of Apply.
    const active = activeStore.get();
    if (!active?.cmd.build) return;
    const readiness = commandApplyReadiness(active, { commandDoc, bearingRootCurrent, canChangeDocument,
      modelCurrent: docNow.current === doc && evaluatedRef.current === evaluated });
    if (readiness.kind === 'skip') return;
    if (readiness.kind === 'wait') { commandApply.requestApply(active); return; }
    commandApply.clearApply();
    if (readiness.kind === 'blocked' || readiness.kind === 'retire') {
      if (readiness.clearRepeat) commandApply.clearRepeat();
      if (readiness.kind === 'retire') { commandPreview.retire(); setActive(null); }
      return;
    }
    if (readiness.kind === 'source-changed') { setToast({ title: 'Source changed', hint: readiness.hint, detail: '' }); return; }
    const independentPreview = readiness.preview;
    // Keep the accepted preview visible while the committed document evaluates.
    const next = independentPreview?.doc ?? active.cmd.build(active.ctx, active.values);
    if (active.cmd.id === SHARED_HOLE_LAYOUT_EDIT && next === doc) {
      commandApply.clear(); setActive(null); setPreviewBodies(null); return;
    }
    if (active.cmd === LINKED_INSET_EXTRUDE) {
      if (active.ctx.doc !== doc || markerNow.current !== null || !fresh || busy || !massReady) {
        setToast({ title: 'Linked inset not created', hint: 'Show the latest History and wait for the current sketch.', detail: '' });
        return;
      }
      stageFeatureCandidate({ next, input: prefixDoc(next, next.nodes.length), failureTitle: 'Linked inset not created', roundedInset: 'create' });
      setActive(null); setPreviewBodies(null);
      return;
    }
    if (!commitApply(active.cmd.id, next)) return;
    const clearSelection = active.cmd.id === 'offset-face' || active.cmd.id === 'delete-face' || active.cmd.id === 'replace-face' || active.cmd.id === 'replace-face-edit' || active.cmd.id === OFFSET_FACE_EDIT || active.cmd.id === 'fill-feature-pattern' || active.cmd.id === 'curve-feature-pattern';
    if (clearSelection) setSelection(emptySel);
    if (active.cmd.id === 'thicken' || active.cmd.id === 'sew') setDirectSel([]);
    // A placed instance supplies its own bodies after evaluation.
    const acceptedPreview = independentPreview?.bodies ?? previewBodies;
    if (acceptedPreview && Object.keys(next.outputs).length && (next.instances?.length ?? 0) === (active.ctx.doc.instances?.length ?? 0)) {
      // Resolve the picks against the accepted topology before installing the preview's new indices.
      const acceptedBodies = bodies;
      if (!clearSelection) setSelection(sel => carrySelection(sel, acceptedBodies, acceptedPreview));
      setBodies(acceptedPreview); claimBodies.current = true;
    }
    holeCloseFocus(active);
    setActive(null); setPreviewBodies(null); setSketch(null);
  }, [activeStore, commandApply, holeCloseFocus, commitApply, previewBodies, bodies, bearingRootCurrent, commandDoc, setSketch, acceptanceScope, doc, evaluated, commandPreview.retire, stageFeatureCandidate, fresh, busy, massReady]);
  const uploadFont = useCallback(async (key: string, file: File) => {
    const captured = activeStore.get();
    if (!captured || key !== 'font') return;
    const { cmd, ctx } = captured;
    commandApply.clearApply();
    lastTyped.current = Date.now(); handleDrag.current = null;
    setPreviewBodies(null);
    setActive(a => {
      if (!a || a.cmd !== cmd || a.ctx !== ctx) return a;
      const values = { ...a.values, [key]: '' }; hudValues.current = values;
      return { ...a, values, upload: 'busy', preview: 'busy', error: undefined };
    });
    try {
      const source = await fontUpload.load(ctx, file);
      if (!source) return;
      setActive(a => {
        if (!a || a.cmd !== cmd || a.ctx !== ctx) return a;
        const values = patchValues(a.cmd, a.ctx, a.values, { [key]: JSON.stringify(source) }); hudValues.current = values;
        return { ...a, values, upload: undefined, preview: 'busy', error: undefined };
      });
    } catch (error) {
      setActive(a => a && a.cmd === cmd && a.ctx === ctx ? { ...a, upload: 'error', preview: 'error', error: {
        title: 'Could not read the font', hint: error instanceof Error ? error.message : String(error), detail: '',
      } } : a);
    }
  }, [activeStore, commandApply, fontUpload]);
  useEffect(() => commandApply.watch(activeStore, apply), [commandApply, previewBodies, activeCommand, apply, activeStore]);

  return { discardFeatureDraft, apply, uploadFont };
}

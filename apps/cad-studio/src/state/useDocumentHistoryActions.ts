import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { clearRecovery } from '../app/recovery';
import type { StudioNotice } from '../app/studioNotice';
import type { ProjectDocumentBinding } from '../storage/useProject';
import { carrySketchSelection } from './profileSelection';
import type { WorkHistory } from './workOwnership';

type Entry = WorkHistory<StudioDoc>;
type Identity = NonNullable<Entry['documentIdentity']>;
type Setter<T> = Dispatch<SetStateAction<T>>;

interface DocumentHistoryOptions {
  history: { undo: Entry[]; redo: Entry[]; setUndo: Setter<Entry[]>; setRedo: Setter<Entry[]> };
  document: {
    doc: StudioDoc; current: RefObject<StudioDoc>; marker: number | null; currentMarker: RefObject<number | null>;
    setDoc: Setter<StudioDoc>; setMarker: Setter<number | null>; setSelection: Setter<Selection>;
  };
  boundary: {
    clearDraft(): void;
    resetView(): void;
    identity(): Pick<Identity, 'fileName' | 'dirty'>;
    captureBinding(): ProjectDocumentBinding | null;
    restoreBinding(binding: ProjectDocumentBinding | null): void;
    restoreIdentity(identity: Identity): void;
  };
  stop: {
    evaluated: RefObject<StudioDoc>;
    take(doc: StudioDoc, evaluated: StudioDoc, entry: Entry | undefined): Entry | null | undefined;
    markDirty(): void;
    notice(message: StudioNotice): void;
  };
  invalidateWork(): void;
  cancelReview(): void;
  cancel(): void;
}

export function useDocumentHistoryActions({history, document, boundary, stop, invalidateWork, cancelReview, cancel}: DocumentHistoryOptions) {
  const {undo, redo, setUndo, setRedo} = history;
  const {doc, current, marker, currentMarker, setDoc, setMarker, setSelection} = document;
  const {clearDraft, resetView, identity, captureBinding, restoreBinding, restoreIdentity} = boundary;

  const reverseHistoryEntry = useCallback((target: Entry, doc: StudioDoc, marker: number | null): Entry => {
    if (!target.documentBoundary) return {doc, marker};
    clearDraft();
    const documentIdentity = target.documentIdentity && {
      ...identity(),
      ...(target.documentIdentity.binding !== undefined ? {binding: captureBinding()} : {}),
    };
    return {doc, marker, documentBoundary: true, ...(documentIdentity ? {documentIdentity} : {})};
  }, [clearDraft, identity, captureBinding]);

  const restoreHistoryEntry = useCallback((entry: Entry) => {
    const previous = current.current;
    if (entry.documentBoundary) resetView();
    else setSelection(selection => carrySketchSelection(selection, previous, entry.doc));
    setDoc(entry.doc);
    setMarker(entry.marker);
    if (entry.documentIdentity) {
      restoreBinding(entry.documentIdentity.binding ?? null);
      restoreIdentity(entry.documentIdentity);
      if (!entry.documentIdentity.dirty) clearRecovery();
    }
    cancel();
  }, [current, resetView, setSelection, setDoc, setMarker, restoreBinding, restoreIdentity, cancel]);

  const undoEntry = useCallback((entry: Entry, source: StudioDoc, marker: number | null) => {
    const redoEntry = reverseHistoryEntry(entry, source, marker);
    setRedo(stack => [...stack, redoEntry]);
    setUndo(stack => stack.slice(0, -1));
    restoreHistoryEntry(entry);
  }, [reverseHistoryEntry, restoreHistoryEntry, setRedo, setUndo]);

  const doUndo = useCallback(() => {
    cancelReview();
    const entry = undo.at(-1);
    if (!entry) return;
    invalidateWork();
    undoEntry(entry, doc, marker);
  }, [undo, doc, marker, undoEntry, cancelReview, invalidateWork]);

  const doRedo = useCallback(() => {
    cancelReview();
    const entry = redo.at(-1);
    if (!entry) return;
    invalidateWork();
    const undoEntry = reverseHistoryEntry(entry, doc, marker);
    setUndo(stack => [...stack, undoEntry]);
    setRedo(stack => stack.slice(0, -1));
    restoreHistoryEntry(entry);
  }, [redo, doc, marker, restoreHistoryEntry, reverseHistoryEntry, cancelReview, invalidateWork, setUndo, setRedo]);

  const cancelWork = () => {
    const entry = stop.take(current.current, stop.evaluated.current, undo.at(-1));
    if (entry === undefined) return;
    if (entry) {
      undoEntry(entry, current.current, currentMarker.current);
      if (!entry.documentIdentity) stop.markDirty();
      stop.notice({ title: 'Stopped', hint: 'The computation was stopped and its change taken back.', detail: '' });
    } else stop.notice({ title: 'Stopped', hint: 'The computation was stopped; no unrelated change was taken back.', detail: 'The document is unchanged. The view is not up to date.' });
  };

  return {doUndo, doRedo, cancelWork};
}

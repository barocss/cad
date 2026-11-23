import type { MouseEvent } from 'react';
import { describeChange } from '@barocss/cad-model/app/bodies';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';

interface HistoryAvailability { undo: boolean; redo: boolean }
interface EditorHistory {
  availability: HistoryAvailability;
  undo(): void;
  redo(): void;
}
interface HistoryControlsOptions {
  document: {
    current: StudioDoc;
    undo: readonly { doc: StudioDoc }[];
    redo: readonly { doc: StudioDoc }[];
    replay(forward: boolean, event?: MouseEvent<HTMLButtonElement>): void;
  };
  sketch: { editing: boolean; availability: HistoryAvailability | null; replay(forward: boolean): void };
  cage: EditorHistory | null;
  skeleton: EditorHistory | null;
}

export function createStudioHistoryControls({ document, sketch, cage, skeleton }: HistoryControlsOptions) {
  const available = sketch.availability ?? cage?.availability ?? skeleton?.availability;
  const draftLabel = cage ? 'cage edit' : skeleton ? '3D sketch edit' : sketch.editing ? 'sketch edit' : null;
  const undo = document.undo.at(-1), redo = document.redo.at(-1);
  return {
    undo: {
      disabled: available ? !available.undo : !undo,
      text: draftLabel ? `Undo ${draftLabel}` : undo ? `Undo ${describeChange(undo.doc, document.current)}` : 'Nothing to undo',
    },
    redo: {
      disabled: available ? !available.redo : !redo,
      text: draftLabel ? `Redo ${draftLabel}` : redo ? `Redo ${describeChange(document.current, redo.doc)}` : 'Nothing to redo',
    },
    replay(forward: boolean, event?: MouseEvent<HTMLButtonElement>) {
      const draft = cage ?? skeleton;
      if (draft) {
        if (forward) draft.redo(); else draft.undo();
      } else if (sketch.editing) {
        sketch.replay(forward);
      } else if (forward ? redo : undo) {
        document.replay(forward, event);
      }
    },
  };
}

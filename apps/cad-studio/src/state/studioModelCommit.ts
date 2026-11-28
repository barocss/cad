import type { Dispatch, SetStateAction } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import { carryOver, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { featureId } from '@barocss/cad-model/engine/ids';
import { captureSignatures } from '@barocss/cad-model/engine/references';
import { emptySel } from '../app/studioConstants';
import type { StudioNotice } from '../app/studioNotice';
import { carrySketchSelection } from './profileSelection';

interface ModelCommit {
  next: StudioDoc;
  mode: { capture: boolean; whole: boolean; authored: boolean };
  source: { doc: StudioDoc; marker: number | null; bodies: readonly BodyResult[]; evaluated(): StudioDoc };
  changes: {
    canChangeDocument(): boolean;
    pushUndo(): void;
    setDoc(next: StudioDoc, whole: boolean): boolean;
    setMarker(marker: null): void;
    setDirty(dirty: true): void;
    setEditNode(index: null): void;
    retireBodies(): void;
    setSelection: Dispatch<SetStateAction<Selection>>;
    setToast(notice: StudioNotice): void;
  };
}

export function commitStudioModel({ next, mode, source, changes }: ModelCommit): boolean {
  if (!changes.canChangeDocument()) return false;

  const { doc, marker, bodies } = source, { capture, whole, authored } = mode;
  const retainedFeatures = marker === null || whole ? null : new Set(next.nodes.map((_, i) => featureId(next.nodes, i)));
  const dropped = marker !== null && retainedFeatures ? doc.nodes.slice(marker).filter((node, i) =>
    node.kind !== 'sketch' && node.kind !== 'driven-sketch' && !retainedFeatures.has(featureId(doc.nodes, marker + i))).length : 0;

  // Commands write an evaluated view. Whole files and proposal replay already carry authored state.
  if (!whole && !authored) next = carryOver(next, source.evaluated(), doc);
  if (capture) next = captureSignatures(next, bodies);
  changes.pushUndo();
  if (!changes.setDoc(next, whole)) return false;

  changes.setMarker(null);
  changes.setDirty(true);
  changes.setEditNode(null);
  const hasBodies = Object.keys(next.outputs).length > 0;
  if (!hasBodies) changes.retireBodies();
  if (whole) {
    if (!hasBodies) changes.setSelection(emptySel);
  } else {
    changes.setSelection(current => {
      const carried = carrySketchSelection(current, doc, next);
      if (hasBodies) return carried;
      const { sketches } = carried;
      return sketches?.length ? { ...emptySel, sketches } : emptySel;
    });
  }
  if (dropped > 0) {
    changes.setToast({ title: `Removed ${dropped} later feature${dropped > 1 ? 's' : ''}`,
      hint: 'You added a feature while rolled back. Undo restores them.', detail: '' });
  }
  return true;
}

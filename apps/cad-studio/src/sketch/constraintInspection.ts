import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { ConstraintEntry, ConstraintKind, Polygon, SketchPick } from '@barocss/cad-model/sketch/rules';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { createValueStore, type ValueStore } from '../state/valueStore';
import type { SavedSketchCorners, SketchCornerAction, SketchCornerResult } from './cornerDraft';

export type ConstraintComparison = { ok: true; shape: Polygon; display: Polygon } | { ok: false; reason: string };
export type ConstraintInspection = {
  owner: SketchState;
  input: 'pointer' | 'focus';
} & (
  | { target: 'row'; entry: ConstraintEntry }
  | { target: 'comparison'; kind: ConstraintKind; result: ConstraintComparison }
  | { target: 'mobility'; entity: SketchPick }
  | { target: 'corner'; doc: StudioDoc; operation: SketchCornerAction; corners: readonly number[];
    resize?: SavedSketchCorners; value: string; result: SketchCornerResult }
);

export type ConstraintInspectionStore = ValueStore<ConstraintInspection | null>;
export const createConstraintInspection = () => createValueStore<ConstraintInspection | null>(null);

/** Hover and focus inspections wait while an explicit corner edit owns the overlay. */
export function inspectConstraint(store: ConstraintInspectionStore, next: Exclude<ConstraintInspection, { target: 'corner' }>): void {
  const held = store.get();
  if (held?.target !== 'corner' || held.owner !== next.owner) store.set(next);
}

export function clearConstraintInspection(store: ConstraintInspectionStore, owner: SketchState | null): boolean {
  const current = store.get();
  if (current?.owner !== owner) return false;
  store.set(null);
  return true;
}

/** A dimension draft stays open while focus moves between its editor and constraint inspection. */
export function keepsDimensionDraft(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[data-sketch-dimension-focus]');
}

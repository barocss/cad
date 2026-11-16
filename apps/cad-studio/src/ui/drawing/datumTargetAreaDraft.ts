import type { DrawingDatumTarget } from '@barocss/cad-model/drawing/datumTargets';
import type { DatumTargetDraft } from './DatumTargetsEditor';

/** A new area uses the latest editable size, keeping its picked centre and identity. */
export function withDatumTargetAreaDraft(target: DrawingDatumTarget, draft: DatumTargetDraft): DrawingDatumTarget {
  if (target.kind !== 'area' || draft.kind !== 'area') return target;
  const number = (text: string) => text.trim() ? Number(text) : NaN;
  const area = draft.shape === 'circle'
    ? { shape: 'circle' as const, at: target.area.at, d: number(draft.d) }
    : { shape: 'rect' as const, at: target.area.at, w: number(draft.w), h: number(draft.h) };
  return { ...target, area };
}

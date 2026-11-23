import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { StudioNotice } from '../app/studioNotice';
import { duplicateSelection } from './duplicateSelection';
import { rotateSelection, type GroupRotation } from './rotateSelection';
import { translateSelection } from './translateSelection';

/** Apply one action to the selected top-level occurrences. */
export function selectedInstanceActions({
  doc, selected, moveBlocked, canChangeDocument, commitInstances, groundMany, notice,
}: {
  doc: StudioDoc;
  selected: readonly string[];
  moveBlocked: string | null;
  canChangeDocument(): boolean;
  commitInstances(instances: PartInstance[], selection?: string[]): boolean;
  groundMany(ids: readonly string[], on: boolean): string | null;
  notice(value: StudioNotice): void;
}) {
  const canMove = () => !moveBlocked && canChangeDocument();
  const refuse = (title: string, hint: string) => {
    notice({ title, hint, detail: 'Nothing was changed.' });
    return false;
  };
  const commitPlacement = (result: ReturnType<typeof translateSelection>, refusalTitle: string) => {
    if (result.error !== undefined) return refuse(refusalTitle, result.error);
    if (!result.instances.some((item, index) => item !== doc.instances?.[index])) return true;
    return commitInstances(result.instances);
  };

  return {
    onTranslate: (delta: readonly number[]) => canMove()
      && commitPlacement(translateSelection(doc, selected, delta), 'Selected parts not moved'),
    onRotate: (value: GroupRotation) => canMove()
      && commitPlacement(rotateSelection(doc, selected, value), 'Selected parts not rotated'),
    onDuplicate: (delta: readonly number[]) => {
      if (!canMove()) return false;
      const result = duplicateSelection(doc, selected, delta);
      if (result.error !== undefined) return refuse('Selected parts not duplicated', result.error);
      return commitInstances(result.instances, result.ids);
    },
    onGround: (on: boolean) => {
      if (!canChangeDocument()) return;
      const error = groundMany(selected, on);
      if (error) notice({ title: 'Selected parts not changed', hint: error, detail: '' });
    },
  };
}

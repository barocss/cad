import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Selection } from '@barocss/cad-model/app/commands';
import { isReferencePlaneEdit } from '@barocss/cad-model/app/offsetPlanePick';
import { isExtrudeToFace } from '@barocss/cad-model/app/extrudeEndFacePick';
import { REVOLVE_AXIS_EDIT } from '@barocss/cad-model/app/revolveAxisEdit';
import { SWEEP_CURVE, retargetSweep } from '@barocss/cad-model/app/profileCommands';
import type { ValueStore } from '../state/valueStore';
import type { Active } from './commandState';
import type { StudioNotice } from './studioNotice';
import { refuseOffsetPlanePick } from './offsetPlanePickFeedback';
import { sourceExtrudeEndFace, type ExtrudeEndHit } from './extrudeEndFace';
import { originalTransformFace } from './transformFacePick';
import { sourceRevolveAxis, type RevolveAxisHit } from './revolveAxisPick';

export interface CommandPickScope { bodies: readonly BodyResult[]; hidden: ReadonlySet<number>; preview: boolean }
interface Options {
  model: { doc: StudioDoc; commandDoc: StudioDoc; isCurrent(): boolean; ownsEvaluatedSource(): boolean };
  command: { activeStore: ValueStore<Active | null>; scope: RefObject<CommandPickScope | null>;
    previewFor: RefObject<string | null>; retire(): void; clearQueuedApply(): void };
  selection: { setSelection: Dispatch<SetStateAction<Selection>>; setDirectSel: Dispatch<SetStateAction<string[]>> };
  onNotice: Dispatch<SetStateAction<StudioNotice | null>>;
}
/** Reference picks operate on the captured render's source, never on generated preview faces. */
export function createCommandReferencePicking({ model, command, selection, onNotice: setToast }: Options) {
  const { doc, commandDoc, isCurrent, ownsEvaluatedSource } = model;
  const { activeStore, scope: commandPickScope, previewFor, retire, clearQueuedApply } = command;
  const setActive = activeStore.set;
  const { setSelection, setDirectSel } = selection;
  const pickCommandReferenceFace = (hit: ExtrudeEndHit, blocked: boolean): boolean => {
    const current = activeStore.get();
    if (!current) return false;
    const planeEdit = isReferencePlaneEdit(current.cmd.id, current.values);
    if (!planeEdit && !isExtrudeToFace(current.cmd.id, current.values)) return false;
    clearQueuedApply();
    if (!isCurrent() || current.ctx.doc !== commandDoc) {
      retire();
      setActive(null);
      return true;
    }
    const scope = commandPickScope.current;
    const face = !blocked && scope && hit.face && !scope.hidden.has(hit.face.body)
      ? sourceExtrudeEndFace(current, scope.bodies, hit) : null;
    const picked = face && current.cmd.onPick?.(current.ctx, current.values, { face, edge: null });
    if (!picked || typeof picked.error === 'string') {
      const hint = typeof picked?.error === 'string' ? picked.error : 'Pick one original planar face of a current solid.';
      if (planeEdit) {
        retire();
        setActive(active => active === current ? refuseOffsetPlanePick(active, hint) : active);
      } else setToast({ title: 'End face not selected', hint, detail: '' });
      return true;
    }
    retire();
    setActive({ ...current, values: picked, preview: 'busy', error: undefined, offsetPlanePickIssue: undefined });
    return true;
  };
  const pickTransformFace = (hit: ExtrudeEndHit, blocked: boolean): boolean => {
    const current = activeStore.get();
    if (!current || !['split', 'align', 'mirror'].includes(current.cmd.id)) return false;
    const split = current.cmd.id === 'split', mirror = current.cmd.id === 'mirror';
    if (!split && !mirror && !current.ctx.selection.faces.length) return true;
    if (!hit.face && !hit.edge && !hit.vertex && !hit.instance && !hit.direct) return true;
    clearQueuedApply();
    if (current.ctx.doc !== commandDoc || !ownsEvaluatedSource()) {
      retire();
      setActive(null);
      return true;
    }
    const scope = commandPickScope.current;
    const face = !blocked && scope && hit.face && !scope.hidden.has(hit.face.body)
      ? originalTransformFace(current.ctx, doc, scope.bodies, hit, split || mirror) : null;
    const picked = face && current.cmd.onPick?.(current.ctx, current.values, { face, edge: null });
    if (!picked || typeof picked.error === 'string') {
      const hint = typeof picked?.error === 'string' ? picked.error
        : mirror ? (current.values.pickPlane === 'yes' ? 'Click an original planar face normal to X, Y or Z, not an edge or vertex. Cancel plane pick restores the previous preview.' : 'Use Pick plane and click an original planar face normal to X, Y or Z.')
        : split ? 'Pick an original planar face normal to X, Y or Z. For a tilted plane, choose Any direction and enter its Normal X/Y/Z and At values.' : 'Pick an original planar face on another body.';
      setToast({ title: `${current.cmd.label} ${split || mirror ? 'plane' : 'target'} not selected`, hint, detail: '', inputPick: current.cmd });
      return true;
    }
    setToast(notice => notice?.inputPick === current.cmd ? null : notice);
    retire();
    setActive({ ...current, values: mirror ? { ...picked, pickPlane: '' } : picked, preview: 'busy', error: undefined });
    return true;
  };
  const pickRevolveAxis = (hit: RevolveAxisHit, blocked: boolean): boolean => {
    const current = activeStore.get();
    if (current?.cmd.id !== 'revolve' && current?.cmd.id !== REVOLVE_AXIS_EDIT) return false;
    if (!hit.edge && !hit.instance && !hit.direct) return true;
    clearQueuedApply();
    if (!isCurrent() || current.ctx.doc !== commandDoc) {
      retire();
      setActive(null);
      return true;
    }
    const scope = commandPickScope.current;
    const ownsPreview = current.preview === 'ok' && previewFor.current === JSON.stringify(current.values);
    const edge = !blocked && scope && hit.edge && !scope.hidden.has(hit.edge.body)
      ? sourceRevolveAxis(current, scope.bodies, hit, ownsPreview, scope.preview) : null;
    const picked = edge && current.cmd.onPick?.(current.ctx, current.values, { face: null, edge });
    if (!picked || typeof picked.error === 'string') {
      setToast({ title: 'Axis not selected', hint: typeof picked?.error === 'string' ? picked.error : 'Pick one original straight edge in the sketch plane.', detail: '', inputPick: current.cmd });
      return true;
    }
    setToast(notice => notice?.inputPick === current.cmd ? null : notice);
    retire();
    setActive({ ...current, values: picked, preview: 'busy', error: undefined });
    return true;
  };
  const retargetActiveSweep = (input: { profile: number } | { path: string }): boolean => {
    const current = activeStore.get();
    if (current?.cmd.id !== SWEEP_CURVE) return false;
    clearQueuedApply();
    if (current.ctx.doc !== commandDoc || !ownsEvaluatedSource()) {
      retire(); setActive(null);
      return true;
    }
    const next = retargetSweep(current.ctx, input);
    if ('error' in next) {
      setToast({ title: 'Sweep input not changed', hint: next.error, detail: '', inputPick: current.cmd });
      return true;
    }
    setToast(notice => notice?.inputPick === current.cmd ? null : notice);
    const { op, ...inputs } = current.values;
    const operation = current.cmd.fields?.(next, current.values).some(field => field.key === 'op');
    const values = operation ? { ...inputs, op: op ?? 'new' } : inputs;
    retire();
    setSelection(next.selection);
    setDirectSel(next.direct ?? []);
    setActive({ ...current, ctx: next, values, preview: 'busy', error: undefined });
    return true;
  };
  return { pickCommandReferenceFace, pickTransformFace, pickRevolveAxis, retargetActiveSweep };
}

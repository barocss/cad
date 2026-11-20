import type { Dispatch, SetStateAction } from 'react';
import { patchValues, type Values } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { isExtrudeToFace } from '@barocss/cad-model/app/extrudeEndFacePick';
import { isReferencePlaneEdit } from '@barocss/cad-model/app/offsetPlanePick';
import { REVOLVE_AXIS_EDIT } from '@barocss/cad-model/app/revolveAxisEdit';
import { SWEEP_CURVE } from '@barocss/cad-model/app/profileCommands';
import { OFFSET_FACE_EDIT } from '@barocss/cad-model/app/offsetFaceEdit';
import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';
import type { ValueStore } from '../state/valueStore';
import { extrudeJoinContext, type Active } from './commandState';
import { currentExtrudeJoin } from '@barocss/cad-model/app/profileCommands';
import type { StudioNotice } from './studioNotice';
import { SHARED_HOLE_LAYOUT_EDIT } from './sharedHoleLayout';
import { filletApplyCurrent } from './filletFamily';
import { filletSectionNumberProblem } from './featureNumberInput';
import { hasFilletInteriorProblem } from './filletInteriorInput';
import { canUseHolePresets } from './holePresets';

interface Options {
  commandDoc: StudioDoc;
  activeStore: ValueStore<Active | null>;
  preview: { retire(): void; typed(): void; publishValues(values: Values): void };
  pending: { clearApply(): void; clearRepeat(): void };
  canChangeDocument(): boolean;
  apply(): void;
  onNotice: Dispatch<SetStateAction<StudioNotice | null>>;
}
/** HUD event admission only: preview/queued actions are retired before command input changes. */
export function createCommandHudActions({ commandDoc, activeStore, preview, pending,
  canChangeDocument, apply, onNotice: setToast }: Options) {
  const setActive = activeStore.set;
  const { retire, typed, publishValues } = preview;
  const { clearApply, clearRepeat } = pending;
  const applyHoleOptions = (owner: Active, patch: Values) => {
    const current = activeStore.get();
    if (!current || current.cmd !== owner.cmd || current.ctx !== owner.ctx || current.ctx.doc !== commandDoc ||
        current.cmd.id !== 'hole' || !canUseHolePresets(current.values) || !canChangeDocument()) return false;
    clearApply();
    retire();
    const values = patchValues(current.cmd, current.ctx, current.values, patch);
    publishValues(values);
    setActive({ ...current, values, preview: 'busy', error: undefined });
    return true;
  };
  // The HUD subscribes to values it edits without a parent render.
  const changeHudValue = (key: string, value: number | string, owner?: Active) => {
    const current = activeStore.get();
    if (!current) return;
    if (current.independentExtrude && key === 'op') {
      if (!owner || current.cmd !== owner.cmd || current.ctx !== owner.ctx || current.values !== owner.values
        || !current.independentExtrude.ownsModel()) return;
      const target = currentExtrudeJoin(extrudeJoinContext(current), current.values);
      if (value !== 'new' && (!target || value !== `join:${target.targetKey}`)) return;
      clearApply();
      clearRepeat();
    }
    if ((current.cmd.id === 'mirror' && key === 'pickPlane') || (current.cmd.id === 'split' && ['axis', 'nx', 'ny', 'nz', 'at'].includes(key))) setToast(notice => notice?.inputPick === current.cmd ? null : notice);
    if (key === 'offsetMode' || current.cmd.id === 'split' || (current.cmd.id === 'mirror' && key === 'pickPlane')
      || (current.cmd.id === 'extrude' && (key === 'region'
      || (key === 'depth' && (isExtrudeToFace(current.cmd.id, current.values) || value === 'to-face'))))) {
      clearApply();
      clearRepeat();
      retire();
    }
    typed();
    const values = patchValues(current.cmd, current.ctx, current.values, { [key]: value });
    if (hasFilletInteriorProblem({ ...current, values }) || filletSectionNumberProblem({ ...current, values })) { clearApply(); clearRepeat(); }
    publishValues(values);
    setActive({ ...current, values, preview: current.upload === 'error' ? 'error' : 'busy' });
  };
  const applyHud = (owner: Active) => {
    const current = activeStore.get();
    if (!current || !filletApplyCurrent(owner, current)) return;
    if ((owner.independentExtrude || current.independentExtrude) &&
      (owner.cmd !== current.cmd || owner.ctx !== current.ctx || owner.values !== current.values)) return;
    if (owner !== current && (owner.ownsSource || current.ownsSource || owner.cmd.id === 'mirror' || current.cmd.id === 'mirror' || owner.cmd.id === REVOLVE_AXIS_EDIT || current.cmd.id === REVOLVE_AXIS_EDIT
      || owner.cmd.id === SWEEP_CURVE || current.cmd.id === SWEEP_CURVE
      || owner.cmd.id === OFFSET_FACE_EDIT || current.cmd.id === OFFSET_FACE_EDIT
      || owner.cmd.id === DRAFT_EDIT || current.cmd.id === DRAFT_EDIT
      || owner.cmd.id === SHARED_HOLE_LAYOUT_EDIT || current.cmd.id === SHARED_HOLE_LAYOUT_EDIT
      || isExtrudeToFace(owner.cmd.id, owner.values) || isExtrudeToFace(current.cmd.id, current.values)
      || isReferencePlaneEdit(owner.cmd.id, owner.values) || isReferencePlaneEdit(current.cmd.id, current.values)
      || (current.cmd.id === 'extrude' && owner.values.region !== current.values.region))) return;
    apply();
  };
  return { applyHoleOptions, changeHudValue, applyHud };
}

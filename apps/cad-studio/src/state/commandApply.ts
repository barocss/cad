import type { Command, Ctx, Values } from '@barocss/cad-model/app/commands';
import { awaitingExtrudeEndFace, EXTRUDE_END_FACE_EDIT, isExtrudeToFace } from '@barocss/cad-model/app/extrudeEndFacePick';
import { awaitingOffsetPlane, isOffsetToPlane } from '@barocss/cad-model/app/offsetPlanePick';
import { awaitingRevolveAxis, REVOLVE_AXIS_EDIT } from '@barocss/cad-model/app/revolveAxisEdit';
import { SWEEP_CURVE } from '@barocss/cad-model/app/profileCommands';
import { OFFSET_FACE_EDIT } from '@barocss/cad-model/app/offsetFaceEdit';
import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { awaitingMirrorPlane, currentIndependentExtrudePreview, selectedExtrudeJoin, type Active } from '../app/commandState';
import { filletSectionNumberProblem } from '../app/featureNumberInput';
import { hasFilletInteriorProblem } from '../app/filletInteriorInput';
import { SHARED_HOLE_LAYOUT_EDIT } from '../app/sharedHoleLayout';
import type { ValueStore } from './valueStore';

interface ModelScope {
  commandDoc: StudioDoc;
  modelCurrent: boolean;
  bearingRootCurrent: boolean;
  canChangeDocument(): boolean;
}

type ApplyReadiness =
  | { kind: 'skip' }
  | { kind: 'wait' }
  | { kind: 'blocked'; clearRepeat: boolean }
  | { kind: 'retire'; clearRepeat: boolean }
  | { kind: 'source-changed'; hint: string }
  | { kind: 'ready'; preview: Active['independentExtrudePreview'] };

/** Confirm that the current values and model still own the result shown in preview. */
export function commandApplyReadiness(active: Active, scope: ModelScope): ApplyReadiness {
  const { cmd, values, ctx, independentExtrude } = active;
  const { id } = cmd;
  const joining = selectedExtrudeJoin(active);
  if ((independentExtrude && !independentExtrude.ownsModel()) || (joining && !independentExtrude?.joinScope())) {
    return { kind: 'blocked', clearRepeat: true };
  }
  if (!scope.canChangeDocument()) return independentExtrude ? { kind: 'blocked', clearRepeat: true } : { kind: 'skip' };
  if ((active.ownsSource && !active.ownsSource()) || (id === SHARED_HOLE_LAYOUT_EDIT && !cmd.available(ctx).ok)) {
    return { kind: 'retire', clearRepeat: true };
  }
  const toFace = isExtrudeToFace(id, values) || isOffsetToPlane(id, values);
  const region = id === 'extrude' && values.region !== undefined && values.region !== 'all';
  const replaceAxis = id === REVOLVE_AXIS_EDIT;
  const sweep = id === SWEEP_CURVE;
  const needsCurrentModel = active.fillet || toFace || region || replaceAxis || sweep
    || ['split', 'align', 'mirror', OFFSET_FACE_EDIT, DRAFT_EDIT].includes(id);
  if (needsCurrentModel && (ctx.doc !== scope.commandDoc || !scope.modelCurrent)) {
    return { kind: 'retire', clearRepeat: false };
  }
  if (['thicken', 'sew', 'offset-face'].includes(id) && ctx.doc !== scope.commandDoc) {
    return { kind: 'source-changed', hint: id === 'offset-face' ? 'Start Offset face again on the current body and face.' : `Start ${cmd.label} again to copy the current surfaces.` };
  }
  if (active.upload || !scope.bearingRootCurrent) return { kind: 'blocked', clearRepeat: false };
  if (awaitingExtrudeEndFace(id, values) || awaitingOffsetPlane(id, values) || awaitingRevolveAxis(id, values) || awaitingMirrorPlane(id, values)
    || hasFilletInteriorProblem(active) || filletSectionNumberProblem(active)) return { kind: 'blocked', clearRepeat: true };
  if (active.preview === 'busy') return { kind: 'wait' };
  const preview = currentIndependentExtrudePreview(active);
  if (active.preview !== 'ok' || ((independentExtrude || joining) && !preview)) {
    return { kind: 'blocked', clearRepeat: !!independentExtrude || toFace || replaceAxis || sweep };
  }
  return { kind: 'ready', preview };
}

export function createCommandApplyQueue() {
  let pending: { cmd: Command; ctx: Ctx; values?: Values } | null = null;
  // Shift-Enter restarts after the accepted result reaches the model.
  let repeat: Command | null = null;
  const clearApply = () => { pending = null; };
  const clearRepeat = () => { repeat = null; };
  return {
    requestApply(active: Active) {
      pending = { cmd: active.cmd, ctx: active.ctx, ...(active.independentExtrude ? { values: active.values } : {}) };
    },
    requestRepeat(cmd: Command) {
      if (!['edit', EXTRUDE_END_FACE_EDIT, REVOLVE_AXIS_EDIT, OFFSET_FACE_EDIT, DRAFT_EDIT, SHARED_HOLE_LAYOUT_EDIT].includes(cmd.id)) repeat = cmd;
    },
    takeRepeat() { const cmd = repeat; clearRepeat(); return cmd; },
    clearApply,
    clearRepeat,
    clear() { clearApply(); clearRepeat(); },
    watch(activeStore: ValueStore<Active | null>, apply: () => void) {
      const check = () => {
        const active = activeStore.get();
        if (!pending) return;
        if (pending.cmd !== active?.cmd || (pending.values && (pending.ctx !== active.ctx || pending.values !== active.values))) {
          if (pending.values) clearRepeat();
          clearApply();
        } else if (active.preview === 'error') apply();
      };
      check();
      // An accepted preview is read after its bodies have rendered.
      if (pending && activeStore.get()?.preview === 'ok') apply();
      return activeStore.subscribe(check);
    },
  };
}

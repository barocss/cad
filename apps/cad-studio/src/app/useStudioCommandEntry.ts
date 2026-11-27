import { useCallback, useRef, type RefObject } from 'react';
import { ATTACHED_RIB, ribAttachment } from '@barocss/cad-model/app/attachedRibCommand';
import { bodyName } from '@barocss/cad-model/app/bodies';
import type { Values } from '@barocss/cad-model/app/commands';
import { extrudeProfile, isIndependentExtrudeJoinProfile } from '@barocss/cad-model/app/profileCommands';
import { pickedSketches, planeOf } from '@barocss/cad-model/app/profiles';
import type { SketchNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { OpenScope } from '../state/openOwnership';
import { offsetFaceLaunchView } from '../viewport/offsetFaceLaunchView';
import type { ViewportHandle } from '../viewport/Viewport';
import { commandLaunchContext } from './commandLaunchContext';
import type { Active } from './commandState';
import { newFilletActive, type FilletType } from './filletFamily';
import { LINKED_INSET_EXTRUDE } from './roundedInsetCommand';

export function useStudioCommandEntry(openIntent: RefObject<OpenScope>, readActive: () => Active | null,
  restoreEditorFocusAfterClose: (button: HTMLElement | null) => void) {
  const extrudeOpener = useRef<HTMLElement | null>(null);
  const holeOpener = useRef<HTMLElement | null>(null);
  const rememberOpener = useCallback((id: string) => {
    if (id !== 'extrude' && id !== 'hole') return;
    const focused = document.activeElement;
    if (id === 'extrude') {
      extrudeOpener.current = focused instanceof HTMLElement && focused.matches('button')
        && !!focused.closest('nav[aria-label="Tools"], [aria-label="Browser"], .history') ? focused : null;
    } else {
      holeOpener.current = focused instanceof HTMLElement && focused.closest('nav[aria-label="Tools"]') ? focused : null;
    }
  }, []);
  const holeCloseFocus = useCallback((active: Active | null) => {
    if (active?.cmd.id !== 'hole' || !document.activeElement?.closest('.hud')) return;
    const opener = holeOpener.current;
    const scope = openIntent.current;
    requestAnimationFrame(() => {
      if (openIntent.current !== scope || readActive() || document.activeElement !== document.body) return;
      const fallback = document.querySelector<HTMLElement>('[data-workspace-mode] button:first-child');
      const target = opener?.isConnected && !opener.closest('[hidden]') ? opener : fallback;
      target?.focus();
    });
  }, [openIntent, readActive]);
  const restoreOpener = useCallback((active: Active | null) => {
    holeCloseFocus(active);
    if (active?.cmd.id === 'extrude' && document.activeElement?.closest('.hud')) {
      restoreEditorFocusAfterClose(extrudeOpener.current);
    }
  }, [holeCloseFocus, restoreEditorFocusAfterClose]);
  return { rememberOpener, restoreOpener, holeCloseFocus };
}

interface StudioFeatureEntry {
  launch: Parameters<typeof commandLaunchContext>[0];
  evaluated: StudioDoc;
  viewport: RefObject<ViewportHandle | null>;
  initial?: Values;
  rememberOpener(id: string): void;
  family: FilletType | null;
  prepareFillet(): void;
  join: { available: boolean; captureOwner(): () => boolean; readScope(): object | null };
}

/** Prepare a field command after the dispatcher admits its source and workspace. */
export function prepareStudioFeatureCommand({ launch, evaluated, viewport, initial, rememberOpener, family,
  prepareFillet, join }: StudioFeatureEntry): Active {
  const { command: cmd, ctx, doc, selection } = launch;
  // Turn a head-on profile to show the direction of the pull.
  if (cmd === ATTACHED_RIB || cmd === LINKED_INSET_EXTRUDE || ['extrude', 'revolve', 'pipe', 'loft'].includes(cmd.id)) {
    const [i] = pickedSketches(evaluated.nodes, selection.sketches), face = cmd.id === 'extrude' ? extrudeProfile(ctx) : null;
    const normal = cmd === ATTACHED_RIB ? ribAttachment(ctx)?.attachment.d
      : face ? planeOf(face.node).normal : i !== undefined ? planeOf(evaluated.nodes[i] as SketchNode).normal : null;
    const camera = viewport.current?.camera;
    if (normal && camera) {
      const forward = camera.basis().forward;
      const alignment = forward[0] * normal[0] + forward[1] * normal[1] + forward[2] * normal[2];
      if (Math.abs(alignment) > 0.95) viewport.current?.setView(cmd === ATTACHED_RIB && normal[2] < 0 ? 'iso-bottom' : 'iso');
    }
  }
  const startCtx = commandLaunchContext(launch);
  rememberOpener(cmd.id);
  if (family) {
    prepareFillet();
    return newFilletActive(family, startCtx, initial);
  }

  const ownsModel = cmd.id === 'extrude' && join.available && isIndependentExtrudeJoinProfile(startCtx)
    ? join.captureOwner() : undefined;
  const values = { ...(cmd.defaults?.(startCtx) ?? {}), ...initial };
  if (cmd.id === 'offset-face' && viewport.current) {
    const view = offsetFaceLaunchView(cmd, startCtx, values, viewport.current.camera.basis().forward);
    if (view) viewport.current.setView(view);
  }
  return {
    cmd, values, preview: 'busy',
    ctx: ownsModel ? { ...startCtx, extrudeJoinLooks: { bodies: doc.bodies, nameOf: body => bodyName(doc, body) } } : { ...startCtx },
    ...(ownsModel ? { independentExtrude: { ownsModel, joinScope: () => ownsModel() ? join.readScope() : null } } : {}),
    ...(cmd.place ? { placing: true } : {}),
  };
}

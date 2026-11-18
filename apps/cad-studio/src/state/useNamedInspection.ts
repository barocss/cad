import { useRef, useState } from 'react';
import type { RenderCamera } from '@barocss/cad-model/engine/render';
import { captureInspectionSignature, currentInspectionSignature, captureNamedInspection, copyInspectionCamera, sameInspectionCamera } from '../app/namedInspection';

type Bodies = Parameters<typeof captureInspectionSignature>[2];
type Signature = NonNullable<ReturnType<typeof captureInspectionSignature>>;
interface SavedView { id: string; name: string; camera: RenderCamera; visibleKeys: readonly string[]; signature: Signature }
export interface InspectionTransaction { token: object; camera: RenderCamera; visibleKeys: readonly string[] | null }
interface State { signature: Signature | null; owner: object; rows: SavedView[]; serial: number; transaction: InspectionTransaction | null; restoreCamera: RenderCamera | null; applied: string | null; active: string | null }
const empty = (owner: object): State => ({ signature: null, owner, rows: [], serial: 0, transaction: null, restoreCamera: null, applied: null, active: null });

/** Session-only review state. The caller consumes camera and visibility as one transaction. */
export function useNamedInspection(input: { owner: object; bodies: Bodies; reason: string | undefined; isCurrent?(): boolean; getCamera(): RenderCamera | null }) {
  const [stored, setStored] = useState<State>(() => empty(input.owner));
  let state = stored;
  if (state.owner !== input.owner || (state.signature && !currentInspectionSignature(state.signature, input.owner, input.owner, input.bodies))) { state = empty(input.owner); setStored(state); }
  else if (input.reason && (state.transaction || state.restoreCamera || state.applied || state.active)) {
    state = { ...state, transaction: null, restoreCamera: null, applied: null, active: null }; setStored(state);
  }
  const live = useRef({ input, state }); live.current = { input, state };
  const current = () => (!live.current.input.isCurrent || live.current.input.isCurrent()) && live.current.input.owner === input.owner && live.current.input.bodies === input.bodies
    && live.current.input.reason === input.reason && live.current.state === state;
  const publish = (next: State) => { live.current = { input: live.current.input, state: next }; setStored(next); };
  return {
    rows: state.rows.map(row => ({ id: row.id, name: row.name, active: state.active === row.id })),
    reason: input.reason, transaction: state.transaction, visibleKeys: state.transaction?.visibleKeys ?? null,
    canCapture: !input.reason && state.rows.length < 2, canRestore: !input.reason && !!state.restoreCamera,
    capture(name: string, keys?: readonly string[]): boolean {
      if (!current() || input.reason || state.rows.length >= 2) return false;
      const camera = copyInspectionCamera(input.getCamera()), signature = captureInspectionSignature(input.owner, input.owner, input.bodies);
      const shown = new Set(input.bodies.filter(body => !body.hidden && (!state.transaction?.visibleKeys || state.transaction.visibleKeys.includes(body.key))).map(body => body.key));
      const visibleKeys = keys ? [...keys] : [...shown];
      if (visibleKeys.some(key => !shown.has(key))) return false;
      const id = `inspection-${state.serial + 1}`, trimmed = name.trim();
      if (!camera || !signature || !trimmed || !captureNamedInspection({ id, name: trimmed, camera, visibleKeys }, signature, input.owner, input.owner, input.bodies)) return false;
      publish({ ...state, signature, serial: state.serial + 1, rows: [...state.rows, { id, name: trimmed, camera, visibleKeys, signature }] }); return true;
    },
    update(id: string): boolean {
      if (!current() || input.reason) return false;
      const row = state.rows.find(row => row.id === id);
      if (!row || !currentInspectionSignature(row.signature, input.owner, input.owner, input.bodies)) return false;
      const camera = copyInspectionCamera(input.getCamera());
      const visibleKeys = input.bodies.filter(body => !body.hidden && (!state.transaction?.visibleKeys || state.transaction.visibleKeys.includes(body.key))).map(body => body.key);
      if (!camera || !captureNamedInspection({ id: row.id, name: row.name, camera, visibleKeys }, row.signature, input.owner, input.owner, input.bodies)) return false;
      // Updating a bookmark never publishes a display transaction or replaces the first Restore camera.
      publish({ ...state, rows: state.rows.map(saved => saved.id === id ? { ...saved, camera, visibleKeys } : saved),
        applied: state.applied === id ? null : state.applied, active: state.applied === id ? null : state.active });
      return true;
    },
    apply(id: string): boolean {
      if (!current() || input.reason) return false;
      const row = state.rows.find(row => row.id === id), before = copyInspectionCamera(input.getCamera());
      if (!row || !before || !currentInspectionSignature(row.signature, input.owner, input.owner, input.bodies)) return false;
      const camera = copyInspectionCamera(row.camera); if (!camera) return false;
      publish({ ...state, restoreCamera: state.restoreCamera ?? before, applied: id, active: null,
        transaction: { token: {}, camera, visibleKeys: [...row.visibleKeys] } }); return true;
    },
    restore(): boolean {
      if (!current() || input.reason || !state.restoreCamera) return false;
      const camera = copyInspectionCamera(state.restoreCamera); if (!camera) return false;
      publish({ ...state, restoreCamera: null, applied: null, active: null, transaction: { token: {}, camera, visibleKeys: null } }); return true;
    },
    remove(id: string): void {
      if (!current() || !state.rows.some(row => row.id === id)) return;
      // Removing a bookmark never moves the user's camera or silently restores visibility.
      publish({ ...state, rows: state.rows.filter(row => row.id !== id), applied: state.applied === id ? null : state.applied, active: state.active === id ? null : state.active });
    },
    observeCamera(camera: RenderCamera): void {
      if (!current() || input.reason) return;
      const row = state.rows.find(row => row.id === state.applied);
      const active = row && sameInspectionCamera(row.camera, camera) ? row.id : null;
      if (active !== state.active) publish({ ...state, active });
    },
  };
}

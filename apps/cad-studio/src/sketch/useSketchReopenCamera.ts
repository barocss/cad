import { useState } from 'react';
export const SKETCH_REOPEN_FRAME_KEY = 'studio.sketch-reopen-frame';
export const parseSketchReopenFrame = (value: string | null): boolean => value !== 'off';
export function readSketchReopenFrame(storage: () => Pick<Storage, 'getItem'>): { enabled: boolean; persistent: boolean } {
  try { return { enabled: parseSketchReopenFrame(storage().getItem(SKETCH_REOPEN_FRAME_KEY)), persistent: true }; }
  catch { return { enabled: true, persistent: false }; }
}
export function writeSketchReopenFrame(storage: () => Pick<Storage, 'setItem'>, enabled: boolean): boolean {
  try { storage().setItem(SKETCH_REOPEN_FRAME_KEY, enabled ? 'on' : 'off'); return true; }
  catch { return false; }
}
const browserStorage = () => window.localStorage;
/** UI preference only; never serialized in the model or undo history. */
export function useSketchReopenCamera() {
  const [state, setState] = useState(() => readSketchReopenFrame(browserStorage));
  return { ...state, set(enabled: boolean) { setState({ enabled, persistent: writeSketchReopenFrame(browserStorage, enabled) }); } };
}

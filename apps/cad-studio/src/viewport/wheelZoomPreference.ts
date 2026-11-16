import { useState } from 'react';

export const REVERSE_WHEEL_ZOOM_KEY = 'studio.reverse-wheel-zoom';
export const parseReverseWheelZoom = (value: string | null): boolean => value === 'on';
export function readWheelZoomPreference(storage: () => Pick<Storage, 'getItem'>) {
  try { return { enabled: parseReverseWheelZoom(storage().getItem(REVERSE_WHEEL_ZOOM_KEY)), persistent: true }; }
  catch { return { enabled: false, persistent: false }; }
}
export function writeWheelZoomPreference(storage: () => Pick<Storage, 'setItem'>, enabled: boolean): boolean {
  try { storage().setItem(REVERSE_WHEEL_ZOOM_KEY, enabled ? 'on' : 'off'); return true; }
  catch { return false; }
}
const browserStorage = () => window.localStorage;
/** Origin-local navigation preference, never part of a document or its history. */
export function useWheelZoomPreference() {
  const [state, setState] = useState(() => readWheelZoomPreference(browserStorage));
  return { ...state, set(enabled: boolean) { setState({ enabled, persistent: writeWheelZoomPreference(browserStorage, enabled) }); } };
}
/** Modified wheel gestures retain their existing behavior, including trackpad pinch. */
export function wheelZoomFactor(event: { deltaY: number; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }, reverse = false): number {
  const direction = reverse && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey ? -1 : 1;
  return Math.exp(event.deltaY * 0.0015 * direction);
}

/** Keep rendering and manufacturing navigation outside this Model/Sketch preference. */
export const modelWheelZoomAvailable = (rendering: boolean, printing: boolean, printPreview: boolean, camPreview: boolean): boolean => !rendering && !printing && !printPreview && !camPreview;

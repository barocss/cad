import type { DrawingDetail } from '@barocss/cad-model/drawing/detail';
import type { DrawingSettings, XY } from '@barocss/cad-model/drawing/types';

/** Preserve the exact starting placement on a stationary/retraced pointer, before grid rounding. */
export function detailPaperDragAt(initialAt: XY, initialPointer: XY, pointer: XY): XY {
  if (pointer[0] === initialPointer[0] && pointer[1] === initialPointer[1]) return initialAt;
  return [Math.round((initialAt[0] + pointer[0] - initialPointer[0]) * 10) / 10,
    Math.round((initialAt[1] + pointer[1] - initialPointer[1]) * 10) / 10];
}

/** A click is not an authored placement override, including when the detail is automatically placed. */
export function commitDetailPaperDrag(settings: DrawingSettings, original: DrawingDetail, initialAt: XY, at: XY): DrawingSettings {
  if (at[0] === initialAt[0] && at[1] === initialAt[1]) return settings;
  if (!settings.details?.includes(original) || settings.details.filter(d => d.id === original.id).length !== 1) return settings;
  if (original.at?.[0] === at[0] && original.at?.[1] === at[1]) return settings;
  return { ...settings, details: settings.details.map(d => d === original ? { ...d, at } : d) };
}

import type { DrawingFrame } from '@barocss/cad-model/drawing/controls';

/** Standalone and dimension-attached frames share one drawing-wide ID namespace. */
export function nextStandaloneFrameId(all: readonly DrawingFrame[] = []): string | null {
  if (all.length >= 200) return null;
  const ids = new Set(all.map(frame => frame.id));
  let id = 'frame-1', index = 2;
  while (ids.has(id)) id = `frame-${index++}`;
  return id;
}

/** A dimension's controls reserve the same global namespace as standalone frames. */
export function nextAttachedFrameId(dim: string, all: readonly DrawingFrame[] = []): string | null {
  if (all.length >= 200) return null;
  const ids = new Set(all.map(frame => frame.id));
  let id = `control-${dim}`, index = 2;
  while (ids.has(id)) id = `control-${dim}-${index++}`;
  return id;
}

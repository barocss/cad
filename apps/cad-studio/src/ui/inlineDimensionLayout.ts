import type { ScreenBox } from './sketchConstraintMarkLayout';

/** Keep the exact entry text; reserve room for its leading digits instead of rounding it. */
export function inlineDimensionLayout(text: string, arc: boolean, at: readonly [number, number], area: ScreenBox) {
  const controls = arc ? 57 : 0, height = 26;
  const available = Math.max(1, area.width - controls);
  // 12px monospace digits fit within 8px; include padding and borders.
  const inputWidth = Math.min(available, Math.max(84, Math.min(244, text.length * 8 + 20)));
  const width = inputWidth + controls;
  const clamp = (preferred: number, lower: number, upper: number) =>
    Number.isFinite(preferred) ? Math.max(lower, Math.min(upper, preferred)) : lower;
  return { inputWidth, width, height,
    left: clamp(at[0] - inputWidth / 2, area.x, area.x + area.width - width),
    top: clamp(at[1] - height / 2, area.y, area.y + area.height - height) };
}

import { edgeRing } from '@barocss/cad';
import { runOp, slideCageSelection, type CageSession } from '@barocss/cad-model/subd/cageEdit';

/** Every preview starts at the same accepted cage, never at the previous preview. */
export function previewCageLoop(base: CageSession, value: string): { session: CageSession; error: string | null } {
  const t = value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(t) || t <= 0 || t >= 1) return { session: base, error: 'Enter a ratio greater than 0 and less than 1.' };
  try {
    const seed = base.sel.edges[0];
    if (seed) for (const [a, b] of edgeRing(base.cage, ...seed)) {
      const length = Math.hypot(...[0, 1, 2].map(i => base.cage.positions[3 * a + i] - base.cage.positions[3 * b + i]));
      if (!Number.isFinite(length) || length === 0) return { session: base, error: 'The loop crosses a zero-length or invalid edge.' };
    }
    return { session: runOp(base, 'insert-loop', 0.01, t), error: null };
  }
  catch (error) { return { session: base, error: error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error) }; }
}

export function previewCageSlide(base: CageSession, value: string): { session: CageSession; error: string | null } {
  const ratio = value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(ratio) || ratio <= -1 || ratio >= 1) {
    return { session: base, error: 'Enter a ratio greater than −1 and less than 1.' };
  }
  try { return { session: slideCageSelection(base, ratio), error: null }; }
  catch (error) { return { session: base, error: error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error) }; }
}

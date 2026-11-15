import type { PathGapPlan } from './pathGap';

/** `current` has already passed the hook's document/sketch/generation ownership check. */
export function pathGapPreviewDraft<T extends { notice?: string }>(current: T | null, expected: { notice?: string }, plan: PathGapPlan | null): T | null {
  if (!current || current !== expected) return null;
  return plan && current.notice ? { ...current, notice: undefined } : current;
}

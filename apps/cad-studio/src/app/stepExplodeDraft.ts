import { MAX_STEP_EXPLODE } from '@barocss/cad-model/assembly/steps';

/** Presentation scale only; an unfinished field must never become Off. */
export function stepExplodeValue(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= MAX_STEP_EXPLODE ? value : undefined;
}

/** Native files may contain any accepted scale, not only the toolbar presets. */
export function stepExplodeOptions(value: number): number[] {
  return [...new Set([0, 0.5, 1, 2, value])].sort((a, b) => a - b);
}

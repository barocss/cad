import type { Command } from '@barocss/cad-model/app/commands';

export interface PaletteExecutionContext { showingVariant: string | null; fresh: boolean; busy: boolean }
/** Global execution restrictions take precedence over selection advice. No document or selection is changed. */
export function paletteExecutionReason(state: PaletteExecutionContext): string | undefined {
  if (state.showingVariant) return `Showing ${state.showingVariant}: show the master to edit.`;
  if (state.busy) return 'Wait for the computation to finish, or stop it, before starting a command.';
  if (!state.fresh) return 'Fix the model evaluation or undo the last change first.';
  return undefined;
}
export function paletteCommandBlocked(command: Command, state: PaletteExecutionContext): boolean {
  if (state.showingVariant) return true;
  // Assembly steps are a display-only editor; do not invent a geometry restriction for it.
  const needsModel = !!command.build || !!command.action || command.id === 'sketch3d';
  return needsModel && (state.busy || !state.fresh);
}
export function runPaletteSelection(blocked: boolean, available: boolean, run: () => void, focusInput: () => void): void {
  if (blocked || !available) { focusInput(); return; }
  run();
}

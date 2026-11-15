/** Keyboard deletion and its hint share one selection-only admission policy.
 * Pending creation/movement owns Delete without destroying the previous selection.
 */
export interface DrawingDeleteState {
  readonly tool: string;
  readonly pending: boolean;
  readonly drag: boolean;
  readonly reattach: boolean;
  readonly rimChoice: boolean;
  readonly targetChoices: number;
  readonly reselectTarget: boolean;
  readonly hasSelection: boolean;
}
export function drawingCanDeleteSelection(state: DrawingDeleteState): boolean {
  return state.tool === 'select' && state.hasSelection
    && !state.pending && !state.drag && !state.reattach && !state.rimChoice
    && state.targetChoices === 0 && !state.reselectTarget;
}

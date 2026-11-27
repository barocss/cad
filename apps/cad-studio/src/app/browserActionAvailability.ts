export interface BrowserActionConditions {
  readonly currentModel: boolean;
  readonly editing: boolean;
  readonly editingRevealOnly: boolean;
  readonly limitedModelView: boolean;
  readonly limitedRevealView: boolean;
  readonly limitedIsolationView: boolean;
  readonly showingVariant: boolean;
  readonly dragging: boolean;
  dialogPending(): boolean;
}

/** Each action reports its first blocking condition in the order the Browser presents it. */
export function browserActionAvailability(state: BrowserActionConditions) {
  const reveal = !state.currentModel
    ? 'Wait for the current model result before finding the selection.'
    : state.editing || state.editingRevealOnly
      ? 'Finish or cancel the current edit before finding the selection.'
      : state.limitedModelView || state.limitedRevealView
        ? 'Return to the ordinary Model view before finding the selection.'
        : state.dragging
          ? 'Finish the current drag before finding the selection.'
          : state.dialogPending()
            ? 'Finish the current document or dialog operation before finding the selection.' : null;
  const isolation = !state.currentModel || state.showingVariant
    ? 'Wait for the current main Model result.'
    : state.editing || state.limitedModelView || state.limitedIsolationView
      ? 'Finish the current operation and return to ordinary Model view.'
      : state.dragging || state.dialogPending()
        ? 'Finish the current drag or dialog first.' : null;
  return { reveal, isolation };
}

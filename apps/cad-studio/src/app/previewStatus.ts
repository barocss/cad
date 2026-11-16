export function printPreviewSummary(reason: string | undefined, stage: string, error?: string): string {
  if (reason?.includes('Model view')) return 'Print · Model only';
  if (reason?.startsWith('No visible solid mesh')) return 'Print · No solid';
  if (reason) return 'Print · Paused';
  if (error) return 'Print · Failed';
  return stage === 'ready' ? 'Print · Ready' : 'Print · Pending';
}

export function annotationCounts(model: number, sheetOnly: number): string {
  if (!model && !sheetOnly) return 'No annotations yet: dimension the part in the Drawing workspace.';
  return `${model} annotation${model === 1 ? '' : 's'} on the model${sheetOnly ? ` · ${sheetOnly} only on the sheet` : ''}`;
}

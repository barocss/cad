// What the drawing workspace hands up when settings change: the same canonical form Open reads, so an authored
// drawing equals its reopened self as JSON (key order included).
import { readDrawing, type DrawingSettings } from '@barocss/cad-model/drawing/types';
import { forSheet, mergeSheet } from '@barocss/cad-model/drawing/sheets';
import { checkSavedSectionHatch } from '@barocss/cad-model/drawing/savedSectionHatch';
import { assertSectionHatchScope, type DrawingScope } from '@barocss/cad-model/drawing/scope';

export const committedSettings = (next: DrawingSettings, scope: DrawingScope): DrawingSettings => readDrawing({ ...next, scope: next.scope ?? scope });

/** The active sheet after the workspace's merge and canonical commit; also the identity a Fix round waits for. */
export const committedSheetSettings = (whole: DrawingSettings, current: number, next: DrawingSettings, scope: DrawingScope): DrawingSettings =>
  forSheet(committedSettings(mergeSheet(whole, current, next), scope), current);

/** Validate the merged whole drawing before any authored-state callback. Local sheets can omit hidden peers. */
export function commitDrawingSettings(next: DrawingSettings, scope: DrawingScope, commit: (settings: DrawingSettings) => boolean, onRefused: (why: string) => void): boolean {
  const input = { ...next, scope: next.scope ?? scope };
  try { assertSectionHatchScope(input); }
  catch (cause) { onRefused(cause instanceof Error ? cause.message : String(cause)); return false; }
  const issue = checkSavedSectionHatch(input)[0];
  if (issue) { onRefused(issue.message); return false; }
  const canonical = committedSettings(input, scope);
  const finalIssue = checkSavedSectionHatch(canonical)[0];
  if (finalIssue) { onRefused(finalIssue.message); return false; }
  return commit(canonical);
}

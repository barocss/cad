// Admission for explicit selected-body scope only; old permissive drawings are unchanged.
import { refusal, refused } from '../engine/refusal';
import { assertDrawingBodySettings, checkDrawingScope } from './scope';
import { readDrawing } from './types';
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export function assertSavedDrawingBody(doc: Record<string, unknown>): void {
  const raw = doc.drawing;
  if (!record(raw) || !record(raw.scope) || !Object.hasOwn(raw.scope, 'body')) return;
  const [invalid] = checkDrawingScope(raw.scope);
  if (invalid || raw.scope.body === undefined) throw invalid ? refused(invalid) : refusal('DRAWING_SCOPE', 'Selected drawing body must be explicitly defined.');
  // Reject unsupported raw data before permissive readers can discard it.
  for (const key of ['section', 'sections', 'details', 'breaks', 'sheets', 'balloons', 'weldSymbols']) {
    const value = raw[key];
    if (value !== undefined && value !== false && !(Array.isArray(value) && value.length === 0))
      throw refusal('DRAWING_SCOPE', `Selected-body drawings do not support ${key}.`);
  }
  if (raw.tables !== undefined && (!Array.isArray(raw.tables) || raw.tables.some(t => !record(t) || t.from !== undefined)))
    throw refusal('DRAWING_SCOPE', 'Selected-body drawings do not support sourced tables.');
  const settings = readDrawing(raw);
  assertDrawingBodySettings(settings);
}

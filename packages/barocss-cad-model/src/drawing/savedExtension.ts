// Admission for an optional presentation field; existing unmarked drawings are unchanged.
import { problem, type Problem } from '../engine/refusal';
import { checkDrawingScope } from './scope';
import { readDrawing } from './types';

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** A/B are saved reference roles, never screen order or generated mark indexes. */
export function checkSavedExtension(raw: unknown): Problem[] {
  if (!record(raw) || !Array.isArray(raw.dimensions)) return [];
  const flagged = raw.dimensions.filter(d => record(d) && Object.hasOwn(d, 'hideExtension'));
  if (!flagged.length) return [];
  const fail = (why: string) => [problem('DRAWING_OPTIONS', `Dimension extension display: ${why}. Keep the original document; omit hideExtension for both lines.`)];
  if (raw.scope !== undefined) {
    if (checkDrawingScope(raw.scope).length || !record(raw.scope) || raw.scope.kind !== 'part') return fail('only part scope is supported');
  } else if (raw.balloons || (Array.isArray(raw.tables) && raw.tables.some(t => record(t) && t.from === 'bom'))) return fail('assembly scope is not supported');
  const retained = readDrawing({ dimensions: raw.dimensions }).dimensions;
  for (const d of flagged) {
    if (d.hideExtension !== 'a' && d.hideExtension !== 'b') return fail('hideExtension must be a or b');
    if (d.kind !== 'linear' || d.auto !== undefined || !['front', 'top', 'right'].includes(String(d.view))) return fail('only manual linear dimensions in ordinary orthographic views are supported');
    if (typeof d.id !== 'string' || !d.id || raw.dimensions.filter(x => record(x) && x.id === d.id).length !== 1) return fail('the dimension must have a unique nonempty ID');
    if (!retained.some(x => x.id === d.id && x.kind === 'linear' && x.hideExtension === d.hideExtension)) return fail('the reader must preserve the flagged dimension');
    if (!record(d.a) || !record(d.b) || !['horizontal', 'vertical', 'aligned'].includes(String(d.orient))) return fail('two saved reference roles and a supported orientation are required');
  }
  return [];
}

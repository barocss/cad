// Admission for optional foreshortened radius display; existing unmarked drawings are unchanged.
import { problem, type Problem } from '../engine/refusal';
import { foreshortenOk, isOrthographicView } from './foreshorten';
import { checkDrawingScope } from './scope';
import { readDrawing, type DimView } from './types';

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function checkSavedForeshorten(raw: unknown): Problem[] {
  if (!record(raw) || !Array.isArray(raw.dimensions)) return [];
  const flagged = raw.dimensions.filter(d => record(d) && Object.hasOwn(d, 'foreshorten'));
  if (!flagged.length) return [];
  const fail = (why: string) => [problem('DRAWING_OPTIONS', `Foreshortened radius display: ${why}. Keep the original document; omit foreshorten for an ordinary radius.`)];
  if (raw.scope !== undefined) {
    if (checkDrawingScope(raw.scope).length || !record(raw.scope) || raw.scope.kind !== 'part') return fail('only part scope is supported');
  } else if (raw.balloons || (Array.isArray(raw.tables) && raw.tables.some(t => record(t) && t.from === 'bom'))) {
    return fail('assembly scope is not supported');
  }
  const retained = readDrawing({ dimensions: raw.dimensions }).dimensions;
  for (const d of flagged) {
    if (!foreshortenOk(d.foreshorten)) return fail('foreshorten must be { origin: [x, y] } with finite coordinates');
    if (d.kind !== 'radius' || d.auto !== undefined || !isOrthographicView(String(d.view) as DimView)) {
      return fail('only manual radius dimensions in ordinary orthographic views are supported');
    }
    if (typeof d.id !== 'string' || !d.id || raw.dimensions.filter(x => record(x) && x.id === d.id).length !== 1) {
      return fail('the dimension must have a unique nonempty ID');
    }
    if (typeof d.edge !== 'string' || !d.edge || !Array.isArray(d.near) || d.near.length !== 3) {
      return fail('a saved circular edge reference is required');
    }
    if (!retained.some(x => x.id === d.id && x.kind === 'radius' && !!x.foreshorten)) {
      return fail('the reader must preserve the foreshortened radius dimension');
    }
  }
  return [];
}

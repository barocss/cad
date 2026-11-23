import { problem, type Problem } from '../engine/refusal';
import { checkDrawingScope } from './scope';
import { readDrawing } from './types';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const edgeRef = (value: unknown) => record(value) && typeof value.edge === 'string' && !!value.edge
  && Array.isArray(value.near) && value.near.length === 3 && value.near.every(value => typeof value === 'number' && Number.isFinite(value));

/** Validate only the new opt-in field before saved drawing readers can discard malformed input. */
export function checkSavedReflexAngle(raw: unknown): Problem[] {
  if (!record(raw) || !Array.isArray(raw.dimensions)) return [];
  const flagged = raw.dimensions.filter((dimension: unknown): dimension is Record<string, unknown> => record(dimension) && Object.hasOwn(dimension, 'mode'));
  if (!flagged.length) return [];
  const fail = (why: string) => [problem('DRAWING_OPTIONS', `Reflex angle: ${why}. Keep the original document; omit mode for ordinary angles.`)];
  if (raw.scope !== undefined) {
    if (checkDrawingScope(raw.scope).length || !record(raw.scope) || raw.scope.kind !== 'part') return fail('only part scope is supported');
  } else if (raw.balloons || Array.isArray(raw.tables) && raw.tables.some(table => record(table) && table.from === 'bom')) return fail('assembly scope is not supported');
  if (Array.isArray(raw.breaks) && raw.breaks.some(value => record(value) && (value.axis === 'x' || value.axis === 'y')))
    return fail('broken Top views are not supported');
  const retained = readDrawing({ dimensions: raw.dimensions }).dimensions;
  for (const dimension of flagged) {
    if (dimension.mode !== 'reflex') return fail('mode must be reflex');
    if (dimension.kind !== 'angle' || dimension.view !== 'top' || dimension.auto !== undefined) return fail('only manual angles in the ordinary Top view are supported');
    if (typeof dimension.id !== 'string' || !dimension.id || raw.dimensions.filter(other => record(other) && other.id === dimension.id).length !== 1)
      return fail('the dimension needs a unique nonempty ID');
    if (!edgeRef(dimension.a) || !edgeRef(dimension.b)) return fail('two finite linked edge references are required');
    if (!Array.isArray(dimension.place) || dimension.place.length !== 2 || dimension.place.some(value => typeof value !== 'number' || !Number.isFinite(value)))
      return fail('the label needs a finite Top position');
    if (!retained.some(other => other.id === dimension.id && other.kind === 'angle' && other.mode === 'reflex')) return fail('the reader must preserve the marked angle');
  }
  return [];
}

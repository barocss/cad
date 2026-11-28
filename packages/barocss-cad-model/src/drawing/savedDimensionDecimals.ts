import { problem, type Problem } from '../engine/refusal';
import { isObj } from '../util/guards';
import { manualDecimalDimension, precisionOk } from './types';

/** Validate the authored presentation field before readDrawing can discard it. */
export function checkSavedDimensionDecimals(raw: unknown): Problem[] {
  if (!isObj(raw) || !Array.isArray(raw.dimensions)) return [];
  const flagged = raw.dimensions.filter(dim => isObj(dim) && Object.hasOwn(dim, 'displayDecimals'));
  for (const dim of flagged) {
    if (!precisionOk(dim.displayDecimals) || !manualDecimalDimension(dim) || typeof dim.id !== 'string' || !dim.id
      || raw.dimensions.filter(other => isObj(other) && other.id === dim.id).length !== 1) {
      return [problem('DRAWING_OPTIONS', 'Display decimals require a unique ordinary manual linear or angle dimension and an integer from 0 to 6.')];
    }
  }
  return [];
}

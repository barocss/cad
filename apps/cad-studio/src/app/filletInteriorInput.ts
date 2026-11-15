import type { ModelNode } from '@barocss/cad-model/engine/doc';
import type { Active } from './commandState';

export type FilletInteriorKey = 'stationAt' | 'station2At';
export type FilletInteriorProblems = Partial<Record<FilletInteriorKey, string>>;
// Mirror commands.ts and native part-finish.ts. Compare fractions, not a
// percentage difference: binary64 division and subtraction do not commute.
const MARGIN = 1e-9;
const keys: FilletInteriorKey[] = ['stationAt', 'station2At'];
function problems(fractions: readonly number[]): FilletInteriorProblems {
  const out: FilletInteriorProblems = {};
  fractions.forEach((fraction, index) => {
    if (!(Number.isFinite(fraction) && fraction > MARGIN && fraction < 1 - MARGIN)) {
      const label = `interior position${fractions.length === 2 ? ` ${index + 1}` : ''}`;
      out[keys[index]] = fraction > 0 && fraction < 1
        ? `Move ${label} farther from the edge endpoint.`
        : `Set ${label} above 0% and below 100%.`;
    }
  });
  if (fractions.length === 2 && !Object.keys(out).length && fractions[1] - fractions[0] <= MARGIN)
    out.station2At = fractions[1] <= fractions[0]
      ? 'Set interior position 2 after interior position 1.'
      : 'Separate interior position 2 farther from interior position 1.';
  return out;
}
const fractionOf = (percent: string | number | undefined) => percent === undefined || String(percent).trim() === '' ? NaN : Number(percent) / 100;

/** Only controls shown for this creation mode participate. Hidden drafts stay local. */
export function filletInteriorProblems(active: Pick<Active, 'cmd' | 'values' | 'fillet'>): FilletInteriorProblems {
  if (active.cmd.id !== 'fillet' || active.fillet?.radiusMode === 'constant') return {};
  const mode = active.values.stationMode;
  if (mode !== 'interior' && mode !== 'two-interior') return {};
  return problems((mode === 'two-interior' ? keys : keys.slice(0, 1)).map(key => fractionOf(active.values[key])));
}
export function hasFilletInteriorProblem(active: Pick<Active, 'cmd' | 'values' | 'fillet'>): boolean {
  return Object.keys(filletInteriorProblems(active)).length > 0;
}

/** Unedited fractions are native data: never round-trip them through the UI's percentage. */
export function historyFilletInteriorProblems(node: ModelNode | undefined, typed: Readonly<Record<string, string>> = {}): FilletInteriorProblems {
  if (node?.kind !== 'fillet' || !node.radii) return {};
  const interior = node.radii.slice(1, -1);
  if ((interior.length !== 1 && interior.length !== 2) || interior.some(point => point.fraction === undefined)) return {};
  return problems(interior.map((point, index) => typed[keys[index]] === undefined ? point.fraction! : fractionOf(typed[keys[index]])));
}

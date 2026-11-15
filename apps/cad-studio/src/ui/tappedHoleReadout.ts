import type { StudioFastenerSizeRow } from '@barocss/cad-model/engine/fastenerSizeRows';
type Row = Pick<StudioFastenerSizeRow, 'id' | 'pitch' | 'tap'>;

/** Compare only a saved designation's exact loaded row, never infer a tap drill. */
export function tappedHoleReadout(thread: string, diameter: string | number | undefined, rows: readonly Row[] = []) {
  const actual = diameter === undefined || String(diameter).trim() === '' ? NaN : Number(diameter);
  const drill = Number.isFinite(actual) ? `Actual drill Ø${actual} mm` : 'Actual drill unavailable: enter a number in Diameter.';
  const matching = rows.filter(row => `${row.id}×${row.pitch}` === thread && Number.isFinite(row.tap) && row.tap > 0);
  if (matching.length !== 1) return { drill, comparison: 'Tap drill comparison unavailable: no unique matching loaded size row.' };
  const tap = matching[0].tap;
  return { drill, comparison: `Loaded row tap drill Ø${tap} mm${Number.isFinite(actual) ? actual === tap ? ' · matches the actual drill.' : ' · differs from the actual drill.' : '.'}` };
}

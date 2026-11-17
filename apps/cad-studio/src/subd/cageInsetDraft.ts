import { insetCageSelection, type CageSession } from '@barocss/cad-model/subd/cageEdit';
export function previewCageInset(base: CageSession, value: string): { session: CageSession; error: string | null } {
  try {
    const distance = value.trim() === '' ? NaN : Number(value);
    return { session: insetCageSelection(base, distance), error: null };
  } catch (error) { return { session: base, error: error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error) }; }
}

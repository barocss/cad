import { selectionCentre, transformCageSelection, type CageSession } from '@barocss/cad-model/subd/cageEdit';
export interface CageTransformInput {
  kind: 'rotate' | 'scale'; axis: 0 | 1 | 2; value: string;
  pivot: 'centre' | 'vertex'; vertex: string;
}
export function previewCageTransform(base: CageSession, input: CageTransformInput): { session: CageSession; error: string | null; pivot: readonly [number, number, number] | null } {
  try {
    const value = input.value.trim() === '' ? NaN : Number(input.value);
    if (!Number.isFinite(value)) throw new Error('Enter a finite value.');
    let pivot = selectionCentre(base);
    if (input.pivot === 'vertex') {
      const v = input.vertex.trim() === '' ? NaN : Number(input.vertex);
      if (!Number.isInteger(v) || v < 0 || v >= base.cage.positions.length / 3) throw new Error('Enter a current cage vertex ID.');
      pivot = base.cage.positions.slice(3 * v, 3 * v + 3) as [number, number, number];
    }
    if (!pivot) throw new Error('Pick cage elements first.');
    const transform = input.kind === 'rotate' ? { kind: 'rotate' as const, axis: input.axis, degrees: value, pivot } : { kind: 'scale' as const, factor: value, pivot };
    return { session: transformCageSelection(base, transform), error: null, pivot };
  } catch (error) { return { session: base, error: error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error), pivot: null }; }
}

import { cageLocalDirection, type CageLocalFrame } from '@barocss/cad-model/subd/cageLocalDirection';
import { selectionCentre, transformCageSelection, type CageSession } from '@barocss/cad-model/subd/cageEdit';
export interface CageTransformInput {
  kind: 'move' | 'rotate' | 'scale'; axis: 0 | 1 | 2; value: string;
  proportional?: boolean; radius?: string;
  frame?: 'world' | CageLocalFrame;
  pivot: 'centre' | 'vertex'; vertex: string;
}
export function previewCageTransform(base: CageSession, input: CageTransformInput): { session: CageSession; error: string | null; pivot: readonly [number, number, number] | null } {
  try {
    const value = input.value.trim() === '' ? NaN : Number(input.value);
    if (!Number.isFinite(value)) throw new Error('Enter a finite value.');
    if (input.kind === 'move' && input.proportional) {
      if (input.frame && input.frame !== 'world') throw new Error('Proportional movement supports world axes only.');
      const radius = input.radius?.trim() ? Number(input.radius) : NaN;
      return { session: transformCageSelection(base, { kind: 'move-proportional', axis: input.axis, distance: value, radius }), error: null, pivot: null };
    }
    if (input.kind === 'move') {
      const transform = !input.frame || input.frame === 'world' ? { kind: 'move' as const, axis: input.axis, distance: value } : { kind: 'move-along' as const, direction: cageLocalDirection(base, input.frame), distance: value };
      return { session: transformCageSelection(base, transform), error: null, pivot: null };
    }
    let pivot = selectionCentre(base);
    if (input.pivot === 'vertex') {
      const v = input.vertex.trim() === '' ? NaN : Number(input.vertex);
      if (!Number.isInteger(v) || v < 0 || v >= base.cage.positions.length / 3) throw new Error('Enter a current cage vertex ID.');
      pivot = base.cage.positions.slice(3 * v, 3 * v + 3) as [number, number, number];
    }
    if (!pivot) throw new Error('Pick cage elements first.');
    const transform = input.kind === 'rotate'
      ? input.frame && input.frame !== 'world'
        ? { kind: 'rotate-along' as const, direction: cageLocalDirection(base, input.frame), degrees: value, pivot }
        : { kind: 'rotate' as const, axis: input.axis, degrees: value, pivot }
      : { kind: 'scale' as const, factor: value, pivot };
    return { session: transformCageSelection(base, transform), error: null, pivot };
  } catch (error) { return { session: base, error: error instanceof Error ? error.message.replace(/^SubD: /, '') : String(error), pivot: null }; }
}

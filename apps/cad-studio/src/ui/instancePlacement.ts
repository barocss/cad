import type { PartInstance } from '@barocss/cad-model/engine/doc';

/** Explicitly restore the assembly-frame origin and orientation, never a pattern-controlled occurrence. */
export function resetInstancePlacement(inst: PartInstance): PartInstance {
  if (inst.pattern || [...inst.position, ...inst.rotation].every(v => v === 0)) return inst;
  return { ...inst, position: [0, 0, 0], rotation: [0, 0, 0] };
}

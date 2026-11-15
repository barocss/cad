import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Reference } from '@barocss/cad-model/engine/schema/references';

export interface ReferenceDisplay { local: ReadonlyMap<string, BodyResult[]>; errors: ReadonlyMap<string, string> }
/** Actual read failures only. Empty successful output is not recast as a failed read. */
export async function readReferenceDisplay(references: readonly Reference[], read: (reference: Reference) => Promise<BodyResult[]>, current: () => boolean, publish: (result: ReferenceDisplay) => void): Promise<void> {
  const local = new Map<string, BodyResult[]>(), errors = new Map<string, string>();
  for (const reference of references) {
    if (!current()) return;
    try { local.set(reference.id, await read(reference)); }
    catch (error) { local.set(reference.id, []); errors.set(reference.id, error instanceof Error ? error.message : String(error)); }
    if (!current()) return;
  }
  if (current()) publish({ local, errors });
}

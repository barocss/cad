import { thickenCommand } from '@barocss/cad-model/app/thickenCommand';

/** Preflight guidance only. Model snapshot/native admission remains authoritative. */
export function directThickenGuidance(object: { trims?: unknown }) {
  // Match thickenSnapshot: malformed metadata must not become an untrimmed surface.
  const blocked = object.trims !== undefined && (!Array.isArray(object.trims) || object.trims.length !== 0);
  return {
    blocked,
    text: `${thickenCommand.hint}.${blocked ? ' Untrim the surface first; Thicken uses its whole support surface. Untrim removes the stored trim loops; it is a separate explicit edit.' : ''}`,
  };
}

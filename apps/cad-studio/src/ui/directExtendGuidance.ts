/** UI preflight only; the engine remains authoritative for Extend admission. */
export function directExtendGuidance(object: { trims?: unknown }) {
  // Match direct.ts requireWholeSurface, including malformed trim metadata.
  const blocked = object.trims !== undefined && (!Array.isArray(object.trims) || object.trims.length > 0);
  return {
    blocked,
    text: 'Extend does not preserve surface trims. Untrim removes the existing trim boundaries as a separate explicit edit; use it only if intended.',
  };
}

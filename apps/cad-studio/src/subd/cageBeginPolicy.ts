/** Re-entering the current cage is not a new edit; another cage requires an approved discard. */
export function cageBeginPolicy(
  node: number,
  target: { readonly kind: string } | null | undefined,
  session: { readonly node: number } | null,
  source: object | null,
  discardCurrent = false,
): 'refuse' | 'keep' | 'begin' {
  if (!Number.isInteger(node) || node < 0 || target?.kind !== 'subd') return 'refuse';
  if (session?.node === node && target === source) return 'keep';
  if (session && !discardCurrent) return 'refuse';
  return 'begin';
}

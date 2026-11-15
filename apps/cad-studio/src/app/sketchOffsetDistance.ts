export const OFFSET_MAGNITUDE_ERROR = 'Enter a positive distance in mm. Choose In or Out for the direction.';
/** UI magnitude only. The native offset API still accepts signed distances. */
export function parseOffsetMagnitude(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
export function offsetRecoveryMessage(message: string): string {
  return /smaller|reduce/i.test(message) ? message : `${message} Reduce Offset distance and try again.`;
}
/** No application callback runs for invalid magnitude text. */
export function applyOffsetMagnitude(raw: string, direction: 'in' | 'out', apply: (signed: number) => string | undefined): string | undefined {
  const value = parseOffsetMagnitude(raw);
  return value === null ? OFFSET_MAGNITUDE_ERROR : apply(direction === 'in' ? -value : value);
}

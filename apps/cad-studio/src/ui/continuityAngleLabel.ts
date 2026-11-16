/** Display precision only. Never use rounded angles to classify continuity. */
export function continuityAngleLabel(minimum: number, maximum: number): string {
  const format = (value: number) => String(Number(value.toFixed(6)));
  const low = format(minimum), high = format(maximum);
  return low === high ? `${low}°` : `${low} – ${high}°`;
}

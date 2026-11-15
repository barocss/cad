/** Use the same seven-significant-digit precision for constant and varying samples. */
export function curvatureReadout(minimum: number, maximum: number): string {
  const low = String(Number(minimum.toPrecision(7))), high = String(Number(maximum.toPrecision(7)));
  return low === high ? low : `${low} – ${high}`;
}

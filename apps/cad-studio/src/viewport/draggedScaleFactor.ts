/** The gizmo supplies a positive relative multiplier. Keep small authored factors,
 * rather than rounding them to two absolute decimal places (which could produce 0).
 * Geometry-specific minimum-size refusals remain the kernel's responsibility. */
export function draggedScaleFactor(start: number, relative: number): number {
  const product = start * relative;
  return Math.min(1000, Math.max(Number.MIN_VALUE, Number(product.toPrecision(12))));
}

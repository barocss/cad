/** Mirror Hole creation's outer-diameter relation without changing native admission. */
export function countersinkHistoryProblem(diameter: string | number, countersink: string | number): string | null {
  // Empty fields already have the editor's required-number feedback.
  if (String(diameter).trim() === '' || String(countersink).trim() === '') return null;
  const hole = Number(diameter), outer = Number(countersink);
  if (Number.isFinite(hole) && Number.isFinite(outer) && outer > hole) return null;
  return `Countersink Ø must be greater than Diameter${Number.isFinite(hole) ? ` (${hole} mm)` : ''}. Increase Countersink Ø or reduce Diameter.`;
}

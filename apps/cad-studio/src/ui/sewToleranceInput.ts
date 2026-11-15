/** Keep incomplete Direct Sew input distinct from the last committed scalar and automatic zero. */
export function parseSewToleranceInput(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// A bounded assignment, not JavaScript. No expression evaluation or script side effects.
export function parseDiameterCode(value: string): { label: 'A' | 'B'; diameter: number } | null {
  const match = /^\s*hole([AB])\.diameter\s*=\s*((?:\d+(?:\.\d+)?|\.\d+))\s*;?\s*$/.exec(value);
  if (!match) return null;
  const diameter = Number(match[2]);
  return Number.isFinite(diameter) && diameter > 0 ? { label: match[1] as 'A' | 'B', diameter } : null;
}

import type { DrawingDatumTarget } from '@barocss/cad-model/drawing/datumTargets';

/** Reserve identities from every sheet, including held legacy targets. New targets keep the existing A-series policy. */
export function nextDatumTargetIdentity(all: readonly DrawingDatumTarget[] = []): { id: string; letter: string; number: number } | null {
  if (all.length >= 200) return null;
  let number = 1;
  while (all.some(t => t.letter === 'A' && t.number === number)) number++;
  if (number > 99) return null;
  const ids = new Set(all.map(t => t.id));
  let id = 'target-1', k = 2;
  while (ids.has(id)) id = `target-${k++}`;
  return { id, letter: 'A', number };
}

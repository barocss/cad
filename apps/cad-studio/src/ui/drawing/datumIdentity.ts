import type { DrawingDatum } from '@barocss/cad-model/drawing/types';

/** A face datum is identified across the whole drawing, not just the sheet currently displayed.
 * Existing unresolved references and arbitrary imported IDs remain reserved, without rewriting them.
 */
export function nextFaceDatumIdentity(all: readonly DrawingDatum[] = []): { id: string; letter: string } | null {
  if (all.length >= 200) return null;
  const letter = [...'ABCDEFGHJKLMNPRSTUVWXYZ'].find(l => !all.some(d => d.letter === l));
  if (!letter) return null;
  const ids = new Set(all.map(d => d.id));
  let id = `datum-${letter}`, n = 2;
  while (ids.has(id)) id = `datum-${letter}-${n++}`;
  return { id, letter };
}

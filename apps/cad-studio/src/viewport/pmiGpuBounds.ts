import type { ModelAnnotation } from '@barocss/cad-model/drawing/annotations3d';
import type { PmiTextBounds } from './pmiGeometry';
export type PmiGlyphSnapshot = { epoch: object; bounds: readonly { labelIndex: number; rects: readonly { left: number; top: number; right: number; bottom: number }[] }[] };
export type PmiGpuOwner = { items: readonly ModelAnnotation[]; selected: string | null; renderer: object; canvas: HTMLCanvasElement; facingKey: string };
export type PmiGpuCommit = PmiGpuOwner & { owners: { plain: readonly string[]; selected: readonly string[] } };
/** Label-generation identity is independent of current submitted projection. Never estimate missing GPU text. */
export function pmiGpuTextBounds(commit: PmiGpuCommit | null, current: PmiGpuOwner, read: (key: string) => PmiGlyphSnapshot | null): PmiTextBounds {
  const out: PmiTextBounds = new Map();
  if (!commit || commit.items !== current.items || commit.selected !== current.selected || commit.renderer !== current.renderer
    || commit.canvas !== current.canvas || commit.facingKey !== current.facingKey || !current.canvas.isConnected) return out;
  let epoch: object | null = null;
  for (const group of ['plain', 'selected'] as const) {
    const owners = commit.owners[group]; if (!owners.length) continue;
    const snapshot = read(group === 'plain' ? 'pmi:text' : 'pmi:text:selected');
    if (!snapshot || !snapshot.epoch || epoch && epoch !== snapshot.epoch) return new Map();
    epoch = snapshot.epoch;
    for (const item of snapshot.bounds) {
      if (!Number.isInteger(item.labelIndex) || item.labelIndex < 0 || item.labelIndex >= owners.length) return new Map();
      const id = owners[item.labelIndex];
      for (const rect of item.rects) {
        if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) || rect.right <= rect.left || rect.bottom <= rect.top) continue;
        const boxes = out.get(id) ?? []; boxes.push({ ...rect }); out.set(id, boxes);
      }
    }
  }
  return out;
}

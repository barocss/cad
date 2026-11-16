import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
export interface SplitSourceOwner {
  doc: StudioDoc; commandDoc: StudioDoc; evaluated: StudioDoc;
  worker: unknown; open: object; engine: object; marker: number | null; variant: unknown;
  fresh: boolean; busy: boolean; instances: boolean; inPlace: boolean;
}
export function splitSourceCurrent(a: SplitSourceOwner, b: SplitSourceOwner): boolean {
  return a.fresh && b.fresh && !a.busy && !b.busy && !a.instances && !b.instances && !a.inPlace && !b.inPlace
    && a.marker === null && b.marker === null && !a.variant && !b.variant
    && a.doc === b.doc && a.commandDoc === b.commandDoc && a.evaluated === b.evaluated
    && a.worker === b.worker && a.open === b.open && a.engine === b.engine;
}
export function splitParentBounds(doc: StudioDoc, index: number, bodies: BodyResult[]) {
  const node = doc.nodes[index];
  if (node?.kind !== 'split' || !node.normal || node.suppressed || node.held
    || !Number.isInteger(node.parent.node) || node.parent.node < 0 || node.parent.node >= index) return null;
  const matches = bodies.filter(b => b.ref?.node === node.parent.node && b.ref.side === node.parent.side
    && b.key === bodyKeyFor(doc.nodes, node.parent.node, node.parent.side));
  if (matches.length !== 1) return null;
  const { min, max } = matches[0].mesh.bounds;
  if (min.length !== 3 || max.length !== 3 || !min.every((v, i) => Number.isFinite(v) && Number.isFinite(max[i]) && v <= max[i])) return null;
  return { min: [...min] as [number, number, number], max: [...max] as [number, number, number] };
}

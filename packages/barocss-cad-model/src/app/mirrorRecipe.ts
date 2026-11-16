import { withNode, type BodyRef, type StudioDoc } from '../engine/doc';
import { refusal } from '../engine/refusal';
import type { Values } from './commands';
export function mirrorRecipeValues(values: Values): { plane: 'xy' | 'xz' | 'yz'; at: number } {
  if (!['xy', 'xz', 'yz'].includes(String(values.plane)) || !['number', 'string'].includes(typeof values.at)
    || String(values.at).trim() === '' || !Number.isFinite(Number(values.at)))
    throw refusal('VALUE', 'Mirror requires an XY, XZ or YZ plane and a finite Plane at coordinate.');
  return { plane: values.plane as 'xy' | 'xz' | 'yz', at: Number(values.at) };
}
/** Fixed numeric plane, never a live face constraint. */
export function appendMirrorRecipe(doc: StudioDoc, parent: BodyRef, values: Values, remember = true): StudioDoc {
  const { plane, at } = mirrorRecipeValues(values), start = doc.nodes.length;
  const axis = { yz: 0, xz: 1, xy: 2 }[plane];
  const shift = (d: number): [number, number, number] => { const v: [number, number, number] = [0, 0, 0]; v[axis] = d; return v; };
  if (at === 0) doc = withNode(doc, { kind: 'mirror', parent, plane });
  else {
    doc = withNode(doc, { kind: 'translate', parent, offset: shift(-at) });
    doc = withNode(doc, { kind: 'mirror', parent: { node: doc.nodes.length - 1, side: 'solid' }, plane });
    doc = withNode(doc, { kind: 'translate', parent: { node: doc.nodes.length - 1, side: 'solid' }, offset: shift(at) });
  }
  if (!remember) return doc;
  return { ...doc, nodes: doc.nodes.map((node, i) => i === doc.nodes.length - 1
    ? { ...node, made: { command: 'mirror', values: { plane, at }, nodes: doc.nodes.length - start } } : node) };
}

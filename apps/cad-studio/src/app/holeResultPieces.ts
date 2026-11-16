import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';

/** Report only the exact exposed terminal Hole result, never a downstream/placed body. */
export function holeResultPieces(doc: StudioDoc, index: number, bodies: readonly BodyResult[]): FriendlyError | undefined {
  const hole = doc.nodes[index];
  if (index !== doc.nodes.length - 1 || hole?.kind !== 'hole' || !hole.id || hole.held || hole.suppressed
    || doc.instances?.length || doc.nodes.filter(node => node.id === hole.id).length !== 1) return;
  const outputs = Object.entries(doc.outputs).filter(([, ref]) => ref.node === index);
  const key = bodyKeyFor(doc.nodes, index);
  if (outputs.length !== 1 || outputs[0][0] !== key || outputs[0][1].side !== 'solid') return;
  const matches = bodies.filter(body => body.key === key || body.ref?.node === index);
  if (matches.length !== 1) return;
  const body = matches[0], count = body.pieces;
  if (body.key !== key || body.ref?.node !== index || body.ref.side !== 'solid'
    || !Number.isSafeInteger(count) || count! <= 1 || body.lumpTouch?.length) return;
  return { title: `The Hole result contains ${count} disconnected pieces`,
    hint: 'Select the result body to inspect Pieces and use Separate if needed.', detail: '' };
}

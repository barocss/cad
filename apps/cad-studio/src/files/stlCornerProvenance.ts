import { getBlob } from '@barocss/cad-model/engine/blobs';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { FACET_PREVIEW_TRIANGLES } from '@barocss/cad-model/engine/meshImport';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';

const originalImports = new WeakSet<StudioDoc>();

/** Keep the original STL interpretation only in the live document admitted from that file. */
export function rememberStlCornerSource(doc: StudioDoc): void {
  originalImports.add(doc);
}

/** STL has no indexed vertex table. The import's index array maps each file corner to its welded vertex. */
export function stlCornerOccurrences(doc: StudioDoc, at: Vec3) {
  const node = doc.nodes[0];
  if (!originalImports.has(doc) || doc.nodes.length !== 1 || node?.kind !== 'mesh' || node.repair || node.pieces || !node.blob) return;
  const positions = getBlob(node.blob.positions), indices = getBlob(node.blob.indices);
  if (!positions || !indices || indices.length > 3 * FACET_PREVIEW_TRIANGLES || positions.length > indices.length * 3) return;
  let vertex = -1;
  for (let i = 0; i < positions.length; i += 3) {
    if (!at.every((value, axis) => value === positions[i + axis])) continue;
    if (vertex !== -1) return;
    vertex = i / 3;
  }
  if (vertex === -1) return;
  const first: number[] = [];
  let count = 0;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== vertex) continue;
    count++;
    if (first.length < 6) first.push(i + 1);
  }
  if (count) return { first, count };
}

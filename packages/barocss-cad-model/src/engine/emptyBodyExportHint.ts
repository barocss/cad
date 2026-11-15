import type { StudioDoc } from './doc';
import type { BodyResult } from './evaluate';
import { bodyName } from '../app/bodies';

export function emptyBodyExportHint(doc: StudioDoc, body: BodyResult): string {
  const scale = body.ref && doc.nodes[body.ref.node]?.kind === 'scale';
  return `${bodyName(doc, body)} (${body.key}) has no triangles to export. No files were downloaded. ${scale ? 'Open History → Scale and increase Factor, then evaluate and export again.' : 'Repair or remove this empty body, then evaluate and export again.'}`;
}

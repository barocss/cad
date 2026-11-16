import { CadPartError } from '@barocss/cad';
import type { StudioDoc } from './doc';
import type { FriendlyError } from './errors';
import { featureId } from './ids';

/** Add ordered saved labels only when this evaluation owns the native Sew refusal. */
export function sewGapLocation(doc: StudioDoc, cause: unknown, error: FriendlyError): FriendlyError {
  try { return ownedSewGapLocation(doc, cause, error); } catch { return error; }
}
function ownedSewGapLocation(doc: StudioDoc, cause: unknown, error: FriendlyError): FriendlyError {
  if (!(cause instanceof CadPartError) || cause.code !== 'GEOMETRY' || cause.details.category !== 'GEOMETRY'
    || !cause.feature || error.feature !== cause.feature || error.code !== cause.code
    || cause.message !== `${cause.feature}: ${error.detail}` || doc.instances?.length || Object.keys(doc.pendingParts ?? {}).length) return error;
  const owners = doc.nodes.filter((_, index) => featureId(doc.nodes, index) === cause.feature);
  if (owners.length !== 1) return error;
  const node = owners[0];
  if (node.kind !== 'sew' || node.suppressed || node.held || !Array.isArray(node.names) || !Array.isArray(node.surfaces)
    || node.names.length !== node.surfaces.length || node.names.length < 2 || node.names.length > 64
    || !node.names.every(name => typeof name === 'string')) return error;
  const match = /^the surfaces do not close: ([1-9]\d*) (edge|edges) meet no other surface \((surface|surfaces) ([1-9]\d*(?:, [1-9]\d*)*)\)$/.exec(error.detail);
  if (!match) return error;
  const count = Number(match[1]), indices = match[4].split(', ').map(Number);
  if (!Number.isSafeInteger(count) || count > node.surfaces.length * 4 || count < indices.length
    || match[2] !== (count === 1 ? 'edge' : 'edges') || match[3] !== (indices.length === 1 ? 'surface' : 'surfaces')
    || new Set(indices).size !== indices.length || indices.some(index => !Number.isSafeInteger(index) || index > node.names.length)) return error;
  const labels = indices.map(index => `${index}. ${node.names[index - 1] || '(unnamed surface)'}`).join('; ');
  return { ...error, hint: `${count} ${match[2]} could not be matched on these copied surfaces: ${labels}. Check the gap and the tolerance.` };
}

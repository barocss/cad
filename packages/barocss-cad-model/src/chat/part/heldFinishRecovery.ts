import { lookKey } from '../../app/lookKey';
import { heldFinishGroupProblems, isHeldConstantLineFinish, validFinishGroupEdge } from '../../engine/heldFinishGroup';
import { bodyKeyFor, featureId } from '../../engine/ids';
import { verifyReferences } from '../../engine/references';
import { revisionOf } from '../../util/revision';
import type { ChatState, Evaluate } from '../toolKit';

/** The History choices of the held terminal Fillet on the current part, for inspection only. */
export async function heldFinishRecovery({ doc, bodies, partOf }: ChatState, evaluate: Evaluate, only: string | null, page: number, pageSize: number) {
  const index = doc.nodes.length - 1, node = doc.nodes[index];
  if (partOf || node?.kind !== 'fillet' || node.edges.length !== 3 || !isHeldConstantLineFinish(doc, index, node)) return;
  const key = bodyKeyFor(doc.nodes, index, 'solid');
  if (only && only !== key) return;
  const owned = bodies.filter(body => body.key === key);
  if (owned.length !== 1) return;
  const [body] = owned;
  if (body.ref?.node !== index || body.ref.side !== 'solid' || doc.bodies?.[lookKey(doc.nodes, body)]?.hidden) return;

  const { problems, changes } = await verifyReferences(doc, bodies, evaluate);
  const slots = !changes.length && heldFinishGroupProblems(doc, index, problems);
  if (!slots) return;
  const edges = body.mesh.edges, start = (page - 1) * pageSize;
  const selectable = (name: string) => validFinishGroupEdge(edges.find(edge => edge.names.includes(name)), edges);
  const picks = edges.slice(start, start + pageSize).filter(edge => validFinishGroupEdge(edge, edges));
  return {
    feature: featureId(doc.nodes, index), body: key, revision: revisionOf(doc),
    mode: 'studio_history_review', page, pages: Math.max(1, Math.ceil(edges.length / pageSize)),
    slots: slots.map(({ name, candidates }, i) => ({
      slot: i + 1, authored_edge: name, signature_matches: candidates.filter(selectable),
    })),
    pick_edges: picks.map(edge => ({ name: edge.names[0], from: edge.a, to: edge.b })),
  };
}

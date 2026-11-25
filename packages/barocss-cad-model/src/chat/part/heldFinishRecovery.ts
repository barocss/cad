import { lookKey } from '../../app/lookKey';
import { prefixDoc } from '../../engine/doc';
import { rememberedEvaluate } from '../../engine/evalMemo';
import { heldChamferThroughHole, heldPairedFilletThroughHole, parentChamferEdge, parentPairedFilletEdge } from '../../engine/heldChamferThroughHole';
import type { DisplayEdge } from '../../engine/mesh';
import { heldFinishGroupProblems, isHeldConstantLineFinish, nativeLine, validFinishGroupEdge } from '../../engine/heldFinishGroup';
import { bodyKeyFor, featureId } from '../../engine/ids';
import { sameDatumTargetSourceSig, toSig, verifyReferences } from '../../engine/references';
import { signaturesOf } from '../../engine/rematch';
import { revisionOf } from '../../util/revision';
import type { ChatState, Evaluate } from '../toolKit';

const edgePick = (edge: DisplayEdge) => ({ name: edge.names[0], from: edge.a, to: edge.b });

/** The held finish choices on the current part, for inspection in Studio History. */
export async function heldFinishRecovery(state: ChatState, evaluate: Evaluate, only: string | null, page: number, pageSize: number) {
  if (state.partOf) return;
  if (state.doc.nodes.at(-1)?.kind === 'hole') {
    return (await heldChamferRecovery(state, evaluate, only, page, pageSize))
      ?? heldPairedFilletRecovery(state, evaluate, only, page, pageSize);
  }
  return terminalFilletRecovery(state, evaluate, only, page, pageSize);
}

async function terminalFilletRecovery({ doc, bodies }: ChatState, evaluate: Evaluate, only: string | null, page: number, pageSize: number) {
  const index = doc.nodes.length - 1, node = doc.nodes[index];
  if (node?.kind !== 'fillet' || node.edges.length !== 3 || !isHeldConstantLineFinish(doc, index, node)) return;
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
    pick_edges: picks.map(edgePick),
  };
}

async function heldChamferRecovery({ doc, bodies }: ChatState, evaluate: Evaluate, only: string | null, page: number, pageSize: number) {
  const index = doc.nodes.length - 2, node = doc.nodes[index];
  if (node?.kind !== 'chamfer' || node.rematched) return;
  const [name] = node.edges;
  if (node.sigs?.[name]?.n !== undefined) return;

  const scope = heldChamferThroughHole(doc, index, bodies);
  if (!scope || (only && only !== scope.body.key) || doc.bodies?.[lookKey(doc.nodes, scope.body)]?.hidden) return;
  const { problems, changes } = await verifyReferences(doc, bodies, evaluate);
  const [problem] = problems;
  if (changes.length || problems.length !== 1 || problem.node !== index || problem.name !== name) return;

  const stock = await rememberedEvaluate(evaluate)(prefixDoc(doc, index));
  if (!stock?.ok || stock.bodies.length !== 1) return;
  const [parent] = stock.bodies;
  if (parent.ref?.node !== scope.parent.node || parent.ref.side !== scope.parent.side ||
      parent.key !== bodyKeyFor(doc.nodes, scope.parent.node, 'solid') ||
      parent.topology?.kind !== 'solid' || parent.topology.bodyCount !== 1) return;

  const edges = scope.body.mesh.edges;
  const eligible = new Set(edges.filter(edge => parentChamferEdge(scope, parent, edge)));
  if (!eligible.size) return;
  const names = new Set([...eligible].map(edge => edge.names[0]));
  const start = (page - 1) * pageSize;
  return {
    feature: featureId(doc.nodes, index), body: scope.body.key, revision: revisionOf(doc),
    source_body: parent.key, downstream_feature: featureId(doc.nodes, index + 1),
    mode: 'studio_history_review', page, pages: Math.max(1, Math.ceil(edges.length / pageSize)),
    slots: [{ slot: 1, authored_edge: name, signature_matches: problem.candidates.filter(candidate => names.has(candidate)) }],
    pick_edges: edges.slice(start, start + pageSize).filter(edge => eligible.has(edge)).map(edgePick),
  };
}

async function heldPairedFilletRecovery({ doc, bodies }: ChatState, evaluate: Evaluate, only: string | null, page: number, pageSize: number) {
  const index = doc.nodes.length - 2, node = doc.nodes[index];
  const scope = heldPairedFilletThroughHole(doc, index, bodies);
  if (!scope || node?.kind !== 'fillet' || (only && only !== scope.body.key) ||
      doc.bodies?.[lookKey(doc.nodes, scope.body)]?.hidden) return;

  const { problems, changes } = await verifyReferences(doc, bodies, evaluate);
  if (changes.length || !problems.length || problems.some(problem => problem.node !== index)) return;
  const stock = await rememberedEvaluate(evaluate)(prefixDoc(doc, index));
  if (!stock?.ok || stock.bodies.length !== 1) return;
  const [parent] = stock.bodies;
  if (parent.ref?.node !== scope.parent.node || parent.ref.side !== scope.parent.side ||
      parent.key !== bodyKeyFor(doc.nodes, scope.parent.node, 'solid') ||
      parent.topology?.kind !== 'solid' || parent.topology.bodyCount !== 1) return;

  const edges = scope.body.mesh.edges;
  let retained: string | undefined;
  let slots: { slot: number; authored_edge: string; candidates: string[] }[];
  if (problems.length === 1) {
    const [problem] = problems;
    const slotIndex = node.edges.indexOf(problem.name);
    retained = node.edges.find(name => name !== problem.name);
    if (slotIndex < 0 || !retained) return;
    const saved = node.sigs?.[retained];
    if (saved?.k !== 'line' || saved.n !== undefined) return;
    for (const checkBody of [scope.body, parent]) {
      const matched = checkBody.mesh.edges.filter(edge => edge.names.includes(retained!));
      const signature = signaturesOf(checkBody).edges.get(retained);
      if (matched.length !== 1 || matched[0].names.length !== 1 || !nativeLine(matched[0]) ||
          !signature || !sameDatumTargetSourceSig(saved, toSig(signature))) return;
    }
    slots = [{ slot: slotIndex + 1, authored_edge: problem.name, candidates: problem.candidates }];
  } else {
    const grouped = heldFinishGroupProblems(doc, index, problems, true);
    if (!grouped) return;
    slots = grouped.map((problem, i) => ({ slot: i + 1, authored_edge: problem.name, candidates: problem.candidates }));
  }

  const eligible = new Set(edges.filter(edge => edge.names[0] !== retained && parentPairedFilletEdge(scope, parent, edge)));
  if (!eligible.size) return;
  const names = new Set([...eligible].map(edge => edge.names[0]));
  const start = (page - 1) * pageSize;
  return {
    feature: featureId(doc.nodes, index), body: scope.body.key, revision: revisionOf(doc),
    source_body: parent.key, downstream_feature: featureId(doc.nodes, index + 1),
    mode: 'studio_history_review', page, pages: Math.max(1, Math.ceil(edges.length / pageSize)),
    slots: slots.map(({ slot, authored_edge, candidates }) => ({
      slot, authored_edge, signature_matches: candidates.filter(candidate => names.has(candidate)),
    })),
    pick_edges: edges.slice(start, start + pageSize).filter(edge => eligible.has(edge)).map(edgePick),
  };
}

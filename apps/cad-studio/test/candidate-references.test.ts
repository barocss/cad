import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { evaluationKey } from '@barocss/cad-model/engine/evalMemo';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { captureSignatures, confirmReference, toSig, verifyReferences } from '@barocss/cad-model/engine/references';
import { candidateReferenceProblem, refreshCandidateReferences } from '../src/state/candidateReferences';
import { refreshDownstreamProblems } from '../src/state/referenceDecisions';

function evaluated(doc: StudioDoc) {
  const result = evaluateDoc(doc, 1); if (!result.ok) throw new Error(result.error.hint); return result;
}
function fixture() {
  const base = rectanglePart(30, 20, 10), parent = evaluated(base);
  const name = parent.bodies[0].mesh.edges[0].names[0];
  const candidate = withNode(base, { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: [name], distance: 1 });
  const result = evaluated(candidate), prefix = prefixDoc(candidate, 2);
  return { base, parent, name, candidate, result, prefix };
}
test('candidate final-body reference gate refuses missing names without mutating the document', () => {
  const { base, parent, name } = fixture();
  const candidate: StudioDoc = { ...base, drawing: { sheet: 'A4', projection: 'third', hidden: true,
    dimensions: [{ id: 'dimension', view: 'top', kind: 'diameter', edge: name, near: [0, 0, 0], place: [2, 2] }] } };
  const before = structuredClone(candidate);
  assert.equal(candidateReferenceProblem(candidate, parent.bodies, parent.bodies), undefined);
  assert.match(candidateReferenceProblem(candidate, parent.bodies, [])!, /needs an explicit choice/);
  assert.match(candidateReferenceProblem(candidate, [], parent.bodies)!, /needs an explicit choice/);
  assert.deepEqual(candidate, before);
});
test('candidate reference refresh reads the named parent and changes evidence only', async () => {
  const f = fixture(), before = structuredClone(f.candidate); let reads = 0;
  const next = await refreshCandidateReferences({ candidate: f.candidate, key: evaluationKey(f.candidate), result: f.result,
    accepted: () => null, isCurrent: () => true,
    evaluateParent: async doc => { reads++; assert.equal(evaluationKey(doc), evaluationKey(f.prefix)); return f.parent; } });
  assert.equal(reads, 1); const feature = next.nodes[2]; assert.ok(feature.kind === 'chamfer');
  assert.deepEqual(feature.sigs?.[f.name], toSig(signaturesOf(f.parent.bodies[0]).edges.get(f.name)!));
  assert.deepEqual(f.candidate, before); assert.deepEqual(feature.edges, [f.name]);
});
test('matching accepted parent evaluation is reused without worker reads', async () => {
  const f = fixture();
  const next = await refreshCandidateReferences({ candidate: f.candidate, key: evaluationKey(f.candidate), result: f.result,
    accepted: () => ({ key: evaluationKey(f.prefix), result: f.parent }), isCurrent: () => true,
    evaluateParent: async () => assert.fail('Cached parent should not be reevaluated') });
  assert.ok(next.nodes[2].sigs?.[f.name]);
});
test('a parent response arriving after ownership changes cannot refresh candidate evidence', async () => {
  const f = fixture(); let current = true;
  await assert.rejects(refreshCandidateReferences({ candidate: f.candidate, key: evaluationKey(f.candidate), result: f.result,
    accepted: () => null, isCurrent: () => current,
    evaluateParent: async () => { current = false; return f.parent; } }), /reference parent could not be evaluated/);
  assert.equal(f.candidate.nodes[2].sigs, undefined);
});
test('a successful parent evaluation missing the exact referenced name is refused', async () => {
  const f = fixture();
  await assert.rejects(refreshCandidateReferences({ candidate: f.candidate, key: evaluationKey(f.candidate), result: f.result,
    accepted: () => null, isCurrent: () => true,
    evaluateParent: async () => ({ ...f.parent, bodies: [] }) }), /needs an explicit choice/);
});

test('releasing a held parent Chamfer refreshes downstream bevel-edge candidates without mutating the document', async () => {
  const readPart = async (doc: StudioDoc) => evaluateDoc(doc, 1);
  const stock = rectanglePart(80, 40, 10);
  const [sketch, extrude] = stock.nodes;
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'rectangle');
  const base: StudioDoc = { ...stock, nodes: [{ ...sketch, min: [-20, -20], max: [60, 20],
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } }, extrude] };
  const withN2 = captureSignatures(withNode(base, { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: ['n1.side[e1]|n1.side[e4]'], distance: 4 }), evaluated(base).bodies);
  const withN3 = captureSignatures(withNode(withN2, { kind: 'chamfer', parent: { node: 2, side: 'solid' }, edges: ['n1.side[e1]|n2.face'], distance: 1 }), evaluated(withN2).bodies);
  const retired = structuredClone(withN3);
  assert.ok(retired.nodes[0].kind === 'sketch' && retired.nodes[0].profile === 'rectangle');
  retired.nodes[0].min[1] = -18;
  retired.nodes[0].sideTags!.outer[0] = 'e5';

  const opened = await verifyReferences(retired, [], readPart);
  assert.deepEqual(opened.problems.map(p => [p.node, p.name, p.candidates]), [
    [2, 'n1.side[e1]|n1.side[e4]', ['n1.side[e4]|n1.side[e5]']],
    [3, 'n1.side[e1]|n2.face', ['n1.side[e4]|n1.side[e5]']],
  ]);
  const afterN2 = await confirmReference(opened.doc, opened.problems[0].index, evaluated(opened.doc).bodies, readPart, 'n1.side[e4]|n1.side[e5]');
  const snapshot = structuredClone(afterN2);
  const refreshed = await refreshDownstreamProblems(afterN2, 2, [opened.problems[1]], evaluated(afterN2).bodies, readPart);
  assert.deepEqual(afterN2, snapshot);
  assert.deepEqual(refreshed.map(p => [p.node, p.name, p.candidates]), [
    [3, 'n1.side[e1]|n2.face', ['n1.side[e5]|n2.face']],
  ]);

  // Same-name dependent edge (n1.top|n2.face) reappears as an explicit candidate once n2 is restored.
  const sameName = captureSignatures(withNode(withN2, { kind: 'chamfer', parent: { node: 2, side: 'solid' }, edges: ['n1.top|n2.face'], distance: 1 }), evaluated(withN2).bodies);
  const sameRetired = structuredClone(sameName);
  assert.ok(sameRetired.nodes[0].kind === 'sketch' && sameRetired.nodes[0].profile === 'rectangle');
  sameRetired.nodes[0].min[1] = -18;
  sameRetired.nodes[0].sideTags!.outer[0] = 'e5';
  const sameOpened = await verifyReferences(sameRetired, [], readPart);
  assert.deepEqual(sameOpened.problems[1].candidates, []);
  const sameAfterN2 = await confirmReference(sameOpened.doc, sameOpened.problems[0].index, evaluated(sameOpened.doc).bodies, readPart, 'n1.side[e4]|n1.side[e5]');
  const sameRefreshed = await refreshDownstreamProblems(sameAfterN2, 2, [sameOpened.problems[1]], evaluated(sameAfterN2).bodies, readPart);
  assert.deepEqual(sameRefreshed.map(p => [p.node, p.name, p.candidates]), [
    [3, 'n1.top|n2.face', ['n1.top|n2.face']],
  ]);
});

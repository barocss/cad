import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { evaluationKey } from '@barocss/cad-model/engine/evalMemo';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { candidateReferenceProblem, refreshCandidateReferences } from '../src/state/candidateReferences';

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

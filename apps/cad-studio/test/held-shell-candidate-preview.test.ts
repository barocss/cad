import test from 'node:test';
import assert from 'node:assert/strict';
import { withLook } from '@barocss/cad-model/app/bodies';
import { type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { referencesOf } from '@barocss/cad-model/engine/references';
import { heldShellCandidateFace } from '../src/state/referenceDecisions';

const old = 'n1.side[e1]', chosen = 'n1.side[s1]';
const ref = (node: number) => ({ node, side: 'solid' as const });
const doc: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[-20,-20],[10,-20],[10,10],[30,10],[30,-20],[60,-20],[60,20],[-20,20]], sideTags: { outer: ['s1','s2','s3','s4','s5','e2','e3','e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 12 },
    { id: 'n2', kind: 'shell', parent: ref(1), open: [old], thickness: 2, suppressed: true, held: 'Candidate choice' },
    { id: 'n3', kind: 'chamfer', parent: ref(2), edges: ['n1.top|n2.ceiling'], distance: 0.5, suppressed: true, held: 'Candidate choice' },
  ], outputs: { b3: ref(3) },
};
const result = evaluateDoc(doc, 1);
assert.ok(result.ok);
const { bodies } = result;
const refs = referencesOf(doc, true).refs;
const index = refs.findIndex(r => r.node === 2 && r.name === old);
assert.ok(index >= 0);
const problem = { index, name: old, where: refs[index].where, node: 2, candidates: [chosen] };
const face = bodies[0].mesh.faces.find(f => f.name === chosen);
assert.ok(face);
test('held Shell opening preview maps to the exact planar face of the output passthrough', () => {
  const before = structuredClone(doc);
  assert.deepEqual(heldShellCandidateFace(doc, bodies, problem, chosen), { body: 0, face: face.index });
  assert.deepEqual(doc, before);
});
test('refuses a non-offered candidate, stale slot, hidden or mismatched output, and ambiguous name', () => {
  assert.equal(heldShellCandidateFace(doc, bodies, problem, 'n1.top'), undefined);
  assert.equal(heldShellCandidateFace(doc, bodies, { ...problem, index: index + 1 }, chosen), undefined);
  const hidden = withLook(doc, bodies[0], { hidden: true });
  assert.equal(heldShellCandidateFace(hidden, bodies, problem, chosen), undefined);
  assert.equal(heldShellCandidateFace(doc, [{ ...bodies[0], ref: ref(1) }], problem, chosen), undefined);
  const ambiguous = { ...bodies[0], mesh: { ...bodies[0].mesh, faces: [...bodies[0].mesh.faces, { ...face, index: 99 }] } };
  assert.equal(heldShellCandidateFace(doc, [ambiguous], problem, chosen), undefined);
});
test('refuses downstream active geometry and other output lineages even with the same face name', () => {
  const active = { ...doc, nodes: doc.nodes.map((n, i) => i === 3 ? { ...n, held: undefined, suppressed: undefined } : n) };
  assert.equal(heldShellCandidateFace(active, bodies, problem, chosen), undefined);
  const other = { ...doc, nodes: doc.nodes.map((n, i) => i === 3 && n.kind === 'chamfer' ? { ...n, parent: ref(1) } : n) };
  assert.equal(heldShellCandidateFace(other, bodies, problem, chosen), undefined);
});

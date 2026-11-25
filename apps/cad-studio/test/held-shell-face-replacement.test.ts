import test from 'node:test';
import assert from 'node:assert/strict';
import { withLook } from '@barocss/cad-model/app/bodies';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '@barocss/cad-model/engine/references';
import { refreshDownstreamProblems } from '../src/state/referenceDecisions';
import { heldShellFaceProblem, pickHeldShellFace, replaceHeldShellFace } from '../src/state/heldShellFaceReplacement';

const n2Old = 'n1.side[e1]';
const n2New = 'n1.side[s1]';
const n3Old = 'n1.side[e1]#3|n2.ceiling';
const n3New = 'n1.side[s1]#3|n2.ceiling';
const ref = (node: number) => ({ node, side: 'solid' as const });

function makeHeldFixture() {
  const seed: StudioDoc = {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 12 },
      { id: 'n2', kind: 'shell', parent: ref(1), open: [n2Old], thickness: 2 },
      { id: 'n3', kind: 'chamfer', parent: ref(2), edges: [n3Old], distance: 0.5 },
    ],
    outputs: { b3: ref(3) },
  };
  const r1 = evaluateDoc(prefixDoc(seed, 2), 1);
  assert.ok(r1.ok);
  let authored = captureSignatures(seed, r1.bodies);
  const r2 = evaluateDoc(prefixDoc(authored, 3), 1);
  assert.ok(r2.ok);
  authored = captureSignatures(authored, r2.bodies);

  const edited: StudioDoc = {
    ...authored,
    nodes: authored.nodes.map((node, i) => i === 0 ? {
      id: 'n0', kind: 'sketch', profile: 'polygon',
      points: [[-20, -20], [10, -20], [10, 10], [30, 10], [30, -20], [60, -20], [60, 20], [-20, 20]],
      sideTags: { outer: ['s1', 's2', 's3', 's4', 's5', 'e2', 'e3', 'e4'] },
    } : node),
  };
  const heldDoc: StudioDoc = {
    ...edited,
    nodes: edited.nodes.map((node, i) => i === 2 || i === 3 ? { ...node, suppressed: true, held: 'Candidate choice' } : node),
  };
  const ev = evaluateDoc(heldDoc, 1);
  assert.ok(ev.ok);
  const refs = referencesOf(heldDoc, true).refs;
  const shellRefIndex = refs.findIndex(r => r.node === 2 && r.name === n2Old);
  const chamferRefIndex = refs.findIndex(r => r.node === 3 && r.name === n3Old);
  assert.ok(shellRefIndex >= 0 && chamferRefIndex >= 0);
  const problems = [
    { index: shellRefIndex, name: n2Old, where: refs[shellRefIndex].where, node: 2, candidates: [n2New, 'n1.side[s3]', 'n1.side[s5]'] },
    { index: chamferRefIndex, name: n3Old, where: refs[chamferRefIndex].where, node: 3, candidates: ['n1.side[s1]|n1.top'] },
  ];
  return { doc: heldDoc, bodies: ev.bodies, problems };
}

test('heldShellFaceProblem admits verified planar candidates and pickHeldShellFace accepts only offered planar faces', () => {
  const { doc, bodies, problems } = makeHeldFixture();
  const scope = heldShellFaceProblem(doc, 2, problems, bodies);
  assert.ok(scope);
  assert.equal(scope.allowedNames.has(n2New), true);
  assert.equal(scope.allowedNames.has('n1.top'), false);

  const goodFace = bodies[0].mesh.faces.find(f => f.name === n2New)!;
  const topFace = bodies[0].mesh.faces.find(f => f.name === 'n1.top')!;
  const nonCandidateSide = bodies[0].mesh.faces.find(f => f.name === 'n1.side[e2]')!;
  assert.ok(goodFace && topFace && nonCandidateSide);

  const okPick = pickHeldShellFace(doc, 2, problems, bodies, { face: { body: 0, face: goodFace.index }, faceMesh: bodies[0].mesh });
  assert.ok(okPick.ok);
  assert.equal(okPick.target.name, n2New);
  assert.equal(okPick.target.faceIndex, goodFace.index);
  assert.equal(okPick.target.signature.k, 'plane');

  // Wrong face, non-candidate side, null face, instance hit, stale mesh all refused without mutating doc
  const before = structuredClone(doc);
  assert.equal(pickHeldShellFace(doc, 2, problems, bodies, { face: { body: 0, face: topFace.index }, faceMesh: bodies[0].mesh }).ok, false);
  assert.equal(pickHeldShellFace(doc, 2, problems, bodies, { face: { body: 0, face: nonCandidateSide.index }, faceMesh: bodies[0].mesh }).ok, false);
  assert.equal(pickHeldShellFace(doc, 2, problems, bodies, { face: null, faceMesh: bodies[0].mesh }).ok, false);
  assert.equal(pickHeldShellFace(doc, 2, problems, bodies, { face: { body: 0, face: goodFace.index }, faceMesh: bodies[0].mesh, instance: 'inst1' }).ok, false);
  assert.equal(pickHeldShellFace(doc, 2, problems, bodies, { face: { body: 0, face: goodFace.index }, faceMesh: { ...bodies[0].mesh } }).ok, false);
  assert.deepEqual(doc, before);
});

test('heldShellFaceProblem refuses empty candidates, multi-opening shell, hidden body, active downstream feature, and non-shell nodes', () => {
  const { doc, bodies, problems } = makeHeldFixture();
  assert.equal(heldShellFaceProblem(doc, 3, problems, bodies), undefined);
  assert.equal(heldShellFaceProblem(withLook(doc, bodies[0], { hidden: true }), 2, problems, bodies), undefined);
  const noCandidates = problems.map((p, i) => i === 0 ? { ...p, candidates: [] } : p);
  assert.equal(heldShellFaceProblem(doc, 2, noCandidates, bodies), undefined);
  const multiOpening: StudioDoc = {
    ...doc,
    nodes: doc.nodes.map((n, i) => i === 2 && n.kind === 'shell' ? { ...n, open: [n2Old, 'n1.top'] } : n),
  };
  assert.equal(heldShellFaceProblem(multiOpening, 2, problems, bodies), undefined);
  const activeDownstream: StudioDoc = {
    ...doc,
    nodes: doc.nodes.map((n, i) => i === 3 ? { ...n, held: undefined, suppressed: undefined } : n),
  };
  assert.equal(heldShellFaceProblem(activeDownstream, 2, problems, bodies), undefined);
});

test('replaceHeldShellFace releases Shell only, leaves downstream Chamfer held, and refreshes Chamfer candidate', async () => {
  const { doc, bodies, problems } = makeHeldFixture();
  const goodFace = bodies[0].mesh.faces.find(f => f.name === n2New)!;
  const picked = pickHeldShellFace(doc, 2, problems, bodies, { face: { body: 0, face: goodFace.index }, faceMesh: bodies[0].mesh });
  assert.ok(picked.ok);

  const next = replaceHeldShellFace(doc, 2, picked.target);
  assert.ok(next);
  const shell = next.nodes[2];
  const chamfer = next.nodes[3];
  assert.ok(shell.kind === 'shell' && chamfer.kind === 'chamfer');
  assert.deepEqual(shell.open, [n2New]);
  assert.equal(shell.suppressed, undefined);
  assert.equal(shell.held, undefined);
  assert.equal(chamfer.suppressed, true);
  assert.equal(chamfer.held, 'Candidate choice');
  assert.deepEqual(chamfer.edges, [n3Old]);

  const rebuilt = evaluateDoc(next, 1);
  assert.ok(rebuilt.ok);
  const remaining = problems.filter(p => p.node !== 2);
  const refreshed = await refreshDownstreamProblems(next, 2, remaining, rebuilt.bodies, async d => evaluateDoc(d, 1));
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].node, 3);
  assert.ok(refreshed[0].candidates.includes(n3New), `expected refreshed candidate ${n3New}, got ${JSON.stringify(refreshed[0].candidates)}`);

  const verified = await verifyReferences(next, rebuilt.bodies, async d => evaluateDoc(d, 1));
  assert.ok(verified.problems.some(p => p.node === 3 && p.candidates.includes(n3New)));
});

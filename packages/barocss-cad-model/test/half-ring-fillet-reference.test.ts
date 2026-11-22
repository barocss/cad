import assert from 'node:assert/strict';
import test from 'node:test';
import { withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, placeBody, type BodyResult } from '../src/engine/evaluate';
import { captureSignatures, verifyReferences } from '../src/engine/references';

const solid = (node: number) => ({ node, side: 'solid' as const });
const stock: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 5,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Circular rail', mode: 'exact', path: {
      degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
      controlPoints: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
        [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]],
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
    } },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [0, -30], max: [30, 30] },
    { id: 'n3', kind: 'extrude', sketch: 2, from: -5, height: 10 },
    { id: 'n4', kind: 'intersect', left: solid(1), right: solid(3) },
  ],
  outputs: { b4: solid(4) },
};

test('a signed constant half-ring Fillet keeps the exact authored semicircle at native reopen', async () => {
  const source = evaluatePart(stock, 1, 8, 'refs');
  assert.ok(source.ok);
  const body = source.bodies[0];
  const rim = body.halfRingFilletRims?.find(candidate => candidate.center[1] > 0);
  assert.ok(rim);
  const [sibling, selected] = [...rim.edges].sort();
  const authored = withNode(stock, { kind: 'fillet', parent: solid(4), edges: [selected], radius: 0.75 });
  const signed = captureSignatures(authored, source.bodies);
  const circle = signed.nodes[0], fillet = signed.nodes[5];
  assert.ok(circle.kind === 'sketch' && circle.profile === 'circle' && fillet.kind === 'fillet');
  const saved = JSON.parse(JSON.stringify({ ...signed, nodes: [{ ...circle, radius: 3 }, ...signed.nodes.slice(1)] })) as StudioDoc;
  const savedFillet = saved.nodes[5];
  assert.ok(savedFillet.kind === 'fillet');
  assert.deepEqual(savedFillet.sigs?.[selected], { k: 'curve', p: [0, 20, 0], s: 4 });
  const reopened = evaluatePart(saved, 2, 8, 'refs');
  assert.ok(reopened.ok);
  const resized = evaluatePart({ ...stock, nodes: saved.nodes.slice(0, 5) }, 3, 8, 'refs');
  assert.ok(resized.ok);
  const replaceParent = (parent: BodyResult) => async (doc: StudioDoc) => {
    assert.equal(doc.nodes.length, 5);
    return { ...resized, bodies: [parent] };
  };
  const accepted = await verifyReferences(saved, reopened.bodies, replaceParent(resized.bodies[0]));
  assert.equal(accepted.doc, saved);
  assert.deepEqual([accepted.changes, accepted.problems], [[], []]);

  const unqualified = { ...resized.bodies[0], halfRingFilletRims: undefined };
  const refused = await verifyReferences(saved, reopened.bodies, replaceParent(unqualified));
  assert.deepEqual(refused.problems.map(problem => problem.candidates), [[sibling]]);
  assert.equal(refused.doc.nodes[5].suppressed, true);
  assert.equal(placeBody(body, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 40, 0]).halfRingFilletRims, undefined);

  // The stored center identifies the physical cap. A matching live name is insufficient when it points to the other cap.
  const otherCap = { ...fillet, sigs: { [selected]: { k: 'curve', p: [0, -20, 0] as [number, number, number], s: 4 } } };
  const wrongCenter = await verifyReferences({ ...saved, nodes: [...saved.nodes.slice(0, 5), otherCap] },
    reopened.bodies, replaceParent(resized.bodies[0]));
  assert.equal(wrongCenter.problems.length, 1);
  assert.equal(wrongCenter.doc.nodes[5].suppressed, true);
  assert.deepEqual((wrongCenter.doc.nodes[5] as typeof fillet).edges, [selected]);
});

test('a signed two-rim Fillet keeps the authored half on each cap after a diameter edit and reopen', async () => {
  const source = evaluatePart(stock, 1, 8, 'refs');
  assert.ok(source.ok);
  const rims = source.bodies[0].halfRingFilletRims;
  assert.ok(rims);
  const edges = rims.map(rim => [...rim.edges].sort()[1]);
  const authored = withNode(stock, { kind: 'fillet', parent: solid(4), edges, radius: 0.75 });
  const signed = captureSignatures(authored, source.bodies);
  const circle = signed.nodes[0];
  assert.ok(circle.kind === 'sketch' && circle.profile === 'circle');
  const saved = JSON.parse(JSON.stringify({ ...signed, nodes: [{ ...circle, radius: 3 }, ...signed.nodes.slice(1)] })) as StudioDoc;
  const fillet = saved.nodes[5];
  assert.ok(fillet.kind === 'fillet');
  const resized = evaluatePart({ ...stock, nodes: saved.nodes.slice(0, 5) }, 2, 8, 'refs');
  assert.ok(resized.ok);
  const reopened = evaluatePart(saved, 3, 8, 'refs');
  assert.ok(reopened.ok);
  const parentOnly = async (doc: StudioDoc) => {
    assert.equal(doc.nodes.length, 5);
    return resized;
  };

  const accepted = await verifyReferences(saved, reopened.bodies, parentOnly);
  assert.equal(accepted.doc, saved);
  assert.deepEqual([accepted.changes, accepted.problems], [[], []]);

  const wrongCap = { ...fillet, sigs: { ...fillet.sigs, [edges[0]]: fillet.sigs![edges[1]] } };
  const ambiguous = await verifyReferences({ ...saved, nodes: [...saved.nodes.slice(0, 5), wrongCap] },
    reopened.bodies, parentOnly);
  assert.equal(ambiguous.problems.length, 1);
  assert.equal(ambiguous.doc.nodes[5].suppressed, true);
  assert.deepEqual((ambiguous.doc.nodes[5] as typeof fillet).edges, edges);
});

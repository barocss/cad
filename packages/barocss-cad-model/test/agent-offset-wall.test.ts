import assert from 'node:assert/strict';
import test from 'node:test';
import { runCheck } from '../src/chat/spec';
import { acceptProposal, dispatchTool } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { partSnapshot } from '../src/engine/part';
import { isUpperThickenCapOffset } from '../src/engine/upperThickenCapOffset';
import type { Requirement } from '../src/engine/schema/spec';
import { requirementEvidenceRevision } from '../src/util/digest';

const check: Requirement['check'] = {
  query: { fn: 'radial_wall', a: 'n0.normal', b: 'n0.reverse' }, op: '==', value: 2, tol: 0.01, unit: 'mm',
};
const wall = { id: 'RADIAL-2', source: 'Keep the radial wall at 2 ± 0.01 mm.', hard: true, check };
const semicircle = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
function source(thickness = 2) {
  return withNode({ ...emptyDoc(), requirements: [wall], parameters: { thickness } }, {
    kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', side: 'reverse', thickness: { parameter: 'thickness' },
    surface: {
      degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: semicircle.map(([x, y]) => [[x, y, 0], [x, y, 12]]),
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
    },
  });
}
const operation = (distance: number) => ({
  tool: 'features', args: { action: 'command', command: 'offset-face', faces: ['n0.v-max'], values: { d: distance } },
});
async function state(doc: StudioDoc) {
  const result = await evaluate(doc);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}
async function proposal(doc: StudioDoc, distance: number) {
  const made = await dispatchTool(await state(doc), 'proposals', {
    action: 'propose', title: 'Move cap with a protected wall', requirements: [wall.id], ops: [operation(distance)],
  }, evaluate);
  assert.equal(made.isError, false, made.content);
  assert.deepEqual(made.state.doc.nodes, doc.nodes);
  assert.deepEqual(made.state.doc.outputs, doc.outputs);
  return made.state;
}

test('a signed exact upper-cap Offset can be approved with a current radial wall result', async () => {
  for (const distance of [2, -3]) {
    const doc = source(), pending = await proposal(doc, distance);
    assert.deepEqual(pending.doc.proposals?.[0].checks?.after, { pass: 1, fail: 0, unknown: 0 });
    const approved = await acceptProposal(pending, 'P1', evaluate);
    assert.ok('state' in approved, 'error' in approved ? approved.error : '');
    const applied = approved.state.doc;
    assert.deepEqual(applied.nodes[0], doc.nodes[0]);
    assert.ok(applied.nodes[1].kind === 'offset-face');
    assert.equal(applied.nodes[1].distance, distance);
    assert.equal(applied.proposals?.[0].decided?.evidence_revisions?.after, requirementEvidenceRevision(applied));
    const result = await runCheck(applied, approved.state.bodies, evaluate, check);
    assert.equal(result.status, 'pass');
    assert.ok(typeof result.measured === 'number' && Math.abs(result.measured - 2) < 1e-10);
    assert.deepEqual(result.entities, ['n0.normal', 'n0.reverse']);
    const reversed = { ...check, query: { fn: 'radial_wall' as const, a: 'n0.reverse', b: 'n0.normal' } };
    assert.deepEqual((await runCheck(applied, approved.state.bodies, evaluate, reversed)).entities, result.entities);
    const [output] = partBreps(applied);
    assert.equal(Math.max(...output.brep.vertices.map(vertex => vertex.point[2])), 12 + distance);

    const transformed = withNode(applied, { kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [1, 0, 0] });
    const moved = await state(transformed);
    assert.equal((await runCheck(transformed, moved.bodies, evaluate, check)).status, 'unknown');
  }
});

test('changed proposal inputs are stale and a truly thin wall blocks a current proposal', async () => {
  const pending = await proposal(source(), 2);
  const thinDoc = { ...pending.doc, parameters: { thickness: 1 } };
  const stale = await acceptProposal(await state(thinDoc), 'P1', evaluate);
  assert.ok('error' in stale && stale.stale);
  const thin = await proposal(source(1), 2);
  assert.deepEqual(thin.doc.proposals?.[0].checks?.after, { pass: 0, fail: 1, unknown: 0 });
  const before = JSON.stringify(thin.doc);
  const refused = await acceptProposal(thin, 'P1', evaluate);
  assert.match('error' in refused ? refused.error : '', /RADIAL-2: measured 1 mm/);
  assert.equal(JSON.stringify(thin.doc), before);
});

test('the cap proof refuses another native result with the same skin names', async () => {
  const accepted = await acceptProposal(await proposal(source(), 2), 'P1', evaluate);
  assert.ok('state' in accepted);
  const other = await acceptProposal(await proposal(source(), -3), 'P1', evaluate);
  assert.ok('state' in other);
  const doc = accepted.state.doc, snapshot = partSnapshot(doc);
  const names = ['n0.normal', 'n0.reverse'] as const;
  assert.equal(isUpperThickenCapOffset(doc, snapshot, 1, snapshot.outputs[0].brep, names), true);
  assert.equal(isUpperThickenCapOffset(doc, snapshot, 1, partBreps(other.state.doc)[0].brep, names), false);
  assert.equal(isUpperThickenCapOffset(doc, partSnapshot(other.state.doc), 1, snapshot.outputs[0].brep, names), false);
});

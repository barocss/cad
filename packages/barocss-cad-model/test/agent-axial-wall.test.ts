import assert from 'node:assert/strict';
import test from 'node:test';
import { runCheck } from '../src/chat/spec';
import { acceptProposal, dispatchTool } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import type { Requirement } from '../src/engine/schema/spec';

const check: Requirement['check'] = { query: { fn: 'radial_wall', a: 'n0.normal', b: 'n0.reverse' }, op: '==', value: 2, unit: 'mm' };
const wall = { id: 'RADIAL-2', source: 'Keep the radial wall at 2 mm.', hard: true, check };
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const weights = [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1];
const parent = { node: 0, side: 'solid' } as const, tool = { node: 2, side: 'solid' } as const;
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
function operands(start: number, height: number, right = 35) {
  const thicken = withNode({ ...emptyDoc(), requirements: [wall], parameters: { start } }, {
    kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', side: 'reverse', thickness: 2,
    surface: { degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, 12]]), weights: weights.map(weight => [weight, weight]) },
  });
  return withNode(withNode(thicken, { kind: 'sketch', profile: 'rectangle', min: [5, 15], max: [right, 35] }),
    { kind: 'extrude', sketch: 1, from: { parameter: 'start' }, height });
}

test('radial wall follows a full axial end cut using its current resolved cutter and native skins', async () => {
  for (const [start, height] of [[8, 9], [6, 9], [-3, 7]]) {
    const doc = withNode(operands(start, height), { kind: 'difference', parent, tool });
    const native = await evaluate(doc);
    assert.ok(native.ok);
    const outcome = await runCheck(doc, native.bodies, evaluate, check);
    assert.equal(outcome.status, 'pass');
    assert.ok(typeof outcome.measured === 'number' && Math.abs(outcome.measured - 2) < 1e-10);
    assert.deepEqual(outcome.entities, ['n0.normal', 'n0.reverse']);
  }
});

test('a partial or ineffective cut cannot provide a passing wall or be approved with that hard requirement', async () => {
  for (const [start, height, right] of [[8, 9, 22], [13, 3, 35]]) {
    const doc = operands(start, height, right);
    const native = await evaluate(doc);
    assert.ok(native.ok);
    const state = { doc, bodies: native.bodies };
    const made = await dispatchTool(state, 'proposals', {
      action: 'propose', title: 'Cut with protected wall', requirements: [wall.id], ops: [
        { tool: 'features', args: { action: 'command', command: 'difference', bodies: ['b0', 'b2'] } },
      ],
    }, evaluate);
    assert.equal(made.isError, false, made.content);
    assert.deepEqual(made.state.doc.proposals?.[0].checks?.after, { pass: 0, fail: 0, unknown: 1 });
    const cut = withNode(doc, { kind: 'difference', parent, tool });
    const nativeCut = await evaluate(cut);
    assert.ok(nativeCut.ok);
    const [leaf] = partBreps(cut);
    assert.ok(leaf.brep.faces.some(face => face.name === 'n0.normal') && leaf.brep.faces.some(face => face.name === 'n0.reverse'));
    const result = await runCheck(cut, nativeCut.bodies, evaluate, check);
    assert.equal(result.status, 'unknown');
    assert.equal(result.measured, undefined);
    const pending = JSON.stringify(made.state.doc);
    const refused = await acceptProposal(made.state, 'P1', evaluate);
    assert.match('error' in refused ? refused.error : '', /RADIAL-2:.*full axial-end cut/);
    assert.equal(JSON.stringify(made.state.doc), pending);
  }
});

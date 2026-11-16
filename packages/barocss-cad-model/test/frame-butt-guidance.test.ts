import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { friendly, friendlyCause } from '../src/engine/errors';
const fixture: Extract<ModelNode, { kind: 'frame' }> = { kind: 'frame', points: [[0, 0, 0], [400, 0, 0], [200, 0, 0], [200, 300, 0]], segments: [[0, 1], [2, 3]], section: { kind: 'round-tube', diameter: 40, wall: 3 }, corners: { tee: 'butt' } };
test('round tube T refuses Butt precisely and the same frame supports Cope', () => {
  const doc = withNode(emptyDoc(), fixture), snapshot = JSON.stringify(doc), failed = evaluateDoc(doc, 1);
  assert.equal(failed.ok, false); if (failed.ok) return;
  assert.equal(failed.error.code, 'BUTT_ON_OPEN_SIDE');
  assert.match(failed.error.detail, /point 2: member 1 meets member 0: its end spans/);
  const repaired = evaluateDoc(withNode(emptyDoc(), { ...fixture, corners: { tee: 'cope' } }), 2);
  assert.ok(repaired.ok, JSON.stringify(repaired)); assert.equal(repaired.bodies.length, 2);
  assert.ok(repaired.bodies.every(body => body.volume! > 0)); assert.equal(JSON.stringify(doc), snapshot);
  assert.equal(failed.error.title, 'Butt joint would leave a gap');
  assert.match(failed.error.hint, /Point 3.*member 2.*member 1/);
  assert.match(failed.error.hint, /T-joints.*Cope/);
});
test('typed guidance preserves details and uses only strict, safe location indices', () => {
  const detail = '[BUTT_ON_OPEN_SIDE] point 2: member 1 meets member 0: its end spans -20 to 20 mm';
  const result = friendly(detail); assert.equal(result.detail, detail); assert.equal(result.code, 'BUTT_ON_OPEN_SIDE');
  assert.match(result.hint, /Point 3.*member 2.*member 1/);
  for (const where of ['point -1: member 1 meets member 0', 'point 2.5: member 1 meets member 0', 'point 9007199254740992: member 1 meets member 0', 'unknown location']) {
    const error = friendly(`[BUTT_ON_OPEN_SIDE] ${where}: its end spans -20 to 20 mm`);
    assert.equal(error.title, result.title); assert.doesNotMatch(error.hint, /Point \d/);
  }
  const typed = friendlyCause(Object.assign(new Error('unknown location'), { code: 'BUTT_ON_OPEN_SIDE' }));
  assert.equal(typed.title, result.title); assert.equal(typed.detail, 'unknown location');
  assert.notEqual(friendly('BUTT_ON_OPEN_SIDE without a typed code').title, result.title);
  assert.notEqual(friendly('[BUTT_NOT_ON_A_FACE] point 2').title, result.title);
});

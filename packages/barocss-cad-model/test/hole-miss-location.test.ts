import test from 'node:test';
import assert from 'node:assert/strict';
import { CadPartError } from '@barocss/cad';
import { rectanglePart, withNode } from '../src/engine/doc';
import { evaluateDoc, evaluatePreview } from '../src/engine/evaluate';
import { friendlyCause } from '../src/engine/errors';
import { holeMissLocation } from '../src/engine/holeMissLocation';
const row = (step = 12, count = 4) => withNode(rectanglePart(40, 40, 12), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [8, 20], radius: 2, pattern: { count, step: [step, 0] } });

test('native row misses identify final and intermediate copies without changing detail or input', () => {
  for (const count of [4, 5]) {
    const doc = row(12, count), before = JSON.stringify(doc);
    for (const evaluate of [evaluateDoc, evaluatePreview]) {
      const result = evaluate(doc, 1); assert.equal(result.ok, false);
      if (result.ok) throw new Error('expected refusal');
      assert.equal(result.error.code, 'SELECTION');
      assert.equal(result.error.feature, count === 4 ? 'n2' : 'n2_p3');
      assert.match(result.error.hint, new RegExp(`Hole 4 of ${count} at X 44, Y 20 mm`));
      assert.match(result.error.detail, /the hole at \(44, 20\) along z misses the target/);
      assert.equal(JSON.stringify(doc), before);
    }
  }
});

test('native notch and corrected complete row remain admitted', () => {
  for (const step of [11, 9]) {
    const doc = row(step), before = JSON.stringify(doc), result = evaluateDoc(doc, 1);
    assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
    assert.ok(result.bodies[0].volume! < 40 * 40 * 12);
    assert.equal(JSON.stringify(doc), before);
  }
});

test('native circle copy miss uses actual authored order', () => {
  const doc = withNode(rectanglePart(40, 40, 12), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [8, 20], radius: 2, pattern: { count: 4, about: [30, 20] } });
  const result = evaluateDoc(doc, 1); assert.equal(result.ok, false);
  if (result.ok) throw new Error('expected refusal');
  assert.match(result.error.hint, /Hole 2 of 4 at X 30, Y -2 mm/);
});

test('unowned, stale, malformed and unrelated refusals retain the fallback unchanged', () => {
  const cause = new CadPartError('SELECTION', 'n2', 'the hole at (44, 20) along z misses the target');
  const error = friendlyCause(cause);
  for (const [doc, bad] of [
    [row(9), cause], [row(12, 5), cause],
    [row(), Object.assign(new Error(cause.message), { code: 'SELECTION', feature: 'n2' })],
    [row(), new CadPartError('GEOMETRY', 'n2', 'the hole at (44, 20) along z misses the target')],
    [row(), new CadPartError('SELECTION', 'n2', 'extra the hole at (44, 20) along z misses the target')],
    [rectanglePart(40, 40, 12), cause],
  ] as const) assert.equal(holeMissLocation(doc, bad, error), error);
  const enriched = holeMissLocation(row(), cause, error);
  assert.equal(enriched.detail, error.detail); assert.equal(enriched.feature, error.feature); assert.equal(enriched.code, error.code);
});


test('malformed later holes cannot mask an earlier native refusal', () => {
  const cause = new CadPartError('SELECTION', 'n2', 'the hole at (44, 20) along z misses the target'), error = friendlyCause(cause);
  for (const bad of [{ center: null }, { center: [Symbol('invalid'), 20] }, { center: [{ valueOf() { throw new Error('invalid value'); } }, 20] }, { pattern: { count: Infinity, step: [0, 0] } }, { pattern: { count: 1e9, step: [0, 0] } }, { pattern: { count: 2, about: null } }]) {
    const doc = row();
    const broken = { ...doc, nodes: [...doc.nodes, { ...doc.nodes[2], ...bad }] } as unknown as typeof doc;
    const result = holeMissLocation(broken, cause, error);
    assert.equal(result.detail, error.detail);
    assert.ok(result === error || /Hole 4 of 4/.test(result.hint));
  }
});

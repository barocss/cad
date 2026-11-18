import test from 'node:test';
import assert from 'node:assert/strict';
import { commandById, type Ctx, type Values } from '../src/app/commands';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
const mirror = commandById('mirror')!;
function context(doc: StudioDoc): Ctx {
  const result = evaluateDoc(doc, 1); assert.ok(result.ok);
  return { doc, bodies: result.bodies, selection: { bodies: [0], faces: [], edges: [] } };
}
const sheet = context(withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [80, 50] }), { kind: 'sheet-base', sketch: 0, thickness: 1.5, bendRadius: 1.5, kFactor: 0.44 }));
test('Only one selected sheet body gets the flat-pattern contract, never a success check', () => {
  assert.ok(sheet.bodies[0].sheet);
  for (const result of ['combined', 'reflected']) {
    const steps = mirror.steps!(sheet, { plane: 'yz', at: 0, result });
    assert.equal(steps.length, 1); assert.equal(steps[0].label, 'Flat pattern'); assert.equal(steps[0].done, false);
    if (result === 'combined') assert.equal(steps[0].text, 'Original and reflection creates a solid result without a sheet-metal flat pattern.');
    else assert.equal(steps[0].text, 'Reflected body only supports the YZ plane at X = 0. Flat-pattern availability depends on the evaluated result.');
    assert.deepEqual(mirror.steps!(context(rectanglePart(40, 30, 10)), { result }), []);
    assert.deepEqual(mirror.steps!({ ...sheet, selection: { bodies: [], faces: [], edges: [] } }, { result }), []);
    assert.deepEqual(mirror.steps!({ ...sheet, bodies: [...sheet.bodies, ...sheet.bodies], selection: { bodies: [0, 1], faces: [], edges: [] } }, { result }), []);
  }
});
test('Sheet guidance appends without replacing picked-plane and recovery steps or mutating values', () => {
  const plain = { ...sheet, selection: { bodies: [], faces: [], edges: [] } };
  const cases: Values[] = [{ plane: 'yz', at: 0, planeFace: 'n1.side0', result: 'combined' }, { plane: 'xz', at: 12, pickPlane: 'yes', planeFace: 'n1.side0', result: 'reflected' }, { pickPlane: 'yes' }];
  for (const values of cases) {
    const original = structuredClone(values), base = mirror.steps!(plain, values), steps = mirror.steps!(sheet, values);
    assert.deepEqual(steps.slice(0, -1), base); assert.equal(steps.at(-1)!.label, 'Flat pattern'); assert.equal(steps.at(-1)!.done, false); assert.deepEqual(values, original);
  }
});

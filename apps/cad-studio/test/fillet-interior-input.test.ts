import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { newFilletActive } from '../src/app/filletFamily';
import { filletInteriorProblems, historyFilletInteriorProblems, hasFilletInteriorProblem } from '../src/app/filletInteriorInput';

const doc = rectanglePart(40, 30, 10), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
const ctx = { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{ body: 0, edge }], bodies: [] } };
const values = { radius: 1.25, endRadius: 2.5, stationMode: 'two-interior', stationAt: 25, stationRadius: 3, station2At: 62.5, station2Radius: 1 };
const active = (patch = {}) => newFilletActive('edge', ctx, { ...values, ...patch });
function node(fractions = [0.25, 0.625]): Extract<ModelNode, { kind: 'fillet' }> {
  return { id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.top'], radius: 1.25,
    radii: [{ at: [0, 0, 10], radius: 1.25, atEnd: true }, ...fractions.map(fraction => ({ at: [40 * fraction, 0, 10] as [number, number, number], radius: 2, fraction })), { at: [40, 0, 10], radius: 2.5, atEnd: true }] };
}
const validFraction = (percent: number) => { const f = percent / 100; return f > 1e-9 && f < 1 - 1e-9; };
test('percent admission follows existing command fraction boundaries without widening or rounding', () => {
  for (const percent of [0, -1, 100, 101, NaN, Infinity, 1e-7, 1.0000000000000002e-7, 99.9999999, 99.99999989999999, 25, 62.5, 70]) {
    const a = active({ stationMode: 'interior', stationAt: percent });
    const accepted = !hasFilletInteriorProblem(a);
    assert.equal(accepted, validFraction(percent), String(percent));
    if (accepted) assert.doesNotThrow(() => a.cmd.build!(ctx, a.values));
    else assert.throws(() => a.cmd.build!(ctx, a.values), /interior position/);
  }
  for (const text of ['', ' ', 'NaN', 'Infinity', '1e']) assert.ok(filletInteriorProblems(active({ stationAt: text })).stationAt);
});
test('ordering compares individually converted fractions, not a percentage-space difference', () => {
  for (const [a, b] of [[25, 25], [25, 10], [25, 25.000000099999998], [25, 25.0000001], [0.003123456789, 0.003123556789], [25, 62.5]]) {
    const current = active({ stationAt: a, station2At: b });
    const accepted = b / 100 - a / 100 > 1e-9;
    assert.equal(!hasFilletInteriorProblem(current), accepted, `${a},${b}`);
    if (accepted) assert.doesNotThrow(() => current.cmd.build!(ctx, current.values));
    else { assert.deepEqual(Object.keys(filletInteriorProblems(current)), ['station2At']); assert.throws(() => current.cmd.build!(ctx, current.values), /position 2 after/); }
  }
  const both = filletInteriorProblems(active({ stationAt: 100, station2At: 0 }));
  assert.deepEqual(Object.keys(both).sort(), ['station2At', 'stationAt']);
  assert.ok(!Object.values(both).some(message => /after/i.test(message!)), 'range problems take precedence over order');
});
test('untouched History fractions are read directly and every authored bit remains unchanged', () => {
  const fraction = 0.000002999991000027; assert.notEqual(fraction * 100 / 100, fraction);
  const feature = node([fraction]), before = structuredClone(feature);
  assert.deepEqual(historyFilletInteriorProblems(feature), {}); assert.deepEqual(feature, before);
  for (const raw of ['', '0', '100', '-1', 'NaN', 'Infinity']) assert.ok(historyFilletInteriorProblems(feature, { stationAt: raw }).stationAt);
  assert.deepEqual(feature, before, 'validation cannot serialize or mutate input');
  const pair = node();
  assert.deepEqual(Object.keys(historyFilletInteriorProblems(pair, { station2At: '25' })), ['station2At']);
  assert.deepEqual(historyFilletInteriorProblems(pair, { station2At: '70' }), {});
  assert.deepEqual(historyFilletInteriorProblems(node([1e-9])), { stationAt: filletInteriorProblems(active({ stationMode: 'interior', stationAt: 1e-7 })).stationAt });
});
test('hidden station values do not gate ends/constant modes or unrelated features', () => {
  assert.deepEqual(filletInteriorProblems(active({ stationMode: 'ends', stationAt: 0, station2At: 100 })), {});
  const constant = active({ stationAt: 0 }); constant.fillet = { ...constant.fillet!, radiusMode: 'constant' };
  assert.deepEqual(filletInteriorProblems(constant), {});
  assert.deepEqual(filletInteriorProblems(active({ stationMode: 'interior', stationAt: 25, station2At: 0 })), {});
  assert.deepEqual(historyFilletInteriorProblems(doc.nodes[1], { stationAt: '0' }), {});
  assert.deepEqual(historyFilletInteriorProblems(undefined), {});
  const ends = node([]); assert.deepEqual(historyFilletInteriorProblems(ends, { stationAt: '0' }), {});
});
test('a numerically valid but impossible radius remains a native geometry refusal', () => {
  const current = active({ radius: 100, endRadius: 100, stationRadius: 100, station2Radius: 100 });
  assert.deepEqual(filletInteriorProblems(current), {});
  const built = current.cmd.build!(ctx, current.values), result = evaluateDoc(built, 1);
  assert.equal(result.ok, false, 'numeric helper must not claim geometry acceptance');
});

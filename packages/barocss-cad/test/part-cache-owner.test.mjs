import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, evaluateCadPart, massPropertiesOf, reevaluate, tessellateBrep } from '../dist/index.js';

const mesh = { positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], indices: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3] };
const document = (features, parameters = {}) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters, features });
const meshFeature = id => ({ id, kind: 'mesh', ...structuredClone(mesh), representation: 'facets' });
const checkedGeometry = output => {
  const report = checkBrep(output.brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  const tessellation = tessellateBrep(output.brep);
  return { positions: [...tessellation.positions], indices: [...tessellation.indices], volume: massPropertiesOf(output).volume };
};

for (const owners of [['ref1', 'ref2'], ['ref2', 'ref1']]) {
  test(`equal meshes keep named-result ownership through ${owners.join(' then ')}, while the same owner still reuses`, () => {
    const first = evaluateCadPart(document([meshFeature(owners[0])])), old = first.outputs[0], before = checkedGeometry(old);
    const changed = reevaluate(first, { document: document([meshFeature(owners[1])]) }), current = changed.outputs[0];
    assert.deepEqual(changed.recomputation, { evaluated: [owners[1]], reused: [] });
    assert.notEqual(current.brep, old.brep);
    assert.equal(current.id, owners[1]);
    assert.ok(current.brep.faces.every(face => face.name.startsWith(owners[1] + '.')));
    assert.ok(current.brep.edges.every(edge => edge.id.startsWith(owners[1] + '_e')));
    assert.ok(current.brep.edges.every(edge => edge.name === undefined || edge.name.split('|').every(name => name.startsWith(owners[1] + '.'))));
    assert.ok(old.brep.faces.every(face => face.name.startsWith(owners[0] + '.')), 'the earlier result is not renamed or mutated');
    assert.deepEqual(checkedGeometry(current), before);
    assert.ok(Math.abs(before.volume - 1000 / 6) < 1e-10);
    const same = reevaluate(changed, { document: document([meshFeature(owners[1])]) });
    assert.deepEqual(same.recomputation, { evaluated: [], reused: [owners[1]] });
    assert.equal(same.outputs[0].brep, current.brep);
  });
}

test('a renamed analytic producer rebuilds its own names without invalidating an unrelated branch', () => {
  const source = document([
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 5] },
    { id: 'a', kind: 'extrude', sketch: 's', height: { parameter: 'height' } },
    { id: 't', kind: 'sketch', profile: 'rectangle', min: [20, 0], max: [26, 4] },
    { id: 'b', kind: 'extrude', sketch: 't', height: 2 },
    meshFeature('m'),
  ], { height: 2 });
  const first = evaluateCadPart(source), originalB = first.outputs.find(output => output.feature === 'b');
  const edited = reevaluate(first, { parameters: { height: 3 } });
  assert.deepEqual(edited.recomputation, { evaluated: ['a'], reused: ['b', 'm'] });
  assert.equal(edited.outputs.find(output => output.feature === 'b').brep, originalB.brep);
  assert.ok(Math.abs(massPropertiesOf(edited.outputs.find(output => output.feature === 'a')).volume - 150) < 1e-10);
  const before = checkedGeometry(edited.outputs.find(output => output.feature === 'a'));
  const renamed = reevaluate(edited, { document: { ...source, parameters: { height: 3 },
    features: source.features.map(feature => feature.id === 'a' ? { ...feature, id: 'new_a' } : feature) } });
  assert.deepEqual(renamed.recomputation, { evaluated: ['new_a'], reused: ['b', 'm'] });
  const output = renamed.outputs.find(output => output.feature === 'new_a');
  assert.ok(output.brep.faces.every(face => face.name.startsWith('new_a.')));
  assert.deepEqual(checkedGeometry(output), before);
  assert.equal(renamed.outputs.find(output => output.feature === 'b').brep, originalB.brep);
  const same = reevaluate(renamed, { document: structuredClone(renamed.document) });
  assert.deepEqual(same.recomputation, { evaluated: [], reused: ['new_a', 'b', 'm'] });
});

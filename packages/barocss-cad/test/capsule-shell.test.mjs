import test from 'node:test';
import assert from 'node:assert/strict';
import { brepMassProperties, checkBrep, evaluateCadPart, massPropertiesOf } from '../dist/index.js';

const sketch = { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
  { kind: 'arc', start: [0, -10], center: [0, 0], direction: 'ccw' },
  { kind: 'line', start: [10, 0] },
  { kind: 'arc', start: [10, 40], center: [0, 40], direction: 'ccw' },
  { kind: 'line', start: [0, 50] },
] };
const revolve = { id: 'n1', kind: 'revolve', sketch: 'n0', axis: { origin: [0, 0], direction: 'y' }, angle: 360 };
const shell = (thickness, open = ['n1.side2']) => ({ id: 'sh', kind: 'shell', target: 'n1', thickness, open });
const evaluate = (...features) => evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features }).outputs[0];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('an exact open capsule retains the original barrel and the other hemisphere', () => {
  const source = evaluate(sketch, revolve);
  const frozen = structuredClone(source.brep);
  for (const thickness of [1, 2]) {
    const result = evaluate(sketch, revolve, shell(thickness)), { brep } = result;
    const report = checkBrep(brep, { strict: true, pcurveSamples: 13 });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 36, edges: 18, vertices: 10 });
    assert.equal(report.topology[0].genus, 0);
    assert.deepEqual(brep.faces.filter(face => face.name.startsWith('n1.')).map(face => ({name:face.name, surface:face.surface.controlPoints})),
      frozen.faces.filter(face => /^n1\.side[01]#/.test(face.name)).map(face => ({name:face.name, surface:face.surface.controlPoints})));
    assert.deepEqual(brep.source, { family: 'shell', id: 'sh' });
    const sameNames = new Set(brep.edges.map(edge => edge.name));
    const retainedEdges = frozen.edges.filter(edge => edge.name.split('|').every(name => /^n1\.side[01]#/.test(name)));
    assert.ok(retainedEdges.length > 0);
    for (const edge of retainedEdges) {
      assert.ok(sameNames.has(edge.name), edge.name);
      const retained = brep.edges.find(item => item.name === edge.name);
      assert.deepEqual(retained.curve.controlPoints, edge.curve.controlPoints);
    }
    const radius = 10 - thickness;
    const expectedVolume = Math.PI * (40 * (100 - radius ** 2) + 2 * (1000 - radius ** 3) / 3);
    const expectedY = Math.PI * (800 * (100 - radius ** 2) - (10000 - radius ** 4) / 4) / expectedVolume;
    const closedForm = massPropertiesOf(result, 1);
    assert.equal(closedForm.method, 'closed-form');
    for (const mass of [closedForm, brepMassProperties(brep, 1)]) {
      close(mass.volume, expectedVolume);
      close(mass.centroid[0], 0);
      close(mass.centroid[1], expectedY);
      close(mass.centroid[2], 0);
    }
  }
  assert.deepEqual(source.brep, frozen);
});

test('an open capsule refuses an axis collapse or a partial native chart selection', () => {
  assert.throws(() => evaluate(sketch, revolve, shell(10)), error => error.code === 'PARAMETER');
  assert.throws(() => evaluate(sketch, revolve, shell(1, ['n1.side2#1'])), error => error.code === 'CAPABILITY');
  assert.throws(() => evaluate(sketch, { ...revolve, angle: 180 }, shell(1)), error => error.code === 'CAPABILITY' && /full turn/.test(error.message));
  const distinctArc = { ...sketch, segments: [{ ...sketch.segments[0], center: [1, -1] }, ...sketch.segments.slice(1)] };
  assert.throws(() => evaluate(distinctArc, revolve, shell(1)), error => error.code === 'CAPABILITY' && /straight walls/.test(error.message));
});

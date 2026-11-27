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

for (const [opened, kept] of [['side2', 'side0'], ['side0', 'side2']]) {
  test(`an exact capsule opened at ${opened} retains the original barrel and the other hemisphere`, () => {
    const source = evaluate(sketch, revolve);
    const frozen = structuredClone(source.brep);
    for (const thickness of [1, 1.2, 2]) {
      const result = evaluate(sketch, revolve, shell(thickness, [`n1.${opened}`])), { brep } = result;
      const report = checkBrep(brep, { strict: true, pcurveSamples: 13 });
      assert.ok(report.valid, report.issues.join('\n'));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 36, edges: 18, vertices: 10 });
      assert.equal(report.topology[0].genus, 0);
      const retainedName = name => name.startsWith('n1.side1#') || name.startsWith(`n1.${kept}#`);
      const retainedFaces = solid => Object.fromEntries(solid.faces.filter(face => retainedName(face.name))
        .map(face => {
          const { id, ...surface } = face.surface;
          assert.ok(id);
          return [face.name, surface];
        }));
      assert.deepEqual(retainedFaces(brep), retainedFaces(frozen));
      assert.deepEqual(brep.source, { family: 'shell', id: 'sh' });
      const sameNames = new Set(brep.edges.map(edge => edge.name));
      const retainedEdges = frozen.edges.filter(edge => edge.name.split('|').every(retainedName));
      assert.ok(retainedEdges.length > 0);
      for (const edge of retainedEdges) {
        assert.ok(sameNames.has(edge.name), edge.name);
        const retained = brep.edges.find(item => item.name === edge.name);
        assert.deepEqual(retained.curve.controlPoints, edge.curve.controlPoints);
      }
      const radius = 10 - thickness;
      const expectedVolume = Math.PI * (40 * (100 - radius ** 2) + 2 * (1000 - radius ** 3) / 3);
      const upperOpeningY = Math.PI * (800 * (100 - radius ** 2) - (10000 - radius ** 4) / 4) / expectedVolume;
      const expectedY = opened === 'side0' ? 40 - upperOpeningY : upperOpeningY;
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
}

test('the lower opening follows tagged, cycled and reversed capsule meridians', () => {
  const tagged = { ...sketch, sideTags: { outer: ['lower', 'barrel', 'upper', 'axis'] } };
  const rotated = list => [...list.slice(1), list[0]];
  const reversed = tagged.segments.map((segment, i) => ({
    ...segment, start: tagged.segments[(i + 1) % tagged.segments.length].start,
    ...(segment.kind === 'arc' ? { direction: 'cw' } : {}),
  })).reverse();
  const variants = [
    tagged,
    { ...tagged, segments: rotated(tagged.segments), sideTags: { outer: rotated(tagged.sideTags.outer) } },
    { ...tagged, segments: reversed, sideTags: { outer: [...tagged.sideTags.outer].reverse() } },
  ];
  for (const variant of variants) {
    const result = evaluate(variant, revolve, shell(1, ['n1.side[lower]']));
    const report = checkBrep(result.brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    const outerNames = result.brep.faces.map(face => face.name).filter(name => name.startsWith('n1.')).sort();
    assert.deepEqual(outerNames, ['n1.side[barrel]#1', 'n1.side[barrel]#2', 'n1.side[upper]#1', 'n1.side[upper]#2']);
    close(massPropertiesOf(result, 1).centroid[1], 24.755226789510985);
  }
});

test('an open capsule refuses an axis collapse or a partial native chart selection', () => {
  for (const opening of ['n1.side0', 'n1.side2']) {
    assert.throws(() => evaluate(sketch, revolve, shell(10, [opening])), error => error.code === 'PARAMETER');
    assert.throws(() => evaluate(sketch, revolve, shell(1, [opening + '#1'])), error => error.code === 'CAPABILITY');
  }
  assert.throws(() => evaluate(sketch, { ...revolve, angle: 180 }, shell(1)), error => error.code === 'CAPABILITY' && /full turn/.test(error.message));
  const distinctArc = { ...sketch, segments: [{ ...sketch.segments[0], center: [1, -1] }, ...sketch.segments.slice(1)] };
  assert.throws(() => evaluate(distinctArc, revolve, shell(1)), error => error.code === 'CAPABILITY' && /straight walls/.test(error.message));
});

test('opening the two original capsule hemispheres retains the exact barrel as a through Shell', () => {
  const source = evaluate(sketch, revolve).brep;
  const barrelCurves = brep => {
    const barrelLoops = new Set(brep.faces.filter(face => face.name.startsWith('n1.side1#')).flatMap(face => face.loops));
    const uses = new Set(brep.loops.filter(loop => barrelLoops.has(loop.id)).flatMap(loop => loop.coedges));
    const edges = new Set(brep.coedges.filter(use => uses.has(use.id)).map(use => use.edge));
    return brep.edges.filter(edge => edges.has(edge.id)).map(edge => {
      const { id, ...curve } = edge.curve;
      assert.ok(id);
      return JSON.stringify(curve);
    }).sort();
  };
  const ends = ['n1.side0', 'n1.side2'];
  let first;
  for (const open of [ends, [...ends].reverse()]) {
    const output = evaluate(sketch, revolve, shell(1.2, open)), { brep } = output;
    if (first) assert.deepEqual(brep, first);
    first = brep;
    const report = checkBrep(brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 32, edges: 16, vertices: 8 });
    assert.equal(report.topology[0].genus, 1);
    assert.deepEqual(barrelCurves(brep), barrelCurves(source));
    assert.deepEqual(brep.faces.map(face => face.name).sort(), [
      'n1.side1#1', 'n1.side1#2', 'sh.in.n1.side1#1', 'sh.in.n1.side1#2',
      'sh.rim.lower#1', 'sh.rim.lower#2', 'sh.rim.upper#1', 'sh.rim.upper#2',
    ]);
    const volume = Math.PI * 40 * (100 - 8.8 ** 2);
    const exact = massPropertiesOf(output, 1);
    assert.equal(exact.method, 'closed-form');
    for (const mass of [exact, brepMassProperties(brep, 1)]) {
      close(mass.volume, volume);
      mass.centroid.forEach((value, axis) => close(value, [0, 20, 0][axis]));
    }
  }
  assert.throws(() => evaluate(sketch, revolve, shell(10, ends)), error => error.code === 'PARAMETER');
  for (const open of [['n1.side0', 'n1.side2#1'], ['n1.side0', 'n1.side1'], ['n1.side0', 'n1.side0']]) {
    assert.throws(() => evaluate(sketch, revolve, shell(1, open)), error => error.code === 'CAPABILITY');
  }
});

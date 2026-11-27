import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCadPart, projectBrepHiddenLines, reevaluate, transformBrep } from '../dist/index.js';

const circle = { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: { parameter: 'R' } };
const prism = { id: 'n1', kind: 'extrude', sketch: 'n0', height: 10 };
const document = (R, features = [circle, prism]) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { R }, features,
});
const top = { toward: [0, 0, 1], up: [0, 1, 0] };
const circles = brep => projectBrepHiddenLines([brep], top).edges.filter(edge => edge.circle).map(edge => edge.circle);
const radii = brep => circles(brep).map(edge => edge.nominalRadius);
const body = snapshot => snapshot.outputs[0].brep;

test('original circle caps retain the authored radius separately from their projected curves', () => {
  const native = body(evaluateCadPart(document(6.35)));
  assert.deepEqual(radii(native), [6.35, 6.35, 6.35, 6.35]);
  assert.ok(circles(native).some(edge => edge.radius !== 6.35));
  const copy = JSON.parse(JSON.stringify(native));
  const geometry = ({ nominalRadius, ...circle }) => circle;
  assert.deepEqual(circles(native).map(geometry), circles(copy));
  assert.ok(circles(copy).every(edge => edge.nominalRadius === undefined));
});

test('parameter changes refresh authored nominals even when the normalized profile rounds to the same geometry', () => {
  const old = evaluateCadPart(document(6.35));
  const edited = reevaluate(old, { document: document(7) });
  assert.deepEqual(radii(body(edited)), [7, 7, 7, 7]);
  assert.deepEqual(radii(body(reevaluate(edited, { document: document(6.35) }))), [6.35, 6.35, 6.35, 6.35]);
  const shifted = { ...circle, center: [8192, 0] };
  const exact = evaluateCadPart(document(1, [shifted, prism]));
  const rounded = reevaluate(exact, { document: document(1 + Number.EPSILON, [shifted, prism]) });
  assert.deepEqual(body(rounded), body(exact));
  assert.deepEqual(radii(body(exact)), [1, 1, 1, 1]);
  assert.deepEqual(radii(body(rounded)), [undefined, undefined, undefined, undefined]);
});

test('new B-reps and changed Booleans use the geometric projection radius', () => {
  const original = body(evaluateCadPart(document(6.35)));
  const translated = body(evaluateCadPart(document(6.35, [circle, prism,
    { id: 'n2', kind: 'translate', target: 'n1', offset: [0, 5, 0] }])));
  const cut = body(evaluateCadPart(document(6.35, [circle, prism,
    { ...circle, id: 'toolProfile', radius: 2 },
    { ...prism, id: 'tool', sketch: 'toolProfile', from: -1, height: 12 },
    { id: 'cut', kind: 'difference', target: 'n1', tool: 'tool' }])));
  for (const derived of [transformBrep(original, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] }), translated, cut]) {
    assert.ok(circles(derived).length > 0);
    assert.ok(radii(derived).every(radius => radius === undefined));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { orderedInterference } from '../src/ui/interferenceOrder';
import { InterferenceInspector } from '../src/ui/MeasurementInspector';
import type { InterferenceReport } from '../src/app/checkInterference';

const pairs = [2, 10, 100, 10.04, 10.01, 10, 0].map((volume, index) => Object.freeze({ a: 'same-name-' + index, b: 'other', volume }));
Object.freeze(pairs);
test('raw numeric order preserves ties, record identity and the original immutable sequence', () => {
  const largest = orderedInterference(pairs, 'largest'), smallest = orderedInterference(pairs, 'smallest');
  assert.deepEqual(largest.map(x => x.volume), [100, 10.04, 10.01, 10, 10, 2, 0]);
  assert.deepEqual(smallest.map(x => x.volume), [0, 2, 10, 10, 10.01, 10.04, 100]);
  assert.equal(largest[3], pairs[1]); assert.equal(largest[4], pairs[5]);
  assert.equal(smallest[2], pairs[1]); assert.equal(smallest[3], pairs[5]);
  assert.equal(orderedInterference(pairs, 'original'), pairs);
  assert.deepEqual(pairs.map(x => x.volume), [2, 10, 100, 10.04, 10.01, 10, 0]);
});
test('empty/single results and defensive nonfinite values stay visible without zero coercion', () => {
  assert.deepEqual(orderedInterference([], 'largest'), []);
  assert.equal(orderedInterference([pairs[0]], 'smallest')[0], pairs[0]);
  const odd = [{ volume: NaN }, { volume: 2 }, { volume: Infinity }, { volume: 1 }];
  for (const order of ['largest', 'smallest'] as const) {
    const rows = orderedInterference(odd, order);
    assert.equal(rows.length, odd.length); assert.equal(rows[2], odd[0]); assert.equal(rows[3], odd[2]);
  }
});
function render(clashes: InterferenceReport | 'busy') {
  return renderToStaticMarkup(createElement(InterferenceInspector, { doc: emptyDoc(), bodies: [], clashes,
    setClashes() { throw new Error('render cannot close'); }, setSelection() { throw new Error('sort cannot select'); } }));
}
test('actual Inspector retains partial/failure/empty truth and exposes default order only for reports', () => {
  const report: InterferenceReport = { checked: ['a', 'b', 'c'], pairs: 3, clashes: [{ a: 'a', b: 'b', volume: 2 }],
    failures: [{ a: 'b', b: 'c', error: { title: 'Unsupported', detail: 'Native refusal', hint: 'Keep source' } }] };
  const before = structuredClone(report), html = render(report);
  assert.match(html, /Interference check incomplete/); assert.match(html, /Native refusal/);
  assert.match(html, /aria-label="Interference order"/); assert.match(html, /value="original" selected=""/);
  assert.match(html, /2 mm³/); assert.deepEqual(report, before);
  assert.match(render({ ...report, pairs: 1, clashes: [] }), /Interference check failed/);
  assert.match(render({ ...report, failures: [], clashes: [] }), /No bodies overlap/);
  assert.doesNotMatch(render('busy'), /Interference order/); assert.match(render('busy'), /Checking/);
});

test('Inspector preserves small positive volumes and the usual display precision', () => {
  const report: InterferenceReport = { checked: ['a', 'b', 'c'], pairs: 3,
    clashes: [{ a: 'a', b: 'b', volume: 0.01 }, { a: 'a', b: 'c', volume: 0.34 }, { a: 'b', b: 'c', volume: 0.001 }], failures: [] };
  const html = render(report);
  assert.match(html, /0\.01 mm³/);
  assert.match(html, /0\.3 mm³/);
  assert.match(html, /1\.00e-3 mm³/);
  assert.doesNotMatch(html, / · 0 mm³/);
});

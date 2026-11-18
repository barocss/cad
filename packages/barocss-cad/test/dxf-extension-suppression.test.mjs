import test from 'node:test';
import assert from 'node:assert/strict';
import { writeDxf, isDxfWriteError } from '../dist/index.js';

const linear = { kind: 'linear', p1: [0, 0], p2: [40, 0], line: [0, 10], angle: 0 };
const aligned = { kind: 'aligned', p1: [0, 0], p2: [24, 32], line: [0, 10] };
const entity = geometry => ({ type: 'dimension', geometry, text: '40', textAt: [20, 10], measurement: 40,
  // Caller-owned block supplied as-is. This test verifies semantic override writing, not regeneration.
  block: [{ type: 'line', a: [0, 10], b: [40, 10] }, { type: 'text', text: '40', at: [20, 10], height: 3 }],
});
function records(text) {
  const lines = text.trimEnd().split('\n'), out = []; let current;
  for (let i = 0; i < lines.length; i += 2) {
    const pair = [Number(lines[i]), lines[i + 1]];
    if (pair[0] === 0) { current = []; out.push(current); }
    current?.push(pair);
  }
  return out;
}
for (const version of ['AC1015', 'AC1009']) {
  for (const geometry of [linear, aligned]) test(`${version} ${geometry.kind}: endpoint override only appends ACAD DSTYLE and leaves source, geometry and block intact`, () => {
    const base = entity(geometry), doc = { units: 'mm', entities: [base, entity(linear)] };
    const original = structuredClone(doc), legacy = writeDxf(doc, { version });
    assert.deepEqual(writeDxf({ ...doc, entities: [{ ...base, suppressExtension: undefined }, doc.entities[1]] }, { version }), legacy);
    for (const [suppressExtension, code] of [['p1', 75], ['p2', 76]]) {
      const selected = { ...doc, entities: [{ ...base, suppressExtension }, doc.entities[1]] };
      const selectedBefore = structuredClone(selected);
      const result = writeDxf(selected, { version });
      const dimensions = records(result.text).filter(r => r[0][1] === 'DIMENSION');
      assert.equal(dimensions.length, 2);
      const expected = [[1001, 'ACAD'], [1000, 'DSTYLE'], [1002, '{'], [1070, String(code)], [1070, '1'], [1002, '}']];
      assert.deepEqual(dimensions[0].slice(-6), expected);
      assert.ok(!dimensions[1].some(([c]) => c === 1001), 'unmodified peer has no per-entity override');
      const oldDimensions = records(legacy.text).filter(r => r[0][1] === 'DIMENSION');
      assert.deepEqual(dimensions[0].slice(0, -6), oldDimensions[0]);
      assert.deepEqual(dimensions[1], oldDimensions[1]);
      const xdata = expected.map(([c, v]) => `${c}\n${v}\n`).join('');
      assert.equal(result.text.split(xdata).length, 2, 'exactly one override');
      assert.equal(result.text.replace(xdata, ''), legacy.text, 'all remaining output bytes are unchanged');
      assert.deepEqual(result.report, legacy.report);
      assert.deepEqual(selected, selectedBefore);
    }
    assert.deepEqual(doc, original);
  });
  test(`${version}: malformed endpoint and non-linear dimension overrides refuse with BAD_ENTITY`, () => {
    for (const suppressExtension of [null, '', 'a', 'b', 'both', 'P1', 0, 1, false, true, [], {}, ['p1']]) {
      const doc = { units: 'mm', entities: [{ ...entity(linear), suppressExtension }] }, before = structuredClone(doc);
      assert.throws(() => writeDxf(doc, { version }), error => isDxfWriteError(error) && error.code === 'BAD_ENTITY');
      assert.deepEqual(doc, before);
    }
    const unsupported = [
      { kind: 'radius', center: [0, 0], rim: [10, 0] },
      { kind: 'diameter', rim: [10, 0], opposite: [-10, 0] },
      { kind: 'angular', line1: [[0, 0], [10, 0]], line2: [[0, 0], [0, 10]], arc: [7, 7] },
    ];
    for (const geometry of unsupported) {
      assert.doesNotThrow(() => writeDxf({ units: 'mm', entities: [entity(geometry)] }, { version }));
      for (const suppressExtension of ['p1', 'p2']) {
        const doc = { units: 'mm', entities: [{ ...entity(geometry), suppressExtension }] }, before = structuredClone(doc);
        assert.throws(() => writeDxf(doc, { version }), error => isDxfWriteError(error) && error.code === 'BAD_ENTITY');
        assert.deepEqual(doc, before);
      }
    }
  });
}

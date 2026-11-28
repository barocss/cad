import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptyDoc, withNode, type StudioDoc, type PartInstance } from '../src/engine/doc';
import { exportStudioStep } from '../src/engine/evaluate';
const options = { name: 'exchange', timestamp: '2026-11-01T00:00:00' };
const box = (): StudioDoc => ({ ...emptyDoc(), nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 10 }], nextId: 2 });
const occurrence = (id: string, doc: StudioDoc): PartInstance => ({ id, name: `Named ${id}`, doc, position: [0, 0, 0], rotation: [0, 0, 0], part: { id: 'shared', rev: '1' } });
test('actual native parameters, nested visible sharing, names and appearance are reported without changing geometry bytes', () => {
  const plain = box(), decorated = { ...plain, parameters: { width: 10 }, bodies: { b1: { name: 'Red prism', color: '#ff0000', material: 'steel' } } };
  const nested = { ...emptyDoc(), instances: [occurrence('a', decorated), occurrence('b', decorated)] }, doc = { ...emptyDoc(), instances: [occurrence('sub', nested)] };
  const before = JSON.stringify(doc), result = exportStudioStep(doc, options), loss = result.omitted!.join(' ');
  assert.match(loss, /feature history/); assert.match(loss, /parameters/); assert.match(loss, /flattened at their placements/); assert.match(loss, /hierarchy and shared definitions/); assert.match(loss, /User body and occurrence labels/); assert.match(loss, /colours and materials/);
  assert.equal(JSON.stringify(doc), before); assert.equal((result.text.match(/=MANIFOLD_SOLID_BREP\(/g) ?? []).length, 2);
  const native = exportStudioStep(plain, options), named = exportStudioStep({ ...plain, bodies: decorated.bodies }, options);
  assert.equal(native.text.split('DATA;')[1], named.text.split('DATA;')[1], 'appearance metadata does not change exported geometry; source revision in the header still identifies each input');
});
test('plain STEP re-export and hidden occurrences do not invent native history, parameters or appearance losses', () => {
  const plain = exportStudioStep(box(), options), imported: StudioDoc = { ...emptyDoc(), nodes: [{ id: 'n0', kind: 'import', name: 'in.step', step: plain.text }], nextId: 1 };
  const result = exportStudioStep({ ...imported, instances: [{ ...occurrence('hidden', { ...box(), bodies: { b1: { color: '#f00' } } }), hidden: true }] }, options);
  assert.equal(result.omitted, undefined); assert.equal((result.text.match(/=MANIFOLD_SOLID_BREP\(/g) ?? []).length, 1);
});
test('drawing semantic PMI and named reference datums are conditional losses, including visible definitions', () => {
  const part = box();
  const drawing: NonNullable<StudioDoc['drawing']> = { sheet: 'A4', projection: 'third', hidden: true, dimensions: [], datums: [{ id: 'd', letter: 'A', view: 'front', place: [0, 0], face: { face: 'n1.side0', near: [0, 0, 0] } }], datumTargets: [{ id: 'dt', letter: 'A', number: 1, view: 'front', place: [0, 0], kind: 'line', line: { from: [0, 0], to: [1, 0] } }], frames: [{ id: 'fcf', view: 'front', place: [0, 0], characteristic: 'flatness', value: 0.1, datums: [] }] };
  for (const key of ['datums', 'datumTargets', 'frames'] as const) {
    const only = { ...drawing, datums: [], datumTargets: [], frames: [], [key]: drawing[key] };
    assert.match(exportStudioStep({ ...part, drawing: only }, options).omitted!.join(' '), /Drawing sheets, dimensions, annotations and semantic PMI are not included/);
  }
  assert.match(exportStudioStep({ ...part, drawing: { sheet: 'A4', projection: 'third', hidden: true, dimensions: [] } }, options).omitted!.join(' '), /Drawing sheets, dimensions/);
  const referenced: StudioDoc = { ...part, references: { version: 1, references: [], keepouts: [], datums: [{ id: 'datum1', name: 'Inspection origin', kind: 'plane', origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }] } };
  const nested = exportStudioStep({ ...emptyDoc(), instances: [occurrence('datumPart', referenced)] }, options);
  assert.match(nested.omitted!.join(' '), /Named reference datums and their coordinate systems/);
  assert.equal(nested.omittedRootDatums, undefined);
  const absent = exportStudioStep(part, options).omitted!.join(' '); assert.doesNotMatch(absent, /semantic PMI|Named reference datums/);
});


test('root STEP loss identifies each exact datum without changing the geometry section', () => {
  const plain = box();
  const datums: NonNullable<StudioDoc['references']>['datums'] = [
    { id: 'D1', name: 'Setup', kind: 'plane', origin: [10, 20, 30], normal: [1, 0, 0], xAxis: [0, 1, 0] },
    { id: 'D2', name: 'Setup', kind: 'axis', origin: [4, 5, 6], direction: [0, 1, 0] },
    { id: 'D3', name: 'Inspection point', kind: 'point', origin: [7, 8, 9] },
  ];
  const source: StudioDoc = { ...plain, references: { version: 1, references: [], datums, keepouts: [] } };
  const before = JSON.stringify(source);
  const base = exportStudioStep(plain, options), current = exportStudioStep(source, options);
  assert.equal(base.omittedRootDatums, undefined);
  assert.deepEqual(current.omittedRootDatums, datums.map(({ id, name, kind }) => ({ id, name, kind })));
  assert.notEqual(base.source, current.source);
  assert.equal(base.text.split('DATA;')[1], current.text.split('DATA;')[1]);
  assert.equal(JSON.stringify(source), before);
});

/** Same actual plain-import fixture and timestamp used by the pre-fix D421 export baseline. */
function nameFixture(): StudioDoc {
  const source = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [4, 3] }), { kind: 'extrude', sketch: 0, height: 2 });
  const step = exportStudioStep(source, { name: 'seed', timestamp: '2026-11-01T00:00:00Z' }).text;
  return withNode(emptyDoc(), { kind: 'import', name: 'seed.step', step });
}
const nameLoss = 'Control characters and invalid Unicode in the STEP header file name and product name are replaced with underscores.';
const nameTimestamp = '2026-11-01T00:00:00Z';

test('STEP header and product names encode printable Unicode and report remaining substitutions', () => {
  const doc = nameFixture(), before = JSON.stringify(doc);
  for (const [name, encoded, losses] of [
    ['München', 'M\\X4\\000000FC\\X0\\nchen', undefined],
    ['부품', '\\X4\\0000BD800000D488\\X0\\', undefined],
    ['Part😀', 'Part\\X4\\0001F600\\X0\\', undefined],
    ["Ö'\\file", "\\X4\\000000D6\\X0\\''\\\\file", undefined],
    ['A\nB', 'A_B', [nameLoss]],
    ['A\u007fB', 'A_B', [nameLoss]],
    ['A\u0085B', 'A_B', [nameLoss]],
    ['A\uD800B', 'A_B', [nameLoss]],
    ['A\uDC00B', 'A_B', [nameLoss]],
  ] as const) {
    const result = exportStudioStep(doc, { name, timestamp: nameTimestamp });
    assert.deepEqual(result.omitted, losses);
    assert.ok(result.text.includes(`PRODUCT('${encoded}','${encoded}'`));
    assert.ok(result.text.includes(`FILE_NAME('${encoded}.step'`));
    assert.equal(JSON.stringify(doc), before);
  }
});

test('printable ASCII names and lossless quote/backslash escapes add no destructive name-loss report', () => {
  const doc = nameFixture();
  for (const name of ['part', 'plate A_1', "bolt'\\test"]) {
    const result = exportStudioStep(doc, { name, timestamp: nameTimestamp });
    assert.equal(result.omitted, undefined);
  }
  const escaped = exportStudioStep(doc, { name: "bolt'\\test", timestamp: nameTimestamp });
  assert.ok(escaped.text.includes("PRODUCT('bolt''\\\\test','bolt''\\\\test'"));
});

test('the four ASCII or substituted-control profiles retain their fixed-timestamp D421 STEP bytes', () => {
  const doc = nameFixture();
  // Recorded by actual exportStudioStep before the loss-report change, not generated by the predicate under test.
  const baselines = [
    ['part', '56b8a72f1fc851380967abfd745427764ba12812711fc1ec4bdae15b63401b3c'],
    ['plate A_1', '892d46a0f694d1694b3d93744d975c4c28fdb25031de27af8885cf86160ab0cd'],
    ['A\nB', 'd8a094a82c9cec5e62a2c33b3f72469fd6de678a487e6f5ed7c3399419040c78'],
    ["bolt'\\test", '0ecc011cbad168efe4960e62dec6c2a790748ecba26112b9021f89cb8f6c0da9'],
  ];
  for (const [name, hash] of baselines) {
    const result = exportStudioStep(doc, { name, timestamp: nameTimestamp });
    assert.equal(createHash('sha256').update(result.text).digest('hex'), hash, name);
    assert.equal(result.source, 'b46faf1dcfd84471');
  }
});

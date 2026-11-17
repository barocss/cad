import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { addPart } from '../src/assembly/edit';
import { addInstancePattern, editInstancePattern, expandPatterns } from '../src/assembly/patterns';
import { readStudioDoc } from '../src/engine/migrate';
import { rotationMatrix } from '../src/engine/placement';
const source = () => addPart(rectanglePart(10, 10, 2), { name: 'Pin', doc: rectanglePart(1, 1, 2), position: [12, 0, 0], rotation: [0, 0, 0] }).doc;
const close = (a: readonly number[], b: readonly number[]) => { a.forEach((x, k) => assert.ok(Number.isFinite(x) && Math.abs(x - b[k]) < 1e-10, `${a} != ${b}`)); };
const roundtrip = (doc: StudioDoc) => { const read = readStudioDoc(JSON.stringify(doc)); assert.ok('doc' in read); return expandPatterns(read.doc); };
for (const magnitude of [Number.MAX_VALUE, Number.MIN_VALUE, 1e-310]) {
  test(`linear finite direction ${magnitude}: scale cannot change unit spacing`, () => {
    const doc = source(), before = JSON.stringify(doc), dir: [number, number, number] = [magnitude, magnitude, magnitude];
    const r = addInstancePattern(doc, { seed: 'p1', kind: 'linear', dir, count: 3, spacing: Math.sqrt(3) });
    close(r.doc.instances![1].position, [13, 1, 1]); close(r.doc.instances![2].position, [14, 2, 2]);
    assert.equal(JSON.stringify(doc), before); assert.deepEqual(r.doc.instancePatterns![0].kind === 'linear' && r.doc.instancePatterns![0].dir, dir);
    close(roundtrip(r.doc).instances![2].position, [14, 2, 2]);
    const edited = editInstancePattern(r.doc, { id: r.id, dir: [-magnitude, magnitude, magnitude] }).doc;
    close(edited.instances![1].position, [11, 1, 1]); assert.deepEqual(edited.instances!.map(i => i.id), r.doc.instances!.map(i => i.id));
  });
  test(`circular finite axis ${magnitude}: 120 degree (1,1,1) rotation cycles coordinates`, () => {
    const axis: [number, number, number] = [magnitude, magnitude, magnitude];
    const r = addInstancePattern(source(), { seed: 'p1', kind: 'circular', axis, origin: [0, 0, 0], count: 3, angle: 120 });
    close(r.doc.instances![1].position, [0, 12, 0]); close(r.doc.instances![2].position, [0, 0, 12]);
    close(rotationMatrix(r.doc.instances![1].rotation), [0, 0, 1, 1, 0, 0, 0, 1, 0]);
    close(rotationMatrix(r.doc.instances![2].rotation), [0, 1, 0, 0, 0, 1, 1, 0, 0]);
    assert.deepEqual(r.doc.instancePatterns![0].kind === 'circular' && r.doc.instancePatterns![0].axis, axis);
    close(roundtrip(r.doc).instances![2].position, [0, 0, 12]);
  });
}
test('invalid zero/nonfinite directions still refuse before normalization', () => {
  for (const dir of [[0, 0, 0], [Infinity, 1, 1], [NaN, 1, 1]] as [number, number, number][]) {
    assert.throws(() => addInstancePattern(source(), { seed: 'p1', kind: 'linear', dir, count: 3, spacing: 2 }), /dir is/);
    assert.throws(() => addInstancePattern(source(), { seed: 'p1', kind: 'circular', axis: dir, origin: [0, 0, 0], count: 3, angle: 120 }), /axis is/);
  }
});

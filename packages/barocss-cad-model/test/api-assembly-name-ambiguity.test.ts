import test from 'node:test';
import assert from 'node:assert/strict';
import { assembly, part, Assembly, Location, BarocssError } from '../src/api';

const fixture = () => assembly('rack', part())
  .addPart('Pin', part().box({ w: 10, d: 10, h: 10 }))
  .addPart('Pin 2', part().box({ w: 30, d: 10, h: 10 }));
const patterned = () => fixture().pattern('Pin', { kind: 'linear', count: 2, direction: [1, 0, 0], spacing: 50 });
const ambiguous = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof BarocssError && e.code === 'PART_AMBIGUOUS' && /pat1-1.*p2/.test(e.message));

test('a generated pattern name cannot silently select a different part', () => {
  const original = fixture(), before = original.doc;
  assert.equal(original.idOf('Pin 2'), 'p2');
  assert.equal(original.part('Pin 2').mass('steel').volume, 3000);
  const a = patterned(), snapshot = a.doc;
  assert.deepEqual(a.parts().filter(p => p.name === 'Pin 2').map(p => p.id), ['pat1-1', 'p2']);
  ambiguous(() => a.idOf('Pin 2'));
  ambiguous(() => a.part('Pin 2'));
  ambiguous(() => a.place('Pin 2', { at: Location.at([90, 0, 0]) }));
  ambiguous(() => a.setPartLook('Pin 2', 'b1', { material: 'steel' }));
  ambiguous(() => a.step({ parts: ['Pin 2'] }));
  ambiguous(() => a.lock('Pin', 'Pin 2'));
  ambiguous(() => a.addMate('distance', { part: 'Pin', face: 'n1.top' }, { part: 'Pin 2', face: 'n1.bottom' }, { distance: 0 }));
  assert.deepEqual(a.doc, snapshot);
  assert.deepEqual(original.doc, before);
});

test('unique names, base and unique generated names keep the name-only contract', () => {
  const a = assembly('rack', part()).addPart('Pin', part().box({ w: 10, d: 10, h: 10 }))
    .pattern('Pin', { kind: 'linear', count: 2, direction: [1, 0, 0], spacing: 50 });
  assert.equal(a.idOf('base'), 'base');
  assert.equal(a.idOf('Pin'), 'p1');
  assert.equal(a.idOf('Pin 2'), 'pat1-1');
  assert.ok(Math.abs(a.part('Pin 2').mass('steel').volume - 1000) < 1e-9);
  assert.deepEqual(a.skipOccurrence('Pin 2').patterns()[0].skip, [1]);
  assert.throws(() => a.idOf('p1'), (e: unknown) => e instanceof BarocssError && e.code === 'PART_UNKNOWN');
  assert.throws(() => a.idOf('absent'), (e: unknown) => e instanceof BarocssError && e.code === 'PART_UNKNOWN');
});

test('saved duplicate names remain intact; deleting the pattern restores the original lookup', () => {
  const a = patterned(), stored = JSON.parse(JSON.stringify(a.doc)), before = structuredClone(stored);
  const opened = new Assembly('opened', stored);
  ambiguous(() => opened.part('Pin 2'));
  const restored = opened.deletePattern('pat1');
  assert.equal(restored.idOf('Pin 2'), 'p2');
  assert.equal(restored.part('Pin 2').mass('steel').volume, 3000);
  assert.deepEqual(stored, before);
  assert.deepEqual(opened.doc, before);
  ambiguous(() => new Assembly('restored snapshot', before).part('Pin 2'));
});

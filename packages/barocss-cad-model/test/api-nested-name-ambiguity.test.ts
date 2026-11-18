import test from 'node:test';
import assert from 'node:assert/strict';
import { assembly, part, Assembly, Location, BarocssError } from '../src/api';

const box = () => part().box({ w: 10, d: 10, h: 10 });
const sub = () => assembly('sub', part()).addPart('Pin', box())
  .addPart('Pin 2', part().box({ w: 30, d: 10, h: 10 }), { at: Location.at([0, 0, 30]) })
  .pattern('Pin', { kind: 'linear', count: 2, direction: [1, 0, 0], spacing: 50 });
const fixture = () => assembly('top', part().box({ w: 100, d: 100, h: 10 })).addPart('Sub', part('sub', sub().doc));
const mate = (a: Assembly, path: string) => a.addMate('distance', { part: 'base', face: 'n1.top' }, { part: path, face: 'n1.bottom' }, { distance: 5 });
const refuses = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof BarocssError && e.code === code);

test('ambiguous nested generated names refuse rather than binding the wrong part and moving its host', () => {
  const a = fixture(), before = a.doc;
  refuses(() => mate(a, 'Sub/Pin 2'), 'PART_AMBIGUOUS');
  const direct = mate(a, 'p1/p2'), generated = mate(a, 'p1/pat1-1');
  assert.equal(direct.doc.mates![0].b.part, 'p1/p2');
  assert.deepEqual(direct.doc.instances![0].position, [0, 0, -15]);
  assert.equal(generated.doc.mates![0].b.part, 'p1/pat1-1');
  assert.deepEqual(generated.doc.instances![0].position, [0, 0, 15]);
  assert.deepEqual(direct.problems(), []);
  assert.deepEqual(generated.problems(), []);
  assert.deepEqual(a.doc, before);
});

test('saved names remain intact and an explicit ID still works after reopening', () => {
  const stored = JSON.parse(JSON.stringify(fixture().doc)), before = structuredClone(stored), a = new Assembly('opened', stored);
  refuses(() => mate(a, 'Sub/Pin 2'), 'PART_AMBIGUOUS');
  assert.equal(mate(a, 'p1/p2').doc.mates![0].b.part, 'p1/p2');
  assert.deepEqual(a.doc, before);
  assert.deepEqual(stored, before);
});

test('every nested level checks names without merging local namespaces', () => {
  const inner = sub(), middle = assembly('middle', part()).addPart('Inner', part('inner', inner.doc));
  const a = assembly('top', box()).addPart('Sub', part('middle', middle.doc));
  refuses(() => mate(a, 'Sub/Inner/Pin 2'), 'PART_AMBIGUOUS');
  assert.equal(mate(a, 'p1/p1/p2').doc.mates![0].b.part, 'p1/p1/p2');
  const outer = assembly('top', box()).addPart('Sub', part('sub', inner.doc)).addPart('Sub 2', part('sub', inner.doc))
    .pattern('Sub', { kind: 'linear', count: 2, direction: [1, 0, 0], spacing: 100 });
  refuses(() => mate(outer, 'Sub 2/p2'), 'PART_AMBIGUOUS');
});

test('unique names, full slash names, ID/name VALUE conflicts and missing names keep their contracts', () => {
  const a = fixture();
  assert.equal(mate(a, 'Sub/Pin').doc.mates![0].b.part, 'p1/p1');
  refuses(() => mate(a, 'Sub/Missing'), 'PART_UNKNOWN');
  const whole = assembly('top', box()).addPart('Bracket A/B', box());
  assert.equal(mate(whole, 'Bracket A/B').doc.mates![0].b.part, 'p1');
  const conflict = assembly('top', box()).addPart('p2', part('sub', sub().doc)).addPart('Sub', part('sub', sub().doc));
  refuses(() => mate(conflict, 'p2/p1'), 'VALUE');
  assert.equal(mate(conflict, 'Sub/p1').doc.mates![0].b.part, 'p2/p1');
});

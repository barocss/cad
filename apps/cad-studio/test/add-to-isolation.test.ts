import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { OutlinerInstances } from '../src/ui/OutlinerInstances';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type PartInstance } from '@barocss/cad-model/engine/doc';
import { addToIsolation } from '../src/app/addToIsolation';
import type { InstanceEvaluationSource } from '../src/viewport/instanceEvaluation';
function fixture() {
  const instances: PartInstance[] = ['a', 'b', 'c'].map(id => ({ id, name: 'Same', doc: emptyDoc(), position: [0, 0, 0], rotation: [0, 0, 0] }));
  const evaluated = new Map(instances.map(inst => [inst.id, { inst, sourceKey: 'current', bodies: [{ topology: { kind: 'solid' } }] }]));
  const sources = new Map<string, InstanceEvaluationSource>(instances.map(inst => [inst.id, { ok: true, key: 'current', base: inst.doc }]));
  const current = ['a'];
  const add = (id = 'b', blocked: string | null = null) => addToIsolation(current, id, instances, evaluated, sources, blocked);
  return { instances, evaluated, sources, current, add };
}
test('explicit addition preserves original arrays and exact same-name identity; duplicate is no-op', () => {
  const f = fixture(), before = structuredClone(f.instances);
  assert.deepEqual(f.add(), { ids: ['a', 'b'] });
  assert.deepEqual(f.current, ['a']); assert.deepEqual(f.instances, before);
  const duplicate = f.add('a'); assert.ok('ids' in duplicate); assert.equal(duplicate.ids, f.current);
});
test('hidden, duplicate, missing and stale targets refuse without pruning', () => {
  for (const alter of [
    (f: ReturnType<typeof fixture>) => { f.instances[1].hidden = true; },
    (f: ReturnType<typeof fixture>) => { f.evaluated.delete('b'); },
    (f: ReturnType<typeof fixture>) => { f.evaluated.get('b')!.bodies[0].topology.kind = 'sheet'; },
    (f: ReturnType<typeof fixture>) => { f.evaluated.get('b')!.bodies = []; },
    (f: ReturnType<typeof fixture>) => { f.instances.push(f.instances[1]); },
    (f: ReturnType<typeof fixture>) => { f.instances[1] = { ...f.instances[1] }; },
    (f: ReturnType<typeof fixture>) => { f.evaluated.get('b')!.sourceKey = 'old'; },
  ]) { const f = fixture(); alter(f); assert.ok('reason' in f.add()); assert.deepEqual(f.current, ['a']); }
  for (const id of ['', 'missing', 'b/child']) assert.ok('reason' in fixture().add(id));
});
test('old members must also be current; rejection never restores or prunes isolation', () => {
  const f = fixture(); f.evaluated.delete('a'); assert.ok('reason' in f.add()); assert.deepEqual(f.current, ['a']);
  assert.ok('reason' in addToIsolation(undefined, 'b', f.instances, f.evaluated, f.sources, null));
  assert.ok('reason' in addToIsolation(['a', 'a'], 'b', f.instances, f.evaluated, f.sources, null));
  assert.deepEqual(fixture().add('b', 'Finish editing.'), { reason: 'Finish editing.' });
});

test('action slot appears only on top-level rows, preserving nested selection buttons', () => {
  const f = fixture(); f.instances[0].doc.instances = [{ ...f.instances[1], id: 'child' }];
  const html = renderToString(createElement(OutlinerInstances, { instances: f.instances, selection: ['a'], edit: null, locked: false,
    open: new Set(['a']), onToggle() {}, onPick() {}, onEdit() {}, iconFor: () => '',
    isolationAction: inst => createElement('button', { 'data-add-isolation': inst.id }, 'Add to isolation') }));
  assert.equal((html.match(/data-add-isolation=/g) ?? []).length, 3);
  assert.match(html, /data-browser-instance-path="a\/child"/);
  assert.doesNotMatch(html, /data-add-isolation="child"/);
});

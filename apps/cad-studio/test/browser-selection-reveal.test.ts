import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { emptyDoc, type PartInstance, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Selection } from '@barocss/cad-model/app/commands';
import { browserRevealTarget, withRevealAncestors, registerBrowserRow } from '../src/app/bodyBrowserReveal';
import { OutlinerInstances } from '../src/ui/OutlinerInstances';
import type { InstanceEvaluationSource } from '../src/viewport/instanceEvaluation';
const empty = (): Selection => ({ bodies: [], faces: [], edges: [] });
function part(id: string, children: PartInstance[] = []): PartInstance {
  return { id, name: 'Same name', doc: { ...emptyDoc(), instances: children }, position: [0, 0, 0], rotation: [0, 0, 0] };
}
function fixture() {
  const shared = part('inner', [part('p2')]);
  const a = part('sub1', [part('level', [shared])]), b = { ...a, id: 'sub2' };
  const doc: StudioDoc = { ...emptyDoc(), instances: [a, b] };
  const entries = new Map([a, b].map(inst => [inst.id, { inst, sourceKey: 'current' }]));
  const sources = new Map<string, InstanceEvaluationSource>([a, b].map(inst => [inst.id, { ok: true, key: 'current', base: inst.doc }]));
  const find = (path: string[], selection = empty(), direct = 0, blocked: string | null = null) => browserRevealTarget(selection, [{ key: 'sub1' }], path, direct, doc, entries, sources, blocked);
  return { a, b, doc, entries, sources, find };
}
test('same-name shared definitions resolve exact occurrence and only required ancestors', () => {
  const { find, doc } = fixture(), before = structuredClone(doc);
  assert.deepEqual(find(['sub1']), { key: 'instance:sub1', ancestors: [] });
  assert.deepEqual(find(['sub2/level/inner/p2']), { key: 'instance:sub2/level/inner/p2', ancestors: ['sub2', 'sub2/level', 'sub2/level/inner'] });
  assert.deepEqual(find([], { ...empty(), bodies: [0] }), { key: 'body:sub1' });
  assert.deepEqual(doc, before);
});
test('hidden ancestors, missing path and duplicate identities refuse without host fallback', () => {
  for (const depth of [0, 1, 2, 3]) {
    const f = fixture(); let at = f.a;
    for (let i = 0; i < depth; i++) at = at.doc.instances![0];
    at.hidden = true;
    assert.match(f.find(['sub1/level/inner/p2']).reason!, /hidden/);
  }
  assert.match(fixture().find(['sub1/missing']).reason!, /no longer/);
  for (const depth of [0, 1, 2, 3]) {
    const f = fixture(); let doc = f.doc;
    for (let i = 0; i < depth; i++) doc = doc.instances![0].doc;
    doc.instances!.push(doc.instances![0]);
    assert.match(f.find(['sub1/level/inner/p2']).reason!, /ambiguous/);
  }
});
test('current authored instance AND effective evaluation source must match', () => {
  const f = fixture();
  f.entries.delete('sub1'); assert.match(f.find(['sub1']).reason!, /current revision/);
  f.entries.set('sub1', { inst: f.a, sourceKey: 'old' }); assert.match(f.find(['sub1/level/inner/p2']).reason!, /current revision/);
  f.entries.set('sub1', { inst: { ...f.a }, sourceKey: 'current' }); assert.match(f.find(['sub1']).reason!, /current revision/);
  f.entries.set('sub1', { inst: f.a, sourceKey: 'current' });
  f.sources.set('sub1', { ok: false, error: 'refused' }); assert.match(f.find(['sub1']).reason!, /current revision/);
});
test('multi, mixed, display-body and malformed selections remain unsupported', () => {
  const { find } = fixture();
  for (const paths of [['sub1', 'sub2'], ['sub1#0'], ['sub1//p2'], ['/sub1']]) assert.ok(find(paths).reason);
  for (const selection of [{ ...empty(), bodies: [0] }, { ...empty(), edges: [{ body: 0, edge: 1 }] }, { ...empty(), sketches: [0] }]) assert.ok(find(['sub1'], selection).reason);
  assert.ok(find(['sub1'], empty(), 1).reason);
  assert.equal(find(['sub1'], empty(), 0, 'Finish editing.').reason, 'Finish editing.');
});
test('ancestor expansion retains unrelated branches, never expands target or sibling', () => {
  const open = new Set(['sub1', 'unrelated/deep']);
  const next = withRevealAncestors(open, ['sub2', 'sub2/level', 'sub2/level/inner']);
  assert.deepEqual([...next], ['sub1', 'unrelated/deep', 'sub2', 'sub2/level', 'sub2/level/inner']);
  assert.deepEqual([...open], ['sub1', 'unrelated/deep']);
  assert.equal(withRevealAncestors(next, ['sub2']), next);
});
test('old row cleanup cannot remove a newer same-path node; namespaces remain separate', () => {
  const rows = new Map<string, object>(), old = {}, newer = {}, body = {};
  const cleanup = registerBrowserRow(rows, 'instance:sub1', old)!;
  const cleanupNew = registerBrowserRow(rows, 'instance:sub1', newer)!;
  registerBrowserRow(rows, 'body:sub1', body);
  cleanup(); assert.equal(rows.get('instance:sub1'), newer);
  cleanupNew(); assert.equal(rows.has('instance:sub1'), false); assert.equal(rows.get('body:sub1'), body);
});
test('controlled Outliner renders full-path target immediately when required ancestors are open', () => {
  const { doc } = fixture();
  const props = { instances: doc.instances!, selection: ['sub1/level/inner/p2'], edit: null, locked: false,
    onToggle() {}, onPick() { assert.fail('render must not select'); }, onEdit() { assert.fail('render must not edit'); }, iconFor: () => 'widgets' };
  const closed = renderToString(createElement(OutlinerInstances, { ...props, open: new Set<string>() }));
  assert.doesNotMatch(closed, /data-browser-instance-path="sub1\/level/);
  const html = renderToString(createElement(OutlinerInstances, { ...props, open: new Set(['sub1', 'sub1/level', 'sub1/level/inner']) }));
  assert.match(html, /data-browser-instance-path="sub1\/level\/inner\/p2"/);
  assert.doesNotMatch(html, /data-browser-instance-path="sub2\/level/);
});

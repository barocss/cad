import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { canSelectStepPart } from '../src/app/assemblySteps';
import { AssemblyStepsPanel } from '../src/ui/AssemblyStepsPanel';
function fixture(): StudioDoc {
  const part = rectanglePart(10, 5, 2);
  return { ...rectanglePart(1, 1, 1), instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: 'Same block', doc: part, position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: 'shared', rev: 'A' } })), assemblySteps: [{ id: 'mount', name: 'Mount', add: ['p1', 'p2'] }, { id: 'finish', name: 'Finish', add: ['p3'] }] };
}
test('current-step exact occurrence admits same-name shared parts without modifying source', () => {
  const doc = fixture(), before = structuredClone(doc);
  for (const id of ['p1', 'p2']) assert.equal(canSelectStepPart(doc, 0, 'mount', id), true);
  assert.equal(canSelectStepPart(doc, 1, 'finish', 'p3'), true);
  assert.deepEqual(doc, before);
});
test('hidden and driven top-level occurrences stay selectable without Show or expansion', () => {
  const doc = fixture(); doc.instances![0].hidden = true; doc.instances![1].pattern = { id: 'pat', k: 1 };
  const before = structuredClone(doc); assert.ok(canSelectStepPart(doc, 0, 'mount', 'p1')); assert.ok(canSelectStepPart(doc, 0, 'mount', 'p2')); assert.deepEqual(doc, before);
});
test('wrong step, nonmember, missing, base, nested and invalid index are refused', () => {
  const doc = fixture();
  for (const id of ['p3', 'missing', 'base', 'p1/child', 'Same block', '']) assert.equal(canSelectStepPart(doc, 0, 'mount', id), false);
  for (const index of [-1, 0.5, NaN, Infinity, 2]) assert.equal(canSelectStepPart(doc, index, 'mount', 'p1'), false);
  assert.equal(canSelectStepPart(doc, 1, 'mount', 'p1'), false); assert.equal(canSelectStepPart(doc, 0, 'finish', 'p1'), false);
});
test('duplicate instance, step or membership identities fail closed', () => {
  for (const mutate of [(d: StudioDoc) => { d.instances![2].id = 'p1'; }, (d: StudioDoc) => { d.assemblySteps![1].id = 'mount'; }, (d: StudioDoc) => { d.assemblySteps![0].add.push('p1'); }, (d: StudioDoc) => { d.assemblySteps![1].add.push('p1'); }]) {
    const doc = fixture(); mutate(doc); const before = structuredClone(doc); assert.equal(canSelectStepPart(doc, 0, 'mount', 'p1'), false); assert.deepEqual(doc, before);
  }
});
function html(doc: StudioDoc, extra: Partial<ComponentProps<typeof AssemblyStepsPanel>> = {}) {
 const noop = () => {};
 return renderToStaticMarkup(createElement(AssemblyStepsPanel, { doc, index: 0, offer: null, faded: false, problems: [], onGo: noop, onFaded: noop, onNew: noop, onRename: noop, onNote: noop, onExplode: noop, onAddSelected: noop, onTransfer: noop, onTakeOut: noop, onCaptureView: noop, onResetView: noop, onClearView: noop, onMove: noop, onDelete: noop, onClose: noop, ...extra }));
}
const selectTags = (markup: string) => [...markup.matchAll(/<button\b[^>]*aria-label="Select step part [^"]*"[^>]*>/g)].map(m => m[0]);
test('optional selection controls preserve legacy panel; selected exact IDs are distinguishable', () => {
 const doc = fixture(); assert.equal(selectTags(html(doc)).length, 0);
 const markup = html(doc, { onSelectPart() {}, selectedParts: ['p2'] }); const tags = selectTags(markup); assert.equal(tags.length, 2);
 assert.match(tags[0], /Same block \(p1\)/); assert.match(tags[0], /aria-pressed="false"/); assert.match(tags[1], /Same block \(p2\)/); assert.match(tags[1], /aria-pressed="true"/);
 assert.equal((markup.match(/aria-label="Take Same block out of this step"/g) ?? []).length, 2);
 assert.ok(tags.every(t => !/\sdisabled=""/.test(t)));
});
test('SSR disables owned-busy and unsupported members rather than filtering them', () => {
 const doc = fixture(); assert.ok(selectTags(html(doc, { onSelectPart() {}, selectionDisabled: true })).every(t => /\sdisabled=""/.test(t)));
 doc.assemblySteps![0].add = ['missing', 'base', 'p1/child'];
 const tags = selectTags(html(doc, { onSelectPart() {} })); assert.equal(tags.length, 3); assert.ok(tags.every(t => /\sdisabled=""/.test(t)));
});

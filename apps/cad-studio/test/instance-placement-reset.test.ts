import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart, type PartInstance } from '@barocss/cad-model/engine/doc';
import { resetInstancePlacement } from '../src/ui/instancePlacement';
import { InstancePanel } from '../src/ui/InstancePanel';
const inst: PartInstance = { id: 'a', name: 'Placed part', doc: rectanglePart(10, 12, 8), part: { id: 'shared', rev: 'A' }, position: [15, -20, 30], rotation: [10, 20, -35], grounded: true, hidden: true };
test('reset changes only placement while preserving exact definition and other occurrence properties', () => {
 const before = structuredClone(inst), reset = resetInstancePlacement(inst);
 assert.deepEqual(reset, { ...inst, position: [0, 0, 0], rotation: [0, 0, 0] });
 assert.strictEqual(reset.doc, inst.doc);assert.strictEqual(reset.part, inst.part);assert.deepEqual(inst, before);assert.strictEqual(resetInstancePlacement(reset), reset);
});
test('pattern-controlled occurrences cannot be reset independently', () => {
 const occurrence = { ...inst, pattern: { id: 'p', k: 1 } };
 assert.strictEqual(resetInstancePlacement(occurrence), occurrence);
});
test('reset is offered only for a free placement and is disabled at the origin', () => {
 const render = (value: PartInstance) => renderToStaticMarkup(createElement(InstancePanel, { inst: value, bodies: undefined, onChange: () => assert.fail('render must not commit'), onDuplicate() {}, onRemove() {} }));
 assert.match(render(inst), /aria-label="Reset instance placement"/);
 assert.match(render(resetInstancePlacement(inst)), /<button[^>]*aria-label="Reset instance placement"[^>]*disabled/);
 assert.doesNotMatch(render({ ...inst, pattern: { id: 'p', k: 1 } }), /Reset instance placement/);
});

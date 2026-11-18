import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { editAssemblyStep } from '@barocss/cad-model/assembly/steps';
import { stepBatchTakeOutOffer } from '../src/app/assemblySteps';
import { AssemblyStepsPanel } from '../src/ui/AssemblyStepsPanel';

function fixture(): StudioDoc {
  const part = rectanglePart(10, 5, 2);
  return {
    ...rectanglePart(30, 20, 2),
    instances: ['p1', 'p2', 'p3', 'p4', 'other', 'free'].map((id, i) => ({
      id, name: 'Same block', doc: part, position: [i * 15, 0, 0], rotation: [0, 0, i * 10],
      part: { id: 'shared', rev: 'B', source: 'shared-block.barocad' },
    })),
    mates: [{ id: 'm1', kind: 'coincident', a: { part: 'p1', face: 'origin:xy' }, b: { part: 'p2', face: 'origin:xy' } }],
    assemblySteps: [
      { id: 'mount', name: 'Same step', note: 'Keep this note', add: ['p1', 'p2', 'p3', 'p4'], explode: 1,
        view: { eye: [40, -20, 30], target: [0, 0, 0], up: [0, 0, 1] } },
      { id: 'finish', name: 'Same step', add: ['other'] },
    ],
  };
}

function takeOut(doc: StudioDoc, selection: readonly string[], shown = 0) {
  const offer = stepBatchTakeOutOffer(doc, selection, shown);
  assert.ok(offer, 'an exact current-step batch is required before a core edit');
  const source = doc.assemblySteps![shown];
  return editAssemblyStep(doc, { id: offer.target, add: source.add.filter(id => !offer.parts.includes(id)) });
}

test('offers all exact members in selection order, never by shared name or definition', () => {
  const doc = fixture(), before = structuredClone(doc), selection = Object.freeze(['p4', 'p2']);
  const offer = stepBatchTakeOutOffer(doc, selection, 0);
  assert.deepEqual(offer, { target: 'mount', parts: ['p4', 'p2'] });
  assert.notEqual(offer!.parts, selection, 'the offer cannot retain a caller-owned array');
  assert.deepEqual(doc, before);
  assert.deepEqual(selection, ['p4', 'p2']);
});

test('requires at least two distinct members and refuses duplicate selections rather than deduplicating', () => {
  const doc = fixture();
  for (const selection of [[], ['p1'], ['p1', 'p1'], ['p1', 'p2', 'p1']]) {
    assert.equal(stepBatchTakeOutOffer(doc, selection, 0), null, JSON.stringify(selection));
  }
});

test('mixed other-step, unassigned, base, nested, missing, name and empty IDs reject the entire batch', () => {
  const doc = fixture(), before = structuredClone(doc);
  for (const bad of ['other', 'free', 'base', 'p1/child', 'missing', 'Same block', '']) {
    assert.equal(stepBatchTakeOutOffer(doc, ['p1', 'p2', bad], 0), null, bad);
    assert.equal(stepBatchTakeOutOffer(doc, [bad, 'p2'], 0), null, `first: ${bad}`);
  }
  // Even a malformed occurrence named base cannot authorize the reserved host ID.
  doc.instances!.push({ ...doc.instances![0], id: 'base' });
  doc.assemblySteps![0].add.push('base');
  assert.equal(stepBatchTakeOutOffer(doc, ['p1', 'base'], 0), null);
  doc.instances!.pop(); doc.assemblySteps![0].add.pop();
  assert.deepEqual(doc, before);
});

test('requires the exact current step and an integer in range, never a clamped position', () => {
  const doc = fixture();
  for (const shown of [-1, 0.5, 2, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(stepBatchTakeOutOffer(doc, ['p1', 'p2'], shown), null, String(shown));
  }
  assert.equal(stepBatchTakeOutOffer(doc, ['p1', 'p2'], 1), null);
  assert.equal(stepBatchTakeOutOffer({ ...doc, assemblySteps: undefined }, ['p1', 'p2'], 0), null);
  assert.equal(stepBatchTakeOutOffer({ ...doc, instances: undefined }, ['p1', 'p2'], 0), null);
});

test('duplicate current-step, instance and membership identities fail closed without repair', () => {
  const mutations: ((doc: StudioDoc) => void)[] = [
    doc => { doc.assemblySteps![1].id = 'mount'; },
    doc => { doc.instances!.push({ ...doc.instances![0] }); },
    doc => { doc.instances!.push({ ...doc.instances!.at(-1)! }); },
    doc => { doc.assemblySteps![0].add.push('p1'); },
    doc => { doc.assemblySteps![1].add.push('p2'); },
    doc => { doc.instances = doc.instances!.filter(i => i.id !== 'p2'); },
  ];
  for (const mutate of mutations) {
    const doc = fixture(); mutate(doc); const before = structuredClone(doc);
    assert.equal(stepBatchTakeOutOffer(doc, ['p1', 'p2'], 0), null);
    assert.deepEqual(doc, before);
  }
});

test('hidden, whole subassembly and generated occurrence members remain exact top-level IDs', () => {
  const doc = fixture();
  doc.instances![0].hidden = true;
  doc.instances![1].doc = { ...doc.instances![1].doc, instances: [{ ...doc.instances![2], id: 'child' }] };
  doc.instances![2].pattern = { id: 'pattern', k: 1 };
  const before = structuredClone(doc);
  assert.deepEqual(stepBatchTakeOutOffer(doc, ['p3', 'p1', 'p2'], 0), { target: 'mount', parts: ['p3', 'p1', 'p2'] });
  assert.equal(stepBatchTakeOutOffer(doc, ['p1', 'p2/child'], 0), null);
  assert.deepEqual(doc, before);
});

test('one core edit removes every selected member, preserves survivor order and all other source metadata', async () => {
  const doc = fixture(), before = structuredClone(doc);
  const result = takeOut(doc, ['p4', 'p2']);
  assert.deepEqual(result.problems, []);
  assert.notEqual(result.doc, doc);
  assert.deepEqual(result.doc.assemblySteps![0], { ...before.assemblySteps![0], add: ['p1', 'p3'] });
  assert.equal(result.doc.assemblySteps![1], doc.assemblySteps![1]);
  const oldSource = { ...doc, assemblySteps: undefined };
  const newSource = { ...result.doc, assemblySteps: undefined };
  assert.deepEqual(newSource, oldSource, 'geometry, placements, definitions, mates and source metadata do not change');
  assert.equal(result.doc.instances, doc.instances);
  assert.equal(result.doc.nodes, doc.nodes);
  assert.equal(result.doc.mates, doc.mates);
  assert.deepEqual(doc, before, 'one core edit never mutates its input');
  const reopened = await readStudioFile(encodeStudioFile(result.doc));
  assert.ok('doc' in reopened);
  assert.deepEqual(reopened.doc, JSON.parse(JSON.stringify(result.doc)), 'native roundtrip retains exact membership and source');
  assert.deepEqual(doc, before);
});

test('taking all members out retains an existing empty step and its presentation', () => {
  const doc = fixture(), before = structuredClone(doc);
  const next = takeOut(doc, ['p3', 'p1', 'p4', 'p2']).doc;
  assert.equal(next.assemblySteps!.length, 2);
  assert.deepEqual(next.assemblySteps![0], { ...before.assemblySteps![0], add: [] });
  assert.deepEqual(next.assemblySteps![1], before.assemblySteps![1]);
  assert.equal(stepBatchTakeOutOffer(next, ['p1', 'p2'], 0), null);
  assert.deepEqual(doc, before);
});

test('a remaining missing reference keeps the core refusal and is never silently cleaned up', () => {
  const doc = fixture(); doc.assemblySteps![0].add.splice(1, 0, 'missing');
  const before = structuredClone(doc);
  assert.deepEqual(stepBatchTakeOutOffer(doc, ['p1', 'p2'], 0), { target: 'mount', parts: ['p1', 'p2'] });
  assert.throws(() => takeOut(doc, ['p1', 'p2']), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /\[VALUE\].*No part "missing"/);
    return true;
  });
  assert.deepEqual(doc, before, 'the refusal leaves missing references, selected members and source untouched');
});


test('duplicate unselected survivors are refused rather than silently normalized by the core edit', () => {
  const doc = fixture(); doc.assemblySteps![0].add = ['p1', 'p2', 'p3', 'p3'];
  const before = structuredClone(doc);
  assert.equal(stepBatchTakeOutOffer(doc, ['p1', 'p2'], 0), null);
  assert.deepEqual(doc, before, 'the action must not clean up the repeated unselected p3');
});

function html(doc: StudioDoc, extra: Partial<ComponentProps<typeof AssemblyStepsPanel>> = {}) {
  const noop = () => {};
  return renderToStaticMarkup(createElement(AssemblyStepsPanel, {
    doc, index: 0, offer: null, faded: false, problems: [], onGo: noop, onFaded: noop, onNew: noop,
    onRename: noop, onNote: noop, onExplode: noop, onAddSelected: noop, onTransfer: noop, onTakeOut: noop,
    onCaptureView: noop, onResetView: noop, onClearView: noop, onMove: noop, onDelete: noop, onClose: noop,
    ...extra,
  }));
}
const batchButton = (markup: string) => markup.match(/<button\b[^>]*aria-label="Take selected parts out of this step"[^>]*>/)?.[0];

test('SSR keeps the legacy single-member controls and offers batch takeout only through its optional callback', () => {
  const doc = fixture(), before = structuredClone(doc);
  const legacy = html(doc);
  assert.equal(batchButton(legacy), undefined);
  assert.equal((legacy.match(/aria-label="Take Same block out of this step"/g) ?? []).length, 4);
  assert.match(legacy, /aria-label="Add selected parts to this step"/);
  const markup = html(doc, { takeOutOffer: stepBatchTakeOutOffer(doc, ['p1', 'p2'], 0), onTakeOutSelected() { assert.fail('render must not edit'); } });
  assert.ok(batchButton(markup));
  assert.doesNotMatch(batchButton(markup)!, /\sdisabled=""/);
  assert.equal((markup.match(/aria-label="Take Same block out of this step"/g) ?? []).length, 4);
  assert.deepEqual(doc, before);
});

test('SSR disables takeout while owner-busy or without an exact current-step offer', () => {
  const doc = fixture(), valid = stepBatchTakeOutOffer(doc, ['p1', 'p2'], 0);
  const callback = () => assert.fail('render must not invoke the action');
  for (const extra of [
    { takeOutOffer: valid, selectionDisabled: true },
    { takeOutOffer: null },
    { takeOutOffer: { target: 'finish', parts: ['p1', 'p2'] } },
  ]) {
    const tag = batchButton(html(doc, { onTakeOutSelected: callback, ...extra }));
    assert.ok(tag);
    assert.match(tag, /\sdisabled=""/);
  }
  // SSR proves admission markup only. Real focus/blur and stale-owner events belong to the browser fixture.
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { DraftsPanel } from '../src/ui/DraftsPanel';
import { ReferencesPanel } from '../src/ui/ReferencesPanel';
import { SelectionInspector } from '../src/ui/SelectionInspector';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { Reference, ReferenceSet } from '@barocss/cad-model/engine/schema/references';
import { readReferenceDisplay, type ReferenceDisplay } from '../src/state/referenceDisplay';
const ref: Reference = { id: 'r1', name: 'Fixture', source: { step: 'invalid STEP' }, at: { position: [0, 0, 0], rotation: [0, 0, 0] } };
const empty: ReferenceSet = { version: 1, references: [], datums: [], keepouts: [] };
function references(set = empty, errors = new Map<string, string>(), pending = false) {
  return renderToStaticMarkup(createElement(ReferencesPanel, { set, errors, pending, local: new Map(), verdicts: null,
    onAddFile() {}, onPlace() {}, onDatum() {}, onEnvelope() {}, onRemove() {} }));
}
test('empty Drafts and References retain titles/add actions but omit empty summaries; nonempty counts stay', () => {
  const drafts = renderToStaticMarkup(createElement(DraftsPanel, { drafts: [], onAddDrawing() {}, onConfirm() {} }));
  assert.match(drafts, /aria-label="Drafts"/); assert.match(drafts, /aria-label="Add drawing"/); assert.doesNotMatch(drafts, /Drafts summary/);
  assert.doesNotMatch(references(), /Reference bodies summary/); assert.match(references(), /aria-label="Add reference"/);
  assert.match(references({ ...empty, references: [ref] }), /Reference bodies summary/);
  const filled = renderToStaticMarkup(createElement(DraftsPanel, { drafts: [{ id: 'd1', from: { drawing: 'fixture.dxf' }, nodes: [], dims: [] }], onAddDrawing() {}, onConfirm() {} }));
  assert.match(filled, /Drafts summary/); assert.match(filled, /0 to confirm/);
});
test('real reference failure is visible and differs from loading or successful empty output', async () => {
  let receipt: ReferenceDisplay | undefined;
  await readReferenceDisplay([ref], async () => { throw new Error('[NOT_READ] Fixture could not be read: invalid STEP'); }, () => true, value => { receipt = value; });
  assert.equal(receipt!.local.get('r1')!.length, 0);
  assert.match(references({ ...empty, references: [ref] }, new Map(receipt!.errors)), /invalid STEP/);
  assert.match(references({ ...empty, references: [ref] }, new Map(), true), /Reading this reference/);
  await readReferenceDisplay([ref], async () => [], () => true, value => { receipt = value; });
  assert.equal(receipt!.errors.size, 0, 'empty success is not inferred failure');
});
test('replacement/cleanup while an awaited reference read completes cannot publish stale failures', async () => {
  for (const reject of [false, true]) {
    let release!: () => void, live = true, publications = 0;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const task = readReferenceDisplay([ref], async () => { await wait; if (reject) throw new Error('old read failed'); return []; }, () => live, () => { publications++; });
    live = false; release(); await task; assert.equal(publications, 0);
  }
});
test('selected face keeps body measurements and places inertia controls inside closed details', () => {
  const doc = rectanglePart(10, 10, 10), result = evaluateDoc(doc, 1); assert.ok(result.ok);
  const before = JSON.stringify(doc);
  const html = renderToStaticMarkup(createElement(SelectionInspector, {
    model: { doc, evaluated: doc, bodies: result.bodies, fresh: true, busy: false, massReady: true },
    selection: { bodies: [], edges: [], faces: [{ body: 0, face: 0 }] },
    materialSettings: { material: 'al6061', setMaterial() {} },
    display: { showBox: false, setShowBox() {}, inertiaAt: 'centre', setInertiaAt() {} },
    changes: { commit() { return true; }, setSelection() {}, edgesToCurves() {}, async loadBendTable() {}, setFlatView() {}, setCutListView() {}, separate() {} }, children: null,
  }));
  assert.match(html, /<details class="body-inertia"><summary>Inertia details<\/summary>/);
  assert.match(html, /Inertia about/); assert.match(html, /Moments of inertia/); assert.match(html, /Bounds/); assert.match(html, /Volume/);
  assert.equal(JSON.stringify(doc), before);
});

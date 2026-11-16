import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyRevealTarget, ownsBodyReveal, revealScrollDelta, revealBodyRow, revealInteractionProblem } from '../src/app/bodyBrowserReveal';
import type { Selection } from '@barocss/cad-model/app/commands';
const empty = (): Selection => ({ bodies: [], faces: [], edges: [] });
const bodies = [{ key: 'first' }, { key: 'second' }], other = { instances: 0, direct: 0 };
test('body reveal resolves one current exact key from body, face and edge selections without changing input', () => {
  for (const selection of [{ ...empty(), bodies: [1] }, { ...empty(), faces: [{ body: 1, face: 0 }, { body: 1, face: 2 }] },
    { ...empty(), edges: [{ body: 1, edge: 0 }] }, { ...empty(), bodies: [1], faces: [{ body: 1, face: 2 }], edges: [{ body: 1, edge: 0 }] }]) {
    const before = structuredClone(selection);
    assert.deepEqual(bodyRevealTarget(selection, bodies, other, null), { key: 'second' });
    assert.deepEqual(selection, before);
  }
});
test('body reveal refuses empty, multi, mixed and unsupported sources and never coerces a stale index', () => {
  for (const selection of [empty(), { ...empty(), bodies: [0, 1] }, { ...empty(), bodies: [0], faces: [{ body: 1, face: 0 }] },
    { ...empty(), bodies: [-1] }, { ...empty(), bodies: [2] }, { ...empty(), bodies: [0.5] },
    { ...empty(), bodies: [0], sketches: [0] }, { ...empty(), bodies: [0], profileRegions: { sketch: 0, indices: [0] } },
    { ...empty(), bodies: [0], vertices: [{ body: 0, at: [0, 0, 0] as [number, number, number] }] }]) {
    assert.ok(bodyRevealTarget(selection, bodies, other, null).reason);
  }
  for (const mixed of [{ instances: 1, direct: 0 }, { instances: 0, direct: 1 }])
    assert.ok(bodyRevealTarget({ ...empty(), bodies: [0] }, bodies, mixed, null).reason);
  assert.ok(bodyRevealTarget({ ...empty(), bodies: [0] }, [{ key: 'same' }, { key: 'same' }], other, null).reason);
  assert.deepEqual(bodyRevealTarget({ ...empty(), bodies: [0] }, bodies, other, 'Finish editing.'), { reason: 'Finish editing.' });
});
test('minimal reveal displacement is zero for already visible rows', () => {
  assert.equal(revealScrollDelta(30, 50, 20, 100), 0);
  assert.equal(revealScrollDelta(20, 100, 20, 100), 0);
  assert.equal(revealScrollDelta(10, 30, 20, 100), -10);
  assert.equal(revealScrollDelta(90, 120, 20, 100), 20);
});
function dom() {
  const page: any = { scrollTop: 37 }, root: any = {};
  const doc: any = { body: page, documentElement: root, activeElement: null, defaultView: { getComputedStyle: (el: any) => ({ overflowY: el.overflow }) } };
  const dock: any = { parentElement: page, overflow: 'auto', scrollHeight: 1000, clientHeight: 100, clientTop: 2, scrollTop: 70, getBoundingClientRect: () => ({ top: 10 }) };
  const browser: any = { parentElement: dock, overflow: 'auto', scrollHeight: 900, clientHeight: 900, scrollTop: 0 };
  const row: any = { parentElement: browser, ownerDocument: doc, isConnected: true, getClientRects: () => [1],
    getBoundingClientRect: () => ({ top: 140, bottom: 160 }), focus(options: any) { assert.deepEqual(options, { preventScroll: true }); doc.activeElement = row; } };
  return { row, doc, dock, browser, page };
}
test('actual overflowing dock moves, not non-overflowing Browser or page; focus does not select/click', () => {
  const { row, dock, browser, page, doc } = dom();
  assert.equal(revealBodyRow(row), true);
  assert.equal(dock.scrollTop, 118); assert.equal(browser.scrollTop, 0); assert.equal(page.scrollTop, 37); assert.equal(doc.activeElement, row);
  row.getBoundingClientRect = () => ({ top: 30, bottom: 50 });
  assert.equal(revealBodyRow(row), true); assert.equal(dock.scrollTop, 118);
});
test('disconnected or hidden rows cannot take focus; page is never a reveal scroller', () => {
  const { row, doc, page } = dom();
  row.isConnected = false; assert.equal(revealBodyRow(row), false); assert.equal(doc.activeElement, null);
  row.isConnected = true; row.getClientRects = () => []; assert.equal(revealBodyRow(row), false);
  row.getClientRects = () => [1]; row.parentElement = page;
  assert.equal(revealBodyRow(row), true); assert.equal(page.scrollTop, 37);
});
test('focused editable field or visible modal refuses without blur or writes', () => {
  const doc: any = { activeElement: { matches: () => true }, querySelectorAll: () => [] };
  assert.match(revealInteractionProblem(doc)!, /Finish or cancel/);
  doc.activeElement = { matches: () => false, closest: () => ({}) };
  assert.match(revealInteractionProblem(doc)!, /Finish or cancel/);
  doc.activeElement = null; doc.querySelectorAll = () => [{ getClientRects: () => [1] }];
  assert.match(revealInteractionProblem(doc)!, /Close the dialog/);
  doc.querySelectorAll = () => [{ getClientRects: () => [] }]; assert.equal(revealInteractionProblem(doc), null);
});

test('empty optional profile selection does not reject a valid body', () => {
  assert.deepEqual(bodyRevealTarget({ ...empty(), bodies: [0], sketches: [], vertices: [], profileRegions: { sketch: 0, indices: [] } }, bodies, other, null), { key: 'first' });
});
test('one-shot reveal ownership rejects new document, evaluation, selection, Escape or closed Browser', () => {
  const owner = {}, request = { owner, key: 'first', ticket: 1 };
  assert.equal(ownsBodyReveal(request, owner, 'first', 1, true), true);
  // App creates a distinct owner on each document/evaluation/selection/generation change, even with the same body key.
  assert.equal(ownsBodyReveal(request, {}, 'first', 1, true), false);
  assert.equal(ownsBodyReveal(request, owner, 'second', 1, true), false);
  assert.equal(ownsBodyReveal(request, owner, undefined, 1, true), false);
  assert.equal(ownsBodyReveal(request, owner, 'first', 2, true), false);
  assert.equal(ownsBodyReveal(request, owner, 'first', 1, false), false);
});

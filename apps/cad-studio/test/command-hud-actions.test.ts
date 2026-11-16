import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import type { Values } from '@barocss/cad-model/app/commands';
import type { Active } from '../src/app/commandState';
import type { StudioNotice } from '../src/app/studioNotice';
import { createCommandHudActions } from '../src/app/commandHudActions';
import { createValueStore } from '../src/state/valueStore';

function fixture(id: string, values: Values = {}) {
  const doc = rectanglePart(30, 20, 10);
  const active = { cmd: { id }, ctx: { doc }, values, preview: 'ok' } as unknown as Active;
  const store = createValueStore<Active | null>(active), notice = createValueStore<StudioNotice | null>(null);
  const events: string[] = [];
  let allowed = true, published: Values | null = null;
  const actions = createCommandHudActions({ commandDoc: doc, activeStore: store,
    preview: { retire: () => events.push('retire'), typed: () => events.push('typed'),
      publishValues: values => { published = values; events.push('publish'); } },
    pending: { clearApply: () => events.push('clear-apply'), clearRepeat: () => events.push('clear-repeat') },
    canChangeDocument: () => allowed, apply: () => { events.push('apply'); }, onNotice: notice.set });
  return { actions, active, store, notice, events, published: () => published, block: () => { allowed = false; } };
}
test('HUD target input changes retire queued work before publishing new values', () => {
  const f = fixture('extrude', { depth: 'distance' }); f.actions.changeHudValue('depth', 'to-face');
  assert.deepEqual(f.events, ['clear-apply', 'clear-repeat', 'retire', 'typed', 'publish']);
  assert.equal(f.store.get()?.values.depth, 'to-face'); assert.equal(f.store.get()?.values, f.published());
  assert.equal(f.store.get()?.preview, 'busy');
});
test('ordinary HUD numeric input retains queued policy and font upload refusal', () => {
  const f = fixture('box', { w: 10 }); f.store.set({ ...f.active, upload: 'error' }); f.actions.changeHudValue('w', 20);
  assert.deepEqual(f.events, ['typed', 'publish']); assert.equal(f.store.get()?.preview, 'error');
});
test('mirror input retires only its own pick notice', () => {
  const f = fixture('mirror'); const other = { ...f.active.cmd };
  f.notice.set({ title: 'other', hint: '', detail: '', inputPick: other });
  f.actions.changeHudValue('pickPlane', 'yes'); assert.equal(f.notice.get()?.inputPick, other);
  f.notice.set({ title: 'owned', hint: '', detail: '', inputPick: f.active.cmd });
  f.actions.changeHudValue('pickPlane', ''); assert.equal(f.notice.get(), null);
});
test('hole preset admission requires current command/context and document authority', () => {
  const f = fixture('hole', { pat: 'one', type: 'through', d: 2 });
  assert.equal(f.actions.applyHoleOptions({ ...f.active, ctx: { ...f.active.ctx } }, { d: 4 }), false);
  assert.deepEqual(f.events, []); f.block(); assert.equal(f.actions.applyHoleOptions(f.active, { d: 4 }), false);
  const accepted = fixture('hole', { pat: 'one', type: 'through', d: 2 });
  assert.equal(accepted.actions.applyHoleOptions(accepted.active, { d: 4 }), true);
  assert.deepEqual(accepted.events, ['clear-apply', 'retire', 'publish']);
  assert.equal(accepted.store.get()?.values.d, 4);
});
for (const id of ['mirror', 'revolve-axis-edit', 'offset-face-edit', 'draft-history-edit']) {
  test(`stale ${id} HUD cannot apply a replaced active snapshot`, () => {
    const f = fixture(id); f.store.set({ ...f.active }); f.actions.applyHud(f.active);
    assert.deepEqual(f.events, []); f.actions.applyHud(f.store.get()!); assert.deepEqual(f.events, ['apply']);
  });
}
test('saved-source HUD ignores a replaced snapshot but admits the current owner', () => {
  const f = fixture('edit'); f.active.ownsSource = () => true;
  f.store.set({ ...f.active, values: { x: 44 } });
  f.actions.applyHud(f.active); assert.deepEqual(f.events, []);
  f.actions.applyHud(f.store.get()!); assert.deepEqual(f.events, ['apply']);
});

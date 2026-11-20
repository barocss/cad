import assert from 'node:assert/strict';
import test from 'node:test';
import { extrudeCommand } from '@barocss/cad-model/app/profileCommands';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import type { Active } from '../src/app/commandState';
import { commandApplyReadiness, createCommandApplyQueue } from '../src/state/commandApply';
import { createValueStore } from '../src/state/valueStore';

function draft(): Active {
  return { cmd: extrudeCommand, values: { h: 5, op: 'new' }, preview: 'busy',
    ctx: { doc: emptyDoc(), bodies: [], selection: { bodies: [], edges: [], faces: [] } } };
}

test('a queued independent Extrude cannot apply or repeat after its values change', () => {
  const active = draft();
  const scope = {};
  active.independentExtrude = { ownsModel: () => true, joinScope: () => scope };
  const store = createValueStore<Active | null>(active);
  const queue = createCommandApplyQueue();
  queue.requestRepeat(active.cmd);
  queue.requestApply(active);
  let applied = 0;
  const stop = queue.watch(store, () => { applied++; });
  store.set({ ...active, values: { ...active.values, h: 6 }, preview: 'ok' });
  stop();
  queue.watch(store, () => { applied++; })();
  assert.equal(applied, 0);
  assert.equal(queue.takeRepeat(), null);
});

test('an ordinary queued command waits for the rendered preview and repeats once', () => {
  const active = draft();
  const store = createValueStore<Active | null>(active);
  const queue = createCommandApplyQueue();
  queue.requestApply(active);
  queue.requestRepeat(active.cmd);
  let applied = 0;
  const apply = () => { applied++; queue.clearApply(); };
  const stop = queue.watch(store, apply);
  store.set({ ...active, preview: 'ok' });
  assert.equal(applied, 0);
  stop();
  queue.watch(store, apply)();
  queue.watch(store, apply)();
  assert.equal(applied, 1);
  assert.equal(queue.takeRepeat(), active.cmd);
  assert.equal(queue.takeRepeat(), null);
});

test('a retired source cannot reach Apply while its preview is still busy', () => {
  const active = draft();
  const scope = { commandDoc: active.ctx.doc, modelCurrent: true, bearingRootCurrent: true, canChangeDocument: () => true };
  assert.equal(commandApplyReadiness(active, scope).kind, 'wait');
  assert.deepEqual(commandApplyReadiness({ ...active, ownsSource: () => false }, scope), { kind: 'retire', clearRepeat: true });
});

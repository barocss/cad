import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '@barocss/cad-model/app/commands';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import type { Active } from '../src/app/commandState';
import { captureFilletScalarDraft } from '../src/viewport/filletScalarDraft';

function withRadius(radius: number): Active {
  return { cmd: commandById('fillet')!, preview: 'ok', values: { radius },
    ctx: { doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } } };
}

function capture(before: Active | null) {
  const source = before ?? withRadius(1);
  let current = before, wall: object | null = null, retired = 0;
  const draft = captureFilletScalarDraft({ before, read: () => current, readWall: () => wall,
    owns: active => active.cmd === source.cmd && active.ctx === source.ctx,
    retire: () => { retired++; wall = null; },
    restore: (owner, next) => { assert.equal(owner, current); current = next; },
  });
  return { draft, update(next: Active | null, nextWall: object | null, remember = false) {
    current = next; wall = nextWall;
    if (next && nextWall && remember) draft.remember(next.values, nextWall);
  }, source, state: () => ({ current, wall, retired }) };
}

test('cancel only the idle History gesture that opened the Fillet draft', () => {
  const { draft, source, state, update } = capture(null);
  draft.cancel();
  assert.equal(state().retired, 0);
  const shown: Active = { ...source, values: { radius: 2 } };
  update(shown, {}, true);
  update({ ...shown, preview: 'ok' }, null);
  draft.cancel();
  draft.cancel();
  assert.deepEqual(state(), { current: null, wall: null, retired: 1 });
});

test('cancel an existing Fillet gesture after preview refinement and restore its prior values', () => {
  const before = withRadius(1.5), { draft, state, update } = capture(before), wall = {};
  update({ ...before, values: { radius: 4 } }, wall, true);
  update({ ...before, values: { radius: 3.5 }, preview: 'ok' }, wall);
  draft.cancel();
  assert.equal(state().retired, 1);
  assert.equal(state().current?.values, before.values);
  assert.equal(state().current?.ctx, before.ctx);
  assert.equal(state().current?.preview, 'busy');
  assert.equal(state().wall, null);
});

test('a stale capture cannot retire a replacement command or newer typed radius', () => {
  for (const replace of [true, false]) {
    const before = withRadius(1), { draft, state, update } = capture(before);
    const shown = { ...before, values: { radius: 2 } };
    update(shown, {}, true);
    const next = replace ? withRadius(3) : { ...shown, values: { radius: 3 } };
    update(next, null);
    draft.cancel();
    assert.deepEqual(state(), { current: next, wall: null, retired: 0 });
  }
});

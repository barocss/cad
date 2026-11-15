import test from 'node:test';
import assert from 'node:assert/strict';
import { commands, type Command } from '@barocss/cad-model/app/commands';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { paletteList } from '../src/ui/paletteList';
import { filletPaletteRows } from '../src/app/filletFamily';
import { paletteCommandBlocked, paletteExecutionReason, runPaletteSelection } from '../src/ui/paletteExecution';
const ready = { showingVariant: null, fresh: true, busy: false };
const ctx = { doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } };

test('global variant, failed evaluation and computation precede selection advice, including fillet rows', () => {
  for (const state of [{ ...ready, showingVariant: 'high' }, { ...ready, fresh: false }, { ...ready, fresh: false, busy: true }]) {
    assert.ok(paletteExecutionReason(state));
    for (const query of ['Box', 'Hole', 'Fillet', 'Sketch', 'Measure']) {
      const row = filletPaletteRows(paletteList(query, ctx), query, ctx)[0];
      assert.ok(row, query);
      assert.equal(paletteCommandBlocked(row.c, state), true, query);
    }
  }
  assert.match(paletteExecutionReason({ ...ready, showingVariant: 'high' })!, /show the master/);
  assert.match(paletteExecutionReason({ ...ready, fresh: false })!, /Fix.*undo/);
  assert.match(paletteExecutionReason({ ...ready, fresh: false, busy: true })!, /Wait.*stop/);
  assert.equal(paletteExecutionReason(ready), undefined);
  for (const c of commands) assert.equal(paletteCommandBlocked(c, ready), false);
});

test('blocked Enter/click share a no-run, input-focus path without modifying query, selection or document', () => {
  const before = JSON.stringify(ctx), query = 'Box'; let runs = 0, focuses = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    runPaletteSelection(true, true, () => runs++, () => focuses++);
    runPaletteSelection(false, false, () => runs++, () => focuses++);
  }
  assert.equal(runs, 0); assert.equal(focuses, 4); assert.equal(query, 'Box'); assert.equal(JSON.stringify(ctx), before);
  runPaletteSelection(false, true, () => runs++, () => focuses++);
  assert.equal(runs, 1); assert.equal(focuses, 4);
});

test('3D sketch and interference require a current model; display-only steps retain their own conditions', () => {
  const state = { ...ready, fresh: false };
  const extra = (id: string): Command => ({ id, label: id, icon: '', group: 'inspect', available: () => ({ ok: true }) });
  assert.equal(paletteCommandBlocked(extra('sketch3d'), state), true);
  assert.equal(paletteCommandBlocked(commands.find(c => c.id === 'interference')!, state), true);
  assert.equal(paletteCommandBlocked(extra('assembly-steps'), state), false);
  assert.equal(paletteCommandBlocked(extra('assembly-steps'), { ...state, showingVariant: 'high' }), true);
});

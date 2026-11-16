import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import type { EngineClient } from '../src/engine/client';
import { currentKeepoutVerdicts, keepoutSourceCurrent, type KeepoutSource, type KeepoutReceipt } from '../src/state/keepoutReceipt';

const source = (): KeepoutSource => ({ evaluated: emptyDoc(), references: { version: 1, references: [], datums: [], keepouts: [] }, bodies: [], engine: {} as EngineClient, fresh: true, busy: false });
test('only exact accepted geometry exposes its keepout receipt', () => {
  const owner = source(), receipt: KeepoutReceipt = { source: owner, verdicts: [] };
  assert.equal(currentKeepoutVerdicts(receipt, { ...owner }), receipt.verdicts);
  assert.equal(currentKeepoutVerdicts(null, owner), null);
  for (const changed of [
    { evaluated: { ...owner.evaluated } }, { references: { ...owner.references! } },
    { bodies: [...owner.bodies] }, { engine: {} as EngineClient }, { fresh: false }, { busy: true },
  ]) assert.equal(currentKeepoutVerdicts(receipt, { ...owner, ...changed }), null);
  assert.equal(currentKeepoutVerdicts({ ...receipt, source: { ...owner, fresh: false } }, owner), null);
  assert.equal(currentKeepoutVerdicts({ ...receipt, source: { ...owner, busy: true } }, owner), null);
});
test('same-content replacement never inherits a previous receipt before effects run', () => {
  const before = source(), after = { ...before, evaluated: { ...before.evaluated } };
  const receipt: KeepoutReceipt = { source: before, verdicts: [] };
  assert.equal(currentKeepoutVerdicts(receipt, after), null);
  const completed: KeepoutReceipt = { source: after, verdicts: [] };
  assert.equal(currentKeepoutVerdicts(completed, after), completed.verdicts);
  assert.equal(currentKeepoutVerdicts(completed, before), null);
});
test('deferred completion guard rejects a retired source and accepts the current one', async () => {
  const before = source(); let current = before;
  let receipt: KeepoutReceipt | null = null;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const finish = pending.then(() => { if (keepoutSourceCurrent(before, current)) receipt = { source: before, verdicts: [] }; });
  current = { ...before, bodies: [] };
  release(); await finish;
  assert.equal(receipt, null);
  if (keepoutSourceCurrent(current, current)) receipt = { source: current, verdicts: [] };
  assert.ok(receipt);
  assert.equal(currentKeepoutVerdicts(receipt, current), receipt.verdicts);
});

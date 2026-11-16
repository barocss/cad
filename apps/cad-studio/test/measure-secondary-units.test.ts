import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeasureUnitPreference, MEASURE_SECONDARY_UNIT_KEY, measureSecondaryText, parseMeasureSecondaryUnit } from '../src/ui/measureSecondaryUnits';
test('raw lengths/area and signed deltas use independent inch literals, not rounded mm', () => {
  assert.equal(measureSecondaryText(25.4), '1 in');
  assert.equal(measureSecondaryText(12.7), '0.5 in');
  assert.equal(measureSecondaryText(645.16, 'area'), '1 in²');
  assert.deepEqual([-25.4, 0, 50.8].map(v => measureSecondaryText(v)), ['-1 in', '0 in', '2 in']);
  assert.equal(measureSecondaryText(0.0149), '0.0006 in');
  assert.equal(measureSecondaryText(1, 'area'), '0.00155 in²');
});
test('tiny finite nonzero survives rounding with approximate logarithmic underflow display; nonfinite never becomes normal zero', () => {
  assert.equal(measureSecondaryText(-0), '0 in');
  assert.equal(measureSecondaryText(0.000001), '3.94e-8 in');
  assert.equal(measureSecondaryText(-0.000001, 'area'), '-1.55e-9 in²');
  assert.match(measureSecondaryText(Number.MIN_VALUE)!, /^1\.95e-325 in$/);
  assert.match(measureSecondaryText(Number.MAX_VALUE)!, /e\+306 in$/);
  for (const value of [NaN, Infinity, -Infinity, undefined]) assert.equal(measureSecondaryText(value as number), null);
});
test('only supported enum is accepted, default/invalid values remain None', () => {
  for (const raw of [null, undefined, '', 'none', 'mm', 'INCH', '{}', 1]) assert.equal(parseMeasureSecondaryUnit(raw), 'none');
  assert.equal(parseMeasureSecondaryUnit('inch'), 'inch');
});
test('persist only enum; fresh store restores it, None is persisted; stable snapshots and unsubscribe', () => {
  const values = new Map<string, string>(); const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  const p = createMeasureUnitPreference(() => storage); assert.deepEqual(p.get(), { unit: 'none', persistent: true }); assert.equal(p.get(), p.get());
  let calls = 0; const stop = p.subscribe(() => calls++); p.set('inch'); assert.equal(calls, 1);
  assert.deepEqual([...values], [[MEASURE_SECONDARY_UNIT_KEY, 'inch']]);
  assert.deepEqual(createMeasureUnitPreference(() => storage).get(), { unit: 'inch', persistent: true });
  stop(); p.set('none'); assert.equal(calls, 1); assert.equal(createMeasureUnitPreference(() => storage).get().unit, 'none');
});
test('read/write/quota failures and no storage keep session choice across readers, not a fresh page', () => {
  for (const access of [() => null, () => { throw Error('blocked'); }, () => ({ getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } })]) {
    const p = createMeasureUnitPreference(access); assert.deepEqual(p.get(), { unit: 'none', persistent: false });
    p.set('inch'); assert.deepEqual(p.get(), { unit: 'inch', persistent: false });
    const remountRead = p.get; assert.equal(remountRead().unit, 'inch');
    assert.equal(createMeasureUnitPreference(access).get().unit, 'none');
  }
  const p = createMeasureUnitPreference(() => ({ getItem: () => 'none', setItem() { throw Error('quota'); } }));
  p.get(); p.set('inch'); assert.equal(p.get().unit, 'inch', 'do not reload stale persisted None on remount');
  assert.equal(p.get().persistent, false);
});

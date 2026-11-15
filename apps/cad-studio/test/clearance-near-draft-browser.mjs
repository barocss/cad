import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/viewport/ClearancePanel.tsx', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/test/clearance-near-draft-browser.mjs'];
const f = await createFlow({ name: 'clearance-near-draft', output: process.argv[2], envFrozen: 'D1403_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Clearance drafts commit only on Enter/blur, retain the actual analysis band during editing, and reset on document ownership changes.',
  limits: ['Two synthetic desktop solids. No mobile, manufacturing, assistive technology or IME claim. Browser-sanitized partial number text is recorded, not assumed.'] });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 8] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 6 },
  { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [24, 0], max: [34, 8] }, { id: 'n3', kind: 'extrude', sketch: 2, height: 6 },
], outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } }, nextId: 4 };
const panel = () => f.page.getByLabel('Assembly clearance', { exact: true });
const input = () => panel().getByLabel('Near clearance (mm)');
const preview = name => f.page.getByRole('radio', { name: `Preview: ${name}`, exact: true });
async function show() { if (!await panel().isVisible()) await preview('Clearance').click(); await panel().waitFor(); }
async function result(near) {
  await f.page.waitForFunction(value => { const d = window.__studioClearance?.(); return d?.stage === 'ready' && d.near === value; }, near, { timeout: 60000 });
  const r = await f.page.evaluate(() => { const d = window.__studioClearance(); return { near: d.near, stage: d.stage, gaps: d.pairs.map(p => p.minGap) }; });
  assert.equal(r.gaps.length, near >= 14 ? 1 : 0);
  if (r.gaps.length) assert.ok(Math.abs(r.gaps[0] - 14) < 1e-8);
  assert.match(await panel().innerText(), near >= 14 ? /1 candidate pair/ : /No candidate pairs/);
  return r;
}
async function commit(near, key = 'Enter') { await input().fill(String(near)); await input().press(key); await result(near); assert.equal(Number(await input().inputValue()), near); }
async function hint(invalid = false) {
  const id = await input().getAttribute('aria-describedby'); assert.ok(id);
  const status = f.page.locator(`[id=${JSON.stringify(id.split(' ')[0])}]`); assert.equal(await status.getAttribute('role'), 'status');
  const text = await status.innerText(); assert.match(text, invalid ? /finite positive clearance/ : /Not applied/); assert.match(text, /Analysis uses/);
  assert.equal(await input().getAttribute('aria-invalid'), invalid ? 'true' : null); return text;
}
async function open(doc) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]);
  await chooser.setFiles({ name: 'clearance-draft.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc); await show();
}
await f.run(async () => {
  for (const width of [1024, 1440]) {
    f.phase = `${width} sequential Near replacement`;
    await f.newPage(); await f.page.setViewportSize({ width, height: width === 1024 ? 800 : 900 }); await open(seed);
    // One real model edit makes Undo/Redo an explicit history sentinel. Near
    // changes must not add an entry between this edit and the original document.
    await preview('Print').click(); await f.page.getByLabel('Print layers', { exact: true }).getByLabel('Set layer height').check();
    await f.changed(seed); const baseline = await f.doc(); await show(); await commit(0.301);
    await input().focus(); await input().press('Meta+A'); await input().press('Backspace');
    assert.equal(await input().inputValue(), ''); await hint(true); await result(0.301); await f.same(baseline);
    await input().pressSequentially('0.35'); assert.equal(Number(await input().inputValue()), 0.35);
    await hint(); await result(0.301); await f.same(baseline); await f.snapshot(`${width}-valid-draft`);
    await input().press('Enter'); await result(0.35); await input().press('Tab'); await result(0.35); await f.same(baseline);
    for (const [draft, key] of [['', 'Enter'], ['0', 'Enter'], ['-1', 'Tab']]) {
      f.phase = `${width} invalid ${JSON.stringify(draft)} via ${key}`;
      await input().fill(draft); await input().press(key); assert.equal(await input().inputValue(), draft);
      await hint(true); await result(0.35); await f.same(baseline);
      await f.snapshot(`${width}-invalid-${draft || 'blank'}`); await input().press('Escape'); assert.equal(Number(await input().inputValue()), 0.35);
    }
    await input().fill(''); await input().pressSequentially('0.');
    f.report.observations.push({ width, partialDecimalObserved: await input().inputValue(), committed: await result(0.35) });
    await input().press('Enter'); await hint(true); await result(0.35); await input().press('Escape');
    await commit(0.4, 'Tab'); await input().fill('0.45'); await input().press('Escape'); await input().press('Tab'); await result(0.4);
    f.phase = `${width} None click blur policy`;
    await input().fill('0.55'); await preview('None').click(); await panel().waitFor({ state: 'hidden' }); await show();
    await result(0.55); assert.equal(Number(await input().inputValue()), 0.55);
    await input().fill('-1'); await preview('None').click(); await panel().waitFor({ state: 'hidden' }); await show();
    await result(0.55); assert.equal(Number(await input().inputValue()), 0.55); await f.same(baseline);
    f.report.observations.push({ width, nonePolicy: 'Valid draft commits on click-induced blur; invalid draft is discarded by unmount; accepted band survives.' });
    f.phase = `${width} exact candidate threshold`;
    for (const near of [13.9, 14, 20]) { await commit(near); await f.same(baseline); await f.snapshot(`${width}-near-${near}`); }
    assert.ok(await input().evaluate(e => e.min === String(Number.MIN_VALUE) && e.step === 'any' && e.validity.valid));
    f.phase = `${width} no analysis undo entries and same-ID Open reset`;
    await input().press('Tab'); await f.undo(); await f.same(seed); await result(20);
    await f.redo(); await f.same(baseline); await result(20);
    await input().fill('-1'); await open(baseline);
    await f.page.waitForFunction(() => document.querySelector('input[aria-label="Near clearance (mm)"]')?.value === '20');
    await result(20); assert.equal(await input().getAttribute('aria-invalid'), null); await f.same(baseline); await f.snapshot(`${width}-same-id-open-reset`);
    const saved = await f.save(`${width}-clearance-draft`); assert.deepEqual(saved.doc, baseline);
    await f.newPage(); await f.page.setViewportSize({ width, height: width === 1024 ? 800 : 900 });
    await f.openFile(saved.file, 4); await f.same(baseline); await show(); await result(1);
    assert.equal(Number(await input().inputValue()), 1); await f.snapshot(`${width}-fresh-open`);
  }
});

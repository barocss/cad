import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const original = JSON.parse(await readFile('handover/notes/trimmed-surface-region-2026-10-30/studio/run-01/outside-hole.bcad', 'utf8'));
const id = 'obj_2', oldName = original.direct.objects.find(o => o.id === id).name, newName = 'Renamed curve';
const pins = ['apps/cad-studio/src/ui/DirectPanel.tsx', 'apps/cad-studio/test/direct-rename-history-browser.mjs'];
const f = await createFlow({ name: 'direct-rename-history', output: process.argv[2], envFrozen: 'DIRECT_RENAME_FROZEN', initialFiles: pins, requiredFrozen: pins, qualification: baseline ? 'Diagnostic reproduction of same-ID Undo stale name input' : 'Direct curve name history ownership', limits: ['Rename only; no native geometry algorithm changed.'] });
const field = () => f.page.getByRole('complementary', { name: 'Direct geometry' }).getByLabel('Object name', { exact: true });
await f.run(async () => {
  const create = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await create({ ...options, acceptDownloads: false });
    await context.addInitScript(() => {
      const urls = new Map(), createUrl = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
      window.__renameSaves = [];
      URL.createObjectURL = function (blob) { const url = createUrl.call(this, blob); urls.set(url, blob); return url; };
      HTMLAnchorElement.prototype.click = function () { const blob = urls.get(this.href); if (!blob || !this.download.endsWith('.bcad')) return click.call(this); window.__renameSaves.push(blob.text()); };
    }); return context;
  };
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]);
  await chooser.setFiles({ name: 'rename-original.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original)) }); await f.same(original);
  await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(oldName, { exact: true })).click();
  await field().fill(newName); await field().press('Enter'); await field().press('Tab');
  const renamed = structuredClone(original); renamed.direct.objects.find(o => o.id === id).name = newName;
  await f.same(renamed); await f.snapshot('01-renamed');
  await f.undo(); await f.same(original);
  const shown = await field().inputValue(); await f.snapshot('02-undo-name');
  f.report.observations.push({ label: 'same-id-undo', accepted: oldName, input: shown, baseline });
  assert.equal(shown, baseline ? newName : oldName);
  if (baseline) return;
  // Blurring the now-current name must not reapply the undone edit or discard Redo.
  await field().focus(); await field().press('Tab'); await f.same(original);
  await f.redo(); await f.same(renamed); assert.equal(await field().inputValue(), newName);
  // Whitespace-only normalization is a no-op, not an extra history entry.
  await field().fill('  ' + newName + '  '); await field().press('Enter'); await field().press('Tab');
  await f.same(renamed); await f.undo(); await f.same(original);
  await f.redo(); await f.same(renamed);
  const other = original.direct.objects.find(o => o.id === 'obj_3');
  await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(other.name, { exact: true })).click();
  assert.equal(await field().inputValue(), other.name);
  await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(newName, { exact: true })).click();
  assert.equal(await field().inputValue(), newName); await f.same(renamed);
  await f.page.getByRole('button', { name: 'Save', exact: true }).click();
  await f.page.waitForFunction(() => window.__renameSaves.length === 1);
  const bytes = await f.page.evaluate(() => window.__renameSaves[0]); assert.deepEqual(JSON.parse(bytes), renamed);
  const path = process.argv[2] + '/renamed.bcad'; await writeFile(path, bytes);
  await f.freshOpen(path, renamed, '03-fresh-open');
  await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(newName, { exact: true })).click();
  assert.equal(await field().inputValue(), newName);
  // A second public Open reuses the same object ID but a different accepted name/source owner.
  const next = structuredClone(original); next.direct.objects.find(o => o.id === id).name = 'Other document curve';
  const [second] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]);
  await second.setFiles({ name: 'same-id-other.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(next)) }); await f.same(next);
  await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle('Other document curve', { exact: true })).click();
  assert.equal(await field().inputValue(), 'Other document curve'); await field().press('Tab'); await f.same(next); await f.snapshot('04-same-id-other');
  f.report.observations.push({ label: 'bounded-history', oneUndoAfterEnterBlurAndWhitespace: true, selectionSwitch: true, nativeSaveFreshOpen: true, sameIdOtherDocument: true, cancel: 'No dedicated Cancel action exists; not added.' });
});

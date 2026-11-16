import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const files = ['apps/cad-studio/src/ui/MatePanel.tsx', 'apps/cad-studio/test/mate-selection-priority-browser.mjs'];
const f = await createFlow({ name: 'mate-selection-priority', output: process.argv[2], envFrozen: 'MATE_SELECTION_FROZEN', initialFiles: files, requiredFrozen: files, qualification: 'Mate draft selection priority and same-part recovery', limits: ['Desktop native reference picker; no new cylindrical geometry or robot motion qualification.'] });
await f.run(async () => {
  for (const [width, height] of [[1024, 800], [1440, 900]]) {
    await f.newPage();
    await f.page.setViewportSize({ width, height });
    await f.openFile(resolve('apps/cad-studio/test/fixtures/edit-in-place.bcad'), 2);
    f.phase = `${width} Mate draft, help and refusal recovery`;
    const before = await f.doc();
    await f.page.locator('.outliner .ol.instance').filter({ hasText: 'Cube 1' }).click();
    const panel = f.page.getByRole('complementary', { name: 'Mates', exact: true });
    await panel.getByRole('button', { name: 'Add mate', exact: true }).click();
    await panel.getByLabel('Mate type', { exact: true }).selectOption('cylindrical');
    for (const label of ['1 · Stays', '2 · Moves']) {
      const box = await panel.locator('.mate-draft .kv').filter({ hasText: label }).boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= height, `${label} must be visible at ${width}`);
    }
    assert.equal(await panel.getByLabel('Cylindrical axes').innerText(), '1 free turn and 1 free slide along aligned connector Z axes.');
    await f.snapshot(`${width}-cylindrical-priority`);
    const help = panel.locator('summary', { hasText: 'Mate selection help' });
    await help.focus(); await f.page.keyboard.press('Enter');
    assert.equal(await help.locator('..').getAttribute('open'), '');
    await f.page.keyboard.press('Enter');
    assert.equal(await help.locator('..').getAttribute('open'), null);
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(await f.doc(), before);
    await panel.getByRole('button', { name: 'Add mate', exact: true }).click();
    await panel.getByLabel('Mate type', { exact: true }).selectOption('coincident');
    async function pick(part, geometry, keyboard = false) {
      await panel.getByLabel('Reference part', { exact: true }).selectOption(part);
      await panel.getByLabel('Reference geometry', { exact: true }).selectOption(geometry);
      const button = panel.getByRole('button', { name: 'Pick mate reference', exact: true });
      if (keyboard) { await button.focus(); await f.page.keyboard.press('Enter'); } else await button.click();
    }
    const options = await panel.getByLabel('Reference part', { exact: true }).locator('option').evaluateAll(os => os.map(o => ({value:o.value,text:o.textContent})));
    const base = options.find(o => o.text === 'Base part').value;
    const cube = options.find(o => o.text === 'Cube 1').value;
    await pick(base, 'n1.top');
    const stays = panel.locator('.mate-draft .kv').filter({ hasText: '1 · Stays' });
    assert.match(await stays.innerText(), /Base part.*Top face/);
    await pick(base, 'n1.bottom', true);
    await panel.getByLabel('Mate refused').waitFor();
    assert.equal(await panel.getByLabel('Mate refused').count(), 1);
    assert.match(await stays.innerText(), /Base part.*Top face/);
    await f.snapshot(`${width}-same-part-refused`);
    await pick(cube, 'n1.bottom', true);
    await f.page.waitForFunction(() => window.__studioDoc.mates?.length === 1);
    const after = await f.doc(); assert.equal(after.mates.length, 1);
    await f.snapshot(`${width}-mate-applied`);
    await f.undo();
    assert.deepEqual(await f.doc(), before);
  }
});

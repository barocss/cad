import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { builderFiles, cases } from './b03-depth-category-oracles.mjs';
import { createFlow, sha256 } from './flow-helper.mjs';
import { captureCounterboreSheet, oracleSource } from './two-sheet-counterbore-svg-oracles.mjs';

const output = process.argv[2];
const repo = resolve(import.meta.dirname, '../../..');
assert.ok(output && isAbsolute(output) && relative(repo, output).startsWith('../'), 'Use an external evidence directory');
const { seedText, seedBytes, seedSHA256 } = cases.counterbore;
assert.equal(Buffer.byteLength(seedText), seedBytes);
assert.equal(sha256(seedText), seedSHA256);
const original = JSON.parse(seedText);

const f = await createFlow({
  name: 'two-sheet-counterbore-svg',
  envFrozen: 'D675_SOURCE_FROZEN',
  qualification: 'D675 current-sheet SVG with one depth-edited counterbore callout',
  output,
  oracleSource,
  initialFiles: [
    'apps/cad-studio/test/two-sheet-counterbore-svg-browser.mjs', 'apps/cad-studio/test/two-sheet-counterbore-svg-oracles.mjs', ...builderFiles,
    'packages/barocss-cad-model/src/drawing/sheets.ts', 'packages/barocss-cad-model/src/drawing/sheet.ts',
    'packages/barocss-cad-model/src/drawing/dimensions.ts', 'packages/barocss-cad-model/src/io/svg.ts',
    'packages/barocss-cad-model/src/app/editFields.ts',
  ],
  limits: ['Two A4 sheets, millimetres, one Top-view counterbore, one depth edit.'],
});

await f.run(async () => {
  const seed = join(output, 'counterbore.bcad');
  await writeFile(seed, seedText);
  f.report.seedSHA256 = seedSHA256;
  await f.newPage();
  await f.page.setViewportSize({ width: 1440, height: 900 });
  f.phase = 'Open exact counterbore seed';
  await f.openFile(seed, 4);
  assert.deepEqual(await f.doc(), original);
  const drawing = f.page.getByRole('button', { name: 'Drawing', exact: true });
  await drawing.click();

  f.phase = 'Auto-dimension and prepare Top sheet';
  await f.page.getByRole('button', { name: 'Auto-dimension', exact: true }).click();
  await f.changed(original);
  const add = f.page.getByRole('tablist', { name: 'Sheets', exact: true })
    .getByRole('button', { name: 'Add sheet', exact: true });
  await add.click();
  const panel = f.page.locator('details[aria-label="Sheets"]');
  if (!(await panel.evaluate(element => element.open))) await panel.locator('summary').click();
  await panel.getByLabel('Move Top view to sheet', { exact: true }).selectOption('2');
  const settings = f.page.getByRole('complementary', { name: 'Drawing settings', exact: true });
  await settings.getByLabel('Scale', { exact: true }).selectOption('1');
  await f.page.waitForFunction(() => {
    const sheet = window.__studioDoc?.drawing?.sheets?.[0];
    return sheet?.scale === 1 && sheet.views.includes('top');
  });
  const before = await f.doc();
  await captureCounterboreSheet(f, 1, 4);
  const initial = await captureCounterboreSheet(f, 2, 4);

  f.phase = 'edit counterbore depth 4 to 2';
  await f.page.getByRole('button', { name: 'Model', exact: true }).click();
  await f.openFeatureEditor(3, 'counterbore');
  const depth = f.editor().getByLabel('Depth', { exact: true });
  assert.equal(await depth.inputValue(), '4');
  await depth.fill('2');
  await f.applyEditor(before, 'depth-edited');
  const after = await f.doc();
  const nodes = structuredClone(before.nodes);
  nodes[3].depth = 2;
  assert.deepEqual(after.nodes, nodes);
  assert.deepEqual(after.outputs, before.outputs);
  await drawing.click();
  await captureCounterboreSheet(f, 1, 2);
  const edited = await captureCounterboreSheet(f, 2, 2);
  assert.equal(edited.id, initial.id);
  assert.equal(f.report.downloads.length, 4);
  f.phase = 'complete';
});

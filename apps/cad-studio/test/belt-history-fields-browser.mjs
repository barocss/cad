import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const f = await createFlow({
  name: 'belt-history-fields', output: process.argv[2], envFrozen: 'BELT_HISTORY_FROZEN',
  initialFiles: ['apps/cad-studio/test/belt-history-fields-browser.mjs'],
  qualification: 'V, Timing and Flat belts omit chain-only Links; chain rounding edits still work.',
  limits: ['No manufacturing qualification; no physical downloads.'],
});
const rows = [
  { kind: 'v-belt', id: 'v', angle: 38, datumWidth: 8.5, aboveDatum: 2, belowDatum: 9, spacing: 12, edge: 8, thickness: 8, estimate: true },
  { kind: 'timing-belt', id: 'timing', pitch: 5, pitchLineOffset: 0.5, groove: [[-1.6, 0], [-1.1, 1.2], [1.1, 1.2], [1.6, 0]], thickness: 2.2, estimate: true },
  { kind: 'flat-belt', id: 'flat', width: 40, thickness: 3, estimate: true },
  { kind: 'chain', id: 'chain', pitch: 12.7, rollerDiameter: 8.51, innerWidth: 7.75, plateHeight: 11.8, estimate: true },
];
function fixture(row) {
  const nodes = [0, 1].map(i => ({ id: `n${i}`, row: row.id, bore: 12, center: [i * 200, 0], ...(row.kind === 'chain'
    ? { kind: 'sprocket', teeth: i ? 34 : 17, tip: i ? 145 : 75, width: 7, generator: 'sprocket@0' }
    : { kind: 'pulley', generator: 'pulley@0', ...(row.kind === 'timing-belt' ? { teeth: i ? 30 : 20, width: 10 } : row.kind === 'v-belt' ? { diameter: i ? 100 : 80, grooves: 1 } : { diameter: i ? 80 : 50, width: 50 }) }) }));
  nodes.push({ id: 'n2', kind: 'belt', row: row.id, wheels: [0, 1], generator: 'belt@0' });
  return { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes, outputs: { b0: { node: 0, side: 'solid' }, b1: { node: 1, side: 'solid' }, b2: { node: 2, side: 'solid' } }, nextId: 3, drives: { version: 1, rows: [row] } };
}
async function open(doc) {
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'drive.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc); assert.equal((await f.bodies()).bodies.length, 3);
}
async function noLinks(doc, label) {
  await f.openFeatureEditor(2);
  assert.equal(await f.editor().getByRole('combobox', { name: 'Links (a chain)', exact: true }).count(), 0);
  assert.equal(await f.editor().getByRole('button', { name: 'Apply', exact: true }).count(), 0);
  await f.editor().getByText('This feature has no editable dimensions.', { exact: true }).waitFor();
  await f.snapshot(label); await f.closeEditor(); await f.same(doc);
}
await f.run(async () => {
  await f.newPage();
  for (const row of rows.slice(0, 3)) {
    const doc = fixture(row); await open(doc); await noLinks(doc, `01-${row.id}-no-chain-field`);
    await f.page.getByRole('button', { name: 'New part', exact: true }).click(); await f.ready();
    await open(doc); await noLinks(doc, `02-${row.id}-reopened`);
  }
  const chain = fixture(rows[3]); await open(chain); await f.openFeatureEditor(2);
  const links = () => f.editor().getByRole('combobox', { name: 'Links (a chain)', exact: true });
  assert.deepEqual(await links().locator('option').evaluateAll(xs => xs.map(x => x.value)), ['whole', 'even']);
  await links().selectOption('even'); const even = (await f.applyEditor(chain, '03-chain-even')).doc;
  assert.deepEqual(even.nodes[2], { ...chain.nodes[2], rounding: 'even' });
  await f.undo(); await f.same(chain); await f.redo(); await f.same(even);
  await f.page.getByRole('button', { name: 'New part', exact: true }).click(); await f.ready(); await open(even);
  await f.openFeatureEditor(2); assert.equal(await links().inputValue(), 'even'); await links().selectOption('whole');
  await f.closeEditor(); await f.same(even); assert.deepEqual(f.report.downloads, []);
});

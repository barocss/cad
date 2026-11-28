import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/test/model-commit-history-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/engine/references.ts',
  'apps/cad-studio/src/state/profileSelection.ts'];
const f = await createFlow({
  name: 'model-commit-history', output: process.argv[2], envFrozen: 'MODEL_COMMIT_HISTORY_FROZEN',
  qualification: 'Commit an exact edge-picked Fillet at a rolled-back History marker, then verify the replaced suffix and original edge binding.',
  limits: ['An authored two-body part, one earlier straight box edge and one separately authored later stock.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const part = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const [solid] = part.outputs;
assert.equal(part.outputs.length, 1);
assert.ok(checkBrep(solid.brep, { strict: true }).valid);
console.log(JSON.stringify({digest: digestOf(solid.brep), volume: massPropertiesOf(solid).volume}));
`,
});
const solid = node => ({ node, side: 'solid' });
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 4, parameters: { witness: 5 },
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [30, 20] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 8 },
    { kind: 'sketch', id: 'n2', profile: 'rectangle', min: [45, 2], max: [51, 10] },
    { kind: 'extrude', id: 'n3', sketch: 2, height: 5 },
  ],
  outputs: { b1: solid(1), b3: solid(3) },
};
const button = (name, parent = f.page) => parent.getByRole('button', { name, exact: true });
const history = () => f.page.getByRole('group', { name: 'History', exact: true });
const rolled = () => history().getByText('rolled back · 2 hidden', { exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Fillet', exact: true });
const originalEdge = 'n1.side0|n1.top';
const nativeRead = async (label, doc) => {
  const match = await f.inspect(label, doc);
  assert.ok(Math.abs(match.volume - (4800 - 30 * (1 - Math.PI / 4))) < 1e-7);
  return match;
};

await f.run(async () => {
  const file = join(f.output, 'stock-and-later-feature.bcad');
  await writeFile(file, JSON.stringify(source));
  const open = await f.freshOpen(file, source, 'original-two-bodies');
  assert.deepEqual(open.bodies.bodies.map(body => Math.round(body.volume)), [4800, 240]);
  await history().locator('.hs[data-node-index="1"]').dblclick();
  await rolled().waitFor();
  const editor = f.editor();
  if (await editor.isVisible()) await f.closeEditor();
  await f.ready();
  await f.same(source);
  assert.deepEqual((await f.bodies()).bodies.map(body => Math.round(body.volume)), [4800]);
  await f.snapshot('rolled-before-later-body');

  await button('Iso', f.page.getByRole('group', { name: 'Views' })).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.worldClick([15, 0, 8]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
  await f.command('Fillet');
  await hud().getByLabel('Radius', { exact: true }).fill('1');
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await f.same(source);
  await f.snapshot('owned-fillet-preview');
  await button('Apply', hud()).click();
  await f.changed(source);
  await f.page.getByText('Removed 1 later feature', { exact: true }).waitFor();
  await rolled().waitFor({ state: 'hidden' });
  const result = await f.doc(), fillet = result.nodes.at(-1);
  assert.deepEqual(result.nodes.slice(0, 2), source.nodes.slice(0, 2));
  assert.equal(result.nodes.length, 3);
  assert.deepEqual(result.parameters, source.parameters);
  assert.deepEqual([fillet.kind, fillet.parent, fillet.edges, fillet.radius], ['fillet', solid(1), [originalEdge], 1]);
  const signature = fillet.sigs[originalEdge];
  assert.deepEqual([signature.k, signature.p, signature.d.map(Math.abs), signature.s], ['line', [15, 0, 8], [1, 0, 0], 30]);
  const native = await nativeRead('applied-fillet', result);
  await f.snapshot('applied-with-original-edge');

  await f.undo();
  await rolled().waitFor();
  await f.same(source);
  assert.deepEqual((await f.bodies()).bodies.map(body => Math.round(body.volume)), [4800]);
  await f.redo();
  await rolled().waitFor({ state: 'hidden' });
  await f.same(result);
  const saved = await f.save('replaced-history-suffix');
  await f.freshOpen(saved.file, result, 'reopened-fillet');
  assert.deepEqual(await nativeRead('reopened-native', await f.doc()), native);
  f.report.observations.push({ droppedFeatures: 1, edge: originalEdge, signature, ...native });
});

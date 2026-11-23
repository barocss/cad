import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectPlanarCavity } from '../../../packages/barocss-cad/test/step-cavity-oracle.mjs';
import { createFlow } from './flow-helper.mjs';

const f = await createFlow({
  name: 'step-visible-roots', output: process.argv[2], envFrozen: 'D1833_SOURCE_FROZEN',
  qualification: '#744 export only visible root bodies when chosen, with current geometry and occurrence ownership.',
  limits: ['Synthetic planar boxes and one excluded mesh. The browser captures generated local STEP blobs before the anchor can download them.'],
  initialFiles: [import.meta.filename, 'packages/barocss-cad/test/step-cavity-oracle.mjs',
    'packages/barocss-cad-model/src/engine/evaluate.ts', 'apps/cad-studio/src/files/useModelExports.ts',
    'apps/cad-studio/src/files/stepExportPreparation.ts', 'apps/cad-studio/src/files/StepExportPanel.tsx',
    'apps/cad-studio/src/engine/client.ts', 'apps/cad-studio/src/engine/engine.worker.ts'],
  inspectorSource: `
import { emptyDoc, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
const box = (doc: StudioDoc, x: number, height: number) => {
  const sketch = doc.nodes.length;
  doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [x, 0], max: [x + 10, 10] });
  return withNode(doc, { kind: 'extrude', sketch, height });
};
const low = box(emptyDoc(), 0, 6), pair = box(low, 30, 20);
const base = { ...pair, bodies: { b1: { name: 'Low box' }, b3: { name: 'Tall box', hidden: true } } };
const placed = { ...base, bodies: { ...base.bodies, b1: { ...base.bodies.b1, hidden: true } }, instances: [
  { id: 'instance-shown', name: 'Shown part', doc: low, position: [0, 25, 0], rotation: [0, 0, 0] },
  { id: 'instance-hidden', name: 'Hidden part', doc: low, position: [0, 50, 0], rotation: [0, 0, 0], hidden: true },
] };
const mesh = withNode(low, { kind: 'mesh', name: 'Tetrahedron', unit: 'mm', representation: 'facets',
  positions: [20, 0, 0, 30, 0, 0, 20, 10, 0, 20, 0, 10], indices: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3] });
console.log(JSON.stringify({ base, placed, mesh: { ...mesh, bodies: { b2: { name: 'Hidden mesh', hidden: true } } } }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('region', { name: 'STEP export', exact: true });
const rootScope = () => panel().getByLabel('STEP root body scope', { exact: true });
const meshOption = () => panel().getByLabel('STEP mesh representation', { exact: true });
const included = () => panel().getByLabel('STEP included bodies', { exact: true });
const low = { name: 'n1_b0', volume: 600, centroid: [5, 5, 3] };
const tall = { name: 'n3_b0', volume: 2000, centroid: [35, 5, 10] };
const history = () => Promise.all(['Undo', 'Redo'].map(action => button(action).getAttribute('data-tip')));

async function openStep() {
  const action = button('Export STEP');
  if (await action.count()) await action.click();
  else {
    await button('More tools').click();
    await f.page.getByRole('menuitem', { name: 'Export STEP', exact: true }).click();
  }
  await included().waitFor();
  assert.equal(await rootScope().inputValue(), 'all');
}

async function readExport(label, doc, expected) {
  const previous = await f.page.evaluate(() => window.__localStepBlobs.length);
  const selection = await f.page.evaluate(() => window.__studioSelection);
  const undoRedo = await history();
  await button('Export', panel()).click();
  await f.page.waitForFunction(count => window.__localStepBlobs.length === count + 1, previous);
  const blob = await f.page.evaluate(() => window.__localStepBlobs.at(-1));
  assert.match(blob.name, /\.step$/);
  const measured = inspectPlanarCavity(blob.text).map(({ name, volume, centroid }) => ({ name, volume, centroid }));
  assert.equal(measured.length, expected.length);
  for (const [index, body] of measured.entries()) {
    if (expected[index].name) assert.equal(body.name, expected[index].name);
    assert.ok(Math.abs(body.volume - expected[index].volume) < 1e-8);
    assert.ok(body.centroid.every((value, axis) => Math.abs(value - expected[index].centroid[axis]) < 1e-8));
  }
  await writeFile(join(f.output, `${label}.step`), blob.text);
  f.report.observations.push({ label, measured });
  await f.same(doc);
  assert.deepEqual(await f.page.evaluate(() => window.__studioSelection), selection);
  assert.deepEqual(await history(), undoRedo);
}

async function setVisible() {
  await rootScope().selectOption('visible');
  await included().waitFor();
}

async function openFixture(name, doc) {
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({ name: `${name}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
  const visible = (doc.instances ?? []).filter(instance => !instance.hidden).map(instance => instance.id);
  if (visible.length) await f.page.waitForFunction(ids => ids.every(id => window.__studioInstanceBounds?.().some(bounds => bounds.id === id && bounds.min)), visible);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}

await f.run(async () => {
  const fixtures = await f.inspect('fixtures', {});
  await f.newPage();
  await f.page.evaluate(() => {
    const localStep = new Map(), createURL = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
    window.__localStepBlobs = [];
    URL.createObjectURL = function (blob) {
      const url = createURL.call(URL, blob);
      if (blob instanceof Blob && blob.type === 'model/step') localStep.set(url, blob);
      return url;
    };
    HTMLAnchorElement.prototype.click = function () {
      const blob = localStep.get(this.href);
      if (!blob || !/\.step$/.test(this.download)) return click.call(this);
      const name = this.download;
      localStep.delete(this.href);
      void blob.text().then(text => window.__localStepBlobs.push({ name, text }));
    };
  });
  await openFixture('two-roots', fixtures.base);
  await openStep();
  assert.match(await included().innerText(), /2 root bodies, including 1 hidden/);
  await f.snapshot('01-default-includes-hidden-root');
  await readExport('default-two-roots', fixtures.base, [low, tall]);
  await openStep();
  await setVisible();
  assert.match(await included().innerText(), /1 visible root body · 1 hidden root excluded/);
  await f.snapshot('02-visible-root-only');
  await readExport('visible-low-root', fixtures.base, [low]);

  await openStep();
  await setVisible();
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Hide body', browser.locator('.ol-row').filter({ hasText: 'Low box' })).click();
  await panel().waitFor({ state: 'hidden' });
  await button('Show body', browser.locator('.ol-row').filter({ hasText: 'Tall box' })).click();
  await f.ready();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const swapped = await f.doc();
  await openStep();
  await setVisible();
  assert.match(await included().innerText(), /1 visible root body · 1 hidden root excluded/);
  await f.snapshot('03-same-count-different-root');
  await readExport('visible-tall-root', swapped, [tall]);

  await button('Hide body', browser.locator('.ol-row').filter({ hasText: 'Tall box' })).click();
  await f.ready();
  const hidden = await f.doc();
  await openStep();
  await rootScope().selectOption('visible');
  await panel().getByRole('alert').getByText(/no visible root or placed bodies/i).waitFor();
  assert.equal(await button('Export', panel()).isDisabled(), true);
  assert.equal(await panel().getByRole('status').count(), 0);
  await f.same(hidden);
  await f.snapshot('04-all-hidden-refusal');
  const undoRedo = await history();
  const selection = await f.page.evaluate(() => window.__studioSelection);
  await button('Cancel', panel()).click();
  await f.same(hidden);
  assert.deepEqual(await history(), undoRedo);
  assert.deepEqual(await f.page.evaluate(() => window.__studioSelection), selection);

  await openFixture('visible-occurrence', fixtures.placed);
  await openStep();
  assert.match(await included().innerText(), /2 root bodies, including 2 hidden; 1 placed bodies/);
  await setVisible();
  assert.match(await included().innerText(), /0 visible root bodies · 2 hidden roots excluded · 1 placed body/);
  await f.snapshot('05-visible-occurrence-only');
  await readExport('visible-occurrence', fixtures.placed, [{ volume: 600, centroid: [5, 30, 3] }]);

  const hiddenOccurrences = { ...fixtures.placed, instances: fixtures.placed.instances.map(instance => ({ ...instance, hidden: true })) };
  await openFixture('hidden-occurrences', hiddenOccurrences);
  await openStep();
  await rootScope().selectOption('visible');
  await panel().getByRole('alert').getByText(/no visible root or placed bodies/i).waitFor();
  assert.equal(await button('Export', panel()).isDisabled(), true);
  await f.same(hiddenOccurrences);
  await f.snapshot('06-hidden-roots-and-occurrences-refused');
  await button('Cancel', panel()).click();

  await openFixture('hidden-mesh', fixtures.mesh);
  await openStep();
  assert.equal(await meshOption().count(), 1);
  await setVisible();
  assert.equal(await meshOption().count(), 0);
  await f.snapshot('07-hidden-mesh-excluded');
  await readExport('visible-root-with-hidden-mesh', fixtures.mesh, [low]);
  assert.deepEqual(f.report.downloads, []);
});

import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/SweepHistoryInputs.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/brep/exact-arc-sweep.ts',
];
const f = await createFlow({
  name: 'exact-arc-sweep', output: process.argv[2], envFrozen: 'D1288_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Create a native circular arc Sweep, edit its profile, and reopen the saved part in Studio.',
  limits: ['Desktop Chrome WebGPU, one circular disk along one tilted quarter arc, New body.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep, bodyCount } = output;
const { volume, centroid, method } = massPropertiesOf(output);
console.log(JSON.stringify({ strict: checkBrep(brep, { strict: true }).valid, bodyCount, volume, centroid, method,
  vertices: brep.vertices.length, degrees: brep.faces.map(({ surface }) => [surface.degreeU, surface.degreeV]) }));
`,
});

const arc = [[25, 9, 4], [25, 9, 24], [13, -7, 24]];
const weights = [1, 0.707106781, 1];
const curved = (name, points, w) => `@model ${name} { version: 0; length-unit: mm;
  @curve #rail { type: nurbs; degree: 2; knots: [0,0,0,1,1,1];
    control-points: [${points.map(p => '[' + p.join(',') + ']').join(',')}]; weights: [${w}]; } }`;
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [7, 8], radius: 2 }],
  outputs: {},
  direct: {
    sources: {
      arc: curved('arc', arc, weights),
      other: curved('other', arc, [1, 0.64, 1]),
    },
    objects: [
      { id: 'arc', name: 'Quarter arc', source: 'arc', geometry: 'rail' },
      { id: 'other', name: 'Noncircular path', source: 'other', geometry: 'rail' },
    ],
  },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const representation = () => hud().getByLabel('Representation', { exact: true });
const status = value => hud().locator('.status').filter({ hasText: new RegExp(`^${value}$`) });
const near = (a, b) => Math.abs(a - b) < 1e-7;

async function open(name) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(name);
}

async function visibleSolid(radius) {
  const expected = Math.PI ** 2 * 10 * radius ** 2;
  await f.page.waitForFunction(volume => {
    const shown = window.__studioSection?.();
    return shown?.bodies === 1 && Math.abs(shown.shownVolume - volume) / volume < 0.02;
  }, expected);
}

async function verify(doc, radius, label) {
  const node = doc.nodes[1];
  assert.equal(node.kind, 'sweep-curve');
  assert.equal(node.mode, 'exact');
  assert.equal(node.sketch, 0);
  assert.equal(node.name, 'Quarter arc');
  assert.deepEqual(node.path.controlPoints, arc);
  assert.deepEqual(node.path.weights, weights);
  assert.deepEqual(doc.direct, seed.direct);
  const solid = await f.inspect(label, doc);
  const averageRadial = (20 + radius ** 2 / 80) * 2 / Math.PI;
  const expected = [13 + 0.6 * averageRadial, -7 + 0.8 * averageRadial, 4 + averageRadial];
  assert.ok(solid.strict && solid.bodyCount === 1 && solid.method === 'closed-form', JSON.stringify(solid));
  assert.ok(near(solid.volume, Math.PI ** 2 * 10 * radius ** 2), JSON.stringify(solid));
  assert.ok(solid.centroid.every((v, i) => near(v, expected[i])), JSON.stringify(solid));
  assert.deepEqual(solid.degrees.sort(), [[1,1], [1,1], [2,2], [2,2]]);
  assert.equal(solid.vertices, 4);
  f.report.observations.push({ label, radius, expected, solid });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'D1288-paths.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch 1').click();
  await button('Noncircular path').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  assert.equal(await representation().inputValue(), 'faceted');
  await status('preview').waitFor();
  await representation().selectOption('exact');
  await status('refused').waitFor();
  await hud().getByText('Choose one circular arc from 30° to 90°.', { exact: true }).waitFor();
  assert.ok(await button('Apply', hud()).isDisabled());
  await f.same(seed);
  await f.snapshot('noncircular-exact-refusal');

  await button('Quarter arc').click();
  assert.equal(await representation().inputValue(), 'exact', 'Replacing the path retains exact Sweep');
  await hud().getByText('Quarter arc · Exact circular arc', { exact: true }).waitFor();
  await status('preview').waitFor();
  await visibleSolid(2);
  await f.snapshot('native-arc-preview');
  await button('Apply', hud()).click();
  await f.changed(seed);
  await f.ready();
  await visibleSolid(2);
  const accepted = await f.snapshot('native-arc-applied');
  await verify(accepted.doc, 2, 'original-native-solid');

  await f.openFeatureEditor(1, 'edit input disk');
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  await diameter.fill('40');
  await button('Apply', f.editor()).click();
  await f.editor().getByText('Choose a larger arc radius or reduce the sketch diameter.', { exact: true }).waitFor();
  await f.same(accepted.doc);
  await visibleSolid(2);
  await f.snapshot('self-intersection-refuses-history-edit');
  await diameter.fill('6');
  const edited = await f.applyEditor(accepted.doc, 'input-diameter-edited');
  await visibleSolid(3);
  assert.equal(edited.doc.nodes[0].radius, 3);
  assert.deepEqual(edited.doc.nodes[1], accepted.doc.nodes[1]);
  await verify(edited.doc, 3, 'recomputed-native-solid');
  await f.undo();
  await f.same(accepted.doc);
  await f.redo();
  await f.same(edited.doc);

  const saved = await f.save('exact-arc-sweep');
  await f.newPage();
  await open(saved.file);
  await f.same(edited.doc);
  await visibleSolid(3);
  const reopened = await f.snapshot('native-arc-reopened');
  await verify(reopened.doc, 3, 'reopened-native-solid');
  await f.openFeatureEditor(1, 'inspect reopened Sweep');
  await f.editor().getByText('Exact circular arc', { exact: true }).waitFor();
  await f.editor().getByText('Quarter arc · Copied', { exact: true }).waitFor();
  await f.editor().getByText('Sketch 1 · Ø6 mm', { exact: true }).waitFor();
  await f.snapshot('native-sweep-history');
});

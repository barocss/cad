import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const source = (name, points) => `@model ${name} { version: 0; length-unit: mm; @curve #curve { type: nurbs; degree: 1; knots: [0,0,1,2,3,4,4]; control-points: [${points.map(p => '[' + p.join(',') + ']').join(',')}]; weights: [1,1,1,1,1]; } }`;
const pointsA = [[0,0,0], [0,0,5], [0,0,10], [0,0,15], [0,0,20]];
const pointsB = [[0,0,0], [2,0,5], [0,0,10], [2,0,15], [0,0,20]];
const wrong = [[0,0,0], [2,0,5], [0,0,10], [2,0,15], [0,0,19]];
const guide = controlPoints => ({ kind: 'nurbs', degree: 1, knots: [0,0,1,2,3,4,4], controlPoints });
const checkDuplicate = process.argv.includes('--check-duplicate');
const pins = ['apps/cad-studio/test/loft-history-guide-replacement-browser.mjs', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad-model/src/app/loftGuides.ts'];
const f = await createFlow({
  name: 'loft-history-guide-replacement', output: process.argv[2], envFrozen: 'D1171_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Replace a copied Loft guide in History and refuse an endpoint off the top section.',
  limits: ['Desktop WebGPU. Three equal parallel square sections, two polynomial polyline guides, and one invalid endpoint.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkOutput, evaluateCadPart, curveDomain, evaluateCurve, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = evaluateCadPart(toPartDocument(doc)), out = outputs.find(body => body.id === 'n1');
const props = massPropertiesOf(out), seams = ['l0_0', 'l1_0'].map(id => {
  const edge = out.brep.edges.find(edge => edge.id === id), [a,b] = curveDomain(edge.curve);
  return evaluateCurve(edge.curve, (a+b)/2);
});
console.log(JSON.stringify({ valid: checkOutput(out).valid, count: out.bodyCount, volume: props.volume, centroid: props.centroid, seams }));
`,
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0,0], max: [10,10] },
    { id: 'n1', kind: 'loft', from: [0,0,0], sections: [{ sketch: 0, z: 0 }, { sketch: 0, z: 10 }, { sketch: 0, z: 20 }], guide: guide(pointsA) },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
  direct: {
    sources: { a: source('railA', pointsA), b: source('railB', pointsB), wrong: source('badRail', wrong) },
    objects: [{ id: 'a', name: 'Rail A', source: 'a', geometry: 'curve' },
      { id: 'b', name: 'Rail B', source: 'b', geometry: 'curve' }, { id: 'bad', name: 'Wrong end', source: 'wrong', geometry: 'curve' }],
  },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-7;
async function verify(doc, x, label) {
  const result = await f.inspect(label, doc);
  f.report.observations.push({ label, ...result });
  assert.ok(result.valid && result.count === 1 && near(result.volume, 2000), JSON.stringify(result));
  assert.ok(result.centroid.every((v,i) => near(v, [5+x/2,5,10][i])), JSON.stringify(result));
  for (let i=0; i<2; i++) assert.ok(result.seams[i].every((v,j) => near(v, [x,0,5+10*i][j])), JSON.stringify(result.seams));
}
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, openContext = f.browser.newContext.bind(f.browser);
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
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'D1171-loft-guide.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  let original = seed;
  if (checkDuplicate) {
    f.phase = 'Duplicate Rail B through Direct geometry';
    await button('Rail B').click();
    await button('Duplicate', f.page.getByRole('complementary', { name: 'Direct geometry' })).click();
    await f.changed(seed);
    original = await f.doc();
    assert.equal(original.direct.objects.filter(object => object.name.startsWith('Rail B')).length, 2);
    await button('Rail B copy').waitFor();
  }
  await verify(original, 0, 'original-straight-guide');
  await f.openFeatureEditor(1, 'replace the committed Loft guide');
  const editor = f.editor();
  const field = () => editor.getByLabel('Guide (copied)', { exact: true });
  assert.equal(await field().count(), 1, 'History has no copied guide replacement');
  assert.equal(await field().inputValue(), '');
  await field().selectOption({ label: 'Wrong end' });
  await button('Apply', editor).click();
  const area = editor.locator('.hud-error');
  await area.getByText(/guide must end on the top section.*20.*19.*choose another guide/i).waitFor();
  assert.equal(await area.locator('details').count(), 0);
  await f.same(original);
  await f.snapshot('guide-end-refused');
  if (checkDuplicate) {
    f.phase = 'Select the duplicate name and retain it through equivalent choices';
    for (const label of ['Rail B copy', 'Rail B', 'Rail B copy']) {
      await field().selectOption({ label });
      assert.equal(await field().locator('option:checked').textContent(), label);
      await f.same(original);
    }
    await f.snapshot('duplicate-draft-name');
  } else await field().selectOption({ label: 'Rail B' });
  await f.same(original);
  const after = await f.applyEditor(original, 'guide-replaced');
  assert.deepEqual(after.doc, { ...original, nodes: [original.nodes[0], { ...original.nodes[1], guide: guide(pointsB) }] });
  await verify(after.doc, 2, 'replacement-bowed-seam');
  await f.openFeatureEditor(1, 'read committed copied guide');
  assert.equal(await field().inputValue(), '');
  assert.equal(await field().locator('option:checked').textContent(), 'Current copied guide');
  if (checkDuplicate) {
    await field().selectOption({ label: 'Rail B copy' });
    assert.equal(await field().locator('option:checked').textContent(), 'Rail B copy');
    assert.equal(await button('Apply', editor).isEnabled(), false);
    await button('Reset', editor).click();
    assert.equal(await field().locator('option:checked').textContent(), 'Current copied guide');
    await f.same(after.doc);
  }
  await f.closeEditor();
  await f.undo();
  await f.same(original);
  await f.redo();
  await f.same(after.doc);
  const saved = await f.save('loft-guide-replacement');
  const reopened = await f.freshOpen(saved.file, after.doc, 'guide-reopened');
  await verify(reopened.doc, 2, 'reopened-bowed-seam');
  if (checkDuplicate) {
    await f.openFeatureEditor(1, 'read the saved guide without a source link');
    const picker = f.editor().getByLabel('Guide (copied)', { exact: true });
    assert.equal(await picker.locator('option:checked').textContent(), 'Current copied guide');
    assert.equal(await picker.locator('option').filter({ hasText: /^Rail B copy$/ }).count(), 1);
  }
});

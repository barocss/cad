import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/test/loft-history-section-replacement-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/app/failedFeature.ts', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad-model/src/app/profiles.ts'];
const f = await createFlow({
  name: 'loft-history-section-replacement', output: process.argv[2], envFrozen: 'D1172_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Replace one saved Loft section and preserve the other section copies and the guide.',
  limits: ['Desktop WebGPU. Three parallel rectangular sections and one straight polynomial guide.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), [out] = evaluateCadPart(toPartDocument(doc)).outputs;
const p = massPropertiesOf(out), points = out.brep.vertices.map(v => v.point);
console.log(JSON.stringify({ valid: checkOutput(out).valid, count: out.bodyCount, volume: p.volume,
  centroid: p.centroid, middleRing: points.filter(point => Math.abs(point[2] - 10) < 1e-8) }));
`,
});
const rectangle = (i, maxX, z, x = 0) => ({ id: `n${i}`, kind: 'sketch', profile: 'rectangle', min: [x, 0], max: [maxX, 10],
  ...(z ? { plane: { origin: [0,0,z], normal: [0,0,1], xAxis: [1,0,0] } } : {}) });
const guide = { kind: 'nurbs', degree: 1, knots: [0,0,0.5,1,1], controlPoints: [[0,0,0],[0,0,10],[0,0,20]] };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 6,
  nodes: [rectangle(0, 10, 0), rectangle(1, 10, 10), rectangle(2, 10, 20), rectangle(3, 14, 20), rectangle(4, 14, 20, 1), rectangle(5, 14, 12)],
  outputs: {}, direct: {
    sources: { rail: '@model seam { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 1; knots: [0,0,0.5,1,1]; control-points: [[0,0,0],[0,0,10],[0,0,20]]; weights: [1,1,1]; } }',
      wrong: '@model wrong { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 1; knots: [0,0,0.5,1,1]; control-points: [[0,0,0],[1,0,10],[0,0,20]]; weights: [1,1,1]; } }' },
    objects: [{ id: 'rail', name: 'Rail', source: 'rail', geometry: 'rail' }, { id: 'wrong', name: 'Off middle', source: 'wrong', geometry: 'rail' }],
  },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-7;
const section = () => f.editor().getByLabel('Section 3 source', { exact: true });
const guidePicker = () => f.editor().getByLabel('Guide (copied)', { exact: true });
async function refuse(doc, field, number, action, label) {
  await button('Apply', f.editor()).click();
  const error = f.editor().locator('.hud-error');
  await error.getByText(`The Loft guide misses Section ${number}`, { exact: true }).waitFor();
  await error.getByText(action, { exact: false }).waitFor();
  assert.equal(await field.getAttribute('aria-invalid'), 'true');
  assert.equal(await field.getAttribute('aria-describedby'), await error.getAttribute('id'));
  await f.same(doc);
  await f.snapshot(label);
  await button('Reset', f.editor()).click();
  assert.equal(await field.getAttribute('aria-invalid'), null);
  await f.same(doc);
}
async function verify(doc, label, volume, centroidX, centroidZ) {
  const result = await f.inspect(label, doc);
  f.report.observations.push({ label, ...result });
  assert.ok(result.valid && result.count === 1 && near(result.volume, volume), JSON.stringify(result));
  assert.ok(result.centroid.every((v,i) => near(v, [centroidX, 5, centroidZ][i])), JSON.stringify(result.centroid));
  assert.equal(result.middleRing.length, 4);
  for (const target of [[0,0,10], [10,0,10], [10,10,10], [0,10,10]]) {
    assert.ok(result.middleRing.some(point => point.every((value, axis) => near(value, target[axis]))), JSON.stringify(result.middleRing));
  }
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
  await chooser.setFiles({ name: 'D1172-loft-sections.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch 3').click();
  await button('Sketch 1').click({ modifiers: ['Shift'] });
  await button('Sketch 2').click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  const hud = f.page.getByRole('dialog', { name: 'Loft', exact: true });
  await hud.getByLabel('Guide (copied)', { exact: true }).selectOption({ label: 'Rail' });
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await hud.getByText('Sketch 1 → Sketch 2 → Sketch 3 (height order)', { exact: true }).waitFor();
  await button('Apply', hud).click();
  await f.changed(seed);
  const accepted = await f.doc(), loft = accepted.nodes.at(-1), index = accepted.nodes.length - 1;
  assert.deepEqual(loft.from, [0, 1, 2]);
  assert.deepEqual(loft.guide, guide);
  await verify(accepted, 'original-loft', 2000, 5, 10);
  await f.openFeatureEditor(index, 'inspect original section order');
  assert.equal(await section().count(), 1, 'Loft History cannot replace a saved section');
  assert.equal(await section().locator('option:checked').textContent(), 'Sketch 3');
  assert.equal(await section().locator('option').filter({ hasText: 'Sketch 6' }).count(), 0);
  await guidePicker().selectOption({ label: 'Off middle' });
  await refuse(accepted, guidePicker(), 2, 'In Guide (copied), choose another guide or select Reset.', 'guide-misses-section-2');
  assert.equal(await guidePicker().locator('option:checked').textContent(), 'Current copied guide');
  await section().selectOption({ label: 'Copy Sketch 5' });
  await refuse(accepted, section(), 3, 'In Section 3 source, choose another sketch or select Reset.', 'section-3-breaks-guide');
  assert.equal(await section().locator('option:checked').textContent(), 'Sketch 3');
  await section().selectOption({ label: 'Copy Sketch 4' });
  const after = await f.applyEditor(accepted, 'loft-section-replaced');
  assert.deepEqual(after.doc.nodes[index].from, [0, 1, 3]);
  assert.deepEqual(after.doc.nodes[index].sections, loft.sections);
  assert.deepEqual(after.doc.nodes[index].guide, guide);
  const copy = loft.sections[2].sketch;
  after.doc.nodes.forEach((node, i) => { if (i !== copy && i !== index) assert.deepEqual(node, accepted.nodes[i]); });
  assert.equal(after.doc.nodes[copy].id, accepted.nodes[copy].id);
  assert.equal(after.doc.nextId, accepted.nextId);
  await verify(after.doc, 'replaced-loft', 2200, 184 / 33, 350 / 33);
  await f.undo();
  await f.same(accepted);
  await f.redo();
  await f.same(after.doc);
  const saved = await f.save('loft-section-replacement');
  const reopened = await f.freshOpen(saved.file, after.doc, 'loft-section-reopened');
  await verify(reopened.doc, 'reopened-loft', 2200, 184 / 33, 350 / 33);
  await f.openFeatureEditor(index, 'read replaced section after Open');
  assert.equal(await section().locator('option:checked').textContent(), 'Sketch 4');
  await f.snapshot('loft-section-history');
});

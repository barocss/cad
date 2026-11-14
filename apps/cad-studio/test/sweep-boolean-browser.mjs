import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/App.tsx', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts'];
const f = await createFlow({
  name: 'sweep-boolean', output: process.argv[2], envFrozen: 'D1292_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Subtract an exact straight Sweep from a box and regenerate the through bore from its Sweep diameter.',
  limits: ['Desktop WebGPU. One through bore normal to two parallel box faces.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry, massPropertiesOf, surfaceDomain } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep } = output;
const report = checkBrep(brep, { strict: true });
const { volume, centroid, method } = massPropertiesOf(output);
const walls = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
const geometry = walls.map(face => {
  const { u, v } = surfaceDomain(face.surface);
  const samples = [0, .19, .51, .83, 1].flatMap(a => [0, .27, .71, 1].map(b =>
    evaluateSurface(face.surface, u[0] + a * (u[1] - u[0]), v[0] + b * (v[1] - v[0]))));
  return { name: face.name, samples };
});
const rims = brep.edges.filter(edge => edge.curve.degree === 2).map(edge => ({
  name: edge.name, samples: [0, .19, .51, .83, 1].map(t => evaluateCurve(edge.curve, t)),
}));
console.log(JSON.stringify({ source: brep.source.family, valid: report.valid, counts: report.counts, genus: report.topology[0].genus,
  volume, centroid, method, geometry, rims }));
`,
});
const path = { degree: 1, knots: [0,0,1,1], controlPoints: [[-3,7,3], [24,7,3]], weights: [1,1] };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0,0], max: [20,16] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { id: 'n2', kind: 'sketch', profile: 'circle', center: [9,12], radius: 2 }],
  outputs: { b1: { node: 1, side: 'solid' } },
  direct: {
    sources: { rail: '@model rail { version: 0; length-unit: mm; @curve #line { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[-3,7,3],[24,7,3]]; weights: [1,1]; } }' },
    objects: [{ id: 'rail', name: 'Bore axis', source: 'rail', geometry: 'line' }],
  },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const near = (a, b) => Math.abs(a - b) <= 1e-7;
async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}
async function apply(name, doc, label) {
  f.phase = label;
  await hud(name).locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', hud(name)).click();
  await f.changed(doc);
  return (await f.snapshot(label)).doc;
}
async function verify(doc, radius, label) {
  const cut = doc.nodes[4], tool = doc.nodes[3];
  assert.equal(tool.mode, 'exact-straight');
  assert.deepEqual(tool.path, path);
  assert.equal(cut.kind, 'difference');
  assert.deepEqual(cut.parent, { node: 1, side: 'solid' });
  assert.deepEqual(cut.tool, { node: 3, side: 'solid' });
  const removed = Math.PI * radius ** 2 * 20;
  const volume = 2560 - removed;
  const centroid = [10, (2560 * 8 - removed * 7) / volume, (2560 * 4 - removed * 3) / volume];
  const result = await f.inspect(label, doc);
  assert.ok(result.valid && result.source === 'analytic-boolean' && result.genus === 1, JSON.stringify(result));
  assert.equal(result.counts.faces, 8);
  assert.equal(result.geometry.length, 2);
  assert.ok(near(result.volume, volume));
  assert.ok(result.centroid.every((value, axis) => near(value, centroid[axis])));
  for (const wall of result.geometry) {
    assert.ok(wall.samples.every(([,y,z]) => near(Math.hypot(y - 7, z - 3), radius)));
  }
  assert.equal(result.rims.length, 4);
  for (const rim of result.rims) {
    const end = rim.samples[0][0] < 10 ? 0 : 20;
    assert.ok(rim.samples.every(([x,y,z]) => near(x, end) && near(Math.hypot(y - 7, z - 3), radius)));
  }
  const shown = await f.bodies();
  assert.equal(shown.bodies.length, 1);
  assert.ok(near(shown.bodies[0].volume, volume));
  f.report.observations.push({ label, radius, expected: { volume, centroid }, result });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'D1292-box-and-axis.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch 3').click();
  await button('Bore axis').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud('Sweep').getByLabel('Representation').selectOption('exact-straight');
  const swept = await apply('Sweep', seed, 'native-cutting-tool');
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Extrude 8', browser).click();
  await button('Sweep along Bore axis', browser).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  f.phase = 'analytic-through-cut';
  await f.command('Subtract');
  await f.changed(swept);
  const cut = (await f.snapshot('analytic-through-cut')).doc;
  await verify(cut, 2, 'bore-radius-2');
  await f.undo();
  await f.same(swept);
  await f.redo();
  await f.same(cut);
  await f.openFeatureEditor(3, 'upstream Sweep diameter');
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  await diameter.fill('6');
  await button('Apply', f.editor()).click();
  await f.editor().getByText(/the result's boundary touches itself/).waitFor({ state: 'attached' });
  await f.same(cut);
  await verify(cut, 2, 'tangent-cut-refusal');
  await f.snapshot('tangent-cut-refusal');
  await diameter.fill('5');
  const edit = await f.applyEditor(cut, 'edit-tool-and-replay-cut');
  assert.equal(edit.doc.nodes[2].radius, 2.5);
  assert.deepEqual(edit.doc.nodes.slice(3), cut.nodes.slice(3));
  await verify(edit.doc, 2.5, 'bore-radius-2.5');
  await f.undo();
  await f.same(cut);
  await f.redo();
  await f.same(edit.doc);
  const saved = await f.save('sweep-boolean');
  await f.newPage();
  await open(saved.file);
  await f.same(edit.doc);
  await verify(await f.doc(), 2.5, 'regenerated-on-open');
  await f.snapshot('reopened-through-cut');
});

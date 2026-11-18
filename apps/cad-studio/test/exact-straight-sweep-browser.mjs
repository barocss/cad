import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/src/App.tsx',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/curveSource.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts',
];
const f = await createFlow({
  name: 'exact-straight-sweep', output: process.argv[2], envFrozen: 'D1289_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep a disk on straight Direct curves authored in two Studio workflows.',
  limits: ['Desktop Chrome WebGPU. One sketched line, one picked box edge, and a circular disk.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { geometryOf } from '@barocss/cad-model/engine/direct';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const object = doc.direct.objects.at(-1), curve = geometryOf(doc.direct, object);
const { degree, knots, controlPoints, weights } = curve;
const sweep = doc.nodes.at(-1);
const output = sweep.kind === 'sweep-curve' && evaluateCadPart(toPartDocument(doc)).outputs.find(out => out.id === sweep.id);
const solid = output ? { strict: checkBrep(output.brep, { strict: true }).valid, volume: massPropertiesOf(output).volume,
  centroid: massPropertiesOf(output).centroid, source: output.brep.source.family,
  degrees: output.brep.faces.map(({ surface }) => [surface.degreeU, surface.degreeV]).sort() } : null;
console.log(JSON.stringify({ path: { degree, knots, controlPoints, weights }, object: object.name, solid }));
`,
});
const circle = { id: 'n0', kind: 'sketch', profile: 'circle', center: [7, 8], radius: 2 };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [circle], outputs: {},
};
const box = {
  ...seed, nextId: 3, outputs: { b2: { node: 2, side: 'solid' } },
  nodes: [circle, { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [20, -10], max: [40, 10] },
    { id: 'n2', kind: 'extrude', sketch: 1, height: 8 }],
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const near = (a, b, epsilon = 1e-7) => Math.abs(a - b) <= epsilon;

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

async function openSeed(doc, name) {
  await f.newPage();
  await open({ name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}

function samePoint(actual, expected, epsilon) {
  assert.equal(actual.length, 3);
  assert.ok(actual.every((value, axis) => near(value, expected[axis], epsilon)), JSON.stringify({ actual, expected }));
}

async function verify(doc, mode, radius, label) {
  const result = await f.inspect(label, doc), sweep = doc.nodes.at(-1);
  assert.equal(sweep.mode, 'exact-straight');
  assert.equal(sweep.sketch, 0);
  assert.equal(sweep.name, result.object);
  assert.deepEqual(sweep.path, result.path);
  const expected = mode === 'sketch' ? [[20, 20, 0], [44, 38, 0]] : [[20, -10, 8], [40, -10, 8]];
  const { controlPoints: points, degree, weights } = result.path;
  assert.equal(degree, mode === 'sketch' ? 2 : 1);
  assert.ok(weights.every(weight => weight === 1));
  if (mode === 'sketch') {
    samePoint(points[0], expected[0], 3e-6);
    samePoint(points[1], [32, 29, 0], 3e-6);
    samePoint(points[2], expected[1], 3e-6);
  } else {
    const start = points[0][0] < points[1][0] ? 0 : 1;
    samePoint(points[start], expected[0]);
    samePoint(points[1 - start], expected[1]);
  }
  const length = mode === 'sketch' ? 30 : 20;
  const centroid = expected[0].map((value, axis) => (value + expected[1][axis]) / 2);
  const volume = Math.PI * radius ** 2 * length;
  assert.ok(result.solid?.strict && result.solid.source === 'sweep-curve');
  assert.deepEqual(result.solid.degrees, [[1,1], [1,1], [2,1], [2,1]]);
  assert.ok(near(result.solid.volume, volume, 0.0001), JSON.stringify(result));
  samePoint(result.solid.centroid, centroid, 3e-6);
  const rendered = await f.page.evaluate(() => window.__studioSection());
  const total = volume + (mode === 'edge' ? 3200 : 0);
  assert.equal(rendered.bodies, mode === 'edge' ? 2 : 1);
  assert.ok(near(rendered.shownVolume, total, volume * .02), JSON.stringify(rendered));
  f.report.observations.push({ label, ...result, shownVolume: rendered.shownVolume });
}

async function sweep(mode) {
  const source = await f.doc(), [path] = source.direct.objects;
  await button('Sketch 1').click();
  await button(path.name).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact-straight');
  await hud().locator('.hud-step').getByText('Exact straight path', { exact: true }).waitFor();
  await hud().locator('.hud-step').getByText(path.name + (mode === 'sketch' ? ' · Degree 2 NURBS' : ' · Line'), { exact: true }).waitFor();
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', hud()).click();
  await f.changed(source);
  const applied = await f.snapshot(mode + '-sweep-applied');
  await verify(applied.doc, mode, 2, mode + '-native-2mm');
  await f.openFeatureEditor(applied.doc.nodes.length - 1, 'edit ' + mode + ' Sweep');
  await f.editor().getByLabel('Diameter', { exact: true }).fill('6');
  const edited = await f.applyEditor(applied.doc, mode + '-diameter-edited');
  assert.deepEqual(edited.doc.nodes.at(-1), applied.doc.nodes.at(-1));
  await verify(edited.doc, mode, 3, mode + '-native-3mm');
  await f.undo();
  await f.same(applied.doc);
  await f.redo();
  await f.same(edited.doc);
  const saved = await f.save(mode + '-straight-sweep');
  await f.newPage();
  await open(saved.file);
  await f.same(edited.doc);
  await verify(await f.doc(), mode, 3, mode + '-reopened-native');
  await f.openFeatureEditor(edited.doc.nodes.length - 1, 'reopened ' + mode + ' Sweep');
  await f.editor().getByText('Exact straight path', { exact: true }).waitFor();
  await f.editor().getByText('Sketch 1 · Ø6 mm', { exact: true }).waitFor();
  await f.snapshot(mode + '-reopened-history');
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
  f.phase = 'make a curve from a sketched line';
  await openSeed(seed, 'D1289-sketch-line');
  await button('Sketch', f.page.locator('.mode')).click();
  await f.sketchPanel().waitFor();
  await f.tool('Line', 'l');
  await f.frame([[20, 20], [32, 29], [44, 38]]);
  await f.worldClick([20, 20]);
  await f.worldClick([44, 38]);
  await button('Make curves', f.sketchPanel()).click();
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await f.page.waitForFunction(() => window.__studioDoc.direct?.objects.length === 1);
  await f.ready();
  await sweep('sketch');

  f.phase = 'make a curve from a picked box edge';
  await openSeed(box, 'D1289-box-edge');
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  const point = await f.page.evaluate(() => window.__studioScreenOf([30, -10, 8]));
  assert.ok(point && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await button('Edge as a curve').click();
  await f.page.waitForFunction(() => window.__studioDoc.direct?.objects.length === 1);
  await f.ready();
  await sweep('edge');
});

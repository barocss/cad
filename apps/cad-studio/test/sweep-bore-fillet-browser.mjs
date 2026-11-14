import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/Hud.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad/src/blend/edge-finish.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts'];
const f = await createFlow({
  name: 'sweep-bore-fillet', output: process.argv[2], envFrozen: 'D1294_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Round the circular mouth of an exact Sweep bore and replay the native fillet after editing.',
  limits: ['Desktop WebGPU. One mouth of the straight Sweep bore from D1292.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, evaluateCadPart, evaluateSurface, massPropertiesOf, surfaceDomain } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [out] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep } = out, report = checkBrep(brep, { strict: true });
const { volume, method } = massPropertiesOf(out);
const blend = brep.faces.filter(face => /^n5\\.face(?:#\\d+)?$/.test(face.name)).map(({ surface, name }) => {
  const { u, v } = surfaceDomain(surface);
  return { name, degrees: [surface.degreeU, surface.degreeV],
    points: [0,.17,.43,.77,1].flatMap(a => [0,.18,.49,.86,1].map(b =>
      evaluateSurface(surface, u[0] + a*(u[1]-u[0]), v[0] + b*(v[1]-v[0])))) };
});
console.log(JSON.stringify({ valid: report.valid, counts: report.counts, genus: report.topology[0].genus, volume, method, blend }));
`,
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 5,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0,0], max: [20,16] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { id: 'n2', kind: 'sketch', profile: 'circle', center: [9,12], radius: 2 },
    { id: 'n3', kind: 'sweep-curve', sketch: 2, name: 'Bore axis', mode: 'exact-straight',
      path: { degree: 1, knots: [0,0,1,1], controlPoints: [[-3,7,3],[24,7,3]], weights: [1,1] } },
    { id: 'n4', kind: 'difference', parent: { node: 1, side: 'solid' }, tool: { node: 3, side: 'solid' } },
  ],
  outputs: { b4: { node: 4, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => Math.abs(a - b) <= 1e-7;
const names = ['n1.side1|n3.side0#1', 'n1.side1|n3.side0#2'];
async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}
async function verify(doc, radius, label) {
  assert.deepEqual(doc.nodes.slice(0, 5), seed.nodes);
  const feature = doc.nodes[5];
  assert.equal(feature.kind, 'fillet');
  assert.equal(feature.radius, radius);
  assert.deepEqual(feature.parent, { node: 4, side: 'solid' });
  assert.deepEqual([...feature.edges].sort(), names);
  const solid = await f.inspect(label, doc);
  assert.ok(solid.valid && solid.genus === 1 && solid.counts.bodies === 1);
  assert.equal(solid.blend.length, 2);
  // The meridian is a square minus a quarter disk. Revolve its first moment about the bore axis.
  const removed = 2 * Math.PI * (2 * radius ** 2 * (1 - Math.PI / 4) + radius ** 3 * (5 / 6 - Math.PI / 4));
  const volume = 2560 - 80 * Math.PI - removed;
  assert.ok(near(solid.volume, volume), JSON.stringify({ actual: solid.volume, volume }));
  for (const face of solid.blend) {
    assert.deepEqual(face.degrees, [2,2]);
    for (const [x,y,z] of face.points) {
      const axial = 20 - x, radial = Math.hypot(y - 7, z - 3);
      assert.ok(axial >= -1e-7 && axial <= radius + 1e-7 && radial >= 2 - 1e-7 && radial <= 2 + radius + 1e-7);
      assert.ok(near(Math.hypot(axial - radius, radial - (2 + radius)), radius));
    }
  }
  const { bodies } = await f.bodies();
  assert.ok(bodies.length === 1 && near(bodies[0].volume, volume));
  f.report.observations.push({ label, radius, expectedVolume: volume, solid });
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
  await open({ name: 'D1294-sweep-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Right', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const point = await f.page.evaluate(() => window.__studioScreenOf([20,7 + Math.SQRT2,3 + Math.SQRT2]));
  assert.ok(point && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);
  await f.command('Fillet');
  const hud = f.page.getByRole('dialog', { name: 'Fillet', exact: true });
  await hud.getByLabel('Radius', { exact: true }).fill('0.5');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  const picked = hud.getByRole('group', { name: 'Fillet scope' }).locator('.field').filter({ hasText: 'Picked native edges' }).locator('span[title]');
  assert.deepEqual((await picked.getAttribute('title')).split('\n').sort(), names);
  await f.same(seed);
  await f.snapshot('one-mouth-preview');
  await button('Apply', hud).click();
  await f.changed(seed);
  const applied = (await f.snapshot('one-mouth-fillet')).doc;
  await verify(applied, .5, 'native-mouth-round-0.5');
  await f.openFeatureEditor(5, 'edit bore mouth radius');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.75');
  const edited = (await f.applyEditor(applied, 'edited-blend')).doc;
  await verify(edited, .75, 'native-mouth-round-0.75');
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('sweep-bore-fillet');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  await verify(await f.doc(), .75, 'native-mouth-round-reopened');
  await f.snapshot('native-mouth-round');
});

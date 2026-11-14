import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = ['apps/cad-studio/src/state/useCommandPreview.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts'];
const f = await createFlow({
  name: 'arc-bore-fillet', output: process.argv[2], envFrozen: 'D1302_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Round the start rim of an exact circular Sweep bore and replay the fitted fillet after editing.',
  limits: ['Desktop WebGPU. One offset circular bore, original start rim, constant radii 0.2 and 0.25 mm.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [out] = evaluateCadPart(toPartDocument(doc)).outputs;
const check = checkOutput(out);
const { volume } = massPropertiesOf(out);
const caps = out.brep.faces.filter(face => ['n1.start', 'n1.end'].includes(face.name)).map(face => ({
  name: face.name, loops: face.loops.map(id => out.brep.loops.find(loop => loop.id === id).kind),
}));
console.log(JSON.stringify({ valid: check.valid, genus: check.topology[0].genus, gap: check.maximumEdgeSurfaceGap,
  counts: check.counts, volume, caps, fillet: out.fillet }));
`,
});

const path = { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[33,-7,4],[33,13,4],[13,13,4]], weights: [1,Math.SQRT1_2,1] };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{
    id: 'n0', kind: 'sketch', profile: 'loop',
    segments: [
      { kind: 'line', start: [2,3] },
      { kind: 'arc', start: [12,3], center: [12,8], direction: 'ccw' },
      { kind: 'line', start: [12,13] },
      { kind: 'line', start: [2,13] },
    ],
    holes: [[{ kind: 'arc', start: [9,7], center: [8,7], direction: 'cw' }]],
    sideTags: { outer: ['base', 'round', 'roof', 'back'], holes: [['bore']] },
  }, { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Quarter rail', path, mode: 'exact' }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const names = ['n1.side[bore]#1|n1.start', 'n1.side[bore]#2|n1.start'];
const halfDisk = 12.5 * Math.PI;
const cx = (700 + 12 * halfDisk + 250 / 3) / (100 + halfDisk);
const volumeByRadius = new Map([[.2, 4281.516087396291], [.25, 4281.483417133829]]);
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance,
  JSON.stringify({ actual, expected, tolerance }));

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

async function verify(doc, radius, label) {
  assert.deepEqual(doc.nodes.slice(0, 2), seed.nodes);
  const feature = doc.nodes[2];
  assert.equal(feature.kind, 'fillet');
  assert.equal(feature.radius, radius);
  assert.deepEqual(feature.parent, { node: 1, side: 'solid' });
  assert.deepEqual([...feature.edges].sort(), names);
  const read = await f.inspect(label, doc);
  assert.ok(read.valid && read.genus === 1 && read.counts.bodies === 1 && read.counts.shells === 1);
  assert.ok(read.gap <= 1e-7);
  assert.deepEqual(read.caps.map(cap => cap.name).sort(), ['n1.end', 'n1.start']);
  assert.ok(read.caps.every(cap => cap.loops.join(',') === 'outer,inner'));
  assert.equal(read.fillet.length, 1);
  const [fit] = read.fillet;
  assert.deepEqual([...fit.edges].sort(), names);
  assert.ok(fit.patches > 1 && fit.stations > 2);
  assert.ok(fit.contact <= 1e-7 && fit.section <= 1e-7 && fit.ball <= 1e-7 && fit.normal <= 1e-4);
  const volume = volumeByRadius.get(radius);
  near(read.volume, volume);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  f.report.observations.push({ label, radius, expectedVolume: volume, ...read });
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
  await open({ name: 'curved-sweep-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  f.phase = 'pick the start rim on the Studio canvas';
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const x = 33 + 8 - cx;
  const point = await f.screenOf([x + Math.SQRT1_2, -7, 5 + Math.SQRT1_2]);
  assert.ok(point && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);

  f.phase = 'preview and apply the rolling-ball fillet';
  await f.command('Fillet');
  const hud = f.page.getByRole('dialog', { name: 'Fillet', exact: true });
  const radius = hud.getByLabel('Radius', { exact: true });
  await radius.fill('10');
  await hud.locator('.status').filter({ hasText: /^refused$/ }).waitFor({ timeout: 60000 });
  assert.equal(await button('Apply', hud).isDisabled(), true);
  await f.same(seed);
  await f.snapshot('oversize-refused');
  await radius.fill('0.2');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor({ timeout: 60000 });
  const picked = hud.getByRole('group', { name: 'Fillet scope' }).locator('.field').filter({ hasText: 'Picked native edges' }).locator('span[title]');
  assert.deepEqual((await picked.getAttribute('title')).split('\n').sort(), names);
  await f.same(seed);
  await f.snapshot('curved-mouth-preview');
  await button('Apply', hud).click();
  await f.changed(seed);
  const applied = (await f.snapshot('curved-mouth-applied')).doc;
  await verify(applied, .2, 'fillet-0.2');
  await f.openFeatureEditor(2, 'edit the curved bore fillet');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.25');
  const edited = (await f.applyEditor(applied, 'curved-mouth-edited')).doc;
  await verify(edited, .25, 'fillet-0.25');
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);

  const saved = await f.save('curved-bore-fillet');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  await verify(await f.doc(), .25, 'reopened');
  await f.snapshot('curved-mouth-reopened');
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-curved-bore-fillet-test' }, saved.file, 'reopened-fillet', async call => {
    const result = await call('query', { action: 'summary' });
    near(result.facts.volume, volumeByRadius.get(.25), .001);
    assert.deepEqual(result.features.at(-1).node, edited.nodes.at(-1));
    f.report.observations.push({ label: 'reopened-agent-readback', volume: result.facts.volume });
  });
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';

const file = process.argv[3];
const centered = process.argv.includes('--turn');
const command = centered ? 'Smooth Turn' : 'Smooth Screw';
const baselineFile = process.argv.find(arg => arg.startsWith('--before='))?.slice('--before='.length);
const baseline = baselineFile ? JSON.parse(await readFile(baselineFile, 'utf8')) : null;
const accepted = JSON.parse(await readFile(file, 'utf8'));
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 1,
  nodes: accepted.nodes.slice(0, 1),
};
const backend = process.argv.includes('--webgl2') ? 'webgl2' : 'webgpu';
const files = [
  'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/viewport/useModelAppearance.ts',
  'apps/cad-studio/src/engine/engine.worker.ts', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/loftDisplay.ts', 'packages/barocss-cad-model/src/engine/screwDisplay.ts',
];
const f = await createFlow({
  name: 'smooth-screw-live-preview', output: process.argv[2], envFrozen: 'SCREW_LIVE_PREVIEW_FROZEN',
  qualification: 'Compare the uploaded preview and applied packets of a compact Studio ' + command + ' at a fixed camera.',
  limits: ['Desktop Chrome. Test hooks restore the camera and read the active render packet. AO is off for both views.'],
  initialFiles: files, requiredFrozen: files,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const camera = () => f.page.evaluate(() => window.__studioCamera());
async function aoOff() {
  if (await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
  await f.page.getByRole('button', { name: 'AO', exact: true, pressed: false }).waitFor();
}
async function readPacket(label) {
  const packet = await f.page.evaluate(() => window.__studioReadScrewPreviewPacket());
  assert.ok(packet);
  const geometry = createHash('sha256').update(JSON.stringify(packet)).digest('hex');
  const detail = await f.page.evaluate(() => window.__studioLoftDisplay(0));
  const result = { label, detail, geometry, triangles: packet.indices.length / 3, vertices: packet.positions.length / 3 };
  f.report.observations.push(result);
  return result;
}
async function settle() {
  await f.page.mouse.move(1030, 900);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.endsWith('/Viewport.tsx')) return route.continue();
      const response = await route.fetch({ headers: { ...route.request().headers(), 'if-none-match': '' } });
      const source = await response.text();
      const hook = 'w.__studioCamera = () =>';
      assert.equal(source.split(hook).length, 2);
      const inspect = `
        w.__studioSetScrewPreviewCamera = state => { Object.assign(camera.current, state); requestRef.current(); };
        w.__studioReadScrewPreviewPacket = () => {
          const mesh = uploadedBodies.current?.bodies[0]?.mesh;
          if (!mesh) return null;
          return Object.fromEntries(['positions', 'indices', 'normals', 'edgeLines', 'edgeOfSegment', 'faceOfVertex']
            .map(key => [key, Array.from(mesh[key])]));
        };
      `;
      return route.fulfill({ response, body: source.replace(hook, inspect + hook) });
    });
    return context;
  };
  async function page() {
    await f.newPage();
    if (backend === 'webgl2') await f.page.goto(new URL('?renderer=webgl2', origin).href);
    await f.page.locator(`.viewport[data-renderer="${backend}"]`).waitFor();
  }
  await page();
  await f.openFile(file, accepted.nodes.length);
  await f.same(accepted);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await aoOff();
  await settle();
  const recorded = await camera();
  f.report.observations.push({ backend, camera: recorded });

  await page();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: centered ? 'rectangular-turn-input.bcad' : 'triangular-screw-input.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch 1').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command(command);
  const hud = f.page.getByRole('dialog', { name: command, exact: true });
  const field = label => hud.getByLabel(label, { exact: true });
  if (centered) await field('Height').fill('40');
  else {
    await field('Axis X').fill('10');
    await field('Axis Y').fill('-3');
    await field('Pitch per revolution').fill('40');
  }
  await field('Turn angle').fill(centered ? '360' : '-360');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(seed);
  await aoOff();
  await f.page.waitForFunction(() => typeof window.__studioSetScrewPreviewCamera === 'function');
  await f.page.evaluate(value => window.__studioSetScrewPreviewCamera(value), recorded);
  await settle();
  assert.deepEqual(await camera(), recorded);
  const preview = await readPacket('live-preview');
  assert.equal(preview.detail?.kind, 'smooth-turn');
  await f.snapshot('live-preview-fixed-camera');
  if (!centered) {
    await field('Axis X').fill('7');
    await field('Axis Y').fill('-5');
    await hud.locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    assert.ok(await button('Apply', hud).isDisabled());
    await f.same(seed);
    await f.page.waitForFunction(() => window.__studioReadScrewPreviewPacket() === null);
    await field('Axis X').fill('10');
    await field('Axis Y').fill('-3');
    await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
    await settle();
    assert.equal((await readPacket('recovered-preview')).geometry, preview.geometry);
  }

  await button('Apply', hud).click();
  await f.changed(seed);
  await f.same(accepted);
  await settle();
  assert.deepEqual(await camera(), recorded);
  const applied = await readPacket('applied');
  assert.deepEqual({ ...preview, label: 'applied' }, applied);
  if (baseline) {
    assert.equal(baseline.status, 'PASS');
    const [view, before, beforeApplied] = baseline.observations;
    assert.deepEqual({ backend, camera: recorded }, view);
    assert.deepEqual(applied, beforeApplied);
    assert.equal(before.detail, null);
    assert.ok(preview.triangles > before.triangles);
    assert.notEqual(preview.geometry, before.geometry);
  }
  await f.snapshot('applied-fixed-camera');
});

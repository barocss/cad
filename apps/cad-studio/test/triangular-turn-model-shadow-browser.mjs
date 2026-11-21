import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const file = resolve(process.argv[3]);
const doc = JSON.parse(await readFile(file, 'utf8'));
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const pins = [
  'apps/cad-studio/test/triangular-turn-model-shadow-browser.mjs',
  'apps/cad-studio/src/viewport/gpuRenderer.ts',
  'apps/cad-studio/src/viewport/renderer.ts',
  'apps/cad-studio/src/viewport/Viewport.tsx',
];
const f = await createFlow({
  name: 'triangular-turn-model-shadow',
  output: process.argv[2],
  envFrozen: 'TURN_SHADOW_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Isolate the shadow contribution to the Model viewport on the same long triangular Smooth Turn.',
  limits: ['Desktop Chrome. The test injects one WebGPU Model light switch and leaves production code on disk unchanged.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ brep, key }) => ({
  key, valid: checkBrep(brep, { strict: true }).valid, digest: digestOf(brep),
  topology: [brep.faces.length, brep.edges.length, brep.vertices.length],
}))));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const read = (label) => readFile(join(f.output, label + '.png')).then(bytes => PNG.sync.read(bytes));
const roi = { x: 450, y: 200, width: 420, height: 680 };

async function capture(label, expected) {
  await f.page.mouse.move(1030, 900);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await f.same(doc);
  const state = await f.page.evaluate(() => ({
    camera: window.__studioCamera(),
    packet: window.__studioLoftDisplay?.(0),
    renderer: document.querySelector('.viewport')?.getAttribute('data-renderer'),
  }));
  assert.deepEqual(state.packet, { kind: 'smooth-turn', baseTriangles: 224, triangles: 690 });
  if (expected) assert.deepEqual(state, expected);
  await f.snapshot(label);
  return state;
}

function compare(a, b) {
  assert.deepEqual([a.width, a.height], [b.width, b.height]);
  const result = { changed: 0, foreground: 0, foregroundChanged: 0, maximumForegroundDelta: 0 };
  for (let y = roi.y; y < roi.y + roi.height; y++) {
    for (let x = roi.x; x < roi.x + roi.width; x++) {
      const i = 4 * (a.width * y + x);
      const from = a.data.subarray(i, i + 3), to = b.data.subarray(i, i + 3);
      const delta = Math.max(...from.map((value, channel) => Math.abs(value - to[channel])));
      if (delta) result.changed++;
      if (Math.max(Math.min(...from), Math.min(...to)) < 122) continue;
      result.foreground++;
      if (delta) result.foregroundChanged++;
      result.maximumForegroundDelta = Math.max(result.maximumForegroundDelta, delta);
    }
  }
  return result;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  let inject = false;
  let probeInjected = false;
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.origin !== origin) return route.abort();
      if (!inject || !url.pathname.endsWith('/src/viewport/gpuRenderer.ts')) return route.continue();
      const response = await route.fetch({ headers: { ...route.request().headers(), 'if-none-match': '' } });
      const source = await response.text();
      const token = /direction\s*:\s*\[\s*0?\.12,\s*0?\.18,\s*-1\s*\],\s*intensity\s*:\s*0,\s*castShadow\s*:\s*true/g;
      const matches = [...source.matchAll(token)];
      if (matches.length !== 1) {
        await writeFile(join(f.output, 'model-light-probe-response.js'), source);
        return route.fulfill({ response });
      }
      probeInjected = true;
      const probe = 'direction: [0.12, 0.18, -1], intensity: 0, castShadow: (window.__studioTurnShadow = enabled => { window.__studioTurnShadowEnabled = enabled; this.viewer.requestRender(); }, window.__studioTurnShadowEnabled ?? true)';
      return route.fulfill({ response, body: source.replace(token, probe) });
    });
    return context;
  };

  async function open(backend) {
    await f.newPage();
    if (backend === 'webgl2') await f.page.goto(new URL('?renderer=webgl2', origin).href);
    await f.page.locator('.viewport[data-renderer="' + backend + '"]').waitFor();
    await f.openFile(file, doc.nodes.length);
    await f.same(doc);
    await button('Iso').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    if (await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
    assert.equal(await button('AO').getAttribute('aria-pressed'), 'false');
  }

  f.phase = 'verify unmodified WebGPU Model and reopen the native solid';
  await open('webgpu');
  const baseline = await capture('webgpu-model-original');
  const native = await f.inspect('before-model-shadow-comparison', doc);
  assert.deepEqual(native.map(result => [result.valid, result.topology]), [[true, [5, 9, 6]]]);
  assert.equal(native[0].digest, 'f7ca47f91445638b850c7efa26fbfbb029fb7fb6b4fc65f51039e853b81a1d23');

  f.phase = 'change only the WebGPU Model shadow light';
  inject = true;
  await open('webgpu');
  assert.ok(probeInjected, 'Expected one matching Model light in the served WebGPU module');
  await f.page.waitForFunction(() => typeof window.__studioTurnShadow === 'function');
  await capture('webgpu-model-shadow-on', baseline);
  await f.page.evaluate(() => { window.__studioTurnShadow(false); });
  await capture('webgpu-model-shadow-off', baseline);
  await f.page.evaluate(() => { window.__studioTurnShadow(true); });
  await capture('webgpu-model-shadow-restored', baseline);
  const [original, on, off, restored] = await Promise.all(
    ['webgpu-model-original', 'webgpu-model-shadow-on', 'webgpu-model-shadow-off', 'webgpu-model-shadow-restored'].map(read));
  const result = { roi, baseline, injectedControl: compare(original, on), disabled: compare(on, off), restored: compare(on, restored) };
  f.report.observations.push(result);
  assert.equal(result.injectedControl.changed, 0, JSON.stringify(result));
  assert.equal(result.restored.changed, 0, JSON.stringify(result));
  assert.ok(result.disabled.changed > 100 && result.disabled.foreground > 10000, JSON.stringify(result));
  assert.equal(result.disabled.foregroundChanged, 0, JSON.stringify(result));

  f.phase = 'check unmodified WebGL2 Model at the same camera';
  inject = false;
  await open('webgl2');
  await capture('webgl2-model-original', { ...baseline, renderer: 'webgl2' });
  assert.deepEqual(await f.inspect('after-model-shadow-comparison', await f.doc()), native);
});

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const file = resolve(process.argv[3]), doc = JSON.parse(await readFile(file, 'utf8'));
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const pins = [
  'apps/cad-studio/test/smooth-screw-display-browser.mjs',
  'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/gpuRenderer.ts',
  'apps/cad-studio/src/viewport/renderer.ts',
  'apps/cad-studio/src/viewport/silhouette.ts',
  'packages/barocss-cad-model/src/engine/loftDisplay.ts',
];
const f = await createFlow({
  name: 'smooth-screw-display',
  output: process.argv[2],
  envFrozen: 'SCREW_DISPLAY_FROZEN',
  qualification: 'Compare ambient occlusion, shadow, edge lines and display density on the exact saved Smooth Screw.',
  limits: ['Desktop Chrome. Shadow, line and density controls use isolated instrumented browser responses.'],
  initialFiles: pins,
  requiredFrozen: pins,
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
const roi = { x: 450, y: 290, width: 430, height: 520 };
const witnesses = [{ x: 794, y: 369, width: 35, height: 19 }, { x: 711, y: 685, width: 44, height: 23 }];
const compare = (a, b, { x, y, width, height }) => {
  assert.deepEqual([a.width, a.height], [b.width, b.height]);
  const result = { changed: 0, foreground: 0, foregroundChanged: 0, maxForegroundDelta: 0 };
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const i = 4 * (a.width * py + px), from = a.data.subarray(i, i + 3), to = b.data.subarray(i, i + 3);
    const delta = Math.max(...from.map((channel, j) => Math.abs(channel - to[j])));
    if (delta) result.changed++;
    if (Math.max(Math.min(...from), Math.min(...to)) < 122) continue;
    result.foreground++;
    if (delta) result.foregroundChanged++;
    result.maxForegroundDelta = Math.max(result.maxForegroundDelta, delta);
  }
  return result;
};

async function setAo(enabled) {
  const ao = button('AO'), want = String(enabled);
  if (await ao.getAttribute('aria-pressed') !== want) await ao.click();
  await f.page.getByRole('button', { name: 'AO', exact: true, pressed: enabled }).waitFor();
}

async function capture(label, expectedCamera) {
  await f.page.mouse.move(1030, 900);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await f.same(doc);
  const state = await f.page.evaluate(() => ({ camera: window.__studioCamera(), packet: window.__studioLoftDisplay?.(0) }));
  assert.equal(state.packet.kind, 'smooth-turn');
  if (expectedCamera) assert.deepEqual(state.camera, expectedCamera);
  await f.snapshot(label);
  return state;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  let probe = 'none';
  const injected = new Set();
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.origin !== origin) return route.abort();
      const file = url.pathname.split('/').at(-1);
      let token, patch;
      if (probe === 'shadow' && file === 'gpuRenderer.ts') {
        token = /direction\s*:\s*\[\s*0?\.12,\s*0?\.18,\s*-1\s*\],\s*intensity\s*:\s*0,\s*castShadow\s*:\s*true/g;
        patch = 'direction: [0.12, 0.18, -1], intensity: 0, castShadow: (window.__studioScrewShadow = enabled => { window.__studioScrewShadowEnabled = enabled; this.viewer.requestRender(); }, window.__studioScrewShadowEnabled ?? true)';
      } else if (probe === 'silhouette' && file === 'silhouette.ts') {
        token = /function silhouetteLines\(mesh, model, eye, target, ortho\)\s*\{/g;
        patch = 'function silhouetteLines(mesh, model, eye, target, ortho) { return new Float32Array(0);';
      } else if (probe === 'edges' && file === 'loftDisplay.ts') {
        token = /return\s*\{\s*kind:\s*["']smooth-turn["'],\s*positions,\s*normals,\s*faceOfVertex,\s*indices,\s*edgeLines,\s*edgeOfSegment,\s*bounds\s*,?\s*\}/g;
        patch = 'return { kind: "smooth-turn", positions, normals, faceOfVertex, indices, edgeLines: new Float64Array(0), edgeOfSegment: new Float32Array(0), bounds }';
      } else if (probe === 'density' && file === 'Viewport.tsx') {
        token = /w\.__studioCamera\s*=\s*\(\)\s*=>/g;
        patch = 'w.__studioScrewCamera = state => { Object.assign(camera.current, state); requestRef.current(); }; w.__studioCamera = () =>';
      } else if (probe === 'density' && file === 'loftDisplay.ts') {
        token = /\bbodyMesh\(\s*brep,\s*0,\s*24\s*\)/g;
        patch = 'bodyMesh(brep, 0, 48)';
      } else return route.continue();
      const response = await route.fetch({ headers: { ...route.request().headers(), 'if-none-match': '' } });
      const source = await response.text();
      if ([...source.matchAll(token)].length !== 1) {
        await writeFile(join(f.output, 'probe-response-' + file + '.txt'), source);
        return route.fulfill({ response });
      }
      injected.add(file);
      return route.fulfill({ response, body: source.replace(token, patch) });
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
    await setAo(false);
  }

  async function aoPair(backend, camera) {
    f.phase = 'compare AO on ' + backend;
    await open(backend);
    const state = await capture(backend + '-ao-off', camera);
    assert.deepEqual(state.packet, { kind: 'smooth-turn', baseTriangles: 362, triangles: 1092 });
    await setAo(true);
    assert.deepEqual(await capture(backend + '-ao-on', state.camera), state);
    await setAo(false);
    assert.deepEqual(await capture(backend + '-ao-restored', state.camera), state);
    const [off, on, restored] = await Promise.all(['off', 'on', 'restored'].map(setting => read(backend + '-ao-' + setting)));
    const ao = compare(off, on, roi), restoredAo = compare(off, restored, roi);
    assert.ok(ao.foregroundChanged > 100);
    assert.equal(restoredAo.changed, 0);
    f.report.observations.push({ backend, ao, restoredAo, witnesses: witnesses.map(patch => compare(off, on, patch)) });
    return { state, off };
  }

  const gpu = await aoPair('webgpu');
  const native = await f.inspect('before-screw-display-compare', doc);
  assert.deepEqual(native.map(result => [result.valid, result.topology, result.digest]),
    [[true, [6, 12, 8], 'c91e769225d1c08554ca7556ca23ed70b32cbac73530d0f4ee1278889f02a661']]);
  const gl = await aoPair('webgl2', gpu.state.camera);

  f.phase = 'compare Model ground shadow with AO off';
  probe = 'shadow';
  await open('webgpu');
  assert.ok(injected.has('gpuRenderer.ts'));
  assert.deepEqual(await capture('webgpu-shadow-default', gpu.state.camera), gpu.state);
  await f.page.evaluate(() => window.__studioScrewShadow(false));
  assert.deepEqual(await capture('webgpu-shadow-off', gpu.state.camera), gpu.state);
  await f.page.evaluate(() => window.__studioScrewShadow(true));
  assert.deepEqual(await capture('webgpu-shadow-restored', gpu.state.camera), gpu.state);
  const [defaultShadow, noShadow, restoredShadow] = await Promise.all(['default', 'off', 'restored'].map(setting => read('webgpu-shadow-' + setting)));
  const shadow = compare(defaultShadow, noShadow, roi);
  assert.equal(compare(gpu.off, defaultShadow, roi).changed, 0);
  assert.equal(compare(defaultShadow, restoredShadow, roi).changed, 0);
  assert.ok(shadow.changed > 100);
  f.report.observations.push({ shadow, witnesses: witnesses.map(patch => compare(defaultShadow, noShadow, patch)) });

  f.phase = 'compare with only the generated silhouette lines disabled';
  probe = 'silhouette';
  for (const [backend, base] of [['webgpu', gpu], ['webgl2', gl]]) {
    injected.delete('silhouette.ts');
    await open(backend);
    assert.ok(injected.has('silhouette.ts'));
    const label = backend + '-ao-off-without-silhouettes';
    assert.deepEqual(await capture(label, base.state.camera), base.state);
    const withoutSilhouettes = await read(label);
    f.report.observations.push({ backend, silhouette: compare(base.off, withoutSilhouettes, roi),
      witnesses: witnesses.map(patch => compare(base.off, withoutSilhouettes, patch)) });
  }

  f.phase = 'compare with only the native display edge lines disabled';
  probe = 'edges';
  for (const [backend, base] of [['webgpu', gpu], ['webgl2', gl]]) {
    injected.delete('loftDisplay.ts');
    await open(backend);
    assert.ok(injected.has('loftDisplay.ts'));
    const label = backend + '-ao-off-without-edge-lines';
    assert.deepEqual(await capture(label, base.state.camera), base.state);
    const withoutEdges = await read(label);
    const edgeLines = compare(base.off, withoutEdges, roi);
    assert.ok(edgeLines.changed > 100);
    f.report.observations.push({ backend, edgeLines, witnesses: witnesses.map(patch => compare(base.off, withoutEdges, patch)) });
  }

  f.phase = 'compare denser Model sampling at the original camera';
  probe = 'density';
  await open('webgpu');
  assert.ok(injected.has('Viewport.tsx') && injected.has('loftDisplay.ts'));
  await f.page.evaluate(camera => window.__studioScrewCamera(camera), gpu.state.camera);
  const higher = await capture('webgpu-ao-off-denser-sampling', gpu.state.camera);
  assert.equal(higher.packet.baseTriangles, gpu.state.packet.baseTriangles);
  assert.ok(higher.packet.triangles > gpu.state.packet.triangles);
  const denser = await read('webgpu-ao-off-denser-sampling');
  f.report.observations.push({ previousPacket: gpu.state.packet, denserPacket: higher.packet,
    sampling: compare(gpu.off, denser, roi), witnesses: witnesses.map(patch => compare(gpu.off, denser, patch)) });
  assert.deepEqual(await f.inspect('after-screw-display-compare', await f.doc()), native);
});

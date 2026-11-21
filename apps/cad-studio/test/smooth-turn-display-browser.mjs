import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const fixture = resolve(process.argv[3]);
const renderer = process.argv.includes('--webgl2') ? 'webgl2' : 'webgpu';
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const doc = JSON.parse(await readFile(fixture, 'utf8'));
const pins = [
  'apps/cad-studio/test/smooth-turn-display-browser.mjs', 'apps/cad-studio/src/ui/ViewDisplayControls.tsx',
  'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/viewport/gpuRenderer.ts',
  'apps/cad-studio/src/viewport/renderer.ts', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts', 'packages/barocss-cad/src/features/loft.ts',
];
const f = await createFlow({
  name: 'smooth-turn-display',
  output: process.argv[2],
  envFrozen: 'SMOOTH_TURN_DISPLAY_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Compare display modes at a fixed camera on the exact saved Smooth Turn solid.',
  limits: [`Desktop Studio. Reopen the approved ruled-and-smooth comparison file from D1520 on actual ${renderer}.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { bodyMesh } from '@barocss/cad-model/engine/mesh';
import { digestOf } from '@barocss/cad-model/util/digest';
import { checkBrep } from '@barocss/cad';
const outputs = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify(outputs.map(({ key, brep }) => ({
  key, sha: digestOf(brep), strict: checkBrep(brep, { strict: true }).valid,
  quality: [8, 12, 16, 24].map(q => {
    const mesh = bodyMesh(brep, 0, q);
    return { q, triangles: mesh.indices.length / 3,
      names: mesh.faces.map(face => face.name), joints: mesh.edges.map(edge => edge.names),
      edgeSegments: mesh.edgeLines.length / 6 };
  }),
}))));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const ao = () => button('AO');
const camera = () => f.page.evaluate(() => ({
  view: window.__studioCamera(),
  points: [[47, -11, 3], [47, -11, 28], [47, -11, 53]].map(p => window.__studioScreenOf(p)),
}));
const display = () => button('Display and previews');

async function settle() {
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function snapshot(label, position) {
  await settle();
  await f.same(doc);
  assert.deepEqual(await camera(), position);
  const state = await f.snapshot(label, () => ({
    renderer: document.querySelector('.viewport')?.getAttribute('data-renderer'),
    ao: document.querySelector('button[title="Ambient occlusion"]')?.getAttribute('aria-pressed') ?? null,
  }));
  assert.equal(state.renderer, renderer);
}

async function comparePixels(position) {
  const [on, off, restored] = await Promise.all(['ao-on', 'ao-off', 'restored'].map(async name =>
    PNG.sync.read(await readFile(join(f.output, `smooth-turn-shaded-${name}.png`)))));
  assert.ok([on, off, restored].every(png => png.width === 1440 && png.height === 1000));
  const roi = { left: 700, top: 245, width: 255, height: 635 };
  assert.ok(position.points.every(([x, y]) => x >= roi.left && x < roi.left + roi.width &&
    y >= roi.top && y < roi.top + roi.height));
  let offPixels = 0, restoredPixels = 0, maximumDelta = 0;
  for (let y = roi.top; y < roi.top + roi.height; y++) for (let x = roi.left; x < roi.left + roi.width; x++) {
    const start = (y * on.width + x) * 4;
    const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(on.data[start + channel] - off.data[start + channel])));
    if (delta > 0) offPixels++;
    if ([0, 1, 2].some(channel => on.data[start + channel] !== restored.data[start + channel])) restoredPixels++;
    maximumDelta = Math.max(maximumDelta, delta);
  }
  assert.ok(offPixels > 0, 'AO must change at least one surface pixel in this scene');
  assert.equal(restoredPixels, 0, 'Restored display must match the original crop');
  f.report.observations.push({ renderer, position, roi, offPixels, restoredPixels, maximumDelta });
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
  if (renderer === 'webgl2') await f.page.goto(new URL('?renderer=webgl2', origin).href);
  await f.page.locator(`.viewport[data-renderer="${renderer}"]`).waitFor();
  await f.openFile(fixture, doc.nodes.length);
  await f.same(doc);
  await f.snapshot('exact-saved-workspace');
  const native = await f.inspect('native-topology-and-mesh-tiers', doc);
  assert.equal(native.length, 2);
  assert.ok(native.every(body => body.strict));
  const smooth = native[1];
  assert.equal(smooth.quality[0].names.length, 6);
  assert.equal(smooth.quality[0].joints.length, 12);
  for (const tier of smooth.quality) {
    assert.deepEqual(tier.names, smooth.quality[0].names);
    assert.deepEqual(tier.joints, smooth.quality[0].joints);
  }
  f.report.observations.push({ native });

  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.mouse.move(1050, 880);
  await settle();
  const position = await camera();
  assert.ok(position.points.every(point => point?.length === 2));

  f.phase = 'compare shaded views with AO on and off at identical projection';
  if (await ao().getAttribute('aria-pressed') !== 'true') await ao().click();
  assert.equal(await ao().getAttribute('aria-pressed'), 'true');
  await snapshot('smooth-turn-shaded-ao-on', position);
  await ao().click();
  assert.equal(await ao().getAttribute('aria-pressed'), 'false');
  await snapshot('smooth-turn-shaded-ao-off', position);

  f.phase = 'read the same native edge paths in wireframe';
  await display().click();
  await f.page.getByLabel('CAD display mode', { exact: true }).selectOption('wireframe');
  await display().click();
  await snapshot('smooth-turn-wireframe', position);

  await display().click();
  await f.page.getByLabel('CAD display mode', { exact: true }).selectOption('shaded-with-edges');
  await display().click();
  await ao().click();
  await snapshot('smooth-turn-shaded-restored', position);
  await comparePixels(position);
  const after = await f.inspect('native-after-view-comparison', await f.doc());
  assert.deepEqual(after, native);
});

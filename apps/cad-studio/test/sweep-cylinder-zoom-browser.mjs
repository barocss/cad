import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/viewport/cylinderProjection.ts',
  'packages/barocss-cad-model/src/engine/cylinderDisplay.ts', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts', 'packages/barocss-cad-model/src/engine/meshWire.ts'];
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const before = process.argv.includes('--baseline');
const f = await createFlow({
  name: 'sweep-cylinder-zoom', output: process.argv[2], envFrozen: 'D1291_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Measure and select the native straight Sweep rim through perspective zoom and fresh Open.',
  limits: ['A single tilted cylinder and one exposed rim in desktop Chrome WebGPU.'],
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [7,8], radius: 3 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, mode: 'exact-straight', name: 'Straight line',
      path: { degree: 1, knots: [0,0,1,1], controlPoints: [[20,20,0],[44,38,0]], weights: [1,1] } }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const rim = (t, r = 3, end = true) => [(end ? 44 : 20) - .6 * r * Math.cos(t), (end ? 38 : 20) + .8 * r * Math.cos(t), r * Math.sin(t)];
const project = p => f.page.evaluate(p => window.__studioScreenOf(p), p);
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const probe = Math.PI / 5;
function segmentDistance(p, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], squared = dx ** 2 + dy ** 2;
  const t = squared ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / squared)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function outlineOf(points) {
  const sorted = points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = order => {
    const out = [];
    for (const point of order) {
      while (out.length >= 2) {
        const [a, b] = out.slice(-2);
        if ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) > 0) break;
        out.pop();
      }
      out.push(point);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.toReversed())];
}
async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
  await f.same(source);
}
async function pose() {
  await button('Right').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => (window.__studioEye?.()?.[0] ?? 0) > 60);
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await settle();
}
async function measure(label, click, pixels = false) {
  f.phase = label;
  const samples = Array.from({ length: 720 }, (_, i) => rim(i * Math.PI / 360));
  const back = Array.from({ length: 720 }, (_, i) => rim(i * Math.PI / 360, 3, false));
  const read = await f.page.evaluate(({ samples, back, point, inside, outside }) => {
    const project = p => window.__studioScreenOf(p).slice(0, 2);
    const hit = window.__studioEdgeAt(point, 8);
    if (!hit) return null;
    const vertices = window.__studioSweepCylinderMesh();
    const mesh = vertices ? Array.from({ length: vertices.length / 3 }, (_, i) => project(vertices.slice(3 * i, 3 * i + 3))) : [];
    return { edge: { body: hit.body, edge: hit.edge }, at: project(point), inside: project(inside), outside: project(outside), mesh,
      outline: samples.map(project), back: back.map(project), segments: hit.segments.map(s => [project(s.slice(0,3)), project(s.slice(3,6))]) };
  }, { samples, back, point: rim(probe), inside: rim(probe, 2.92), outside: rim(probe, 3.08) });
  assert.ok(read, 'The exposed circular rim has an active display edge');
  const { outline, segments, edge, at } = read;
  const h = Math.max(...outline.map(p => p[1])) - Math.min(...outline.map(p => p[1]));
  const error = Math.max(...outline.map(p => Math.min(...segments.map(segment => segmentDistance(p, segment)))));
  assert.ok(read.mesh.length > 0);
  const hull = outlineOf(read.mesh);
  const boundary = hull.map((point, i) => [point, hull[(i + 1) % hull.length]]);
  const silhouetteCSS = Math.max(...outlineOf([...outline, ...read.back])
    .map(point => Math.min(...boundary.map(segment => segmentDistance(point, segment)))));
  if (pixels) {
    const png = PNG.sync.read(await f.page.screenshot());
    const red = ([x,y]) => png.data[4 * (Math.round(y) * png.width + Math.round(x))];
    assert.ok(red(read.inside) - red(read.outside) >= 35);
  }
  if (click) {
    assert.ok(await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), at));
    await f.page.mouse.click(...at);
    await f.page.waitForFunction(edge => window.__studioSelection?.selection.edges.some(e => e.body === edge.body && e.edge === edge.edge), edge);
    await f.page.keyboard.press('Escape');
  }
  const result = { label, heightCSS: h, segments: segments.length, errorCSS: error, silhouetteCSS, edge };
  f.report.observations.push(result);
  await f.snapshot(label);
  return result;
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
      if (!before || !url.pathname.endsWith('/engine/evaluate.ts')) return route.continue();
      const response = await route.fetch(), text = await response.text();
      const arm = 'node?.kind === "sweep-curve" && node.mode === "exact-straight"';
      assert.equal(text.split(arm).length, 2);
      const body = text.replace(arm, 'false');
      f.report.observations.push({ label: 'baseline', sourceSHA: sha256(text), servedSHA: sha256(body) });
      return route.fulfill({ response, body });
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'D1291-cylinder.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await pose();
  const centre = await project([44,38,0]);
  await f.page.mouse.move(...centre);
  await f.page.mouse.wheel(0, 560);
  await settle();
  const low = await measure('low', true);
  const zoomCentre = await project([44,38,0]);
  await f.page.mouse.move(...zoomCentre);
  await f.page.mouse.wheel(0, -870);
  await settle();
  const high = await measure('high', true, !before);
  assert.ok(high.heightCSS > low.heightCSS * 2);
  assert.deepEqual(high.edge, low.edge);
  if (before) {
    assert.ok(f.report.observations.some(item => item.label === 'baseline'));
    assert.equal(high.segments, low.segments);
    assert.ok(high.errorCSS > .25 && high.silhouetteCSS > .25);
    return;
  }
  assert.ok(high.segments > low.segments, JSON.stringify({ low, high }));
  assert.ok(high.errorCSS <= .25 && low.errorCSS <= .25, JSON.stringify({ low, high }));
  assert.ok(high.silhouetteCSS <= .25 && low.silhouetteCSS <= .25, JSON.stringify({ low, high }));
  const bytes = await f.page.evaluate(() => window.__studioCylinderDisplayBytes());
  assert.ok(bytes?.length === 2 && bytes.reduce((sum, size) => sum + size, 0) <= 192 * 1024);
  f.report.observations.push({ label: 'packet', bytes });
  const saved = await f.save('zoomed-straight-sweep');
  await f.newPage();
  await open(saved.file);
  await pose();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await settle();
  const reopened = await measure('reopened-ortho', true);
  assert.deepEqual(reopened.edge, low.edge);
  assert.ok(reopened.errorCSS <= .25 && reopened.silhouetteCSS <= .25);
});

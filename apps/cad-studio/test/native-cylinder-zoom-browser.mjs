import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const baseline = process.argv.includes('--baseline');
const draftSector = process.argv.includes('--draft-sector');
const backend = process.argv.includes('--webgl2') ? 'webgl2' : 'webgpu';
const pins = ['apps/cad-studio/test/native-cylinder-zoom-browser.mjs', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/gpuRenderer.ts', 'apps/cad-studio/src/viewport/renderer.ts',
  'apps/cad-studio/src/engine/engine.worker.ts', 'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts', 'packages/barocss-cad-model/src/engine/meshWire.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
  ...(!baseline || draftSector ? ['packages/barocss-cad-model/src/engine/cylinderDisplay.ts'] : [])];
const f = await createFlow({
  name: 'native-cylinder-zoom', output: process.argv[2], envFrozen: 'D1145_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: draftSector ? 'Measure displayed rim error and edge identity on one exact drafted radial sector.'
    : 'Measure one ordinary cylinder cap, native rim and edge selection in desktop Top Ortho.',
  limits: [draftSector ? 'One original 306.87 degree sector with a signed Draft. Desktop, with one unplaced output.'
    : 'One original uncut circular extrusion, no transforms, instances or sections.'],
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: draftSector ? [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, 0] },
      { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [6, -8] },
    ] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10, draft: -30 },
  ] : [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 10 },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 5 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const world = point => f.page.evaluate(p => window.__studioScreenOf(p), point);
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const top = draftSector ? 10 : 5;
const rimRadius = draftSector ? 10 + 10 / Math.sqrt(3) : 10;
const pickAngle = draftSector ? Math.PI / 3 : Math.PI / 32;
const rim = (theta, radius = rimRadius) => [radius * Math.cos(theta), radius * Math.sin(theta), top];
function distance(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]], denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

await f.run(async () => {
  await f.newPage();
  if (backend === 'webgl2') {
    await f.page.goto(f.server.resolvedUrls.local[0] + '?renderer=webgl2');
    await f.page.locator('.viewport[data-renderer="webgl2"]').waitFor();
    await f.ready();
  }
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: draftSector ? 'drafted-sector.bcad' : 'D1145-cylinder.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  assert.ok(Math.abs((await f.bodies()).bodies[0].volume - (draftSector ? 5087.767988706922 : 500 * Math.PI)) < 1e-7);
  await button('Top').click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  const filter = f.page.getByRole('button', { name: 'Selection filter', exact: true });
  for (let i = 0; i < 4 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await settle();
  const center = await world([0, 0, top]);
  await f.page.mouse.move(...center);
  await f.page.mouse.wheel(0, 520);
  await settle();

  async function capture(label, pick) {
    const sample = await f.page.evaluate(({ top, radius, theta }) => {
      const project = p => window.__studioScreenOf(p).slice(0, 2);
      const hand = [radius * Math.cos(theta), radius * Math.sin(theta), top];
      const edge = window.__studioEdgeAt(hand, 30), center = project([0, 0, top]), right = project([radius, 0, top]), north = project([0, radius, top]);
      const segments = edge.segments.map(line => [project(line.slice(0, 3)), project(line.slice(3, 6))]);
      return { edge: { body: edge.body, edge: edge.edge }, center, right, north, segments, at: project(hand) };
    }, { top, radius: rimRadius, theta: pickAngle });
    const { center, right, north, segments, at } = sample;
    assert.ok(segments.length > 1);
    const rho = Math.hypot(right[0] - center[0], right[1] - center[1]);
    const errors = Array.from({ length: 720 }, (_, k) => {
      const theta = draftSector ? Math.PI / 6 + k * Math.PI / 1440 : k * Math.PI / 360;
      const p = center.map((v, j) => v + (right[j] - v) * Math.cos(theta) + (north[j] - v) * Math.sin(theta));
      return Math.min(...segments.map(([a, b]) => distance(p, a, b)));
    });
    const metric = { label, radiusCSS: rho, edge: sample.edge, segments: segments.length, maxErrorCSS: Math.max(...errors) };
    if (pick) {
      const raw = PNG.sync.read(await f.page.screenshot());
      const pixelAt = ([x, y]) => {
        const i = (Math.round(y) * raw.width + Math.round(x)) * 4;
        return [...raw.data.subarray(i, i + 3)];
      };
      metric.pixelProbe = [];
      for (const offset of [-5, -2, 0, 2, 5]) {
        const p = await world(rim(pickAngle, rimRadius + offset * rimRadius / rho));
        metric.pixelProbe.push({ offsetCSS: offset, rgb: pixelAt(p) });
      }
      await f.page.mouse.move(...at);
      await f.page.mouse.click(...at);
      const actual = await f.page.evaluate(() => window.__studioSelection.selection.edges);
      metric.selected = actual;
      if (!baseline) {
        assert.deepEqual(actual, [sample.edge]);
        const [inner, rimInside, , , outer] = metric.pixelProbe.map(p => p.rgb.reduce((a, b) => a + b, 0));
        assert.ok(rimInside > outer + 90 && Math.abs(rimInside - inner) < 150, JSON.stringify(metric.pixelProbe));
      }
    }
    await f.snapshot(label);
    f.report.observations.push(metric);
    return metric;
  }

  f.phase = 'measure native cylinder at baseline and zoomed scale';
  const low = await capture('01-low', true);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Escape');
  await f.page.mouse.move(...await world([0, 0, top]));
  await f.page.mouse.wheel(0, -850);
  await settle();
  const high = await capture('02-high', true);
  await f.same(source);
  assert.ok(high.radiusCSS > low.radiusCSS * 2);
  assert.deepEqual(low.edge, high.edge);
  if (baseline) {
    assert.equal(high.segments, low.segments);
    assert.ok(high.maxErrorCSS > 0.25);
    if (draftSector) return;
    assert.fail('The native cap rim keeps its fixed tessellation when zoomed');
  }
  if (!draftSector) assert.ok(high.segments > low.segments);
  assert.ok(high.maxErrorCSS <= 0.25, JSON.stringify(high));
  assert.ok(low.maxErrorCSS <= 0.25, JSON.stringify(low));
  const bytes = await f.page.evaluate(() => window.__studioCylinderDisplayBytes());
  assert.equal(bytes.length, draftSector ? 1 : 2);
  assert.ok(bytes.reduce((sum, n) => sum + n, 0) <= 192 * 1024);
  f.report.observations.push({ label: 'detail-bytes', backend, bytes });
  if (draftSector && backend === 'webgpu') {
    const saved = await f.save('drafted-sector-display');
    await f.freshOpen(saved.file, source, '03-drafted-sector-reopened');
    assert.deepEqual(await f.page.evaluate(() => window.__studioCylinderDisplayBytes()), bytes);
  } else assert.deepEqual(f.report.downloads, []);
});

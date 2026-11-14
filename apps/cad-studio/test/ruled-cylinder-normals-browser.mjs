import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const kernel = 'packages/barocss-cad/src/brep/brep-tessellate.ts';
const pins = [kernel, 'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/ui/ViewDisplayControls.tsx'];
const f = await createFlow({
  name: 'ruled-cylinder-normals', output: process.argv[2], envFrozen: 'D1290_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Measure visible shading across the native straight Sweep seam with AO on and off.',
  limits: ['One tilted straight Sweep cylinder in desktop WebGPU perspective. Geometry and mesh density are held fixed.'],
});
const path = { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[20,20,0],[32,29,0],[44,38,0]], weights: [1,1,1] };
const doc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [7,8], radius: 3 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Line', mode: 'exact-straight', path }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const seam = [21.8, 17.6, 0], direction = [24, 18, 0];
const stations = Array.from({ length: 17 }, (_, index) => seam.map((value, axis) => value + direction[axis] * (0.3 + index * 0.025)));

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
  await f.same(doc);
}

async function capture(label, aos, screen) {
  const ao = f.page.getByTitle('Ambient occlusion', { exact: true });
  if (await ao.getAttribute('aria-pressed') !== String(aos)) await ao.click();
  assert.equal(await ao.getAttribute('aria-pressed'), String(aos));
  await f.page.mouse.move(260, 90);
  await settle();
  const png = PNG.sync.read(await f.page.screenshot());
  const dx = screen.at(-1)[0] - screen[0][0], dy = screen.at(-1)[1] - screen[0][1], length = Math.hypot(dx, dy);
  assert.ok(length > 140, length);
  const samples = screen.map(([x, y]) => Array.from({ length: 13 }, (_, i) => {
    const t = i - 6, sx = Math.round(x - t * dy / length), sy = Math.round(y + t * dx / length);
    return png.data[4 * (sy * png.width + sx)];
  }));
  const jumps = samples.map(row => Math.max(...row.slice(1).map((red, index) => Math.abs(red - row[index]))));
  const secondDifferences = samples.map(row => Math.max(...row.slice(4, 9).map(
    (red, index) => Math.abs(row[index + 3] - 2 * red + row[index + 5]))));
  const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
  const metric = { jump: median(jumps), secondDifference: median(secondDifferences) };
  f.report.observations.push({ label, aos, screen, metric, jumps, secondDifferences, samples });
  await f.snapshot(label);
  return metric;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.origin !== origin) return route.abort();
      if (!baseline || !url.pathname.endsWith('/brep-tessellate.ts')) return route.continue();
      const response = await route.fetch(), source = await response.text();
      // Restore only the preceding normal arguments for the counterfactual.
      const matches = [...source.matchAll(/emit\(face\.id, ["']ruled["'], (all, cells|pts, tris), null, ruledNormals\((?:all|pts)\), sign\);/g)];
      assert.equal(matches.length, 2, 'Restore both baseline ruled normal call sites');
      let body = source;
      for (const [whole, args] of matches) body = body.replace(whole, `emit(face.id, "ruled", ${args}, null);`);
      f.report.observations.push({ label: 'baseline-source', matches: matches.length, source: sha256(source), served: sha256(body) });
      return route.fulfill({ response, body });
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'D1290-cylinder.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await settle();
  const screen = await f.page.evaluate(points => points.map(point => window.__studioScreenOf(point)), stations);
  const eye = await f.page.evaluate(() => window.__studioEye());
  f.report.observations.push({ label: 'camera', eye, screen });
  const off = await capture('seam-ao-off', false, screen);
  const on = await capture('seam-ao-on', true, screen);
  assert.deepEqual(await capture('seam-ao-off-restored', false, screen), off);
  if (baseline) {
    assert.ok(f.report.observations.some(item => item.label === 'baseline-source'));
    assert.ok(off.secondDifference >= 8 && on.secondDifference >= 8, JSON.stringify({ off, on }));
    return;
  }
  assert.ok(off.secondDifference <= 2 && on.secondDifference <= 2, JSON.stringify({ off, on }));
  const saved = await f.save('ruled-cylinder-normals');
  await f.newPage();
  await open(saved.file);
  await f.openFeatureEditor(1, 'reopened exact Sweep');
  await f.editor().getByText('Exact straight path', { exact: true }).waitFor();
  await f.snapshot('reopened-exact-cylinder');
});

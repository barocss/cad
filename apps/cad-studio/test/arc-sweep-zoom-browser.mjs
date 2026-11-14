import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/viewport/Viewport.tsx', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/arcSweepDisplay.ts', 'packages/barocss-cad-model/src/engine/mesh.ts',
  'packages/barocss-cad-model/src/engine/meshWire.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts'];
const f = await createFlow({
  name: 'arc-sweep-zoom', output: process.argv[2], envFrozen: 'D1296_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Measure filled circular Sweep contours and pick the native rim through desktop zoom and fresh Open.',
  limits: ['One exact quarter-torus in Chrome WebGPU.'],
});
const baseline = process.argv.includes('--baseline');
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0,0], radius: 5 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, mode: 'exact', name: 'Quarter arc',
      path: { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[30,0,0],[30,30,0],[0,30,0]], weights: [1,Math.SQRT1_2,1] } }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const project = point => f.page.evaluate(p => window.__studioScreenOf(p), point);
const polar = (angle, radius) => [radius * Math.cos(angle), radius * Math.sin(angle), 0];
async function zoom(at, delta) {
  await f.page.mouse.move(...await project(at));
  await f.page.mouse.wheel(0, delta);
  await settle();
}
async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
  await f.same(source);
}
async function pose(name) {
  await button(name).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await settle();
}
async function contour(label) {
  f.phase = label;
  const read = await f.page.evaluate(() => {
    const project = p => window.__studioScreenOf(p);
    const radii = Array.from({ length: 41 }, (_, i) => {
      const angle = (35 + i / 2) * Math.PI / 180;
      const point = radius => [radius * Math.cos(angle), radius * Math.sin(angle), 0];
      let inner = 34, outer = 36;
      if (!window.__studioSurfacePoint(point(inner)) || window.__studioSurfacePoint(point(outer))) return null;
      for (let j = 0; j < 12; j++) {
        const probe = (inner + outer) / 2;
        if (window.__studioSurfacePoint(point(probe))) inner = probe;
        else outer = probe;
      }
      const a = project(point(35)), b = project(point((inner + outer) / 2));
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    });
    const a = project([0,0,0]), b = project([1,0,0]);
    return { radii, cssPerMM: Math.hypot(a[0] - b[0], a[1] - b[1]), vertices: window.__studioSweepCylinderMesh().length / 3 };
  });
  assert.ok(read.radii.every(value => value !== null), JSON.stringify(read));
  const png = PNG.sync.read(await f.page.screenshot());
  const pixel = ([x, y]) => png.data[(Math.round(y) * png.width + Math.round(x)) * 4];
  const inside = pixel(await project(polar(Math.PI / 4, 35 - 8 / read.cssPerMM)));
  const outside = pixel(await project(polar(Math.PI / 4, 35 + 8 / read.cssPerMM)));
  assert.ok(inside - outside > 35, JSON.stringify({ inside, outside }));
  const result = { label, cssPerMM: read.cssPerMM, silhouetteCSS: Math.max(...read.radii), vertices: read.vertices, inside, outside };
  f.report.observations.push(result);
  await f.snapshot(label);
  return result;
}
async function pickRim(label) {
  f.phase = label;
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  const angle = Math.PI / 5, point = [30 + 5 * Math.cos(angle), 0, 5 * Math.sin(angle)];
  const edge = await f.page.evaluate(p => {
    const hit = window.__studioEdgeAt(p);
    if (!hit) return null;
    // Independent half-circle oracle in the XZ plane. Measure midpoint deviation of each chord.
    let error = 0;
    for (const [ax, ay, az, bx, by, bz] of hit.segments) {
      if (Math.abs(ay) > 1e-8 || Math.abs(by) > 1e-8) return null;
      error = Math.max(error, 5 - Math.hypot((ax + bx) / 2 - 30, (az + bz) / 2));
    }
    return { body: hit.body, edge: hit.edge, segments: hit.segments.length, error };
  }, point);
  const at = await project(point);
  assert.ok(edge);
  assert.ok(edge.segments >= 23 && edge.error < .012, JSON.stringify(edge));
  assert.ok(await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), at));
  await f.page.mouse.click(...at);
  await f.page.waitForFunction(edge => window.__studioSelection?.selection.edges.some(e => e.body === edge.body && e.edge === edge.edge), edge);
  f.report.observations.push({ label, ...edge });
  await f.snapshot(label);
  await f.page.keyboard.press('Escape');
  return { body: edge.body, edge: edge.edge };
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
      if (!baseline || !url.pathname.endsWith('/engine/evaluate.ts')) return route.continue();
      const response = await route.fetch(), text = await response.text();
      const call = 'arcSweepDisplayMesh(body.mesh, snapshot.outputs[0].brep)';
      assert.equal(text.split(call).length, 2);
      const body = text.replace(call, 'body.mesh');
      f.report.observations.push({ label: 'baseline-packet-disabled', sourceSHA: sha256(text), servedSHA: sha256(body) });
      return route.fulfill({ response, body });
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'quarter-torus.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await pose('Top');
  const fit = await contour('top-fit');
  await zoom(polar(Math.PI / 4, 35), -760);
  const zoomed = await contour('top-zoom');
  assert.ok(zoomed.cssPerMM > fit.cssPerMM * 2, JSON.stringify({ fit, zoomed }));
  if (baseline) {
    assert.ok(f.report.observations.some(observation => observation.label === 'baseline-packet-disabled'));
    assert.ok(zoomed.silhouetteCSS > .25 && zoomed.vertices === fit.vertices, JSON.stringify({ fit, zoomed }));
    return;
  }
  assert.ok(fit.silhouetteCSS <= .25 && zoomed.silhouetteCSS <= .25 && zoomed.vertices >= fit.vertices, JSON.stringify({ fit, zoomed }));
  await pose('Front');
  const original = await pickRim('front-rim');
  await zoom([30, 0, 0], -380);
  assert.deepEqual(await pickRim('front-rim-zoomed'), original);
  const saved = await f.save('refined-arc-sweep');
  await f.newPage();
  await open(saved.file);
  await pose('Front');
  assert.deepEqual(await pickRim('front-rim-reopened'), original);
  await pose('Top');
  const reopened = await contour('top-reopened');
  assert.ok(reopened.silhouetteCSS <= .25);
});

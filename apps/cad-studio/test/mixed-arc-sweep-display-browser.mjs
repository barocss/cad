import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/viewport/Viewport.tsx', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/arcSweepMixedDisplay.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts'];
const f = await createFlow({
  name: 'mixed-arc-sweep-display', output: process.argv[2], envFrozen: 'D1299_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Measure inner and outer contours and preserve inner-edge selection through fit, zoom and fresh Open.',
  limits: ['Top orthographic desktop Chrome WebGPU and one D-shaped exact quarter-arc Sweep.'],
});
const baseline = process.argv.includes('--baseline');
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { backX: 3 }, nextId: 2,
  nodes: [{
    id: 'n0', kind: 'sketch', profile: 'loop',
    segments: [
      { kind: 'line', start: [{ parameter: 'backX' },3] },
      { kind: 'arc', start: [12,3], center: [12,8], direction: 'ccw' },
      { kind: 'line', start: [12,13] },
      { kind: 'line', start: [{ parameter: 'backX' },13] },
    ],
    sideTags: { outer: ['base','round','roof','back'] },
  }, {
    id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Quarter rail', mode: 'exact',
    path: { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[33,-7,4],[33,13,4],[13,13,4]], weights: [1,Math.SQRT1_2,1] },
  }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const area = 90 + 12.5 * Math.PI;
const cx = (90 * 7.5 + 12 * 12.5 * Math.PI + 250 / 3) / area;
const radii = { inner: 20 + 3 - cx, outer: 20 + 17 - cx };
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const polar = (r, angle = Math.PI / 4, z = 4) => [13 + r * Math.cos(angle), -7 + r * Math.sin(angle), z];
const project = point => f.page.evaluate(p => window.__studioScreenOf(p), point);

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
  await f.same(seed);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.ok(Math.abs(bodies[0].volume - area * 20 * Math.PI / 2) < 1e-7);
}
async function pose() {
  await button('Top').click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await settle();
}
async function measure(label, border) {
  f.phase = label;
  const radius = radii[border];
  const read = await f.page.evaluate(({ radius, border }) => {
    const project = p => window.__studioScreenOf(p);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const scale = dist(project([13,-7,4]), project([14,-7,4]));
    const error = Array.from({ length: 29 }, (_, i) => {
      const angle = (38 + i / 2) * Math.PI / 180;
      const point = r => [13 + r * Math.cos(angle), -7 + r * Math.sin(angle), 4];
      let lo = radius - 1, hi = radius + 1;
      const lowerHits = border === 'outer';
      if (Boolean(window.__studioSurfacePoint(point(lo))) !== lowerHits ||
        Boolean(window.__studioSurfacePoint(point(hi))) === lowerHits) return null;
      for (let n = 0; n < 13; n++) {
        const r = (lo + hi) / 2, hit = !!window.__studioSurfacePoint(point(r));
        if (hit === lowerHits) lo = r;
        else hi = r;
      }
      return dist(project(point(radius)), project(point((lo + hi) / 2)));
    });
    return { scale, errorCSS: error.every(x => x !== null) ? Math.max(...error) : null,
      vertices: window.__studioSweepCylinderMesh().length / 3 };
  }, { radius, border });
  const screenshot = PNG.sync.read(await f.page.screenshot());
  const pixel = ([x, y]) => {
    const offset = (Math.round(y) * screenshot.width + Math.round(x)) * 4;
    return screenshot.data[offset] + screenshot.data[offset + 1] + screenshot.data[offset + 2];
  };
  const direction = border === 'inner' ? 1 : -1;
  // An offset of eight pixels clears the actual contour and its antialiasing in both runs.
  const inside = pixel(await project(polar(radius + direction * 8 / read.scale)));
  const outside = pixel(await project(polar(radius - direction * 8 / read.scale)));
  const result = { label, radius, ...read, inside, outside };
  assert.ok(read.errorCSS !== null && (baseline ? read.errorCSS > .25 : read.errorCSS < .25), JSON.stringify(result));
  assert.ok(inside - outside > 85, JSON.stringify(result));
  f.report.observations.push(result);
  await f.snapshot(label);
  return result;
}
async function pickInner(label) {
  f.phase = label;
  const point = polar(radii.inner, Math.PI / 4, 9);
  const read = await f.page.evaluate(p => {
    const hit = window.__studioEdgeAt(p, 3);
    return hit && { body: hit.body, edge: hit.edge, segments: hit.segments };
  }, point);
  assert.ok(read);
  assert.equal(read.segments.length, 56);
  let chordError = 0;
  for (const [ax,ay,az,bx,by,bz] of read.segments) {
    assert.ok(Math.abs(az - 9) < 1e-7 && Math.abs(bz - 9) < 1e-7);
    assert.ok(Math.abs(Math.hypot(ax - 13, ay + 7) - radii.inner) < 1e-7);
    assert.ok(Math.abs(Math.hypot(bx - 13, by + 7) - radii.inner) < 1e-7);
    chordError = Math.max(chordError, radii.inner - Math.hypot((ax + bx) / 2 - 13, (ay + by) / 2 + 7));
  }
  assert.ok(chordError > 0 && chordError < .002);
  const at = await project(point);
  assert.ok(await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), at));
  const owner = { body: read.body, edge: read.edge };
  await f.page.mouse.click(...at);
  await f.page.waitForFunction(e => window.__studioSelection?.selection.edges.some(x => x.body === e.body && x.edge === e.edge), owner);
  await f.snapshot(label);
  f.report.observations.push({ label, ...owner, segments: read.segments.length, chordError });
  await f.page.keyboard.press('Escape');
  return owner;
}

async function filterEdges() {
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const make = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async args => {
    const context = await make({ ...args, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.origin !== origin) return route.abort();
      if (!baseline || !url.pathname.endsWith('/engine/evaluate.ts')) return route.continue();
      const response = await route.fetch(), text = await response.text();
      const arm = 'arcSweepMixedDisplayMesh(arcSweepDisplayMesh(body.mesh, brep), brep)';
      assert.equal(text.split(arm).length, 2);
      const body = text.replace(arm, 'arcSweepDisplayMesh(body.mesh, brep)');
      f.report.observations.push({ label: 'baseline-mixed-packet-disabled', sourceSHA: sha256(text), servedSHA: sha256(body) });
      return route.fulfill({ response, body });
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'mixed-quarter-arc.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  if (!baseline) await filterEdges();
  let owner;
  for (const border of ['inner', 'outer']) {
    await pose();
    const fit = await measure(border + '-fit', border);
    if (!baseline && border === 'inner') owner = await pickInner('inner-edge-at-fit');
    await f.page.mouse.move(...await project(polar(radii[border])));
    await f.page.mouse.wheel(0, -760);
    await settle();
    const zoom = await measure(border + '-zoom', border);
    assert.ok(zoom.scale > fit.scale * 2 && zoom.vertices === fit.vertices);
    if (!baseline && border === 'inner') assert.deepEqual(await pickInner('inner-edge-at-zoom'), owner);
  }
  if (baseline) {
    assert.ok(f.report.observations.some(item => item.label === 'baseline-mixed-packet-disabled'));
    return;
  }
  const saved = await f.save('mixed-quarter-arc');
  await f.newPage();
  await open(saved.file);
  await pose();
  await filterEdges();
  await measure('inner-reopened', 'inner');
  assert.deepEqual(await pickInner('inner-edge-after-reopen'), owner);
});

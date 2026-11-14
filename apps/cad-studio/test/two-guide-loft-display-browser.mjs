import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { twoGuideInspector } from './loft-two-guides-oracle.mjs';

const backend = process.argv.includes('--webgl2') ? 'webgl2' : 'webgpu';
const pins = [
  'apps/cad-studio/test/two-guide-loft-display-browser.mjs', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts', 'apps/cad-studio/src/engine/engine.worker.ts',
  'packages/barocss-cad-model/src/engine/loftDisplay.ts', 'packages/barocss-cad-model/src/engine/meshWire.ts',
  'packages/barocss-cad/src/internal/two-guide-loft-display.ts',
];
const f = await createFlow({
  name: 'two-guide-loft-display', output: process.argv[2], envFrozen: 'D1282_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Render and select the refined native Loft in desktop ${backend}, including after a History edit and reopen.`,
  limits: ['One two-guide Loft between 10 × 6 and 14 × 4 mm rectangular caps, no transforms or section.'],
  inspectorSource: twoGuideInspector,
});
const controls = (x0, x, y, x1) => [[x0, 0, 0], [x, y, 6], [x1, 0, 12]];
const guide = controlPoints => ({ kind: 'quadratic-bezier', controlPoints });
const direct = (name, points) => `@model ${name} {
  version: 0; length-unit: mm;
  @curve #curve { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points: ${JSON.stringify(points)}; weights: [1,1,1]; }
}`;
const vertices = (w, d) => [[0, 0], [w, 0], [w, d], [0, d]];
const section = (i, w, d) => ({ id: `n${i}`, kind: 'sketch', profile: 'loop',
  segments: vertices(w, d).map(start => ({ kind: 'line', start })),
});
const left = controls(0, 2, -1, 0), right = controls(10, 18, 3, 14);
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [section(0, 10, 6), section(1, 14, 4), { id: 'n2', kind: 'loft',
    sections: [{ sketch: 0, z: 0 }, { sketch: 1, z: 12 }], guides: [guide(left), guide(right)] }],
  outputs: { b2: { node: 2, side: 'solid' } },
  direct: {
    sources: { a: direct('a', left), b: direct('b', right) },
    objects: [{ id: 'a', name: 'Rail A', source: 'a', geometry: 'curve' }, { id: 'b', name: 'Rail B', source: 'b', geometry: 'curve' }],
  },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const world = point => f.page.evaluate(p => window.__studioScreenOf(p), point);
const frame = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
function ring(t, middle) {
  const q = 2 * t * (1 - t), x = 2 * q, y = -q, z = 12 * t;
  const dx = 10 + 4 * t + (middle - 14) * q, dy = 4 * q, aspect = 3 / 5 - 11 / 35 * t;
  return [[x, y, z], [x + dx, y + dy, z], [x + dx - aspect * dy, y + dy + aspect * dx, z], [x - aspect * dy, y + aspect * dx, z]];
}

function distance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

async function fit() {
  await button('Right').click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => (window.__studioEye?.()?.[0] ?? 0) > 15);
  await frame();
}

async function measureOutline(middle, label) {
  const analytic = Array.from({ length: 257 }, (_, i) => ring(i / 256, middle)[2]), mid = analytic[128];
  const detail = await f.page.waitForFunction(() => window.__studioLoftDisplay?.()).then(handle => handle.jsonValue());
  assert.ok(detail.triangles > detail.baseTriangles && detail.error <= 0.01);
  const measured = await f.page.evaluate(({ analytic, mid }) => {
    const hit = window.__studioEdgeAt(mid, 4);
    if (!hit) return null;
    const project = window.__studioScreenOf;
    const segments = hit.segments.map(coords => [project(coords.slice(0, 3)), project(coords.slice(3, 6))]);
    return { hit, segments, point: project(mid), curve: analytic.map(project) };
  }, { analytic, mid });
  assert.ok(measured, 'The renderer reports the analytic rear-right guide edge');
  const { hit, segments, point, curve } = measured;
  const ends = [hit.segments[0].slice(0, 3), hit.segments.at(-1).slice(3, 6)];
  assert.deepEqual(ends, [ring(0, middle)[2], ring(1, middle)[2]]);
  const maxError = Math.max(...curve.map(p => Math.min(...segments.map(([a, b]) => distance(p, a, b)))));
  assert.ok(maxError <= 0.8, JSON.stringify({ label, maxError }));
  // The rear-right rail borders the filled silhouette in Right view. Compare actual pixels on either side.
  const inside = [mid[0], mid[1] - 0.05, mid[2]], outside = [mid[0], mid[1] + 0.05, mid[2]];
  const fill = await f.page.evaluate(({ inside, outside }) => window.__studioPixels?.([inside, outside]), { inside, outside });
  if (backend === 'webgpu') {
    assert.ok(fill?.length === 2);
    const [interior, background] = fill.map(rgb => rgb.reduce((sum, value) => sum + value, 0));
    assert.ok(interior - background > 100, JSON.stringify(fill));
  }
  assert.ok(await f.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.matches('canvas.vp-canvas'), point), point);
  await f.page.mouse.click(...point);
  const edge = { body: hit.body, edge: hit.edge };
  await f.page.waitForFunction(e => window.__studioSelection?.selection.edges.some(candidate => candidate.body === e.body && candidate.edge === e.edge), edge);
  f.report.observations.push({ label, ...detail, edge, maxErrorCSS: maxError, heightCSS: Math.abs(curve[0][1] - curve.at(-1)[1]), segments: segments.length, fill });
  await f.snapshot(label);
  return { edge, mid, height: Math.abs(curve[0][1] - curve.at(-1)[1]) };
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, context = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const created = await context({ ...options, serviceWorkers: 'block' });
    await created.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return created;
  };
  const newPage = f.newPage;
  f.newPage = async () => {
    await newPage();
    if (backend === 'webgl2') {
      await f.page.goto(origin + '/?renderer=webgl2');
      await f.page.locator('.viewport[data-renderer="webgl2"]').waitFor();
      await f.ready();
    }
  };
  f.phase = 'Open the tapered twisted Loft and wait for its refined mesh with Direct guides still visible';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'twisted-loft.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  await button('Rail A').waitFor();
  await f.page.waitForFunction(() => window.__studioDirectSegments?.('a')?.length && window.__studioLoftDisplay?.()?.triangles > 0);
  await f.snapshot('perspective');
  const canonical = await f.inspect('original', source);
  assert.equal(canonical.report.valid, true);
  assert.equal(canonical.report.counts.faces, 6);
  assert.ok(Math.abs(canonical.mass.volume - 163256 / 175) < 1e-8);
  const pickEdges = async () => {
    const filter = button('Selection filter');
    for (let i = 0; i < 4 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
    assert.match(await filter.innerText(), /Edges/);
  };
  await fit();
  await pickEdges();
  f.phase = 'Measure the native rear-right edge and click its selection line before and after zoom';
  const before = await measureOutline(18, 'fit-edge');
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Escape');
  await f.page.mouse.move(...await world(before.mid));
  await f.page.mouse.wheel(0, -340);
  await frame();
  const zoomed = await measureOutline(18, 'zoom-edge');
  assert.deepEqual(zoomed.edge, before.edge);
  assert.ok(zoomed.height > before.height * 1.15);
  await f.same(source);
  await fit();
  const filter = button('Selection filter');
  for (let i = 0; i < 4 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const [, a, b] = ring(0.5, 18);
  const facePixel = await world(a.map((value, i) => (value + b[i]) / 2));
  await f.page.mouse.click(...facePixel);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.faces.some(ref => ref.body === 0 && ref.face === 1));
  if (backend === 'webgpu') {
    const interior = [0.18, 0.27, 0.39, 0.57, 0.68, 0.82].flatMap(t => {
      const [, start, end] = ring(t, 18);
      return [0.2, 0.4, 0.6, 0.8].map(u => start.map((value, i) => value + u * (end[i] - value)));
    });
    const hits = await f.page.evaluate(points => points.map(point => window.__studioSurfacePoint(point)), interior);
    const maxError = Math.max(...hits.map((hit, i) => hit ? Math.hypot(...hit.map((x, j) => x - interior[i][j])) : Infinity));
    assert.ok(maxError <= 0.012, maxError);
    f.report.observations.push({ label: 'interior-ray', samples: hits.length, maxError });
  }
  await f.snapshot('right-face');
  await f.openFeatureEditor(2, 'Edit the twisted Loft');
  await f.editor().getByLabel('Guide 2 middle X', { exact: true }).fill('16');
  const edited = (await f.applyEditor(source, 'edited')).doc;
  assert.deepEqual(edited.nodes[2].guides, [guide(left), guide(controls(10, 16, 3, 14))]);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('twisted-loft');
  await f.freshOpen(saved.file, edited, 'fresh-open');
  await fit();
  await pickEdges();
  const reopened = await measureOutline(16, 'reopened-edge');
  assert.deepEqual(reopened.edge, before.edge);
  const checked = await f.inspect('reopened', edited);
  assert.equal(checked.report.valid, true);
  assert.ok(Math.abs(checked.mass.volume - 147064 / 175) < 1e-8);
});

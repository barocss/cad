import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/tube-rim-zoom-browser.mjs', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/engine/engine.worker.ts', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/cylinderDisplay.ts', 'packages/barocss-cad-model/src/engine/meshWire.ts',
];
const f = await createFlow({
  name: 'tube-rim-zoom', output: process.argv[2], envFrozen: 'TUBE_RIM_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Measure both exposed tube rims in desktop Top Ortho and use the same native edges at both zoom levels.',
  limits: ['One upright tube before and after a single radial inner wall Offset; one desktop WebGPU view.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), digest: digestOf(brep), volume: brepMassProperties(brep, 1).volume }));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const centre = [14, 9, 16];
const theta = Math.PI / 32;
const rim = radius => [centre[0] + radius * Math.cos(theta), centre[1] + radius * Math.sin(theta), centre[2]];
const world = p => f.page.evaluate(p => window.__studioScreenOf(p).slice(0, 2), p);
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

function distance(point, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

async function setup() {
  await button('Top').click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  if (await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
  const filter = button('Selection filter');
  for (let i = 0; i < 5 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await settle();
}

async function zoom(lo, hi) {
  for (let i = 0; i < 20; i++) {
    const [x, y] = await world(centre), [rx, ry] = await world([23, 9, 16]), radiusCSS = Math.hypot(rx - x, ry - y);
    if (radiusCSS >= lo && radiusCSS <= hi) return;
    await f.page.mouse.move(x, y);
    await f.page.mouse.wheel(0, radiusCSS < lo ? -160 : 160);
    await settle();
  }
  assert.fail('Unable to reach the requested outer rim scale');
}

async function measure(radius, label, capture) {
  const sample = await f.page.evaluate(({ centre, radius, theta }) => {
    const screen = p => window.__studioScreenOf(p).slice(0, 2);
    const circle = t => [centre[0] + radius * Math.cos(t), centre[1] + radius * Math.sin(t), centre[2]];
    const at = circle(theta), read = window.__studioEdgeAt(at, 5);
    return read && { edge: { body: read.body, edge: read.edge }, at: screen(at), centre: screen(centre), right: screen(circle(0)),
      heights: [...new Set(read.segments.flatMap(line => [line[2], line[5]]))],
      samples: Array.from({ length: 720 }, (_, i) => screen(circle(i * Math.PI / 360))),
      segments: read.segments.map(line => [screen(line.slice(0, 3)), screen(line.slice(3, 6))]) };
  }, { centre, radius, theta });
  assert.ok(sample?.segments.length, label);
  assert.deepEqual(sample.heights, [centre[2]]);
  const rho = Math.hypot(sample.right[0] - sample.centre[0], sample.right[1] - sample.centre[1]);
  const observation = { label, edge: sample.edge, radiusCSS: rho, segments: sample.segments.length,
    maxErrorCSS: Math.max(...sample.samples.map(point => Math.min(...sample.segments.map(segment => distance(point, segment))))) };
  if (capture) {
    const raw = PNG.sync.read(await f.page.screenshot());
    const intensity = async offset => {
      const [x, y] = await world(rim(radius + offset * radius / rho));
      const index = (Math.round(y) * raw.width + Math.round(x)) * 4;
      return raw.data[index] + raw.data[index + 1] + raw.data[index + 2];
    };
    const inside = await intensity(-4), outside = await intensity(4);
    observation.boundaryContrast = radius === 9 ? inside - outside : outside - inside;
    assert.ok(observation.boundaryContrast > 90, JSON.stringify(observation));
    await f.page.mouse.click(...sample.at);
    await f.page.waitForFunction(edge => JSON.stringify(window.__studioSelection?.selection.edges) === JSON.stringify([edge]), sample.edge);
    await f.snapshot(label);
    await f.page.evaluate(() => document.activeElement?.blur());
    await f.page.keyboard.press('Escape');
    await settle();
  }
  f.report.observations.push(observation);
  return observation;
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext(options);
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin || !['http:', 'https:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    return context;
  };
  for (const [label, path, radius] of [['source', process.argv[3], 4], ['offset', process.argv[4], 6]]) {
    const doc = JSON.parse(await readFile(path, 'utf8'));
    await f.freshOpen(path, doc, label + '-open');
    await setup();
    const native = await f.inspect(label + '-native', doc);
    assert.ok(native.check.valid);
    assert.ok(Math.abs(native.volume - Math.PI * (81 - radius ** 2) * 16) < 1e-8);
    f.report.observations.push({ label: label + '-native', digest: native.digest, volume: native.volume });
    f.phase = 'measure ' + label + ' at low zoom';
    await zoom(26, 44);
    const low = await Promise.all([measure(9, label + '-outer-low', false), measure(radius, label + '-inner-low', false)]);
    f.phase = 'measure and select both ' + label + ' rims at high zoom';
    await zoom(195, 270);
    const high = [await measure(9, label + '-outer-high', true), await measure(radius, label + '-inner-high', true)];
    assert.notDeepEqual(high[0].edge, high[1].edge);
    for (const [i, metric] of high.entries()) {
      assert.deepEqual(metric.edge, low[i].edge);
      assert.ok(low[i].maxErrorCSS <= 0.25, JSON.stringify(low[i]));
      if (baseline) assert.ok(metric.segments === low[i].segments && metric.maxErrorCSS > 0.25, JSON.stringify(metric));
      else assert.ok(metric.segments > low[i].segments && metric.maxErrorCSS <= 0.25, JSON.stringify(metric));
    }
    await f.same(doc);
    const bytes = await f.page.evaluate(() => window.__studioCylinderDisplayBytes());
    if (baseline) assert.equal(bytes, undefined);
    else assert.ok(bytes.length > 0 && bytes.reduce((total, count) => total + count, 0) <= 192 * 1024);
    f.report.observations.push({ label: label + '-detail-bytes', bytes });
    if (!baseline && label === 'offset') {
      const saved = await f.save('refined-tube');
      await f.freshOpen(saved.file, doc, 'reopened-tube');
      await setup();
      await zoom(195, 270);
      const reopened = await measure(radius, 'reopened-inner-high', true);
      assert.deepEqual(reopened.edge, high[1].edge);
      assert.ok(reopened.maxErrorCSS <= 0.25);
      assert.deepEqual(await f.inspect('reopened-native', doc), native);
    }
  }
});

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const cubic = process.argv.includes('--cubic');
const straight = [[10, 10, 0], [40, 10, cubic ? 6 : 0]];
const crown = cubic ? [[10, 30, 3], [18, 37, 12], [32, 25, -3], [40, 30, 9]]
  : [[10, 30, 0], [25, 37, 8], [40, 30, 0]];
const degree = crown.length - 1, profile = cubic ? 'cubic' : 'quadratic';
const [start, end] = cubic ? [2, 4] : [0, 1], span = end - start;
function curveSource(id, points, from) {
  const count = points.length;
  return `@model ruled_input {version:0;length-unit:mm;@curve #${id} {type:nurbs;degree:${count - 1};knots:[${Array(count).fill(from)},${Array(count).fill(from + span)}];control-points:${JSON.stringify(points)};weights:[${Array(count).fill(1)}];}}`;
}
const model = (crownStart = start) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: { a: curveSource('straight', straight, start), b: curveSource('crown', crown, crownStart) },
    objects: [{ id: 'a', name: 'Straight rail', source: 'a', geometry: 'straight' },
      { id: 'b', name: 'Crown rail', source: 'b', geometry: 'crown' }],
  },
});
const pins = [
  'apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs',
  'apps/cad-studio/src/ui/DirectPanel.tsx', 'apps/cad-studio/src/ui/ruledMidpointNormal.ts',
  'packages/barocss-cad-model/src/engine/direct.ts',
];
const f = await createFlow({
  name: `direct-ruled-line-${profile}`, output: process.argv[2],
  envFrozen: cubic ? 'D1623_SOURCE_FROZEN' : 'D1611_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: `Build the native ruled sheet with a straight and a ${profile} boundary. Verify its source curves, midpoint normal and exact reopen.`,
  limits: [`One unit-weight straight span and one unit-weight ${profile} span, in the same direction and on the same parameter domain.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluateSurface } from '@barocss/cad';
import { analyzeSurface, geometryOf } from '@barocss/cad-model/engine/direct';
const direct = JSON.parse(readFileSync(process.argv[2], 'utf8')).direct;
const surfaces = direct.objects.flatMap(object => {
  const geometry = geometryOf(direct, object);
  return geometry.kind === 'surface' ? [geometry] : [];
});
if (surfaces.length !== 1) throw Error('Expected one native surface');
const [surface] = surfaces, object = direct.objects.find(object => object.geometry === surface.id);
const samples = Array.from({ length: 17 }, (_, i) =>
  Array.from({ length: 9 }, (_, j) => evaluateSurface(surface, ${start} + ${span} * i / 16, j / 8)));
const normal = analyzeSurface(direct, object.id, ${start} + ${span} / 2, .5).normal;
console.log(JSON.stringify({ surface, samples, normal }));
`,
});
const panel = () => f.page.getByRole('complementary', { name: 'Direct geometry' });
const direction = () => panel().getByRole('status', { name: 'Ruled surface direction', exact: true });
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const row = name => f.page.locator('.outliner .ol.direct').filter({ hasText: name });
async function open(label, doc) {
  const path = join(f.output, label + '.bcad');
  await writeFile(path, JSON.stringify(doc));
  await f.freshOpen(path, doc, label);
  await button(f.page, 'Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row('Straight rail').click();
  await row('Crown rail').click({ modifiers: ['Shift'] });
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };

  f.phase = 'refuse the different parameter domain without changing either rail';
  const mismatch = model(start + 1);
  await open('01-different-domain', mismatch);
  await direction().getByText(/normal unavailable/i).waitFor();
  await button(panel(), 'Ruled surface').click();
  await f.waitToast(/original domain|matching domain|common domain/i);
  await f.same(mismatch);
  assert.equal(await f.page.locator('.ol.direct.sel').count(), 2);
  await f.snapshot('02-different-domain-refused');

  f.phase = 'show the actual direction, then create the exact ruled surface';
  const source = model();
  await open('03-two-rails', source);
  await direction().getByText(/Ruled midpoint normal:/).waitFor();
  if (cubic) {
    await direction().getByText(/Ruled midpoint normal: \(-0\.001, -0\.090, 0\.996\)/).waitFor();
    await button(panel(), 'Swap curve order').click();
    await direction().getByText(/Ruled midpoint normal: \(0\.001, 0\.090, -0\.996\)/).waitFor();
    await button(panel(), 'Swap curve order').click();
    await direction().getByText(/Ruled midpoint normal: \(-0\.001, -0\.090, 0\.996\)/).waitFor();
  }
  await panel().getByText('Ruled connects start to start and end to end.', { exact: true }).waitFor();
  await f.same(source);
  await f.snapshot('04-matched-rail-direction');
  await button(panel(), 'Ruled surface').click();
  await f.changed(source);
  const result = await f.doc();
  assert.deepEqual(result.direct.objects.slice(0, 2), source.direct.objects);
  assert.equal(result.direct.sources.a, source.direct.sources.a);
  assert.equal(result.direct.sources.b, source.direct.sources.b);
  assert.equal(result.direct.objects.length, 3);
  assert.equal(Object.keys(result.direct.sources).length, 3);

  const native = await f.inspect('05-ruled-native', result);
  assert.deepEqual([native.surface.degreeU, native.surface.degreeV], [degree, 1]);
  assert.deepEqual(native.surface.knotsU, [...Array(degree + 1).fill(start), ...Array(degree + 1).fill(end)]);
  assert.deepEqual(native.surface.knotsV, [0, 0, 1, 1]);
  const error = Math.max(...native.samples.flatMap((slice, i) => {
    const u = i / 16;
    return slice.map((point, j) => {
      const v = j / 8;
      const bernstein = cubic ? [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u ** 2, u ** 3]
        : [(1 - u) ** 2, 2 * (1 - u) * u, u ** 2];
      const expected = straight[0].map((beginning, axis) => {
        const a = beginning * (1 - u) + straight[1][axis] * u;
        const b = crown.reduce((sum, point, index) => sum + point[axis] * bernstein[index], 0);
        return (1 - v) * a + v * b;
      });
      return Math.hypot(...point.map((coord, axis) => coord - expected[axis]));
    });
  }));
  assert.ok(error <= 1e-10, error);
  const midpoint = cubic ? [25, 20.375, 3.9375] : [25, 21.75, 2];
  assert.ok(native.samples[8][4].every((coordinate, axis) => Math.abs(coordinate - midpoint[axis]) < 1e-10));
  if (cubic) {
    const cross = [-.328125, -29.53125, 326.8125], length = Math.hypot(...cross);
    assert.ok(native.normal.every((coordinate, axis) => Math.abs(coordinate - cross[axis] / length) < 1e-10));
  }
  f.report.observations.push({ samples: 153, maxErrorMm: error, midpoint: native.samples[8][4], normal: native.normal });
  await f.snapshot('05-ruled-surface');
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(result);
  const saved = await f.save(`ruled-straight-${profile}`);
  await f.freshOpen(saved.file, result, '06-reopened-ruled-surface');
  assert.deepEqual(await f.inspect('06-reopened-native', result), native);
  await button(f.page, 'Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row('Ruled surface').click();
  await f.snapshot('07-reopened-surface-selection');
});

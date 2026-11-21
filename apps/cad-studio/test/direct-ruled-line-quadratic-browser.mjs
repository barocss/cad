import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const straight = [[10, 10, 0], [40, 10, 0]];
const crown = [[10, 30, 0], [25, 37, 8], [40, 30, 0]];
function curveSource(id, points, start = 0) {
  const count = points.length;
  return `@model ruled_input {version:0;length-unit:mm;@curve #${id} {type:nurbs;degree:${count - 1};knots:[${Array(count).fill(start)},${Array(count).fill(start + 1)}];control-points:${JSON.stringify(points)};weights:[${Array(count).fill(1)}];}}`;
}
const model = (start = 0) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: { a: curveSource('straight', straight), b: curveSource('crown', crown, start) },
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
  name: 'direct-ruled-line-quadratic', output: process.argv[2],
  envFrozen: 'D1611_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Build the native ruled sheet with a straight and a quadratic boundary. Verify its source curves, midpoint normal and exact reopen.',
  limits: ['One unit-weight straight span and one unit-weight quadratic span, in the same direction and on the same parameter domain.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluateSurface } from '@barocss/cad';
import { geometryOf } from '@barocss/cad-model/engine/direct';
const direct = JSON.parse(readFileSync(process.argv[2], 'utf8')).direct;
const surfaces = direct.objects.flatMap(object => {
  const geometry = geometryOf(direct, object);
  return geometry.kind === 'surface' ? [geometry] : [];
});
if (surfaces.length !== 1) throw Error('Expected one native surface');
const [surface] = surfaces;
const samples = Array.from({ length: 17 }, (_, i) =>
  Array.from({ length: 9 }, (_, j) => evaluateSurface(surface, i / 16, j / 8)));
console.log(JSON.stringify({ surface, samples }));
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
  const mismatch = model(1);
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

  const native = await f.inspect('05-ruled-native', result);
  assert.deepEqual([native.surface.degreeU, native.surface.degreeV], [2, 1]);
  assert.deepEqual([native.surface.knotsU, native.surface.knotsV], [[0, 0, 0, 1, 1, 1], [0, 0, 1, 1]]);
  const error = Math.max(...native.samples.flatMap((slice, i) => {
    const u = i / 16;
    return slice.map((point, j) => {
      const v = j / 8;
      const expected = straight[0].map((start, axis) => {
        const a = start * (1 - u) + straight[1][axis] * u;
        const b = crown[0][axis] * (1 - u) ** 2 + 2 * crown[1][axis] * (1 - u) * u + crown[2][axis] * u ** 2;
        return (1 - v) * a + v * b;
      });
      return Math.hypot(...point.map((coord, axis) => coord - expected[axis]));
    });
  }));
  assert.ok(error <= 1e-10, error);
  assert.deepEqual(native.samples[8][4], [25, 21.75, 2]);
  f.report.observations.push({ samples: 153, maxErrorMm: error, midpoint: native.samples[8][4] });
  await f.snapshot('05-ruled-surface');
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(result);
  const saved = await f.save('ruled-straight-quadratic');
  await f.freshOpen(saved.file, result, '06-reopened-ruled-surface');
  assert.deepEqual(await f.inspect('06-reopened-native', result), native);
  await button(f.page, 'Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row('Ruled surface').click();
  await f.snapshot('07-reopened-surface-selection');
});

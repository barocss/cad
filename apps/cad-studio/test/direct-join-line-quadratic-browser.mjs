import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const line = [[10, 10, 0], [25, 10, 0]], quadratic = [[25, 10, 0], [35, 24, 0], [50, 18, 0]];
function source(points) {
  const count = points.length;
  return `@model join_input {version:0;length-unit:mm;@curve #path {type:nurbs;degree:${count - 1};knots:[${Array(count).fill(0)},${Array(count).fill(1)}];control-points:${JSON.stringify(points)};weights:[${Array(count).fill(1)}];}}`;
}
const doc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: { a: source(line), b: source(quadratic) },
    objects: [{ id: 'a', name: 'Straight reference', source: 'a', geometry: 'path' },
      { id: 'b', name: 'Quadratic reference', source: 'b', geometry: 'path' }],
  },
};
const pins = [
  'apps/cad-studio/test/direct-join-line-quadratic-browser.mjs', 'apps/cad-studio/src/ui/TwoCurveRoles.tsx',
  'apps/cad-studio/src/ui/joinEndpointGuidance.ts', 'packages/barocss-cad-model/src/engine/direct.ts',
];
const f = await createFlow({
  name: 'join-line-quadratic', output: process.argv[2], envFrozen: 'D1605_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Join the exact line end to the quadratic start, preserve both spans and reopen the single native curve.',
  limits: ['One unit-weight line and one unit-weight quadratic Bézier with an exact shared endpoint.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluateCurve } from '@barocss/cad';
import { geometryOf } from '@barocss/cad-model/engine/direct';
const value = JSON.parse(readFileSync(process.argv[2], 'utf8')).direct;
const [item] = value.objects.filter(item => !item.hidden);
const curve = geometryOf(value, item);
if (curve.kind !== 'curve') throw Error('Expected one visible native curve');
console.log(JSON.stringify({ item: item.id, degree: curve.degree, knots: curve.knots, weights: curve.weights,
  samples: Array.from({ length: 65 }, (_, i) => evaluateCurve(curve, i / 32)) }));
`,
});
const panel = () => f.page.getByRole('complementary', { name: 'Direct geometry' });
const group = () => panel().getByRole('group', { name: 'Join endpoints', exact: true });
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const row = name => f.page.locator('.outliner .ol.direct').filter({ hasText: name });

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
  const file = join(f.output, 'line-and-quadratic.bcad');
  await writeFile(file, JSON.stringify(doc));
  await f.freshOpen(file, doc, '01-two-native-curves');
  await button(f.page, 'Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row('Quadratic reference').click();
  await row('Straight reference').click({ modifiers: ['Shift'] });
  f.phase = 'refuse the opposite order and keep both selected source curves';
  const before = await f.page.locator('.ol.direct.sel').allTextContents();
  await group().getByText(/endpoints match in the opposite order/).waitFor();
  await button(panel(), 'Join').click();
  await f.waitToast(/exactly numerically equal/);
  await f.same(doc);
  assert.deepEqual(await f.page.locator('.ol.direct.sel').allTextContents(), before);
  await f.snapshot('02-wrong-order-refused');
  await f.dismissToasts();
  f.phase = 'explicitly swap the order and join the two exact spans';
  await button(panel(), 'Swap curve order').click();
  await group().getByText(/Gap: 0 mm/).waitFor();
  assert.doesNotMatch(await group().innerText(), /same native degree/);
  await button(panel(), 'Join').click();
  await f.changed(doc);
  const joined = await f.doc();
  assert.deepEqual(joined.direct.objects.slice(0, 2), doc.direct.objects.map(item => ({ ...item, hidden: true })));
  assert.equal(joined.direct.sources.a, doc.direct.sources.a);
  assert.equal(joined.direct.sources.b, doc.direct.sources.b);
  const native = await f.inspect('joined-native', joined);
  assert.equal(native.degree, 2);
  assert.deepEqual(native.knots, [0, 0, 0, 1, 1, 2, 2, 2]);
  assert.deepEqual(native.weights, [1, 1, 1, 1, 1]);
  const error = Math.max(...native.samples.map((point, i) => {
    const t = i <= 32 ? i / 32 : i / 32 - 1;
    const predicted = i <= 32 ? line[0].map((p, j) => (1 - t) * p + t * line[1][j])
      : quadratic[0].map((p, j) => (1 - t) ** 2 * p + 2 * t * (1 - t) * quadratic[1][j] + t ** 2 * quadratic[2][j]);
    return Math.hypot(...point.map((value, j) => value - predicted[j]));
  }));
  assert.ok(error < 1e-10);
  assert.deepEqual(native.samples[32], line[1]);
  f.report.observations.push({ errorMm: error, joinPoint: native.samples[32], degree: native.degree });
  await f.snapshot('03-joined-curve');
  await f.undo();
  await f.same(doc);
  await f.redo();
  await f.same(joined);
  const saved = await f.save('joined-line-quadratic');
  await f.freshOpen(saved.file, joined, '04-reopened-joined-curve');
  assert.deepEqual(await f.inspect('reopened-native', joined), native);
  await button(f.page, 'Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row('Joined curve').click();
  await f.snapshot('05-reopened-native-selection');
});

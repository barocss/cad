import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { twoGuideInspector } from './loft-two-guides-oracle.mjs';

const output = resolve(process.argv[2]);
assert.ok(relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const pins = [
  'apps/cad-studio/test/two-guide-loft-taper-browser.mjs', 'apps/cad-studio/test/loft-two-guides-oracle.mjs',
  'packages/barocss-cad/src/features/loft-two-guides.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad-model/src/engine/part.ts',
];
const f = await createFlow({
  name: 'two-guide-loft-taper', output, envFrozen: 'D1280_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Build and edit a two-guide Loft between rectangular sections of different widths and depths.',
  limits: ['10 × 6 and 14 × 4 mm rectangular sections, 12 mm apart, with linear depth-to-width ratio.'],
  inspectorSource: twoGuideInspector,
});
const bezier = (name, start, mid, end) => `@model ${name} {
  version: 0; length-unit: mm;
  @curve #curve { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points:
    [[${start},0,0],[${mid},0,6],[${end},0,12]]; weights: [1,1,1]; }
}`;
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2, outputs: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6] },
    { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [14, 4],
      plane: { origin: [0, 0, 12], normal: [0, 0, 1], xAxis: [1, 0, 0] } },
  ],
  direct: {
    sources: { a: bezier('left', 0, 2, 0), b: bezier('right', 10, 16, 14) },
    objects: [{ id: 'a', name: 'Rail A', source: 'a', geometry: 'curve' }, { id: 'b', name: 'Rail B', source: 'b', geometry: 'curve' }],
  },
};
const truth = {
  16: { volume: 29016 / 35, centroid: [891196 / 126945, 36886306 / 13329225, 250724 / 42315], inertiaDiagonal: [11.517192331390, 20.885914535959, 13.820989492616] },
  18: { volume: 161272 / 175, centroid: [1042239 / 141113, 43398851 / 14816865, 833844 / 141113], inertiaDiagonal: [12.716299203386, 24.365613158835, 17.224922734439] },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Loft', exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-8;
const nearPoint = (a, b) => a.length === 3 && a.every((x, k) => near(x, b[k]));
async function verify(doc, middleX, label) {
  const loft = doc.nodes.at(-1);
  assert.deepEqual(loft.guides[0].controlPoints, [[0, 0, 0], [2, 0, 6], [0, 0, 12]]);
  assert.deepEqual(loft.guides[1].controlPoints, [[10, 0, 0], [middleX, 0, 6], [14, 0, 12]]);
  const actual = await f.inspect(label, doc);
  assert.ok(actual.report.valid, JSON.stringify(actual.report.issues));
  assert.equal(actual.report.counts.faces, 6);
  assert.equal(actual.report.topology[0].genus, 0);
  assert.ok(actual.report.maximumPcurveGap < 1e-8);
  const [worker] = (await f.bodies()).bodies;
  assert.equal(worker.key, actual.key);
  const expected = truth[middleX];
  assert.ok(near(actual.mass.volume, expected.volume) && near(worker.volume, expected.volume));
  assert.ok(nearPoint(actual.mass.centroid, expected.centroid));
  assert.ok(nearPoint(actual.mass.inertia.map((row, i) => row[i]), expected.inertiaDiagonal));
  const left = actual.edges.find(edge => nearPoint(edge.controls[0], [0, 0, 0]));
  const right = actual.edges.find(edge => nearPoint(edge.controls[0], [10, 0, 0]));
  assert.deepEqual([left.controls, right.controls], loft.guides.map(g => g.controlPoints));
  assert.equal(left.uses, 2);
  assert.equal(right.uses, 2);
  assert.equal(actual.sides.length, 4);
  for (const [i, t] of [0,.25,.5,.75,1].entries()) {
    const width = middleX === 16 ? 10 + 8 * t - 4 * t ** 2 : 10 + 12 * t - 8 * t ** 2;
    const depth = width * (3 / 5 - 11 / 35 * t);
    const x0 = 4 * t * (1 - t), z = 12 * t;
    const ring = [[x0,0,z], [x0+width,0,z], [x0+width,depth,z], [x0,depth,z]];
    assert.ok(nearPoint(left.samples[i], ring[0]) && nearPoint(right.samples[i], ring[1]));
    const matched = new Set();
    for (const side of actual.sides) {
      const [a, m, b] = side.samples[i], corner = ring.findIndex((point, j) => nearPoint(a, point) && nearPoint(b, ring[(j + 1) % 4]));
      assert.ok(corner >= 0 && !matched.has(corner), JSON.stringify({ t, side, ring }));
      matched.add(corner);
      assert.ok(nearPoint(m, a.map((x, k) => (x + b[k]) / 2)));
    }
  }
  f.report.observations.push({ label, expected, volume: actual.mass.volume, worker: worker.volume, centroid: actual.mass.centroid });
  return actual;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Open unequal rectangular sections and apply Loft with both copied guides';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'unequal-loft.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch 2').click();
  await button('Sketch 1').click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  await hud().getByLabel('Guide (copied)', { exact: true }).selectOption('a');
  await hud().getByLabel('Second guide (copied)', { exact: true }).selectOption('b');
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor({ timeout: 15000 });
  await f.same(seed);
  await button('Apply', hud()).click();
  await f.changed(seed);
  const made = await f.doc();
  await verify(made, 16, 'original');
  await f.snapshot('original');

  f.phase = 'Edit the second guide and check that both authored sections stay exact';
  await f.openFeatureEditor(4, 'Loft with unequal sections');
  await f.editor().getByLabel('Guide 2 middle X', { exact: true }).fill('18');
  const edited = (await f.applyEditor(made, 'edited')).doc;
  const actual = await verify(edited, 18, 'edited');
  await f.undo();
  await f.same(made);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('loft-between-unequal-rectangles');
  await f.freshOpen(saved.file, edited, 'reopened');
  assert.deepEqual(await verify(await f.doc(), 18, 'reopened'), actual);
  await f.openFeatureEditor(4, 'Reopened Loft with unequal sections');
  await f.editor().getByText('Guide 1 · (0, 0, 0) → (0, 0, 12) mm', { exact: true }).waitFor();
  await f.editor().getByText('Guide 2 · (10, 0, 0) → (14, 0, 12) mm', { exact: true }).waitFor();
  await f.snapshot('reopened-guide-history');
});

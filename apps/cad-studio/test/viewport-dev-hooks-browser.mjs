import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/viewport-dev-hooks-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/viewport/useStudioViewportDevHooks.ts',
  'apps/cad-studio/src/viewport/useViewportPicking.ts',
];
const f = await createFlow({
  name: 'viewport-dev-hooks', output: process.argv[2], envFrozen: 'D1873_SOURCE_FROZEN',
  qualification: 'Retain desktop harness names and actual viewport selection across native document lifetime.',
  limits: ['The test compares real pointer input with existing development-only helpers.'],
  initialFiles: pins, requiredFrozen: pins,
});
const doc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 24] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = name => f.page.getByRole('button', { name, exact: true });
const selection = () => f.page.evaluate(() => window.__studioSelection.selection);
const pickNames = ['n1.side0|n1.top', 'n1.side1|n1.top'];
const selectFace = name => f.page.evaluate(face => window.__studioSelectFace(face), name);
const selectEdges = count => f.page.waitForFunction(n => window.__studioSelection.selection.edges.length === n, count);
const selectFaces = count => f.page.waitForFunction(n => window.__studioSelection.selection.faces.length === n, count);

async function pickTopFace() {
  await f.page.locator('.views').getByRole('button', { name: 'Top', exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const point = [20, 12, 8];
  const pixel = await f.page.evaluate(async world => {
    let before, stable = 0;
    for (let i = 0; i < 90; i++) {
      await new Promise(requestAnimationFrame);
      const next = window.__studioScreenOf(world);
      stable = before && Math.hypot(next[0] - before[0], next[1] - before[1]) < 0.01 ? stable + 1 : 0;
      before = next;
      if (stable >= 4 && document.elementFromPoint(...next)?.closest('canvas.vp-canvas')) return next;
    }
    throw Error('The model face did not settle on the viewport');
  }, point);
  const filter = button('Selection filter');
  if (await filter.innerText() === 'Pick all') await filter.click();
  assert.equal(await filter.innerText(), 'Faces');
  await f.page.mouse.click(...pixel);
  await selectFaces(1);
  return selection();
}

await f.run(async () => {
  f.phase = 'Open the native box and compare a real face pick to the named helpers';
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'viewport-ownership.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
  await f.same(doc);
  const volume = (await f.bodies()).bodies[0].volume;
  assert.ok(Math.abs(volume - 40 * 24 * 8) < 1e-8);
  assert.equal(await f.page.evaluate(() => window.__studioCage()), null);

  const face = await pickTopFace();
  assert.equal(await selectFace('missing-face'), false);
  assert.deepEqual(await selection(), face);
  assert.equal(await selectFace('n1.top'), true);
  await selectFaces(1);
  assert.deepEqual(await selection(), face);
  await f.snapshot('01-real-top-face');

  f.phase = 'Check named routing, additive selection and chain ownership';
  assert.equal(await f.page.evaluate(name => window.__studioSelectEdge(name), pickNames[0]), true);
  await selectEdges(1);
  assert.equal(await f.page.evaluate(name => window.__studioPickEdge(name, true), pickNames[1]), true);
  await selectEdges(2);
  const selected = await f.snapshot('02-additive-edge-selection');
  assert.equal(new Set(selected.selection.selection.edges.map(edge => edge.edge)).size, 2);
  assert.equal(await f.page.evaluate(() => window.__studioPickFace('n1.top')), true);
  await selectFaces(1);
  assert.deepEqual(await selection(), face);
  assert.equal(await f.page.evaluate(() => window.__studioChainTop()), 1);
  await selectEdges(1);
  await f.snapshot('03-straight-edge-chain');
  await f.same(doc);
  const saved = await f.save('viewport-ownership');

  f.phase = 'Retire previous names when New part takes ownership';
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0 && !window.__studioBodies().bodies.length);
  await f.ready();
  assert.deepEqual(await f.page.evaluate(() => [
    window.__studioSelectEdge('n1.side0|n1.top'), window.__studioSelectFace('n1.top'),
    window.__studioPickEdge('n1.side1|n1.top'), window.__studioPickFace('n1.top'), window.__studioChainTop(),
  ]), [false, false, false, false, 0]);
  await f.snapshot('04-new-part-retires-probes');

  await f.freshOpen(saved.file, doc, '05-fresh-open');
  assert.deepEqual(await pickTopFace(), face);
  assert.equal((await f.bodies()).bodies[0].volume, volume);
  await f.same(doc);
  await f.snapshot('06-real-top-face-after-open');
});

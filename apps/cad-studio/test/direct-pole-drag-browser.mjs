import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/direct-pole-drag-browser.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/state/directPoleSelection.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'packages/barocss-cad-model/src/engine/direct.ts',
];
const f = await createFlow({
  name: 'direct-pole-drag', envFrozen: 'D1648_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Preserve Direct surface pole ownership during a real viewport drag, Escape and release.',
  limits: ['One untrimmed bilinear surface. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { geometryOf } from '@barocss/cad-model/engine/direct';
const { direct } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(geometryOf(direct, direct.objects[0])));
`,
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: { panel: '@model test { version:0; length-unit:mm; @surface #panel { type:nurbs; degree-u:1; degree-v:1; knots-u:[0,0,1,1]; knots-v:[0,0,1,1]; control-points:[[[10,-6,3],[10,24,3]],[[50,-6,3],[50,24,3]]]; weights:[[1,1],[1,1]]; } }' },
    objects: [{ id: 'panel1', name: 'Drag panel', source: 'panel', geometry: 'panel' }],
  },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Direct geometry' });
const pole = () => panel().getByLabel('Control point', { exact: true });
const undoSlot = async () => [await button('Undo').isEnabled(), await button('Undo').getAttribute('data-tip')];

async function selectPole() {
  await f.page.locator('.outliner .ol.direct').filter({ hasText: 'Drag panel' }).click();
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const mark = f.page.locator('.vp-overlay .pole-mark').nth(3);
  await mark.waitFor();
  const [x, y] = await mark.evaluate(circle => {
    const { x, y } = circle.closest('svg').getBoundingClientRect();
    return [x + Number(circle.getAttribute('cx')), y + Number(circle.getAttribute('cy'))];
  });
  assert.ok(await f.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.matches('canvas.vp-canvas'), [x, y]));
  await f.page.mouse.click(x, y);
  assert.equal(await pole().inputValue(), '1,1');
  await f.page.locator('.vp-overlay .pole-mark.picked').waitFor();
}

async function beginDrag() {
  const axis = f.page.locator('[data-gizmo="moveZ"] line:nth-of-type(2)');
  const { start, end } = await axis.evaluate(line => {
    const { x, y } = line.closest('svg').getBoundingClientRect();
    const origin = [Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))];
    const delta = [Number(line.getAttribute('x2')) - origin[0], Number(line.getAttribute('y2')) - origin[1]];
    return { start: [x + origin[0] + delta[0] * 0.5, y + origin[1] + delta[1] * 0.5],
      end: [x + origin[0] + delta[0] * 1.5, y + origin[1] + delta[1] * 1.5] };
  });
  await f.page.mouse.move(...start);
  await f.page.mouse.down();
  await f.page.mouse.move(...end, { steps: 8 });
  await f.page.locator('[data-gizmo="moveZ"][data-dragging="true"]').waitFor();
}

await f.run(async () => {
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  await f.page.setInputFiles('input[aria-label="Model file"]', { name: 'direct-pole.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const source = await f.inspect('source-native', seed), openUndo = await undoSlot();

  f.phase = 'Escape revokes a live pole drag';
  await selectPole();
  await beginDrag();
  await f.same(seed);
  await f.snapshot('01-cancel-preview');
  await f.page.keyboard.press('Escape');
  await panel().waitFor({ state: 'hidden' });
  await f.page.mouse.up();
  await f.same(seed);
  assert.deepEqual(await undoSlot(), openUndo);
  await f.snapshot('02-cancel-released');

  f.phase = 'Release the current pole drag as one edit';
  await selectPole();
  await beginDrag();
  await f.same(seed);
  await f.page.mouse.up();
  await f.changed(seed);
  const edited = await f.doc();
  const moved = await f.inspect('moved-native', edited);
  const [x, y, z] = moved.controlPoints[1][1];
  assert.ok(z > 4);
  const expected = structuredClone(source);
  assert.deepEqual([x, y], expected.controlPoints[1][1].slice(0, 2));
  expected.controlPoints[1][1][2] = z;
  assert.deepEqual(moved, expected);
  assert.equal(await pole().inputValue(), '1,1');
  await f.snapshot('03-committed-drag');

  await f.undo();
  await f.same(seed);
  assert.deepEqual(await undoSlot(), openUndo);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('moved-pole');
  await f.freshOpen(saved.file, edited, '04-fresh-open');
  assert.deepEqual(await f.inspect('reopened-native', await f.doc()), moved);
  f.report.observations.push({ controlPoint: '1,1', source: source.controlPoints[1][1], moved: [x, y, z], oneUndoStep: true });
});

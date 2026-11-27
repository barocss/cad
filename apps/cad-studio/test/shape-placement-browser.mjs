import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { openModelGroup } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/shape-placement-browser.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  ...(!baseline ? ['apps/cad-studio/src/app/useStudioShapePlacement.ts'] : []),
];
const f = await createFlow({
  name: 'shape-placement', output: process.argv[2], envFrozen: 'SHAPE_PLACEMENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Compare pointer placement, cancelled rail drag and successful rail drop in desktop Model.',
});

const button = (scope, name) => scope.getByRole('button', { name, exact: true });
f.hud = () => f.page.getByRole('dialog', { name: 'Box', exact: true });
const preview = () => f.hud().locator('.status').getByText('preview', { exact: true }).waitFor();
const box = async () => button(await openModelGroup(f.page, 'Shapes'), 'Box');
const at = async (x, y) => {
  await f.page.waitForFunction(([x, y]) => {
    const hud = document.querySelector('.hud');
    return Number(hud?.querySelector('input[aria-label="At X"]')?.value) === x
      && Number(hud?.querySelector('input[aria-label="At Y"]')?.value) === y;
  }, [x, y]);
  await preview();
};

async function startDrag(target) {
  const source = await (await box()).boundingBox();
  assert.ok(source);
  const [x, y] = await f.screenOf(target);
  const fromX = source.x + source.width / 2, fromY = source.y + source.height / 2;
  const mouse = f.page.mouse;
  await mouse.move(fromX, fromY);
  await mouse.down();
  await mouse.move(x - 5, y, { steps: 10 });
  await mouse.move(x, y, { steps: 5 });
  await mouse.move(x, y);
}

await f.run(async () => {
  await f.newPage();
  await button(f.page, 'New part').click();
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.length === 0);
  await f.ready();
  const original = await f.doc();
  assert.equal(original.nodes.length, 0);
  f.phase = 'Place a shape with the command and pointer';
  await (await box()).click();
  await f.worldClick([7, 18]);
  await at(-9, 2);
  await f.same(original);
  await f.snapshot('click-placement');
  await button(f.hud(), 'Cancel').click();
  await f.hud().waitFor({ state: 'hidden' });
  await f.same(original);

  f.phase = 'Cancel a physical drag after it previews';
  await startDrag([12, 6]);
  await at(-4, -10);
  await f.snapshot('rail-drag-preview');
  await f.page.mouse.move(400, 16, { steps: 10 });
  await f.page.mouse.up();
  await f.hud().waitFor({ state: 'hidden' });
  await f.same(original);
  assert.equal((await f.bodies()).bodies.length, 0);
  await f.snapshot('cancelled-rail-drag');

  f.phase = 'Drop a shape and apply the placed preview';
  await startDrag([-9, 11]);
  await at(-25, -5);
  await f.page.mouse.up();
  await at(-25, -5);
  await f.same(original);
  await button(f.hud(), 'Apply').click();
  await f.changed(original);
  const created = await f.doc();
  assert.deepEqual(created.nodes[0].min, [-25, -5]);
  assert.deepEqual(created.nodes[0].max, [7, 27]);
  assert.equal(created.nodes[1].height, 16);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.ok(Math.abs(bodies[0].volume - 16384) < 1e-6);
  await f.snapshot('applied-rail-drop');
  await f.undo();
  await f.same(original);
  await f.redo();
  await f.same(created);
  const saved = await f.save('rail-drop');
  await f.freshOpen(saved.file, created, 'reopened-rail-drop');
  f.report.observations.push({ model: created, bodies, volume: 16384 });
});

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const webgl = process.argv.includes('--webgl');
const f = await createFlow({
  name: 'section-through-vertex', output: process.argv[2], envFrozen: 'D1973_SOURCE_FROZEN',
  initialFiles: [
    'apps/cad-studio/test/section-through-vertex-browser.mjs',
    'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/SectionBar.tsx',
    'apps/cad-studio/src/viewport/useSectionSelection.ts', 'apps/cad-studio/src/viewport/sectionEdgePick.ts',
    'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  ],
  qualification: 'Move a settled Section through one original retained vertex.',
  limits: ['One native L-profile extrusion, one axis Section and one retained straight-edge corner.'],
  snapshotExtra: () => ({ section: window.__studioSection() }),
});
const doc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [60, 0], [60, 30], [37.375, 30], [37.375, 10], [0, 10]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = name => f.page.getByRole('button', { name, exact: true });
const section = () => f.page.evaluate(() => window.__studioSection());
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
async function click(point) {
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), point);
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel), pixel);
  await f.page.mouse.click(...pixel);
}
await f.run(async () => {
  if (webgl) {
    const newContext = f.browser.newContext.bind(f.browser);
    f.browser.newContext = async options => {
      const context = await newContext(options);
      await context.addInitScript(() => { Object.defineProperty(navigator, 'gpu', { value: undefined }); });
      return context;
    };
  }
  const input = join(f.output, 'section-input.bcad');
  await writeFile(input, JSON.stringify(doc));
  await f.newPage({ backend: webgl ? 'webgl2' : 'webgpu' });
  await f.openFile(input, 2);
  await f.same(doc);
  await button('Section view').click();
  await button('Section across X').click();
  await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().planes[0].axis === 'x');
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Top left', exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const initial = await section();
  assert.equal(initial.gpu, !webgl);
  assert.deepEqual(initial.planes, [{ normal: [1, 0, 0], offset: 30, axis: 'x' }]);
  near(initial.volume, 7525);
  f.phase = 'Verify the existing Section and original target corner';
  const move = button('Section through a vertex');
  if (baseline) {
    assert.equal(await move.count(), 0);
    await click([37.375, 10, 10]);
    assert.deepEqual((await section()).planes, initial.planes);
    await f.same(doc);
    await f.snapshot('baseline-vertex-cannot-move-plane');
    return;
  }
  const apply = button('Apply section move');
  const cancel = button('Cancel section move');
  const status = f.page.getByRole('group', { name: 'Section', exact: true }).getByRole('status');
  const readOnly = await f.snapshot('source-before');
  const start = async () => { await move.click(); await status.getByText('Click an original corner.').waitFor(); };
  const corner = [37.375, 30, 10];
  f.phase = 'Reject the generated cap corner';
  await start();
  await click([30, 10, 10]);
  await status.getByText('Pick a retained original corner.').waitFor();
  assert.equal(await apply.isDisabled(), true);
  assert.deepEqual((await section()).planes, initial.planes);
  await f.snapshot('generated-cap-corner-refused');
  f.phase = 'Preview the original native corner and cancel';
  await click(corner);
  await status.getByText('Move to X 37.375 mm').waitFor();
  assert.deepEqual((await section()).planes, initial.planes);
  await f.snapshot('retained-corner-candidate');
  await cancel.click();
  assert.deepEqual((await section()).planes, initial.planes);
  f.phase = 'Confirm that Escape retires a pending move';
  await start();
  await f.page.keyboard.press('Escape');
  await click(corner);
  assert.equal(await apply.count(), 0);
  assert.deepEqual((await section()).planes, initial.planes);
  f.phase = 'Changing the current plane retires the candidate';
  await start();
  await click(corner);
  await status.getByText('Move to X 37.375 mm').waitFor();
  await button('Flip the section').click();
  await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().planes[0].offset === -30);
  assert.equal(await apply.count(), 0);
  await button('Section across X').click();
  await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().planes[0].offset === 30);
  f.phase = 'Apply the exact proposed plane';
  await start();
  await click(corner);
  await apply.click();
  await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().planes[0].offset === 37.375);
  const moved = await f.snapshot('through-original-vertex');
  assert.deepEqual(moved.section.planes, [{ normal: [1, 0, 0], offset: 37.375, axis: 'x' }]);
  near(moved.section.volume, 6787.5);
  assert.deepEqual(moved.doc, readOnly.doc);
  assert.deepEqual(moved.history, readOnly.history);
  assert.deepEqual(moved.selection, readOnly.selection);
  await f.same(doc);
  if (!webgl) {
    const saved = await f.save('section-through-vertex');
    const reopened = await f.freshOpen(saved.file, doc, 'fresh-open-original');
    assert.equal(reopened.section.planes, null);
    near(reopened.bodies.bodies[0].volume, 10525);
  }
});

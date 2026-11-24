import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
import { coincidentSectionCorners, holdRealSectionReply, projectSectionOwnership } from './section-vertex-ownership-steps.mjs';

const baseline = process.argv.includes('--baseline');
const webgl = process.argv.includes('--webgl');
const oblique = process.argv.includes('--oblique');
const ownership = process.argv.includes('--ownership');
const coincident = process.argv.includes('--coincident');
assert.ok(!ownership || (oblique && !baseline));
assert.ok(!coincident || (oblique && !ownership));
const f = await createFlow({
  name: 'section-through-vertex', output: process.argv[2], envFrozen: ownership || coincident ? 'D1975_SOURCE_FROZEN' : oblique ? 'D1974_SOURCE_FROZEN' : 'D1973_SOURCE_FROZEN',
  initialFiles: [
    'apps/cad-studio/test/section-through-vertex-browser.mjs',
    'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/SectionBar.tsx',
    'apps/cad-studio/src/viewport/useSectionSelection.ts', 'apps/cad-studio/src/viewport/sectionEdgePick.ts',
    'apps/cad-studio/src/viewport/viewportPointerInput.ts',
    'apps/cad-studio/test/section-vertex-ownership-steps.mjs',
  ],
  qualification: 'Move a settled Section through one original retained vertex.',
  limits: ['One native L-profile extrusion, one settled Section and one retained straight-edge corner.'],
  snapshotExtra: () => ({ section: window.__studioSection(), dirty: !!document.querySelector('[aria-label="Unsaved changes"]') }),
});
const points = oblique ? [[12, 0], [60, 0], [60, 30], [35, 30], [35, 10], [0, 10], [0, 9]]
  : [[0, 0], [60, 0], [60, 30], [37.375, 30], [37.375, 10], [0, 10]];
const doc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = name => f.page.getByRole('button', { name, exact: true });
const section = () => f.page.evaluate(() => window.__studioSection());
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
async function click(point, toward) {
  const project = () => f.page.evaluate(([point, toward]) => {
    const at = window.__studioScreenOf(point);
    if (!toward) return at;
    const next = window.__studioScreenOf(toward), distance = Math.hypot(next[0] - at[0], next[1] - at[1]);
    return at.map((value, i) => value + 2 * (next[i] - value) / distance);
  }, [point, toward ?? null]);
  for (let attempt = 0; attempt < 4; attempt++) {
    const pixel = await project();
    const onCanvas = await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel);
    if (onCanvas) { await f.page.mouse.click(...pixel); return; }
    await f.page.mouse.move(610, 410);
    await f.page.mouse.wheel(0, 350);
    await f.page.waitForTimeout(200);
  }
  assert.fail(`The requested click is outside the canvas: ${point.join(', ')}`);
}
async function look(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
await f.run(async () => {
  if (webgl || ownership || coincident) {
    const newContext = f.browser.newContext.bind(f.browser);
    f.browser.newContext = async options => {
      const context = await newContext(options);
      if (webgl) await context.addInitScript(() => { Object.defineProperty(navigator, 'gpu', { value: undefined }); });
      if (ownership || coincident) await context.addInitScript(holdRealSectionReply);
      return context;
    };
  }
  const input = join(f.output, 'section-input.bcad');
  await writeFile(input, JSON.stringify(doc));
  await f.newPage({ backend: webgl ? 'webgl2' : 'webgpu' });
  await f.openFile(input, 2);
  await f.same(doc);
  const setup = async (face = 'n1.side6') => {
    if (!oblique) {
      await button('Section across X').click();
      await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().planes[0].offset === 30);
      await look('Top left');
      return;
    }
    await button('Section across Z').click();
    await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().planes[0].axis === 'z');
    await look('Top front left');
    await button('Section from a face').click();
    await click([6, 4.5, 8]);
    await f.page.waitForFunction(face => {
      const state = window.__studioSection();
      return state?.exact && state.planes[0].face === face;
    }, face);
    await look('Top back');
  };
  const clickCorner = () => click(oblique ? [35, 30, 10] : [37.375, 30, 10], oblique ? [60, 30, 10] : undefined);
  if (coincident) {
    await coincidentSectionCorners({ f, doc, button, look, clickCorner, setup, section, baseline });
    return;
  }
  if (ownership) {
    await projectSectionOwnership({ f, doc, button, look, clickCorner, setup, section, near });
    return;
  }
  await button('Section view').click();
  await setup();
  const initial = await section(), firstPlane = initial.planes[0];
  assert.equal(initial.gpu, !webgl);
  if (oblique) {
    firstPlane.normal.forEach((value, i) => near(value, [0.6, 0.8, 0][i]));
    near(firstPlane.offset, 33.6);
    near(initial.volume, 5846.25);
  } else {
    assert.deepEqual(initial.planes, [{ normal: [1, 0, 0], offset: 30, axis: 'x' }]);
    near(initial.volume, 7525);
  }
  const expectedStatus = oblique ? 'Move to offset 45 mm' : 'Move to X 37.375 mm';
  const offset = oblique ? 45 : 37.375;
  f.phase = 'Verify the existing Section and original target corner';
  const move = button('Section through a vertex');
  if (baseline) {
    if (oblique) assert.equal(await move.isDisabled(), true);
    else assert.equal(await move.count(), 0);
    await clickCorner();
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
  f.phase = 'Reject the generated cap corner';
  await start();
  await click(oblique ? [35, 15.75, 10] : [30, 10, 10]);
  await status.getByText('Pick a retained original corner.').waitFor();
  assert.equal(await apply.isDisabled(), true);
  assert.deepEqual((await section()).planes, initial.planes);
  await f.snapshot('generated-cap-corner-refused');
  f.phase = 'Preview the original native corner and cancel';
  await clickCorner();
  await status.getByText(expectedStatus).waitFor();
  assert.deepEqual((await section()).planes, initial.planes);
  await f.snapshot('retained-corner-candidate');
  await cancel.click();
  assert.deepEqual((await section()).planes, initial.planes);
  f.phase = 'Confirm that Escape retires a pending move';
  await start();
  await f.page.keyboard.press('Escape');
  await clickCorner();
  assert.equal(await apply.count(), 0);
  assert.deepEqual((await section()).planes, initial.planes);
  f.phase = 'Changing the current plane retires the candidate';
  await start();
  await clickCorner();
  await status.getByText(expectedStatus).waitFor();
  await button('Flip the section').click();
  await f.page.waitForFunction(offset => window.__studioSection()?.exact && window.__studioSection().planes[0].offset === -offset, firstPlane.offset);
  assert.equal(await apply.count(), 0);
  await button('Flip the section').click();
  await f.page.waitForFunction(offset => window.__studioSection()?.exact && window.__studioSection().planes[0].offset === offset, firstPlane.offset);
  const beforeApply = (await section()).planes[0];
  f.phase = 'Apply the exact proposed plane';
  await start();
  await clickCorner();
  await apply.click();
  await f.page.waitForFunction(offset => window.__studioSection()?.exact && Math.abs(window.__studioSection().planes[0].offset - offset) < 1e-8, offset);
  const moved = await f.snapshot('through-original-vertex');
  assert.deepEqual(moved.section.planes[0].normal, beforeApply.normal);
  assert.equal(moved.section.planes[0].face, beforeApply.face);
  near(moved.section.planes[0].offset, offset);
  near(moved.section.volume, oblique ? 2343.75 : 6787.5);
  assert.deepEqual(moved.doc, readOnly.doc);
  assert.deepEqual(moved.history, readOnly.history);
  assert.deepEqual(moved.selection, readOnly.selection);
  await f.same(doc);
  if (!webgl) {
    const saved = await f.save('section-through-vertex');
    const reopened = await f.freshOpen(saved.file, doc, 'fresh-open-original');
    assert.equal(reopened.section.planes, null);
    near(reopened.bodies.bodies[0].volume, oblique ? 10460 : 10525);
  }
});

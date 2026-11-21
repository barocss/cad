import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const files = [
  'apps/cad-studio/test/cage-mirror-transform-browser.mjs',
  'apps/cad-studio/src/subd/useCageEditor.ts',
  'apps/cad-studio/src/subd/useCageGizmo.ts',
  'apps/cad-studio/src/subd/cageTransformDraft.ts',
  'apps/cad-studio/src/ui/CagePanel.tsx',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'packages/barocss-cad-model/src/subd/cageEdit.ts',
];
const f = await createFlow({
  name: 'cage-mirror-transform', output: process.argv[2], envFrozen: 'CAGE_MIRROR_TRANSFORM_FROZEN',
  initialFiles: files, requiredFrozen: files,
  qualification: 'Uniform scale and face-normal rotation about an off-seam vertex in actual Studio.',
  limits: ['One planar top quad of one X-mirrored SubD box; coordinates qualify the cage, not the limit surface.'],
});
const panel = () => f.page.getByRole('complementary', { name: 'Cage editor', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const label = name => panel().getByLabel(name, { exact: true });
const state = () => f.page.evaluate(() => window.__studioCage());
const undo = () => button('Undo cage step', panel()).click();
const redo = () => button('Redo cage step', panel()).click();
const point = (s, id) => s.cage.positions.slice(3 * id, 3 * id + 3);
async function command(value) {
  await f.page.getByText('barocss', { exact: true }).click();
  await f.command(value);
}

async function prepareCage() {
  await command('edit cage');
  await label('Mirror').selectOption('x');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Top').click();
  await button('Box', panel()).click();
  await button('Face', panel()).click();
  await f.page.waitForFunction(() => {
    const a = window.__studioScreenOf([3.75, 2.5, 16]);
    const b = window.__studioScreenOf([3.75, 2.5, 15]);
    const c = window.__studioScreenOf([4.75, 2.5, 16]);
    return a && b && c && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.001 * Math.hypot(a[0] - c[0], a[1] - c[1]);
  });
  await f.frame([[3.75, 2.5], [7.5, 10]]);
  const pixel = await f.page.evaluate(() => window.__studioScreenOf([3.75, 2.5, 16]));
  await f.page.mouse.click(...pixel);
  const seed = await state();
  assert.equal(seed.sel.faces.length, 1);
  return seed;
}

function verify(seed, actual, selected, project) {
  let maxError = 0, constrained = 0;
  for (let id = 0; id < seed.cage.positions.length / 3; id++) {
    const before = point(seed, id), after = point(actual, id);
    if (!selected.has(id)) {
      assert.deepEqual(after, before);
      continue;
    }
    const expected = project(before);
    if (before[0] === 0) {
      assert.ok(Math.abs(expected[0]) > 1e-3, 'Test must exercise the mirror constraint');
      assert.equal(after[0], 0);
      assert.notEqual(after[1], before[1]);
      expected[0] = 0;
      constrained++;
    }
    maxError = Math.max(maxError, ...after.map((value, axis) => Math.abs(value - expected[axis])));
  }
  assert.equal(constrained, 2);
  assert.ok(maxError < 1e-10, String(maxError));
  assert.deepEqual(actual.cage.faces, seed.cage.faces);
  assert.deepEqual(actual.cage.creases, seed.cage.creases);
  assert.deepEqual(actual.sel, seed.sel);
  assert.equal(actual.undo, seed.undo + 1);
  return maxError;
}

async function dragScale(factor) {
  const mark = f.page.locator('[data-gizmo="scale"]');
  await mark.waitFor();
  const rect = await mark.boundingBox();
  const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
  await f.page.mouse.move(x, y);
  await f.page.locator('[data-gizmo="scale"][data-active="true"]').waitFor();
  await f.page.mouse.down();
  await f.page.mouse.move(x + Math.round((factor - 1) * 84), y, { steps: 12 });
  await f.page.locator('.gizmo-readout').filter({ hasText: `relative × ${factor}` }).waitFor();
}

async function dragNormal(pivot, angle) {
  const line = f.page.locator('[data-gizmo="turnAlong"] polyline').last();
  const hit = await line.evaluate((arc, pivot) => {
    const rect = arc.closest('svg').getBoundingClientRect();
    const p = arc.points.getItem(Math.floor((arc.points.numberOfItems - 1) / 2));
    return [rect.x + p.x, rect.y + p.y, ...window.__studioScreenOf(pivot)];
  }, pivot);
  const [x, y, cx, cy] = hit, theta = -angle * Math.PI / 180;
  const c = Math.cos(theta), s = Math.sin(theta);
  await f.page.mouse.move(x, y);
  await f.page.locator('[data-gizmo="turnAlong"][data-active="true"]').waitFor();
  await f.page.mouse.down();
  await f.page.mouse.move(cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy), { steps: 16 });
  await f.page.locator('.gizmo-readout').filter({ hasText: `N ${angle}°` }).waitFor();
}

await f.run(async () => {
  await f.newPage();
  await f.page.setViewportSize({ width: 1440, height: 1000 });
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  await command('subd box');
  const hud = f.page.getByRole('dialog', { name: 'SubD box', exact: true });
  for (const [name, value] of [['Width X', 30], ['Depth Y', 20], ['Height Z', 16], ['Quads along a side', 4], ['Centre X', 0], ['Centre Y', 0], ['At Z', 0]]) {
    await hud.getByLabel(name, { exact: true }).fill(String(value));
  }
  await hud.locator('.status.ok').waitFor();
  await button('Apply', hud).click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.some(node => node.kind === 'subd'));
  await f.ready();
  const base = await f.doc();
  const baseline = await f.save('box-baseline');
  const factor = 1.1, angle = 15, pivot = [7.5, 10, 16];
  for (const [kind, control, value] of [['scale', 'Scale', factor], ['rotate', 'Rotate', angle]]) {
    f.phase = `set up mirrored ${kind}`;
    await f.newPage();
    await f.page.setViewportSize({ width: 1440, height: 1000 });
    await f.openFile(baseline.file, base.nodes.length);
    const seed = await prepareCage();
    const selected = new Set(seed.cage.faces[seed.sel.faces[0]]);
    const selectedPoints = [...selected].map(id => point(seed, id));
    assert.deepEqual(selectedPoints.map(p => p.join(',')).sort(), ['0,0,16', '0,5,16', '7.5,0,16', '7.5,5,16']);
    const pivotId = Array.from({ length: seed.cage.positions.length / 3 }, (_, id) => id)
      .find(id => point(seed, id).every((value, axis) => value === pivot[axis]));
    assert.ok(pivotId !== undefined && !selected.has(pivotId));
    await label('Cage drag tool').selectOption(kind);
    if (kind === 'rotate') await label('Rotate drag frame').selectOption('face');
    await label(`${control} drag pivot`).selectOption('vertex');
    await label(`${control} drag vertex ID`).fill(String(pivotId));
    const drag = kind === 'scale' ? () => dragScale(factor) : () => dragNormal(pivot, angle);
    const project = kind === 'scale'
      ? p => p.map((coordinate, axis) => pivot[axis] + (coordinate - pivot[axis]) * factor)
      : ([x, y, z]) => {
        const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180);
        return [pivot[0] + c * (x - pivot[0]) - s * (y - pivot[1]),
          pivot[1] + s * (x - pivot[0]) + c * (y - pivot[1]), z];
      };
    f.phase = `actual mirrored ${kind}: cancel, compare and accept`;
    await drag();
    await f.same(base);
    assert.deepEqual(await state(), seed);
    await f.snapshot(`${kind}-mirrored-seam-preview`);
    await f.page.keyboard.press('Escape');
    await f.page.mouse.up();
    assert.deepEqual(await state(), seed);
    await drag();
    await f.page.mouse.up();
    const moved = await state();
    const maxError = verify(seed, moved, selected, project);
    await undo(); assert.deepEqual(await state(), seed);
    await redo(); assert.deepEqual(await state(), moved);
    await undo();
    await button(`${control} selection`, panel()).click();
    if (kind === 'rotate') await label('Rotation frame').selectOption('face');
    await label('Selection pivot').selectOption('vertex');
    await label('Pivot cage vertex').fill(String(pivotId));
    await label(kind === 'scale' ? 'Selection scale ratio' : 'Selection angle degrees').fill(String(value));
    await button('Apply transform', panel()).click();
    assert.deepEqual(await state(), moved);
    await undo();
    await drag();
    await f.page.mouse.up();
    assert.deepEqual(await state(), moved);
    await f.page.waitForFunction(() => document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled') === 'false');
    await button('Done editing cage', panel()).click();
    await panel().waitFor({ state: 'detached' });
    await f.ready();
    const accepted = await f.doc();
    const node = accepted.nodes.find(node => node.kind === 'subd');
    assert.equal(node.mirror, 'x');
    assert.deepEqual(node.cage, moved.cage);
    assert.equal((await f.bodies()).bodies.length, 1);
    await f.undo(); await f.same(base);
    await f.redo(); await f.same(accepted);
    const saved = await f.save(`mirrored-${kind}`);
    await f.freshOpen(saved.file, accepted, `${kind}-mirrored-seam-reopened`);
    assert.equal((await f.bodies()).bodies.length, 1);
    f.report.observations.push({ kind, value, mirror: 'x', selectedPoints, pivot, pivotId, maxError, numericParity: true });
  }
});

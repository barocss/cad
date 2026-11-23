import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/sketch/useTwoPointSnap.ts',
  'apps/cad-studio/src/sketch/useSketchActions.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'packages/barocss-cad-model/src/sketch/osnap.ts',
];
const f = await createFlow({
  name: 'two-point-snap-reopened-planes', output: process.argv[2], envFrozen: 'D1816_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Deliver one calculated rectangle corner on a YZ plane and on an oblique world frame.',
  limits: ['Desktop WebGPU, two visible authored construction endpoints, grid off and native Save and fresh Open.'],
  snapshotExtra: () => ({
    draft: ['x', 'y', 'width', 'height'].map(key => document.getElementById('sk-' + key)?.value ?? null),
    form: document.querySelector('[aria-label="Two-point snap"]')?.textContent ?? null,
  }),
});

const A = [2, 4], B = [14, 9], middle = [8, 6.5];
const checks = [
  { name: 'yz', plane: { origin: [7, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0] },
    world: ([u, v]) => [7, u, v], value: '1.5', local: [20, 11.5] },
  { name: 'tilted', plane: { origin: [9, -3, 2], normal: [0, -.6, .8], xAxis: [1, 0, 0] },
    world: ([u, v]) => [9 + u, -3 + .8 * v, 2 + .6 * v], value: '-.5', local: [-4, 1.5] },
];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const form = () => f.page.getByRole('form', { name: 'Two-point snap', exact: true });
const marker = () => f.page.locator('.vp-overlay .sk-osnap').filter({ hasText: 'Calculated' });
const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-8;
function seed(plane) {
  return { format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 1, parameters: {}, outputs: {},
    nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-4, -4], max: [-2, -2], plane,
      sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] },
      construction: [{ kind: 'polygon', construction: true, closed: false, pending: false, points: [A, B], ids: ['e5', 'e6'] }] }],
  };
}
const pixel = point => f.page.evaluate(point => window.__studioScreenOf(point), point);
async function frame(points) {
  for (let attempt = 0; attempt < 9; attempt++) {
    const safe = await f.page.evaluate(points => points.every(point => {
      const [x, y] = window.__studioScreenOf(point);
      const bounds = document.querySelector('canvas.vp-canvas').getBoundingClientRect();
      return x > bounds.left + 20 && y > bounds.top + 20 && x < bounds.right - 20 && y < bounds.bottom - 20
        && !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas');
    }), points);
    if (safe) return;
    const canvas = await f.page.locator('canvas.vp-canvas').boundingBox();
    assert.ok(canvas);
    await f.page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await f.page.mouse.wheel(0, 350);
    await f.page.waitForTimeout(280);
  }
  assert.fail('The authored points could not be framed');
}
async function click(point) {
  const coordinates = await pixel(point);
  assert.ok(coordinates?.every(Number.isFinite));
  assert.ok(await f.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.matches('canvas.vp-canvas'), coordinates), 'The click must land on the canvas');
  await f.page.mouse.move(...coordinates);
  await f.page.mouse.click(...coordinates);
}
function hasRegion(doc, first, second) {
  const lo = first.map((v, axis) => Math.min(v, second[axis]));
  const hi = first.map((v, axis) => Math.max(v, second[axis]));
  const found = doc.nodes.flatMap(node => {
    if (node.kind !== 'sketch') return [];
    return [node.segments, ...(node.regions ?? []), node.profile === 'rectangle'
      ? [[node.min[0], node.min[1]], [node.min[0], node.max[1]], [node.max[0], node.min[1]], [node.max[0], node.max[1]]] : null]
      .filter(Boolean).map(loop => loop.map(edge => edge.start ?? edge));
  });
  return found.some(loop => loop.length === 4 && [lo[0], hi[0]].every(x => [lo[1], hi[1]].every(y =>
    loop.some(([u, v]) => near(u, x) && near(v, y)))));
}

await f.run(async () => {
  for (const check of checks) {
    const source = seed(check.plane);
    await f.newPage();
    await f.openFile({ name: check.name + '-construction.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) }, 1);
    await f.same(source);
    await button('Sketch · rectangle', f.page.getByRole('group', { name: 'History', exact: true })).click();
    await f.editor().waitFor();
    await button('Edit sketch', f.editor()).click();
    await f.sketchPanel().waitFor();
    await f.tool('Rectangle', 'r');
    await frame([A, B, middle, check.local].map(check.world));
    const grid = button('Grid snap');
    for (let index = 0; index < 6 && !(await grid.innerText()).includes('Grid off'); index++) await grid.click();
    assert.match(await grid.innerText(), /Grid off/);

    f.phase = 'Apply the calculated corner on ' + check.name;
    await button('Two-point snap', f.sketchPanel()).click();
    await click(check.world(A));
    await click(check.world(B));
    await form().getByLabel('Snap value').fill(check.value);
    await form().getByRole('status').getByText(`Point ${check.local.join(', ')} mm`, { exact: true }).waitFor();
    await marker().waitFor();
    const projected = await pixel(check.world(check.local));
    const drawn = await marker().locator('rect').evaluate(rect => {
      const box = rect.getBoundingClientRect();
      return [box.left + box.width / 2, box.top + box.height / 2];
    });
    assert.ok(Math.hypot(projected[0] - drawn[0], projected[1] - drawn[1]) < 1);
    await f.snapshot(check.name + '-calculated-point');

    await button('Use point', form()).click();
    await form().waitFor({ state: 'hidden' });
    await f.same(source);
    const drafted = await f.snapshot(check.name + '-first-corner-delivered');
    assert.deepEqual(drafted.draft.map(value => value === null ? null : Number(value)), [...check.local, 0, 0]);
    await click(check.world(middle));
    const rectangle = await f.snapshot(check.name + '-second-corner-accepted');
    assert.deepEqual(rectangle.draft.map(Number), [
      ...check.local.map((value, axis) => Math.min(value, middle[axis])),
      ...check.local.map((value, axis) => Math.abs(value - middle[axis])),
    ]);
    const accepted = (await f.finishSketch(check.name + '-finished')).doc;
    assert.ok(hasRegion(accepted, check.local, middle), JSON.stringify(accepted.nodes));
    assert.deepEqual(accepted.nodes[0].plane, check.plane);
    assert.deepEqual(accepted.nodes[0].construction, source.nodes[0].construction);
    await f.undo(); await f.same(source);
    await f.redo(); await f.same(accepted);
    const saved = await f.save(check.name + '-accepted');
    await f.freshOpen(saved.file, accepted, check.name + '-reopened');
    assert.equal(await form().count(), 0);
    f.report.observations.push({ label: check.name + '-round-trip', plane: check.plane, independentLocal: check.local, world: check.world(check.local) });
  }
});

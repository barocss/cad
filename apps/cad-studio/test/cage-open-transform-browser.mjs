import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const files = [
  'apps/cad-studio/test/cage-open-transform-browser.mjs',
  'apps/cad-studio/src/subd/useCageEditor.ts',
  'apps/cad-studio/src/subd/useCageGizmo.ts',
  'apps/cad-studio/src/subd/cageTransformDraft.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'apps/cad-studio/src/ui/CagePanel.tsx',
  'packages/barocss-cad-model/src/subd/cageEdit.ts',
];
const f = await createFlow({
  name: 'cage-open-transform', output: process.argv[2], envFrozen: 'CAGE_OPEN_TRANSFORM_FROZEN',
  initialFiles: files, requiredFrozen: files,
  qualification: 'Scale an open boundary loop and rotate a single boundary vertex in Studio.',
  limits: ['One four-edge opening in one SubD box. Analytic bounds refer to cage points.'],
});
const panel = () => f.page.getByRole('complementary', { name: 'Cage editor', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const label = name => panel().getByLabel(name, { exact: true });
const state = () => f.page.evaluate(() => window.__studioCage());
const undo = () => button('Undo cage step', panel()).click();
const redo = () => button('Redo cage step', panel()).click();
const coord = (s, id) => s.cage.positions.slice(3 * id, 3 * id + 3);
const done = () => button('Done editing cage', panel());
const readout = () => f.page.locator('.gizmo-readout');
async function command(value) {
  await f.page.getByText('barocss', { exact: true }).click();
  await f.command(value);
}
async function pixel(point) {
  return f.page.evaluate(point => {
    const p = window.__studioScreenOf(point);
    if (!p || !document.elementFromPoint(...p)?.matches('canvas.vp-canvas')) throw Error('The cage point is outside the canvas.');
    return p;
  }, point);
}

function boundaryEdges(cage) {
  const incidence = new Map();
  for (const face of cage.faces) {
    for (let i = 0; i < face.length; i++) {
      const key = [face[i], face[(i + 1) % face.length]].sort((a, b) => a - b).join(':');
      incidence.set(key, (incidence.get(key) ?? 0) + 1);
    }
  }
  return [...incidence].filter(([, count]) => count === 1).map(([key]) => key).sort();
}

function verifyChange(seed, edited, selected, expected) {
  let error = 0;
  for (let id = 0; id < seed.cage.positions.length / 3; id++) {
    const before = coord(seed, id), after = coord(edited, id);
    if (!selected.has(id)) {
      assert.deepEqual(after, before);
      continue;
    }
    const target = expected(before);
    error = Math.max(error, ...after.map((value, axis) => Math.abs(value - target[axis])));
  }
  assert.ok(error < 1e-10, String(error));
  assert.deepEqual(edited.cage.faces, seed.cage.faces);
  assert.deepEqual(edited.cage.creases, seed.cage.creases);
  assert.deepEqual(edited.sel, seed.sel);
  assert.equal(edited.undo, seed.undo + 1);
  return error;
}

async function checkDrag({ seed, base, handle, end, value, snapshot, expected, selected, numeric }) {
  async function start() {
    const [x, y, destX, destY] = await end();
    await f.page.mouse.move(x, y);
    await f.page.locator(`[data-gizmo="${handle}"][data-active="true"]`).waitFor();
    await f.page.mouse.down();
    await f.page.mouse.move(destX, destY, { steps: 14 });
    await readout().filter({ hasText: value }).waitFor();
  }
  await start();
  await f.same(base);
  assert.deepEqual(await state(), seed);
  assert.equal(await done().isDisabled(), true);
  await f.snapshot(snapshot);
  await f.page.mouse.up();
  const edited = await state();
  const maxError = verifyChange(seed, edited, selected, expected);
  await undo(); assert.deepEqual(await state(), seed);
  await redo(); assert.deepEqual(await state(), edited);
  await undo();
  await numeric();
  await button('Apply transform', panel()).click();
  assert.deepEqual(await state(), edited);
  await undo();
  await start();
  await f.page.mouse.up();
  assert.deepEqual(await state(), edited);
  f.report.observations.push({ value, maxError, numericParity: true, boundary: boundaryEdges(edited.cage), picked: seed.sel });
  return edited;
}

await f.run(async () => {
  await f.newPage();
  await f.page.setViewportSize({ width: 1440, height: 1000 });
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  await command('subd box');
  const hud = f.page.getByRole('dialog', { name: 'SubD box', exact: true });
  for (const [name, value] of [['Width X', 30], ['Depth Y', 20], ['Height Z', 16], ['Quads along a side', 4], ['Centre X', 20], ['Centre Y', 30], ['At Z', 10]]) {
    await hud.getByLabel(name, { exact: true }).fill(String(value));
  }
  await hud.locator('.status.ok').waitFor();
  await button('Apply', hud).click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.some(n => n.kind === 'subd'));
  await f.ready();
  const base = await f.doc();
  assert.deepEqual(boundaryEdges(base.nodes[0].cage), []);
  f.phase = 'open the translated cage and select the boundary loop';
  await command('edit cage');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Top').click();
  await button('Box', panel()).click();
  await button('Face', panel()).click();
  const centre = [23.75, 32.5, 26];
  await f.page.mouse.click(...await pixel(centre));
  assert.equal((await state()).sel.faces.length, 1);
  await button('Delete', panel()).click();
  const open = await state();
  const boundary = boundaryEdges(open.cage);
  assert.equal(boundary.length, 4);
  await button('Edge', panel()).click();
  await f.page.mouse.dblclick(...await pixel([23.75, 30, 26]));
  const edge = await state();
  assert.deepEqual(edge.sel.edges.map(ids => [...ids].sort((a, b) => a - b).join(':')).sort(), boundary);
  const edgeVertices = new Set(edge.sel.edges.flat());
  assert.equal(edgeVertices.size, 4);
  f.phase = 'scale the open boundary to half size';
  await label('Cage drag tool').selectOption('scale');
  const scaled = await checkDrag({
    seed: edge, base, handle: 'scale', value: 'relative × 0.5', snapshot: 'open-boundary-half-scale',
    selected: edgeVertices, expected: p => p.map((value, axis) => (value + centre[axis]) / 2),
    end: async () => {
      const rect = await f.page.locator('[data-gizmo="scale"]').boundingBox();
      assert.ok(rect);
      const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
      return [x, y, x - 42, y];
    },
    numeric: async () => {
      await button('Scale selection', panel()).click();
      await label('Selection scale ratio').fill('0.5');
    },
  });
  f.phase = 'rotate one boundary vertex around an unselected point';
  await button('Vertex', panel()).click();
  await f.page.mouse.click(...await pixel([21.875, 31.25, 26]));
  const vertex = await state();
  assert.equal(vertex.sel.vertices.length, 1);
  const [picked] = vertex.sel.vertices;
  assert.ok(edgeVertices.has(picked));
  assert.deepEqual(coord(vertex, picked), [21.875, 31.25, 26]);
  const pivot = [21.875, 33.75, 26];
  const pivotId = [...edgeVertices].find(id => coord(vertex, id).every((value, axis) => value === pivot[axis]));
  assert.ok(pivotId !== undefined && pivotId !== picked);
  await label('Cage drag tool').selectOption('rotate');
  await label('Rotate drag pivot').selectOption('vertex');
  await label('Rotate drag vertex ID').fill(String(pivotId));
  const angle = 15, c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180);
  const rotated = await checkDrag({
    seed: vertex, base, handle: 'turnZ', value: 'Z 15°', snapshot: 'open-single-vertex-turn',
    selected: new Set([picked]),
    expected: ([x, y, z]) => [pivot[0] + c * (x - pivot[0]) - s * (y - pivot[1]),
      pivot[1] + s * (x - pivot[0]) + c * (y - pivot[1]), z],
    end: () => f.page.locator('[data-gizmo="turnZ"] polyline').last().evaluate((arc, { pivot, c, s }) => {
      const rect = arc.closest('svg').getBoundingClientRect();
      const p = arc.points.getItem(Math.floor((arc.points.numberOfItems - 1) / 2));
      const x = rect.x + p.x, y = rect.y + p.y;
      const [cx, cy] = window.__studioScreenOf(pivot);
      return [x, y, cx + c * (x - cx) + s * (y - cy), cy - s * (x - cx) + c * (y - cy)];
    }, { pivot, c, s }),
    numeric: async () => {
      await button('Rotate selection', panel()).click();
      await label('Rotation world axis').selectOption('2');
      await label('Selection pivot').selectOption('vertex');
      await label('Pivot cage vertex').fill(String(pivotId));
      await label('Selection angle degrees').fill(String(angle));
    },
  });
  assert.deepEqual(boundaryEdges(scaled.cage), boundary);
  assert.deepEqual(boundaryEdges(rotated.cage), boundary);
  f.phase = 'accept the open result and verify native Save and Open';
  await f.page.waitForFunction(() => document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled') === 'false');
  await done().click();
  await panel().waitFor({ state: 'detached' });
  await f.ready();
  const accepted = await f.doc();
  assert.deepEqual(accepted.nodes[0].cage, rotated.cage);
  await f.page.locator('.corner-left').filter({ hasText: /1 open surface/ }).waitFor();
  await f.undo(); await f.same(base);
  await f.redo(); await f.same(accepted);
  const saved = await f.save('open-cage-transformed');
  await f.freshOpen(saved.file, accepted, 'open-cage-transformed-reopened');
  await f.page.locator('.corner-left').filter({ hasText: /1 open surface/ }).waitFor();
});

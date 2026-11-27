import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const height = 3;
const corners = [[20, 20], [20, -12], [15, 20]];
const inward = [[-1, -1], [-1, 1], [1, -1]];
const anchor = [...corners[0], height / 2];
const direction = [Math.SQRT1_2, Math.SQRT1_2, 0];
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, -12], [20, -12], [20, 20], [15, 20], [15, 15], [5, 15], [5, 20], [0, 20]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const edges = ['n1.side1|n1.side2', 'n1.side0|n1.side1', 'n1.side2|n1.side3'];
const f = await createFlow({
  name: 'parallel-fillet-radius', output: process.argv[2], envFrozen: 'D2056_SOURCE_FROZEN',
  qualification: 'Drag the shared radius of three original parallel convex Fillet edges in creation and History.',
  limits: ['Original D1870 upright polygon, three convex vertical straight edges and one constant circular radius.'],
  initialFiles: ['apps/cad-studio/src/state/historyFilletRadiusReceipt.ts', 'apps/cad-studio/src/app/useHistoryFilletRadius.ts',
    'packages/barocss-cad-model/src/app/commands.ts', 'apps/cad-studio/src/viewport/useCommandGizmos.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ key, brep }] = partBreps(doc);
const faces = brep.faces.map(face => ({ name: face.name, ...faceGeometry(face) }));
console.log(JSON.stringify({ key, hash: digestOf(brep), report: checkBrep(brep, { strict: true }),
  volume: brepMassProperties(brep, 1).volume, faces, heights: [...new Set(brep.vertices.map(v => v.point[2]))].sort() }));
`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const hud = () => f.page.locator('.hud');
const handle = key => f.page.locator(`g.gizmo-handle[data-handle="${key}"]`);
const field = () => hud().getByLabel('Radius', { exact: true });
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
const midpoint = key => handle(key).locator('circle').boundingBox().then(({ x, y, width, height }) => [x + width / 2, y + height / 2]);
const preview = () => hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
async function orbit(yaw, pitch) {
  const camera = () => f.page.evaluate(() => window.__studioCamera());
  const box = await f.page.locator('.vp-canvas').boundingBox();
  for (let i = 0; i < 3; i++) {
    const c = await camera(), dx = (c.yaw - yaw) / .008, dy = (pitch - c.pitch) / .008;
    if (Math.hypot(dx, dy) < .05) break;
    const x = box.x + box.width * .55, y = box.y + box.height * .55;
    await f.page.mouse.move(x, y);
    await f.page.mouse.down({ button: 'right' });
    await f.page.mouse.move(x + dx, y + dy, { steps: 12 });
    await f.page.mouse.up({ button: 'right' });
  }
  const c = await camera();
  close(c.yaw, yaw, .003);
  close(c.pitch, pitch, .003);
  assert.ok(c.ortho);
}
async function view(pitch = .38) {
  await button('Iso').click();
  const ortho = button('Ortho');
  if (await ortho.getAttribute('aria-pressed') !== 'true') await ortho.click();
  await orbit(Math.PI / 4, pitch);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}
async function verify(doc, label, radius) {
  const node = doc.nodes.at(-1);
  assert.equal(node.radius, radius);
  assert.deepEqual(node.edges, edges);
  assert.deepEqual(Object.keys(node.sigs).sort(), [...edges].sort());
  const n = await f.inspect(label, doc);
  assert.ok(n.report.valid, JSON.stringify(n.report.issues));
  assert.deepEqual(n.heights, [0, height]);
  assert.deepEqual([n.report.counts.bodies, n.report.counts.faces, n.report.counts.edges, n.report.counts.vertices], [1, 13, 33, 22]);
  const volume = height * (590 - 3 * (1 - Math.PI / 4) * radius ** 2);
  close(n.volume, volume);
  close((await f.bodies()).bodies[0].volume, volume);
  const cylinders = n.faces.filter(face => face.kind === 'cylinder');
  assert.equal(cylinders.length, 3);
  for (const [i, [x, y]] of corners.entries()) {
    const centre = [x + inward[i][0] * radius, y + inward[i][1] * radius];
    const matches = cylinders.filter(wall => Math.hypot(wall.c[0] - centre[0], wall.c[1] - centre[1]) < 1e-8);
    assert.equal(matches.length, 1);
    const [wall] = matches;
    assert.equal(wall.out, 1);
    close(Math.hypot(wall.a[0], wall.a[1]), 0);
    close(Math.abs(wall.a[2]), 1);
    close(wall.r, radius);
  }
  f.report.observations.push({ label, radius, volume: n.volume, hash: n.hash });
  return n.hash;
}
async function atOriginalEdge(key, radius) {
  const expected = await f.screenOf(anchor.map((x, i) => x + radius * direction[i]));
  const actual = await midpoint(key);
  return { expected, actual, errorPx: Math.hypot(expected[0] - actual[0], expected[1] - actual[1]) };
}
async function drag(key, before, start, end, label) {
  await orbit(Math.PI / 4, 0);
  assert.ok((await atOriginalEdge(key, start)).errorPx < .75);
  const [a, b, z] = await Promise.all([f.screenOf(anchor), f.screenOf(anchor.map((value, i) => value + 10 * direction[i])),
    f.screenOf([anchor[0], anchor[1], anchor[2] + 1])]);
  const projection = Math.hypot(a[0] - b[0], a[1] - b[1]);
  assert.ok(projection < .15);
  const pixelsPerMm = Math.hypot(a[0] - z[0], a[1] - z[1]);
  const [x, y] = await midpoint(key);
  await f.page.mouse.move(x, y);
  await f.page.mouse.down();
  await f.page.mouse.move(x, y - pixelsPerMm * (end - start), { steps: 8 });
  await f.page.locator('.gizmo-readout').filter({ hasText: /Radius/ }).waitFor();
  assert.equal(Number(await field().inputValue()), end);
  await preview();
  await f.same(before);
  await f.snapshot(label);
  await f.page.mouse.up();
  assert.equal(Number(await field().inputValue()), end);
  f.report.observations.push({ label, start, end, projection, pixelsPerMm });
}
async function openHistory() {
  await f.openFeatureEditor(2, 'shared Fillet radius');
  if (!baseline) await handle('r').locator('title').filter({ hasText: /when viewed end-on/ }).waitFor({ state: 'attached' });
}
await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'three-vertical-edges.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  await view();
  f.phase = 'Select the three original native edges in the viewport';
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  for (const [i, corner] of corners.entries()) {
    if (i) await f.page.keyboard.down('Shift');
    try { await f.worldClick([...corner, height / 2]); } finally { if (i) await f.page.keyboard.up('Shift'); }
    await f.page.waitForFunction(count => window.__studioSelection.selection.edges.length === count, i + 1);
  }
  if (await button('Close chat').isVisible()) await button('Close chat').click();
  await f.command('Fillet');
  await field().fill('0.5');
  await preview();
  await drag('radius', source, .5, 1, '01-create-shared-radius');
  await button('Apply', hud()).click();
  await f.changed(source);
  const created = await f.doc();
  await verify(created, 'created-native', 1);

  f.phase = 'Open the History radius handle';
  await view();
  await openHistory();
  const before = await atOriginalEdge('r', 1);
  const ownsOriginal = (await handle('r').locator('title').allTextContents()).some(text => text.includes('when viewed end-on'));
  f.report.observations.push({ label: 'history-anchor', ...before, ownsOriginal });
  await f.snapshot(baseline ? '02-history-old-anchor' : '02-history-original-anchor');
  if (baseline) {
    assert.ok(before.errorPx > 5 && !ownsOriginal);
    return;
  }
  assert.ok(before.errorPx < .75 && ownsOriginal);
  await drag('r', created, 1, 2, '03-history-cancel-preview');
  await button('Cancel', hud()).click();
  await f.same(created);
  if (!(await f.editor().isVisible())) await openHistory();
  await drag('r', created, 1, 2, '04-history-apply-preview');
  await button('Apply', hud()).click();
  await f.changed(created);
  const edited = await f.doc();
  assert.deepEqual(edited, { ...created, nodes: [...created.nodes.slice(0, 2), { ...created.nodes[2], radius: 2 }] });
  const shape = await verify(edited, 'history-native', 2);
  await f.undo();
  await f.same(created);
  await f.redo();
  await f.same(edited);
  await f.undo();
  await f.same(created);
  if (!(await f.editor().isVisible())) await openHistory();
  await f.editor().getByLabel('Radius', { exact: true }).fill('2');
  await f.applyEditor(created, '05-typed-radius');
  await f.same(edited);
  assert.equal(await verify(edited, 'typed-native', 2), shape);
  const saved = await f.save('three-parallel-fillets');
  const reopened = await f.freshOpen(saved.file, edited, '06-fresh-open');
  assert.equal(await verify(reopened.doc, 'reopened-native', 2), shape);
  await view();
  await f.snapshot('07-reopened-three-fillets');
});

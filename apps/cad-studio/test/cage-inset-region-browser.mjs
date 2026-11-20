import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/cage-inset-region-browser.mjs',
  'apps/cad-studio/src/ui/CagePanel.tsx',
  'apps/cad-studio/src/ui/CageInsetControls.tsx',
  'apps/cad-studio/src/subd/cageInsetDraft.ts',
  'apps/cad-studio/src/subd/useCageEditor.ts',
  'packages/barocss-cad-model/src/subd/cageEdit.ts',
  'packages/barocss-cad-model/src/subd/cageInset.ts',
  'packages/barocss-cad/src/features/subd-cage.ts',
];
const manifest = process.env.CAGE_INSET_REGION_FROZEN_LIST;
const extraFrozen = manifest ? (await readFile(manifest, 'utf8')).split(/\r?\n/).filter(Boolean) : [];
const f = await createFlow({
  name: 'cage-inset-region',
  output: process.argv[2],
  envFrozen: 'CAGE_INSET_REGION_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  extraFrozen,
  qualification: 'Shift-pick adjacent top quads, inset one continuous border, extrude both inset faces, and Save and Open the accepted solid.',
  limits: ['One desktop Chrome WebGPU fixture with two adjacent coplanar quads. The distance is measured on the cage.'],
  snapshotExtra: () => ({ cage: window.__studioCage?.() ?? null }),
});

const panel = () => f.page.getByRole('complementary', { name: 'Cage editor', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const cageButton = name => button(name, panel());
const field = () => panel().getByLabel('Inset distance mm', { exact: true });
const state = () => f.page.evaluate(() => window.__studioCage());
const command = async text => {
  await f.page.getByText('barocss', { exact: true }).click();
  await f.command(text);
};
const screenOf = point => f.page.evaluate(p => window.__studioScreenOf(p), point);
const pointOf = (cage, vertex) => cage.positions.slice(3 * vertex, 3 * vertex + 3);
const faceIds = [90, 86];
const originalSeam = [93, 94];
const sortedVertices = ids => [...ids].sort((a, b) => a - b);
const faceKey = ids => sortedVertices(ids).join(',');

async function selectRegion() {
  await command('edit cage');
  await panel().waitFor();
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await cageButton('Box').click();
  await cageButton('Vertex').click();
  await cageButton('Face').click();

  const first = await screenOf([3.75, 2.5, 16]);
  assert.ok(first);
  await f.page.mouse.click(...first);
  await f.page.waitForFunction(() => window.__studioCage().sel.faces.length === 1);
  assert.deepEqual((await state()).sel.faces, [90]);
  assert.ok(await cageButton('Inset face').isEnabled());

  const second = await screenOf([-3.75, 2.5, 16]);
  assert.ok(second);
  await f.page.keyboard.down('Shift');
  try {
    await f.page.mouse.click(...second);
  } finally {
    await f.page.keyboard.up('Shift');
  }
  await f.page.waitForFunction(() => window.__studioCage().sel.faces.length === 2);
  const selected = await state();
  assert.deepEqual(selected.sel.faces, faceIds);
  assert.equal(selected.undo, 0);
  assert.ok(await cageButton('Inset region').isEnabled());
  return selected;
}

function checkRegion(before, after, distance) {
  const original = before.cage;
  const inset = after.cage;
  assert.deepEqual(sortedVertices(after.sel.faces), sortedVertices(faceIds));
  assert.deepEqual(after.sel.edges, []);
  assert.deepEqual(after.sel.vertices, []);
  assert.equal(after.undo, 1);

  // The selected patch spans X = [-7.5, 7.5] and Y = [0, 5] at Z = 16.
  // Its two collinear Y borders each cross the seam at X = 0.
  const [right, left] = faceIds.map(id => original.faces[id]);
  assert.deepEqual(sortedVertices(right.filter(v => left.includes(v))), originalSeam);
  const firstNew = original.positions.length / 3;
  assert.equal(inset.positions.length, original.positions.length + 18);
  assert.deepEqual(inset.positions.slice(0, original.positions.length), original.positions);
  const copy = new Map();
  for (const vertex of new Set([...right, ...left])) {
    const [x, y, z] = pointOf(original, vertex);
    assert.equal(z, 16);
    assert.ok([-7.5, 0, 7.5].includes(x));
    assert.ok([0, 5].includes(y));
    const expected = [x - Math.sign(x) * distance, y === 0 ? distance : 5 - distance, 16];
    const matches = Array.from({ length: 6 }, (_, i) => firstNew + i).filter(id =>
      pointOf(inset, id).every((coordinate, axis) => Math.abs(coordinate - expected[axis]) < 1e-9));
    assert.equal(matches.length, 1, `Inset point for source vertex ${vertex}`);
    copy.set(vertex, matches[0]);
  }
  const innerSeam = originalSeam.map(vertex => copy.get(vertex));
  for (const [id, face] of original.faces.entries()) {
    if (faceIds.includes(id)) {
      assert.equal(faceKey(inset.faces[id]), faceKey(face.map(vertex => copy.get(vertex))));
      assert.ok(innerSeam.every(vertex => inset.faces[id].includes(vertex)));
    } else {
      assert.deepEqual(inset.faces[id], face);
    }
  }
  const outerEdges = [[93, 96], [96, 97], [97, 94], [94, 91], [91, 90], [90, 93]];
  const expectedRing = outerEdges.map(([a, b]) => faceKey([a, b, copy.get(a), copy.get(b)])).sort();
  const ring = inset.faces.slice(original.faces.length);
  assert.equal(ring.length, 6);
  assert.deepEqual(ring.map(faceKey).sort(), expectedRing);
  assert.ok(ring.every(face => !originalSeam.every(vertex => face.includes(vertex))));
  assert.ok(ring.every(face => !innerSeam.every(vertex => face.includes(vertex))));
  return { distance, outerEdges, innerSeam, innerSeamPoints: innerSeam.map(id => pointOf(inset, id)) };
}

async function solid(label) {
  await f.ready();
  assert.match(await f.page.locator('.corner-left').innerText(), /\b1 solid\b/);
  const result = await f.bodies();
  assert.equal(result.bodies.length, 1);
  const [{ volume }] = result.bodies;
  assert.ok(Number.isFinite(volume) && volume > 0);
  f.report.observations.push({ label, nativeSolidCount: 1, volume });
  return volume;
}

await f.run(async () => {
  f.phase = 'create desktop box';
  await f.newPage();
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  const empty = await f.doc();
  await command('subd box');
  const hud = f.page.getByRole('dialog', { name: 'SubD box', exact: true });
  const dimensions = [['Width X', 30], ['Depth Y', 20], ['Height Z', 16], ['Quads along a side', 4],
    ['Centre X', 0], ['Centre Y', 0], ['At Z', 0]];
  for (const [name, value] of dimensions) await hud.getByLabel(name, { exact: true }).fill(String(value));
  await hud.locator('.status.ok').waitFor();
  await button('Apply', hud).click();
  await f.changed(empty);
  const base = await f.doc();
  await solid('base box');

  f.phase = 'select adjacent quads with Shift';
  const selected = await selectRegion();
  assert.equal(selected.cage.faces.length, 96);
  assert.deepEqual(selected.cage, base.nodes.find(node => node.kind === 'subd').cage);
  await f.snapshot('01-two-adjacent-quads');

  f.phase = 'replace preview and reject a collapsed region';
  await cageButton('Inset region').click();
  for (const distance of [0.5, 1.5]) {
    await field().fill(String(distance));
    const preview = await state();
    f.report.observations.push(checkRegion(selected, preview, distance));
    assert.equal(await cageButton('Done editing cage').getAttribute('aria-disabled'), 'true');
    await f.same(base);
  }
  await field().fill('2.5');
  assert.deepEqual(await state(), selected);
  assert.ok(await cageButton('Apply inset').isDisabled());
  await f.same(base);
  await f.snapshot('02-collapsed-region-refused');

  f.phase = 'cancel preview and cancel a cage edit after Apply';
  await field().fill('1');
  checkRegion(selected, await state(), 1);
  await cageButton('Cancel inset preview').click();
  await field().waitFor({ state: 'detached' });
  assert.deepEqual(await state(), selected);
  await cageButton('Inset region').click();
  await cageButton('Apply inset').click({ timeout: 60000 });
  await field().waitFor({ state: 'detached' });
  checkRegion(selected, await state(), 1);
  await cageButton('Cancel cage edit').click();
  await panel().waitFor({ state: 'detached' });
  await f.same(base);
  await f.undo();
  await f.same(empty);
  await f.redo();
  await f.same(base);

  f.phase = 'apply one continuous inset and check cage history';
  const reselected = await selectRegion();
  assert.deepEqual(reselected, selected);
  await cageButton('Inset region').click();
  await field().fill('1');
  const inset = await state();
  f.report.observations.push(checkRegion(reselected, inset, 1));
  await f.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button =>
    button.textContent === 'Apply inset' && !button.disabled), null, { timeout: 60000 });
  await f.snapshot('03-one-millimetre-inset');
  await cageButton('Apply inset').click({ timeout: 60000 });
  await field().waitFor({ state: 'detached' });
  assert.deepEqual(await state(), inset);
  await cageButton('Undo cage step').click();
  assert.deepEqual(await state(), reselected);
  assert.ok(await cageButton('Undo cage step').isDisabled());
  await cageButton('Redo cage step').click();
  assert.deepEqual(await state(), inset);
  await f.same(base);

  f.phase = 'extrude the selected inset faces together';
  await button('Iso').click();
  await f.page.waitForTimeout(250);
  await cageButton('Extrude').click();
  const extruded = await state();
  assert.equal(extruded.undo, 2);
  assert.equal(extruded.cage.faces.length, inset.cage.faces.length + 6);
  assert.deepEqual(sortedVertices(extruded.sel.faces), sortedVertices(faceIds));
  const arrow = f.page.locator('.gizmo-arrow[data-gizmo="moveZ"] polygon');
  await arrow.waitFor();
  const box = await arrow.boundingBox();
  assert.ok(box);
  const from = await screenOf([0, 2.5, 16]);
  const to = await screenOf([0, 2.5, 18]);
  assert.ok(from && to);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await f.page.mouse.move(x, y);
  await f.page.mouse.down();
  try {
    await f.page.mouse.move(x + to[0] - from[0], y + to[1] - from[1], { steps: 12 });
  } finally {
    await f.page.mouse.up();
  }
  const moved = await state();
  assert.equal(moved.undo, 3);
  const caps = moved.sel.faces.map(id => moved.cage.faces[id]);
  assert.equal(new Set(caps.flat()).size, 6);
  for (const vertex of caps.flat()) assert.ok(Math.abs(pointOf(moved.cage, vertex)[2] - 18) < 1e-6);
  assert.deepEqual(moved.cage.positions.slice(0, inset.cage.positions.length), inset.cage.positions);
  await cageButton('Undo cage step').click();
  assert.deepEqual(await state(), extruded);
  await cageButton('Redo cage step').click();
  assert.deepEqual(await state(), moved);
  await f.same(base);
  await f.snapshot('04-connected-inset-extruded');

  f.phase = 'accept the native solid and check document history';
  await cageButton('Done editing cage').click({ timeout: 60000 });
  await panel().waitFor({ state: 'detached' });
  await f.changed(base);
  const accepted = await f.doc();
  assert.deepEqual(accepted.nodes.find(node => node.kind === 'subd').cage, moved.cage);
  const acceptedVolume = await solid('accepted extrusion');
  await f.undo();
  await f.same(base);
  await f.redo();
  await f.same(accepted);

  const saved = await f.save('connected-inset-extruded');
  await f.freshOpen(saved.file, accepted, '05-fresh-open');
  const reopenedVolume = await solid('fresh Open extrusion');
  assert.ok(Math.abs(reopenedVolume - acceptedVolume) < 1e-6);
});

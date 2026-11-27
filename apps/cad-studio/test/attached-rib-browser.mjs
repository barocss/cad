import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand, openModelGroup } from './model-rail-helper.mjs';

const pins = [
  'packages/barocss-cad-model/src/app/attachedRibCommand.ts', 'apps/cad-studio/src/app/studioConstants.ts',
  'apps/cad-studio/src/app/useStudioCommandEntry.ts', 'apps/cad-studio/src/viewport/camera.ts', 'apps/cad-studio/test/attached-rib-browser.mjs',
  'packages/barocss-cad-model/src/engine/attachedRib.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
];
const f = await createFlow({
  name: 'attached-rib', output: process.argv[2], envFrozen: 'ATTACHED_RIB_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: '#755 attach a native Rib to the original top and bottom faces and follow thickness changes',
  limits: ['One original XY rectangular extrusion on desktop WebGPU. Other geometries and manufacturing are outside this fixture.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const parts = partBreps(doc), brep = parts[0].brep;
const properties = brepMassProperties(brep, 1);
const z = brep.vertices.map(vertex => vertex.point[2]);
console.log(JSON.stringify({ partCount: parts.length, kind: brep.bodies[0].kind,
  valid: checkBrep(brep, { strict: true }).valid, closed: brep.shells.every(shell => shell.closed),
  volume: properties.volume, centerZ: properties.centroid[2], z: [Math.min(...z), Math.max(...z)] }));
`,
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { H: 10 }, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: { parameter: 'H' } },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Rib', exact: true });
const field = name => hud().getByLabel(name, { exact: true });
const status = name => hud().locator('.status').filter({ hasText: new RegExp(`^${name}$`) });
const history = async () => [await button('Undo').isEnabled(), await button('Redo').isEnabled()];
async function open() {
  await f.newPage();
  await f.openFile({ name: 'rib-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, seed.nodes.length);
  await f.same(seed);
}
async function select(view, point) {
  if (view === 'Bottom') {
    await button('View cube directions', f.page.getByRole('group', { name: 'View cube' })).click();
    await f.page.getByRole('menuitem', { name: 'Bottom', exact: true }).click();
  } else await button(view, f.page.locator('.views')).click();
  await f.page.waitForFunction(view => document.querySelector('.view-cube .vc-label')?.textContent === view.toUpperCase(), view);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const pick = button('Selection filter');
  for (let i = 0; i < 4 && !(await pick.innerText()).includes('Faces'); i++) await pick.click();
  assert.match(await pick.innerText(), /Faces/);
  const position = await f.page.evaluate(world => window.__studioScreenOf(world), point);
  assert.equal(position?.length, 2);
  await f.page.mouse.click(...position);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
}
async function preview(side, historyBefore) {
  await status('preview').waitFor();
  await f.page.waitForFunction(() => Math.abs(window.__studioSection().shownVolume - 12200) < .02);
  const pitch = await f.page.evaluate(() => window.__studioCamera().pitch);
  assert.ok(Math.abs(pitch - (side === 'top' ? 1 : -1) * Math.PI / 5) < 1e-10);
  assert.match(await hud().innerText(), side === 'top' ? /Top · \+Z.*n1\.top/ : /Bottom · −Z.*n1\.bottom/);
  for (const [name, expected] of [['Length', '20'], ['Width', '2'], ['Protrusion', '5']])
    assert.equal(await field(name).inputValue(), expected);
  await f.same(seed);
  assert.deepEqual(await history(), historyBefore);
}
async function verify(label, doc, side, stockHeight) {
  const proof = await f.inspect(label, doc);
  const volume = 1200 * stockHeight + 200;
  const expectedZ = (1200 * stockHeight * stockHeight / 2 + 200 * (side === 'top' ? stockHeight + 2.5 : -2.5)) / volume;
  assert.ok(Math.abs(proof.volume - volume) < 1e-8);
  assert.ok(Math.abs(proof.centerZ - expectedZ) < 1e-10);
  assert.deepEqual(proof.z, side === 'top' ? [0, stockHeight + 5] : [-5, stockHeight]);
  assert.deepEqual([proof.partCount, proof.kind, proof.valid, proof.closed], [1, 'solid', true, true]);
  f.report.observations.push({ label, side, stockHeight, ...proof });
  return proof;
}

await f.run(async () => {
  await open();
  f.phase = 'Reject a selected vertical stock face';
  const sideHistory = await history();
  await select('Front', [20, 0, 5]);
  const create = await openModelGroup(f.page, 'Create');
  const rib = button('Rib', create);
  const reason = await rib.getAttribute('data-tip-off');
  assert.match(reason, /original top or bottom face/);
  await rib.click();
  assert.equal(await hud().count(), 0);
  await f.page.getByText(reason, { exact: true }).waitFor();
  await f.same(seed);
  assert.deepEqual(await history(), sideHistory);
  await f.snapshot('01-vertical-face-unavailable');

  for (const side of ['top', 'bottom']) {
    f.phase = `Preview the original ${side} attachment`;
    await open();
    const pickSide = () => select(side === 'top' ? 'Top' : 'Bottom', [20, 15, side === 'top' ? 10 : 0]);
    const historyBefore = await history();
    await pickSide();
    await clickModelCommand(f.page, 'Create', 'Rib');
    await preview(side, historyBefore);
    await f.snapshot(`02-${side}-preview`);
    if (side === 'top') {
      await field('Protrusion').fill('0');
      await status('refused').waitFor();
      assert.equal(await button('Apply', hud()).isEnabled(), false);
      await field('Protrusion').fill('5');
      await status('preview').waitFor();
      await field('Centre X').fill('60');
      await status('refused').waitFor();
      assert.equal(await button('Apply', hud()).isEnabled(), false);
      await hud().getByText('Kernel detail', { exact: true }).click();
      await hud().getByText(/current cap must fully support the Rib footprint/).waitFor();
      await f.same(seed);
      assert.deepEqual(await history(), historyBefore);
      await f.snapshot('03-outside-footprint-refused');
    }
    await button('Cancel', hud()).click();
    await hud().waitFor({ state: 'hidden' });
    await f.same(seed);
    assert.deepEqual(await history(), historyBefore);

    await pickSide();
    await clickModelCommand(f.page, 'Create', 'Rib');
    await preview(side, historyBefore);
    await button('Apply', hud()).click();
    await f.changed(seed);
    const accepted = await f.doc(), node = accepted.nodes.at(-1);
    assert.equal(accepted.nodes.length, 3);
    assert.equal(node.kind, 'rib');
    assert.deepEqual(Object.keys(node.sigs), [`n1.${side}`]);
    assert.deepEqual(node.sigs[`n1.${side}`].d, [0, 0, side === 'top' ? 1 : -1]);
    await verify(`04-${side}-native`, accepted, side, 10);
    await f.undo();
    await f.same(seed);
    await f.redo();
    await f.same(accepted);

    f.phase = `Change thickness while following the original ${side} face`;
    await f.setParameter('H', 12, `05-${side}-thickness-12`);
    const thickened = await f.doc();
    assert.deepEqual(thickened.nodes.at(-1), node);
    const native = await verify(`05-${side}-native`, thickened, side, 12);
    const saved = await f.save(`06-${side}-rib`);
    await f.freshOpen(saved.file, thickened, `06-${side}-reopened`);
    const historyLabel = `Rib · ${side === 'top' ? 'Top' : 'Bottom'} n1.${side} · 20 × 2 × 5 mm`;
    await f.page.getByRole('group', { name: 'History', exact: true }).getByRole('button', { name: historyLabel, exact: true }).waitFor();
    assert.deepEqual(await verify(`06-${side}-native`, await f.doc(), side, 12), native);
    if (side === 'bottom') {
      await button('Iso', f.page.locator('.views')).click();
      const viewport = await f.page.locator('.vp-canvas').boundingBox();
      assert.ok(viewport);
      const x = viewport.x + viewport.width / 2, y = viewport.y + viewport.height / 2;
      await f.page.mouse.move(x, y);
      await f.page.mouse.down({ button: 'right' });
      await f.page.mouse.move(x, y - 160, { steps: 12 });
      await f.page.mouse.up({ button: 'right' });
      await f.page.waitForFunction(() => window.__studioCamera().pitch < -.5);
      await f.snapshot('06-bottom-reopened-underside');
    }
  }
});

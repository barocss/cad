import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/Hud.tsx',
  'apps/cad-studio/src/app/transformFacePick.ts', 'packages/barocss-cad-model/src/app/commands.ts'];
const f = await createFlow({
  name: 'mirror-original-plane', output: process.argv[2], envFrozen: 'D1200_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Mirror uses the original bottom across Z=0 instead of the top of its preview.',
  limits: ['Desktop WebGPU, one native box, one merged preview and one physically clicked bottom face.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partSnapshot(doc).outputs.map(output => ({
  valid: checkBrep(output.brep, { strict: true }).valid,
  volume: massPropertiesOf(output).volume, centroid: massPropertiesOf(output).centroid,
  vertices: output.brep.vertices.map(vertex => vertex.point),
}))));
`,
});
const baseline = process.argv.includes('--baseline');
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 24], id: 'n0' },
    { kind: 'extrude', sketch: 0, height: 10, id: 'n1' },
    { kind: 'hole', parent: { node: 1, side: 'solid' }, axis: 'z', side: 'max', center: [11, 7], radius: 2, id: 'n2' },
  ],
  outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Mirror', exact: true });
const field = label => hud().getByLabel(label, { exact: true });
async function clickAt(point) {
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), point);
  assert.ok(pixel?.length === 2);
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel), JSON.stringify(pixel));
  await f.page.mouse.click(...pixel);
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);
async function native(label, doc, offset) {
  const output = await f.inspect(label, doc);
  assert.equal(output.length, 1);
  const { valid, volume, centroid, vertices } = output[0];
  assert.equal(valid, true);
  const holeVolume = 2 * Math.PI * 4 * 10, expected = 19200 - holeVolume;
  near(volume, expected);
  [(19200 * 20 - holeVolume * 11) / expected, (19200 * 12 - holeVolume * 7) / expected, offset].forEach((value, k) => near(centroid[k], value));
  const min = [Math.min, Math.max].map(op => [0, 1, 2].map(k => op(...vertices.map(point => point[k]))));
  const wanted = [[0, 0, offset - 10], [40, 24, offset + 10]];
  min.forEach((corner, j) => corner.forEach((value, k) => near(value, wanted[j][k])));
  f.report.observations.push({ label, volume, centroid, bounds: min });
}
await f.run(async () => {
  await f.newPage();
  await f.page.setViewportSize({width:Number(process.argv[3]) || 1440,height:900});
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'mirror-plane.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('View cube directions').click();
  await f.page.getByRole('menu', { name: 'View cube directions', exact: true }).getByRole('menuitem', { name: 'Bottom', exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const body = f.page.getByRole('complementary', { name: 'Browser', exact: true }).locator('.ol:not(.ol-step)').first();
  await body.click();
  await clickModelCommand(f.page, 'Pattern', 'Mirror');
  await field('Plane at').fill('0');
  await hud().locator('.status.ok').waitFor();
  await f.page.waitForFunction(() => window.__studioSection().shownKeys.join() === 'b3');
  await f.snapshot('merged-mirror-preview');
  if (!baseline) {
    await clickAt([24, 14, 0]);
    await f.waitToast(/Mirror plane not selected/);
    assert.equal(await field('Plane').inputValue(), 'yz');
    assert.equal(await field('Plane at').inputValue(), '0');
    await f.same(seed);
    await f.snapshot('generated-face-refused');
    await button('Pick plane', hud()).click();
    await f.page.waitForFunction(() => window.__studioSection().shownKeys.join() === 'b2');
    await f.same(seed);
    assert.equal(await button('Apply', hud()).isDisabled(), true);
    assert.equal(await f.page.locator('.toast').filter({hasText:'Mirror plane not selected'}).count(), 0);
    await f.snapshot('original-plane-pick-mode');
  }
  await clickAt([24, 14, 0]);
  if (!baseline) await hud().getByText('n1.bottom', { exact: true }).waitFor();
  await hud().locator('.status.ok').waitFor();
  assert.equal(await field('Plane').inputValue(), 'xy');
  assert.equal(await field('Plane at').inputValue(), baseline ? '10' : '0');
  await button('Pick plane', hud()).click();
  await f.page.waitForFunction(() => window.__studioSection().shownKeys.join() === 'b2');
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  assert.match(await hud().innerText(), /Previous face/);
  assert.match(await hud().innerText(), /Cancel plane pick restores/);
  await clickAt([40, 12, 0]);
  await f.waitToast(/Mirror plane not selected/);
  assert.match(await f.page.locator('.toast').innerText(), /Click an original planar face/);
  assert.doesNotMatch(await f.page.locator('.toast').innerText(), /Use Pick plane/);
  assert.equal(await field('Plane').inputValue(), 'xy');
  assert.equal(await field('Plane at').inputValue(), '0');
  await button('Cancel plane pick', hud()).focus();
  await f.page.keyboard.press('Enter');
  await hud().locator('.status.ok').waitFor();
  assert.equal(await button('Pick plane', hud()).count(), 1);
  assert.equal(await f.page.locator('.toast').filter({hasText:'Mirror plane not selected'}).count(), 0);
  assert.doesNotMatch(await hud().innerText(), /Previous face|XY at Z/);
  await f.same(seed);
  await button('Pick plane', hud()).click();
  await f.page.waitForFunction(() => window.__studioSection().shownKeys.join() === 'b2');
  await clickAt([24, 14, 0]);
  await hud().locator('.status.ok').waitFor();
  assert.match(await hud().innerText(), /Later face changes do not move the mirror plane/);
  await f.snapshot('clicked-bottom');
  await f.same(seed);
  await button('Apply', hud()).click();
  await f.changed(seed);
  const applied = (await f.snapshot('mirror-applied')).doc;
  await native('mirror-native', applied, baseline ? 10 : 0);
  if (baseline) throw new Error('Original bottom click in merged preview used the top Z=10 instead of bottom Z=0.');
  assert.deepEqual(applied.nodes.at(-1), { kind: 'mirror', parent: { node: 2, side: 'solid' }, plane: 'xy', id: 'n3', made: { command: 'mirror', values: { plane: 'xy', at: 0 }, nodes: 1 } });
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(applied);
  const [reopen] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await reopen.setFiles({ name: 'mirror-reopened.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(applied)) });
  await f.same(applied);
  assert.deepEqual(f.report.downloads, []);
  await native('mirror-reopened-native', applied, 0);
  await f.page.getByRole('complementary', { name: 'Browser', exact: true }).locator('.ol:not(.ol-step)').first().click();
  await clickModelCommand(f.page, 'Pattern', 'Mirror');
  await button('Pick plane', hud()).click();
  await button('Cancel plane pick', hud()).waitFor();
  await f.page.keyboard.press('Escape');
  await hud().waitFor({ state: 'hidden' });
  await f.same(applied);
});

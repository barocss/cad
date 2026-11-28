import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/sphere-tangent-bore-browser.mjs',
  'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
];
const f = await createFlow({
  name: 'sphere-tangent-bore', output: process.argv[2], envFrozen: 'SPHERE_TANGENT_BORE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Check the reduced internally tangent sphere-cylinder Difference through the actual Studio controls.',
  limits: ['One sphere of radius 3 mm and a parallel-axis through bore of radius 2 mm offset by 1 mm.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify(outputs.map(output => ({ check: checkBrep(output.brep, { strict: true }), mass: massPropertiesOf(output) }))));
`,
});

const ref = node => ({ node, side: 'solid' });
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, -3] }, { kind: 'arc', start: [0, 3], center: [0, 0], direction: 'cw' },
    ], plane: { origin: [0, 0, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } },
    { id: 'n1', kind: 'revolve', sketch: 0, axis: 'y', angle: 360 },
    { id: 'n2', kind: 'rotate', parent: ref(1), axis: 'y', angle: 270 },
    { id: 'n3', kind: 'rotate', parent: ref(2), axis: 'z', angle: 270 },
    { id: 'n4', kind: 'translate', parent: ref(3), offset: [2, -2, -2] },
    { id: 'n5', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 },
    { id: 'n6', kind: 'extrude', sketch: 5, height: 6 },
    { id: 'n7', kind: 'rotate', parent: ref(6), axis: 'x', angle: 90 },
    { id: 'n8', kind: 'translate', parent: ref(7), offset: [2, 1, -3] },
  ],
  outputs: { b4: ref(4), b8: ref(8) }, nextId: 9,
};
const filename = 'sphere-tangent-bore.bcad';
const project = 'Sphere tangent bore control';
const button = (name, owner = f.page) => owner.getByRole('button', { name, exact: true });
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const undoButtons = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
async function openProject() {
  if (!(await versions().isVisible())) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}
async function verifyStock() {
  await f.same(stock);
  const { bodies } = await f.bodies();
  assert.deepEqual(bodies.map(body => body.key), ['b4', 'b8']);
  assert.ok(Math.abs(bodies[0].volume - 36 * Math.PI) < 1e-7);
  assert.ok(Math.abs(bodies[1].volume - 24 * Math.PI) < 1e-7);
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)) }, stock.nodes.length);
  await verifyStock();
  const rows = f.page.locator('.outliner .ol-row > button.ol');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });
  await frame();
  const history = await undoButtons();
  await f.snapshot('tangent-bore-stock');
  await clickModelCommand(f.page, 'Combine', 'Subtract');
  if (baseline) {
    await f.changed(stock);
    const result = await f.doc();
    assert.equal(result.nodes.at(-1).kind, 'difference');
    const [native] = await f.inspect('baseline-native', result);
    assert.equal(native.check.valid, false);
    assert.ok(native.check.maximumEdgeSurfaceGap > 2e-5);
    await frame();
    await f.snapshot('tangent-bore-invalid-result');
    f.report.observations.push(native);
    return;
  }
  const warning = await f.waitToast(/could not|tangent|manifold/i);
  await verifyStock();
  assert.deepEqual(await undoButtons(), history);
  await f.page.locator('.toast').getByText('Details', { exact: true }).click();
  await f.page.locator('.toast').getByText(/sphere\/cylinder difference is not a valid manifold solid/i).waitFor();
  await f.snapshot('tangent-bore-refused');
  await openProject();
  await button('Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(filename, { exact: true }).waitFor();
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await openProject();
  await button('Open ' + filename, versions()).click();
  await verifyStock();
  await frame();
  await f.snapshot('tangent-bore-originals-reopened');
  assert.deepEqual(f.report.downloads, []);
  f.report.observations.push({ warning, history, reopened: true });
});

import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/top-l-shell-floor-browser.mjs',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/shellCorner.ts',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad/src/part/part-shell.ts',
];
const f = await createFlow({
  name: 'top-l-shell-floor', envFrozen: 'TOP_L_SHELL_FLOOR_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Choose the exact original top rim and an independent floor thickness on one upright L shell.',
  limits: ['One positive, upright, top-open orthogonal L with a uniform round side-wall offset.'],
  inspectorSource: `
    import { readFileSync } from 'node:fs';
    import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
    import { partSnapshot } from '@barocss/cad-model/engine/part';
    const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const { outputs: [output] } = partSnapshot(doc), { brep } = output;
    console.log(JSON.stringify({ report: checkBrep(brep, { strict: true }), volume: massPropertiesOf(output).volume,
      faces: brep.faces.map(face => ({ name: face.name, support: faceGeometry(face),
        loops: face.loops.map(id => brep.loops.find(loop => loop.id === id).kind) })) }));
  `,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 2, parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [40, 0], [40, 16], [16, 16], [16, 30], [0, 30]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const file = 'open-top-L-floor.bcad', project = 'Open top L floor';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Shell', exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const floor = scope => scope.getByLabel('Floor thickness', { exact: true });
const thicknessMode = () => hud().getByLabel('Wall thickness', { exact: true });
const waitPreview = () => hud().locator('.status').getByText('preview', { exact: true }).waitFor();
async function frameIsometric() {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}

async function openProject() {
  if (!(await panel().isVisible())) await button('Project and versions').click();
  await panel().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', panel()).click();
  await panel().getByLabel('Project', { exact: true }).waitFor();
}

async function startShell() {
  const filter = button('Selection filter');
  for (let attempt = 0; attempt < 6 && !(await filter.innerText()).includes('Faces'); attempt++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const pixel = await f.page.evaluate(() => window.__studioScreenOf([7, 7, 20]));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await clickModelCommand(f.page, 'Modify', 'Shell');
  await waitPreview();
}

async function check(doc, floorThickness, tag) {
  const measured = await f.inspect(tag, doc);
  assert.ok(measured.report.valid, measured.report.issues.join('\n'));
  assert.equal(measured.report.counts.bodies, 1);
  assert.equal(measured.report.counts.shells, 1);
  assert.equal(measured.report.topology[0].genus, 0);
  const volume = 864 * 20 - (600 + 4 - Math.PI) * (20 - floorThickness);
  assert.ok(Math.abs(measured.volume - volume) < 1e-7, `${measured.volume} vs ${volume}`);
  const levels = measured.faces.filter(({ support: s }) => s.kind === 'plane' && Math.abs(s.n[2]) === 1)
    .map(({ name, support: s, loops }) => ({ name, z: s.o[2], normal: s.n[2], loops: loops.slice().sort() }))
    .sort((a, b) => a.z - b.z);
  assert.deepEqual(levels, [
    { name: 'n1.bottom', z: 0, normal: -1, loops: ['outer'] },
    { name: 'n2.floor', z: floorThickness, normal: 1, loops: ['outer'] },
    { name: 'n1.top', z: 20, normal: 1, loops: ['inner', 'outer'] },
  ]);
  const bodies = (await f.bodies()).bodies;
  assert.equal(bodies.length, 1);
  assert.ok(Math.abs(bodies[0].volume - volume) < 1e-7);
  f.report.observations.push({ floorThickness, measured: measured.volume, volume, levels });
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)) }, stock.nodes.length);
  await f.same(stock);
  await startShell();
  if (baseline) {
    assert.equal(await thicknessMode().count(), 0);
    assert.equal(await floor(hud()).count(), 0);
    await f.snapshot('baseline-uniform-wall-only');
    await button('Apply', hud()).click();
    await f.changed(stock);
    await check(await f.doc(), 2, 'baseline-uniform-floor-2');
    return;
  }

  await thicknessMode().selectOption('separate-floor');
  await floor(hud()).fill('3');
  await waitPreview();
  await f.same(stock);
  await f.snapshot('independent-floor-preview');
  await button('Cancel', hud()).click();
  await f.same(stock);
  await startShell();
  await thicknessMode().selectOption('separate-floor');
  await floor(hud()).fill('20');
  await hud().getByText('The Shell floor is too thick', { exact: true }).waitFor();
  assert.equal(await button('Apply', hud()).isEnabled(), false);
  await f.same(stock);
  await f.snapshot('collapsed-floor-refused');
  await floor(hud()).fill('3');
  await waitPreview();
  await button('Apply', hud()).click();
  await f.changed(stock);
  const first = await f.doc();
  assert.equal(first.nodes[2].thickness, 2);
  assert.equal(first.nodes[2].floorThickness, 3);
  assert.deepEqual(first.nodes[2].open, ['n1.top']);
  await check(first, 3, 'accepted-floor-3');
  await frameIsometric();
  await f.snapshot('independent-floor-applied');
  await f.openFeatureEditor(2);
  await floor(f.editor()).fill('5');
  const edited = (await f.applyEditor(first, 'history-floor-5')).doc;
  assert.equal(edited.nodes[2].floorThickness, 5);
  assert.equal(edited.nodes[2].thickness, 2);
  await check(edited, 5, 'edited-floor-5');
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(edited);

  await openProject();
  await button('Save').click();
  await panel().getByRole('list', { name: 'Project documents', exact: true }).getByText(file, { exact: true }).waitFor();
  await button('Close project', panel()).click();
  await panel().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await openProject();
  await button('Open ' + file, panel()).click();
  await f.same(edited);
  await check(edited, 5, 'reopened-floor-5');
  await frameIsometric();
  await f.snapshot('independent-floor-fresh-open');
  assert.deepEqual(f.report.downloads, []);
});

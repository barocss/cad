import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/closed-box-wall-shell-browser.mjs',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/boxShellSelection.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad-model/src/engine/shellWalls.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts',
  'packages/barocss-cad/src/part/part-shell.ts',
];
const f = await createFlow({
  name: 'closed-box-wall-shell', output: process.argv[2], envFrozen: 'CLOSED_BOX_WALL_SHELL_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Author and reopen a closed original axial rectangular shell with six independent walls.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { brepSurfaceArea, checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = partSnapshot(doc).outputs;
console.log(JSON.stringify({
  count: output.bodyCount, report: checkBrep(output.brep, { strict: true }), mass: massPropertiesOf(output),
  area: brepSurfaceArea(output.brep),
  faces: output.brep.faces.map(face => ({ name: face.name, shell: face.shell, loops: face.loops.length, geometry: faceGeometry(face) })),
}));
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const specs = [
  ['Left wall', 'n1.side3', 3], ['Right wall', 'n1.side1', 5],
  ['Front wall', 'n1.side0', 2], ['Back wall', 'n1.side2', 4],
  ['Bottom wall', 'n1.bottom', 2], ['Top wall', 'n1.top', 3],
];
const extents = [40, 30, 20];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Shell', exact: true });
const field = (scope, name) => scope.getByLabel(name, { exact: true });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);
const boxArea = ([w, d, h]) => 2 * (w * d + w * h + d * h);

async function verify(label, doc, right) {
  const op = doc.nodes[2];
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  assert.equal(op.kind, 'shell-walls');
  assert.equal(op.opening, null);
  assert.deepEqual(op.walls, Object.fromEntries(specs.map(([name, key, value]) => [key, name === 'Right wall' ? right : value])));
  assert.equal(Object.keys(op.sigs).length, 6);

  const { count, report, mass, area, faces } = await f.inspect(label, doc);
  assert.equal(count, 1);
  assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 2, faces: 12, loops: 12, coedges: 48, edges: 24, vertices: 16 });
  assert.equal(report.topology[0].genus, 0);
  const low = [3, 2, 2], high = [40 - right, 26, 17];
  const spans = high.map((value, i) => value - low[i]);
  const cavity = spans.reduce((volume, span) => volume * span, 1), expected = 24000 - cavity;
  near(mass.volume, expected);
  near(area, boxArea(extents) + boxArea(spans));
  near((await f.bodies()).bodies[0].volume, expected);
  for (const [i, extent] of extents.entries()) {
    near(mass.centroid[i], (24000 * extent / 2 - cavity * (low[i] + high[i]) / 2) / expected);
    for (const side of [0, 1]) {
      const name = specs[2 * i + side][1];
      const outer = faces.find(face => face.name === name);
      const inner = faces.find(face => face.name === 'n2.in.' + name);
      assert.ok(outer && inner && outer.shell !== inner.shell && outer.loops === 1 && inner.loops === 1);
      assert.equal(outer.geometry.kind, 'plane');
      assert.equal(inner.geometry.kind, 'plane');
      near(outer.geometry.o[i], side ? extent : 0);
      near(inner.geometry.o[i], side ? high[i] : low[i]);
      near(outer.geometry.n[i], side ? 1 : -1);
      near(inner.geometry.n[i], side ? -1 : 1);
    }
  }
  f.report.observations.push({ label, volume: expected, area, cavity: spans });
}

async function openShell() {
  if (!(await f.page.evaluate(() => window.__studioSelection?.selection.bodies.length === 1))) {
    await f.page.locator('.outliner .ol:not(.ol-step)').first().click();
  }
  await f.page.waitForFunction(() => window.__studioSelection?.selection.bodies.length === 1
    && window.__studioSelection.selection.faces.length === 0);
  await clickModelCommand(f.page, 'Modify', 'Shell');
  await hud().waitFor();
}

async function preview() {
  await field(hud(), 'Wall thickness').selectOption({ label: 'Per face' });
  for (const [label, , value] of specs) await field(hud(), label).fill(String(value));
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(source);
}

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'closed-box-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  near((await f.bodies()).bodies[0].volume, 24000);
  f.phase = 'Select the whole original box and open Shell';
  await openShell();
  await field(hud(), 'Wall').waitFor();
  if (baseline) {
    assert.equal(await field(hud(), 'Wall thickness').count(), 0);
    await f.snapshot('uniform-only');
    await button('Cancel', hud()).click();
    await f.same(source);
    return;
  }

  f.phase = 'Preview and cancel six wall thicknesses';
  await preview();
  await f.snapshot('six-wall-preview');
  await button('Cancel', hud()).click();
  await f.same(source);

  f.phase = 'Apply the closed per-face Shell';
  await openShell();
  await preview();
  await button('Apply', hud()).click();
  await f.changed(source);
  await hud().waitFor({ state: 'hidden' });
  const made = await f.doc();
  await verify('native-applied', made, 5);
  const applied = await f.snapshot('closed-applied');
  await f.openFeatureEditor(2, 'Edit six independent Shell walls');
  const editor = f.editor();
  await field(editor, 'Right wall').fill('37');
  await button('Apply', editor).click();
  await editor.getByText('Wall thicknesses leave no cavity', { exact: true }).waitFor();
  await f.same(made);
  assert.deepEqual((await f.snapshot('collapse-refused')).history, applied.history);
  await field(editor, 'Right wall').fill('7');
  const edited = (await f.applyEditor(made, 'right-wall-edited')).doc;
  await verify('native-edited', edited, 7);
  await f.undo();
  await f.same(made);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('closed-box-six-walls');
  const reopened = (await f.freshOpen(saved.file, edited, 'native-reopened')).doc;
  await verify('native-reopened', reopened, 7);

  f.phase = 'View the internal cavity of the reopened box';
  await button('Section view').click();
  await button('Section across Y').click();
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const section = window.__studioSection();
    const plane = section?.planes[0];
    return section?.gpu && plane?.axis === 'y' && plane.offset > 2 && plane.offset < 26;
  });
  await f.same(reopened);
  await f.snapshot('reopened-cavity-section', () => ({ section: window.__studioSection() }));
});

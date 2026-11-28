import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const agent = process.argv.includes('--agent');
const pins = ['packages/barocss-cad-model/src/app/boxShellSelection.ts', 'packages/barocss-cad-model/src/engine/shellWalls.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts', 'packages/barocss-cad/src/part/part-shell.ts'];
const f = await createFlow({
  name: 'corner-open-box-wall-shell', output: process.argv[2], envFrozen: 'CORNER_OPEN_BOX_WALL_SHELL_FROZEN',
  qualification: 'Pick three original faces sharing a corner and edit the other three walls of a rectangular Shell.',
  limits: ['An original 40×30×20 mm box with the top, front and right faces opened.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
const output = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8'))).outputs[0];
const { brep } = output, report = checkBrep(brep, { strict: true, pcurveSamples: 7 });
console.log(JSON.stringify({ mass: massPropertiesOf(output), valid: report.valid, counts: report.counts,
  closed: brep.shells.map(shell => shell.closed), pcurves: brep.coedges.filter(use => use.pcurve).length,
  supports: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face)])),
  digest: createHash('sha256').update(JSON.stringify(brep)).digest('hex') }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 }], outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Shell', exact: true });
const view = name => button(name, f.page.locator('.views')).click();
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-7, `${a} versus ${b}`);

async function pick(viewName, point, count) {
  await view(viewName);
  await frame();
  const coords = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  if (count > 1) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...coords); }
  finally { if (count > 1) await f.page.keyboard.up('Shift'); }
  await f.page.waitForFunction(n => window.__studioSelection.selection.faces.length === n, count);
}

async function prove(label, doc, bottom) {
  const native = await f.inspect(label, doc), node = doc.nodes[2];
  assert.equal(node.kind, 'shell-walls');
  assert.deepEqual([node.opening, node.secondOpening, node.thirdOpening], ['n1.top', 'n1.side1', 'n1.side0']);
  assert.deepEqual(node.walls, { 'n1.side3': 3, 'n1.side2': 4, 'n1.bottom': bottom });
  assert.equal(Object.keys(node.sigs).length, 6);
  assert.deepEqual([native.valid, native.closed, native.pcurves], [true, [true], 50]);
  assert.deepEqual(native.counts, { bodies: 1, shells: 1, faces: 11, loops: 11, coedges: 50, edges: 25, vertices: 16 });
  const cavity = 37 * 26 * (20 - bottom), volume = 24000 - cavity;
  const centroid = [20, 15, 10].map((value, i) => (24000 * value - cavity * [21.5, 13, (20 + bottom) / 2][i]) / volume);
  const visible = (await f.bodies()).bodies[0];
  for (const result of [native.mass, visible]) {
    near(result.volume, volume);
    result.centroid.forEach((value, i) => near(value, centroid[i]));
  }
  for (const [name, axis, station, normal] of [['n1.side3', 0, 3, 1], ['n1.side2', 1, 26, -1], ['n1.bottom', 2, bottom, 1]]) {
    const support = native.supports[`n2.in.${name}`];
    assert.equal(support.kind, 'plane');
    near(support.o[axis], station);
    assert.deepEqual(support.n.map(value => value || 0), [0, 1, 2].map(i => i === axis ? normal : 0));
  }
  f.report.observations.push({ label, volume, centroid, digest: native.digest });
  return native.digest;
}

async function approve(file) {
  f.phase = 'prepare exact corner Shell proposal';
  const proposal = await withMcpSession({ app: f.app, output: f.output, clientName: 'corner-wall-shell' }, file, 'corner-shell-agent', async call => {
    const description = await call('describe', { command: 'shell' });
    assert.match(description.values.wallMode, /three original faces sharing a corner/);
    const revision = await currentPartRevision(call);
    const proposed = await call('proposals', { action: 'propose', title: 'Open the three faces at the top front right corner', ops: [{
      tool: 'features', args: { action: 'command', command: 'shell', faces: ['n1.side0', 'n1.top', 'n1.side1'], expectedRevision: revision,
        values: { wallMode: 'per-face', leftWall: 3, backWall: 4, bottomWall: 2 } },
    }] });
    assert.deepEqual([proposed.proposal, proposed.applied, proposed.change.volume], ['P1', false, -17316]);
    assert.match((await call('proposals', { action: 'accept', id: proposed.proposal }, true)).error, /user accepts.*studio/i);
    return proposed.proposal;
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, stock.nodes);
  await f.freshOpen(file, pending, 'corner-shell-proposal-stock');
  await view('Iso');
  await frame();
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${proposal}`, exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('corner-shell-proposal-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.doc();
  assert.deepEqual([accepted.history.at(-1).kind, accepted.history.at(-1).proposal, accepted.history.at(-1).by.agent], ['accept', proposal, 'user']);
  await prove('agent-approved', accepted, 2);
  await f.snapshot('corner-shell-proposal-approved');
}

await f.run(async () => {
  const file = join(f.output, 'corner-shell-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  if (agent) return approve(file);
  await f.freshOpen(file, stock, 'original');
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  f.phase = 'pick the top, front and right faces';
  await pick('Top', [20, 12, 20], 1);
  await pick('Front', [20, 0, 8], 2);
  await pick('Right', [40, 12, 8], 3);
  await view('Iso');
  await frame();
  const launch = () => clickModelCommand(f.page, 'Modify', 'Shell');
  await launch();
  const mode = () => hud().getByLabel('Wall thickness', { exact: true });
  if (baseline) {
    assert.equal(await mode().count(), 0);
    await f.same(stock);
    await f.snapshot('baseline-no-per-face-walls');
    return;
  }
  async function preview() {
    await mode().selectOption('per-face');
    for (const [name, value] of [['Left wall', 3], ['Back wall', 4], ['Bottom wall', 2]]) {
      await hud().getByLabel(name, { exact: true }).fill(String(value));
    }
    for (const name of ['Top wall', 'Front wall', 'Right wall']) assert.equal(await hud().getByLabel(name, { exact: true }).count(), 0);
    await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  }
  f.phase = 'preview Cancel and retry Apply';
  await preview();
  await f.snapshot('corner-shell-preview');
  await button('Cancel', hud()).click();
  await f.same(stock);
  await f.snapshot('corner-shell-cancelled');
  await launch();
  await preview();
  await button('Apply', hud()).click();
  await f.changed(stock);
  const created = await f.doc();
  await prove('created', created, 2);
  await f.snapshot('corner-shell-applied');

  await f.openFeatureEditor(2, 'wall thickness refusal');
  await f.editor().getByLabel('Bottom wall', { exact: true }).fill('20');
  await button('Apply', f.editor()).click();
  await f.editor().locator('.hud-error').waitFor();
  await f.same(created);
  await f.snapshot('corner-shell-collapse-refused');
  await f.closeEditor();
  await f.openFeatureEditor(2, 'edit the bottom wall');
  await f.editor().getByLabel('Bottom wall', { exact: true }).fill('6');
  await f.applyEditor(created, 'updated-bottom');
  const edited = await f.doc();
  const digest = await prove('edited', edited, 6);
  await f.undo();
  await f.same(created);
  await prove('undo', created, 2);
  await f.redo();
  await f.same(edited);
  assert.equal(await prove('redo', edited, 6), digest);
  const saved = await f.save('corner-wall-shell');
  await f.freshOpen(saved.file, edited, 'corner-shell-reopened');
  assert.equal(await prove('reopened', edited, 6), digest);
  await view('Iso');
  await frame();
  await f.openFeatureEditor(2, 'verify reopened wall fields');
  assert.equal(await f.editor().getByLabel('Bottom wall', { exact: true }).inputValue(), '6');
  await f.snapshot('corner-shell-reopened-history');
});

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const agent = process.argv.includes('--agent');
const channel = process.argv.includes('--channel');
const pins = ['packages/barocss-cad-model/src/app/boxShellSelection.ts', 'packages/barocss-cad-model/src/engine/shellWalls.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts', 'packages/barocss-cad/src/part/part-shell.ts'];
const f = await createFlow({
  name: 'corner-open-box-wall-shell', output: process.argv[2], envFrozen: 'CORNER_OPEN_BOX_WALL_SHELL_FROZEN',
  qualification: 'Open three original rectangular box faces and edit the other three walls.',
  limits: [channel ? 'An original 40×30×20 mm box opens Top, Bottom and Front.' : 'An original 40×30×20 mm box opens Top, Front and Right.'],
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
const view = async name => {
  if (name === 'Bottom') {
    await button('View cube directions', f.page.getByRole('group', { name: 'View cube', exact: true })).click();
    await f.page.getByRole('menuitem', { name, exact: true }).click();
    await f.page.locator('.view-cube .vc-label').getByText('BOTTOM', { exact: true }).waitFor();
  } else await button(name, f.page.locator('.views')).click();
};
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

const originalDimensions = [40, 30, 20];
const opened = channel ? ['n1.top', 'n1.bottom', 'n1.side0'] : ['n1.top', 'n1.side1', 'n1.side0'];
const kept = [
  { label: 'Left wall', name: 'n1.side3', axis: 0, high: false, thickness: 3, key: 'leftWall' },
  { label: 'Back wall', name: 'n1.side2', axis: 1, high: true, thickness: 4, key: 'backWall' },
  channel ? { label: 'Right wall', name: 'n1.side1', axis: 0, high: true, thickness: 5, key: 'rightWall' }
    : { label: 'Bottom wall', name: 'n1.bottom', axis: 2, high: false, thickness: 2, key: 'bottomWall' },
];
const editedWall = kept.at(-1), editedWidth = channel ? 8 : 6;
const thickness = (wall, width) => wall === editedWall ? width : wall.thickness;
const wallValues = Object.fromEntries(kept.map(wall => [wall.key, wall.thickness]));
const originalVolume = 40 * 30 * 20;
function cavityFor(width) {
  const box = originalDimensions.map(dimension => [0, dimension]);
  for (const wall of kept) box[wall.axis][Number(wall.high)] += (wall.high ? -1 : 1) * thickness(wall, width);
  return box;
}
const volumeOf = box => box.reduce((volume, [low, high]) => volume * (high - low), 1);

async function prove(label, doc, width) {
  const native = await f.inspect(label, doc), node = doc.nodes[2];
  assert.equal(node.kind, 'shell-walls');
  assert.deepEqual([node.opening, node.secondOpening, node.thirdOpening], opened);
  assert.deepEqual(node.walls, Object.fromEntries(kept.map(wall => [wall.name, thickness(wall, width)])));
  assert.equal(Object.keys(node.sigs).length, 6);
  const faces = channel ? 10 : 11, edges = channel ? 24 : 25;
  assert.deepEqual([native.valid, native.closed, native.pcurves], [true, [true], 2 * edges]);
  assert.deepEqual(native.counts, { bodies: 1, shells: 1, faces, loops: faces, coedges: 2 * edges, edges, vertices: 16 });
  const cavity = cavityFor(width), removed = volumeOf(cavity), volume = originalVolume - removed;
  const centroid = originalDimensions.map((dimension, axis) => (originalVolume * dimension - removed * (cavity[axis][0] + cavity[axis][1])) / (2 * volume));
  const visible = (await f.bodies()).bodies[0];
  for (const result of [native.mass, visible]) {
    near(result.volume, volume);
    result.centroid.forEach((value, i) => near(value, centroid[i]));
  }
  for (const { name, axis, high } of kept) {
    const support = native.supports[`n2.in.${name}`];
    assert.equal(support.kind, 'plane');
    near(support.o[axis], cavity[axis][Number(high)]);
    assert.deepEqual(support.n.map(value => value || 0), [0, 1, 2].map(i => i === axis ? (high ? -1 : 1) : 0));
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
    const proposed = await call('proposals', { action: 'propose', title: channel ? 'Open both caps and the front face' : 'Open the three faces at the top front right corner', ops: [{
      tool: 'features', args: { action: 'command', command: 'shell', faces: [...opened].reverse(), expectedRevision: revision,
        values: { wallMode: 'per-face', ...wallValues } },
    }] });
    assert.deepEqual([proposed.proposal, proposed.applied, proposed.change.volume], ['P1', false, -volumeOf(cavityFor(editedWall.thickness))]);
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
  await prove('agent-approved', accepted, editedWall.thickness);
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
  f.phase = 'pick the three original Shell openings';
  await pick('Top', [20, 12, 20], 1);
  await pick('Front', [20, 0, 8], 2);
  await (channel ? pick('Bottom', [20, 12, 0], 3) : pick('Right', [40, 12, 8], 3));
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
    for (const { label, thickness } of kept) await hud().getByLabel(label, { exact: true }).fill(String(thickness));
    for (const name of ['Top wall', 'Front wall', channel ? 'Bottom wall' : 'Right wall']) assert.equal(await hud().getByLabel(name, { exact: true }).count(), 0);
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
  await prove('created', created, editedWall.thickness);
  await f.snapshot('corner-shell-applied');

  await f.openFeatureEditor(2, 'wall thickness refusal');
  await f.editor().getByLabel(editedWall.label, { exact: true }).fill(channel ? '37' : '20');
  await button('Apply', f.editor()).click();
  await f.editor().locator('.hud-error').waitFor();
  await f.same(created);
  await f.snapshot('corner-shell-collapse-refused');
  await f.closeEditor();
  await f.openFeatureEditor(2, 'edit one retained wall');
  await f.editor().getByLabel(editedWall.label, { exact: true }).fill(String(editedWidth));
  await f.applyEditor(created, 'updated-wall');
  const edited = await f.doc();
  const digest = await prove('edited', edited, editedWidth);
  await f.undo();
  await f.same(created);
  await prove('undo', created, editedWall.thickness);
  await f.redo();
  await f.same(edited);
  assert.equal(await prove('redo', edited, editedWidth), digest);
  const saved = await f.save('corner-wall-shell');
  await f.freshOpen(saved.file, edited, 'corner-shell-reopened');
  assert.equal(await prove('reopened', edited, editedWidth), digest);
  await view('Iso');
  await frame();
  await f.openFeatureEditor(2, 'verify reopened wall fields');
  assert.equal(await f.editor().getByLabel(editedWall.label, { exact: true }).inputValue(), String(editedWidth));
  await f.snapshot('corner-shell-reopened-history');
});

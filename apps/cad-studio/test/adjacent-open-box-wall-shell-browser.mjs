import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/boxShellSelection.ts', 'packages/barocss-cad-model/src/engine/shellWalls.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts', 'packages/barocss-cad/src/part/part-shell.ts'];
const f = await createFlow({
  name: 'adjacent-open-box-wall-shell', output: process.argv[2], envFrozen: 'ADJACENT_OPEN_BOX_WALL_SHELL_FROZEN',
  qualification: 'One original top and front opening on a cardinal box with four independent kept wall thicknesses.',
  limits: ['One 40×30×20 mm original rectangular extrusion and a top–front opening pair.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const snapshot = partSnapshot(doc), output = snapshot.outputs[0], { brep } = output;
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const { volume, centroid } = massPropertiesOf(output);
const report = checkBrep(brep, { strict: true });
console.log(JSON.stringify({ count: snapshot.outputs.length, volume, centroid,
  valid: report.valid, counts: report.counts,
  closed: brep.shells.map(shell => shell.closed), pcurves: brep.coedges.filter(use => use.pcurve).length,
  faces: brep.faces.map(face => ({ id: face.id, name: face.name, geometry: faceGeometry(face),
    loops: face.loops.map(id => loops.get(id).coedges.length) })) }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 20 },
  ], outputs: { b1: { node: 1, side: 'solid' } },
};
const walls = { 'n1.side3': 3, 'n1.side1': 5, 'n1.side2': 4, 'n1.bottom': 2 };
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Shell', exact: true });
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-7, `${a} versus ${b}`);
const xyz = (a, b) => a.forEach((value, i) => near(value, b[i]));

async function pick(point, shifted = false) {
  const coords = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...coords); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}

async function prove(label, doc, thickness, uniform = false) {
  const body = await f.inspect(label, doc);
  assert.deepEqual([body.count, body.valid, body.closed], [1, true, [true]]);
  assert.deepEqual(body.counts, { bodies: 1, shells: 1, faces: 12, loops: 12, coedges: 56, edges: 28, vertices: 18 });
  assert.equal(body.pcurves, 56);
  const [left, right, back] = uniform ? [2, 2, 2] : [3, 5, 4];
  const cavity = (40 - right - left) * (30 - back) * (20 - thickness);
  const volume = 24000 - cavity, cavityCentre = [(left + 40 - right) / 2, (30 - back) / 2, (20 + thickness) / 2];
  const centroid = [20, 15, 10].map((value, i) => (24000 * value - cavity * cavityCentre[i]) / volume);
  near(body.volume, volume);
  xyz(body.centroid, centroid);
  const visible = (await f.bodies()).bodies[0];
  near(visible.volume, volume);
  xyz(visible.centroid, centroid);
  if (!uniform) {
    const node = doc.nodes[2];
    assert.equal(node.kind, 'shell-walls');
    assert.deepEqual([node.opening, node.secondOpening], ['n1.top', 'n1.side0']);
    assert.deepEqual(node.walls, { ...walls, 'n1.bottom': thickness });
    assert.equal(Object.keys(node.sigs).length, 6);
    const inner = [
      ['n2.in.n1.side3', 0, left, [1, 0, 0]],
      ['n2.in.n1.side1', 0, 40 - right, [-1, 0, 0]],
      ['n2.in.n1.side2', 1, 30 - back, [0, -1, 0]],
      ['n2.in.n1.bottom', 2, thickness, [0, 0, 1]],
    ];
    for (const [name, axis, station, normal] of inner) {
      const face = body.faces.find(face => face.name === name);
      assert.ok(face && face.geometry.kind === 'plane', name);
      near(face.geometry.o[axis], station);
      xyz(face.geometry.n, normal);
    }
    const front = body.faces.filter(face => /^n1\.side0(?:#\d+)?$/.test(face.name));
    assert.equal(front.length, 3);
    assert.deepEqual(front.map(face => face.loops[0]).sort(), [4, 5, 5]);
    assert.deepEqual(body.faces.find(face => face.name === 'n1.top').loops, [8]);
  }
  f.report.observations.push({ label, thickness, volume, centroid, faces: body.counts.faces, pcurves: body.pcurves });
}

await f.run(async () => {
  const file = join(f.output, 'two-opening-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  await f.freshOpen(file, stock, 'original');
  const filter = button('Selection filter');
  for (let attempt = 0; attempt < 6 && !(await filter.innerText()).includes('Faces'); attempt++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Top', f.page.locator('.views')).click();
  await frame();
  await pick([20, 12, 20]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await button('Front', f.page.locator('.views')).click();
  await frame();
  await pick([20, 0, 8], true);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 2);
  await button('Iso', f.page.locator('.views')).click();
  await clickModelCommand(f.page, 'Modify', 'Shell');
  const mode = hud().getByLabel('Wall thickness', { exact: true });
  if (baseline) {
    assert.equal(await mode.count(), 0);
  } else {
    await mode.selectOption('per-face');
    for (const [name, value] of [['Left wall', 3], ['Right wall', 5], ['Back wall', 4], ['Bottom wall', 2]]) {
      await hud().getByLabel(name, { exact: true }).fill(String(value));
    }
    assert.equal(await hud().getByLabel('Front wall', { exact: true }).count(), 0);
    assert.equal(await hud().getByLabel('Top wall', { exact: true }).count(), 0);
  }
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await f.snapshot(baseline ? 'baseline-uniform-only' : 'adjacent-per-face-preview');
  await button('Apply', hud()).click();
  await f.changed(stock);
  const created = await f.doc();
  await prove('created-shell', created, 2, baseline);
  if (baseline) {
    assert.deepEqual(created.nodes[2].open, ['n1.top', 'n1.side0']);
    return;
  }

  await f.openFeatureEditor(2, 'wall thickness refusal');
  await f.editor().getByLabel('Left wall', { exact: true }).fill('39');
  await button('Apply', f.editor()).click();
  await f.editor().locator('.hud-error').waitFor();
  await f.same(created);
  await f.snapshot('adjacent-cavity-refused');
  await f.closeEditor();

  await f.openFeatureEditor(2, 'edit only the floor');
  await f.editor().getByLabel('Bottom wall', { exact: true }).fill('6');
  await f.applyEditor(created, 'updated-bottom-wall');
  const edited = await f.doc();
  await prove('edited-shell', edited, 6);
  await f.undo();
  await f.same(created);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('adjacent-wall-shell');
  await f.freshOpen(saved.file, saved.doc, 'adjacent-shell-reopened');
  await prove('reopened-shell', saved.doc, 6);
  await button('Iso', f.page.locator('.views')).click();
  await frame();
  await f.openFeatureEditor(2, 'reopened per-face walls');
  assert.equal(await f.editor().getByLabel('Bottom wall', { exact: true }).inputValue(), '6');
  await f.snapshot('reopened-adjacent-shell-history');

  const agentFile = join(f.output, 'adjacent-shell-agent-input.bcad');
  await writeFile(agentFile, JSON.stringify(stock));
  const proposalId = await withMcpSession({ app: f.app, output: f.output, clientName: 'adjacent-wall-shell' }, agentFile, 'adjacent-wall-shell-agent', async call => {
    const expectedRevision = await currentPartRevision(call);
    const proposed = await call('proposals', { action: 'propose', title: 'Open the top and front of the shell', ops: [{ tool: 'features', args: {
      action: 'command', command: 'shell', faces: ['n1.side0', 'n1.top'], expectedRevision,
      values: { wallMode: 'per-face', leftWall: 3, rightWall: 5, backWall: 4, bottomWall: 2 },
    } }] });
    assert.deepEqual([proposed.proposal, proposed.applied, proposed.change.volume], ['P1', false, -14976]);
    assert.match((await call('proposals', { action: 'accept', id: proposed.proposal }, true)).error, /user accepts.*studio/i);
    return proposed.proposal;
  });
  const pending = JSON.parse(await readFile(agentFile, 'utf8'));
  assert.deepEqual(pending.nodes, stock.nodes);
  await f.freshOpen(agentFile, pending, 'adjacent-shell-agent-open');
  await button('Iso', f.page.locator('.views')).click();
  await frame();
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${proposalId}`, exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('adjacent-shell-agent-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.doc();
  assert.deepEqual([accepted.history.at(-1).kind, accepted.history.at(-1).proposal, accepted.history.at(-1).by.agent],
    ['accept', proposalId, 'user']);
  await prove('adjacent-shell-agent-approved', accepted, 2);
});

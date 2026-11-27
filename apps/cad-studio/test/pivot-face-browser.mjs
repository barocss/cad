import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const pins = ['packages/barocss-cad-model/src/app/pivotFaceCommand.ts', 'packages/barocss-cad-model/src/app/draftEdit.ts',
  'packages/barocss-cad-model/src/engine/references.ts', 'packages/barocss-cad/src/part/part-box-draft.ts',
  'packages/barocss-cad/src/part/part-face-finish.ts', 'apps/cad-studio/src/state/commandApply.ts'];
const f = await createFlow({ name: 'pivot-face', envFrozen: 'PIVOT_FACE_FROZEN', output: process.argv[2],
  qualification: 'Exact face pivot from a desktop edge pick, History, reopen and the local CAD Agent.',
  limits: ['Original axis-aligned rectangular extrusion and fixed upper front edge.'], initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const snapshot = partSnapshot(doc);
const brep = snapshot.outputs[0].brep;
const vertices = Object.fromEntries(brep.vertices.map(v => [v.id, v.point]));
const edges = brep.edges.map(edge => ({
  edge, points: edge.vertices.map(id => vertices[id]),
  uses: brep.coedges.filter(use => use.edge === edge.id).map(use => [
    use.id, use.sense, brep.faces.find(face => face.loops.includes(use.loop)).id,
  ]),
}));
console.log(JSON.stringify({ strict: checkBrep(brep, { strict: true }).valid, volumes: snapshot.outputs.map(out => brepMassProperties(out.brep,1).volume),
  topology: [brep.bodies.length, brep.shells.length, brep.faces.length, brep.edges.length, brep.vertices.length],
  closed: brep.shells.every(shell => shell.closed), edges, vertices,
  planes: brep.faces.map(face => [face.name, faceGeometry(face)]) }));
` });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 2, parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [4, -3], max: [44, 17] },
    { kind: 'extrude', id: 'n1', sketch: 0, from: 6, height: 12 },
  ], outputs: { b1: { node: 1, side: 'solid' } } };
const pivot = 'Pivot face';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = hud => hud.getByLabel('Angle', { exact: true });
const status = (hud, label) => hud.locator('.status').filter({ hasText: new RegExp('^' + label + '$') }).waitFor();
const near = (a, b) => Math.abs(a - b) < 1e-6;
const samePoint = (a, b) => a.every((value, i) => near(value, b[i]));
function proof(native, original, edgeName, degrees) {
  assert.deepEqual(native.topology, [1, 1, 6, 12, 8]);
  assert.equal(native.strict && native.closed, true);
  const edge = native.edges.find(item => item.edge.name === edgeName);
  assert.deepEqual(edge, original.edges.find(item => item.edge.name === edgeName));
  const inset = 12 * Math.tan(degrees * Math.PI / 180);
  assert.ok(near(native.volumes[0], 40 * 12 * (20 - inset / 2)), JSON.stringify(native.volumes));
  for (const x of [4, 44]) for (const y of [-3 + inset, 17])
    assert.ok(Object.values(native.vertices).some(point => samePoint(point, [x, y, 6])));
  for (const x of [4, 44]) for (const y of [-3, 17])
    assert.ok(Object.values(native.vertices).some(point => samePoint(point, [x, y, 18])));
  return { angle: degrees, volume: native.volumes[0], hinge: edge.edge.name, endpoints: edge.points, inset };
}
async function clickWorld(point, modifiers) {
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  assert.equal(pixel.length, 2);
  if (modifiers) await f.page.keyboard.down(modifiers);
  try { await f.page.mouse.click(...pixel); }
  finally { if (modifiers) await f.page.keyboard.up(modifiers); }
}
async function startPivot() {
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command(pivot);
  return f.page.getByRole('dialog', { name: pivot, exact: true });
}

await f.run(async () => {
  const input = join(f.output, 'original-stock.bcad');
  await writeFile(input, JSON.stringify(seed));
  const original = await f.inspect('01-original-native', seed);
  const hinge = original.edges.find(item => item.points.every(point => point[1] === -3 && point[2] === 18));
  assert.ok(hinge?.edge.name);
  await f.freshOpen(input, seed, '01-stock');
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => window.__studioCamera().ortho);
  await clickWorld([24, -3, 12]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await clickWorld([15, -3, 18], 'Shift');
  await f.page.waitForFunction(() => {
    const { faces, edges } = window.__studioSelection.selection;
    return faces.length === 1 && edges.length === 1;
  });
  await button('Iso', f.page.locator('.views')).click();
  await f.snapshot('02-face-and-edge');
  let hud = await startPivot();
  await status(hud, 'preview');
  await field(hud).fill('0');
  await status(hud, 'refused');
  assert.equal(await button('Apply', hud).isEnabled(), false);
  await f.same(seed);
  await field(hud).fill('12');
  await status(hud, 'preview');
  await f.snapshot('03-inward-preview');
  await button('Cancel', hud).click();
  await f.same(seed);
  hud = await startPivot();
  await status(hud, 'preview');
  await field(hud).fill('12');
  await status(hud, 'preview');
  await button('Apply', hud).click();
  await f.changed(seed);
  const inward = await f.doc(), node = inward.nodes.at(-1);
  assert.deepEqual([node.kind, node.hingeEdge, node.pull, node.angle, node.neutral], ['draft', hinge.edge.name, '-z', 12, undefined]);
  assert.deepEqual(inward.nodes.slice(0, 2), seed.nodes);
  const results = [proof(await f.inspect('04-inward-native', inward), original, node.hingeEdge, 12)];
  await f.snapshot('04-applied-inward');
  await f.openFeatureEditor(2, 'pivot');
  await button('Edit pivot face', f.editor()).click();
  hud = f.page.getByRole('dialog', { name: 'Edit Pivot face', exact: true });
  await status(hud, 'preview');
  assert.equal(await hud.getByLabel('Pull', { exact: true }).count(), 0);
  await field(hud).fill('-8');
  await status(hud, 'preview');
  await button('Apply', hud).click();
  await f.changed(inward);
  const outward = await f.doc();
  assert.deepEqual(outward.nodes.at(-1), { ...node, angle: -8 });
  results.push(proof(await f.inspect('05-outward-native', outward), original, node.hingeEdge, -8));
  await f.undo(); await f.same(inward);
  await f.redo(); await f.same(outward);
  const saved = await f.save('pivot-face');
  await f.freshOpen(saved.file, outward, '05-reopened');
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  results.push(proof(await f.inspect('06-native-reopen', await f.doc()), original, node.hingeEdge, -8));
  await f.snapshot('06-reopened-outward');

  const originalBytes = await readFile(input);
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-pivot-face-test' }, input, 'local-agent', async call => {
    const descriptor = await call('describe', { command: 'pivot-face' });
    assert.match(descriptor.selection, /original straight edge/);
    const expectedRevision = await currentPartRevision(call);
    const command = { action: 'command', command: 'pivot-face', faces: node.faces, edges: [node.hingeEdge], expectedRevision, values: { deg: 12 } };
    const propose = args => ({ action: 'propose', title: 'Pivot the stock face about its upper edge', ops: [{ tool: 'features', args }] });
    assert.match((await call('proposals', propose({ ...command, expectedRevision: '0'.repeat(16) }), true)).error, /part changed/i);
    const nonadjacent = original.edges.find(item => item.points.every(point => point[1] === 17 && point[2] === 18));
    assert.match((await call('proposals', propose({ ...command, edges: [nonadjacent.edge.name] }), true)).error, /one straight edge on that face/i);
    assert.deepEqual(await readFile(input), originalBytes);
    const accepted = await call('proposals', propose(command));
    assert.equal(accepted.applied, false);
    assert.ok(Math.abs(accepted.change.volume - (results[0].volume - original.volumes[0])) < 0.001);
    const pending = JSON.parse(await readFile(input, 'utf8'));
    assert.deepEqual(pending.nodes, seed.nodes);
    assert.equal(pending.proposals[0].status, 'open');
    assert.match((await call('proposals', { action: 'accept', id: accepted.proposal }, true)).error, /user accepts.*Studio/i);
  });
  const pending = JSON.parse(await readFile(input, 'utf8'));
  await f.freshOpen(input, pending, '07-pending-agent');
  const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  await f.snapshot('08-agent-preview');
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  assert.deepEqual([approved.proposals[0].status, approved.proposals[0].decided.by], ['accepted', 'user']);
  assert.deepEqual(approved.nodes, inward.nodes);
  results.push(proof(await f.inspect('09-agent-native-approved', approved), original, node.hingeEdge, 12));
  await f.snapshot('09-agent-approved');
  const agentSave = await f.save('agent-pivot-approved');
  await f.freshOpen(agentSave.file, approved, '10-approved-reopened');
  f.report.observations.push({ results, selectedFace: node.faces[0], pull: node.pull, agentRequiresApproval: true });
});

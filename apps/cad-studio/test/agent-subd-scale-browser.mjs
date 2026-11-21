import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const rotate = process.argv.includes('--rotate');
const operation = rotate ? 'rotate' : 'scale';
const pins = [
  'apps/cad-studio/test/agent-subd-scale-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts',
  'apps/cad-studio/src/subd/useCageEditor.ts',
  'packages/barocss-cad-model/src/chat/cageTools.ts',
  'packages/barocss-cad-model/src/chat/contract.ts',
  'packages/barocss-cad-model/src/chat/groups.ts',
  'packages/barocss-cad-model/src/chat/tools.ts',
  'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
  'packages/barocss-cad-model/src/chat/toolset.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/subd/cageEdit.ts',
];
const f = await createFlow({
  name: `agent-subd-${operation}`, output: process.argv[2], envFrozen: rotate ? 'AGENT_SUBD_ROTATE_FROZEN' : 'AGENT_SUBD_SCALE_FROZEN',
  qualification: `A local MCP cage selection creates an exact Studio-reviewable ${operation} proposal.`,
  limits: ['One top quad of an authored unmirrored SubD box. Local stdio only. Coordinates refer to the cage.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {digestOf} from '@barocss/cad-model/util/digest';
import {checkBrep,brepMassProperties} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const [{brep,key}]=partBreps(doc);
console.log(JSON.stringify({key,check:checkBrep(brep,{strict:true}),sha:digestOf(brep),volume:brepMassProperties(brep,1).volume}));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const cagePanel = () => f.page.getByRole('complementary', { name: 'Cage editor', exact: true });
const centre = [23.75, 32.5, 26], factor = 1.1, pivot = [20, 40, 26], degrees = 15;
const theta = degrees * Math.PI / 180, cosine = Math.cos(theta), sine = Math.sin(theta);
const targetPoint = rotate ? ([x, y, z]) => [
  pivot[0] + cosine * (x - pivot[0]) - sine * (y - pivot[1]),
  pivot[1] + sine * (x - pivot[0]) + cosine * (y - pivot[1]), z,
] : point => point.map((value, axis) => centre[axis] + factor * (value - centre[axis]));
async function command(value) {
  await f.page.getByText('barocss', { exact: true }).click();
  await f.command(value);
}
async function native(label, doc) {
  const result = await f.inspect(label, doc);
  const bodies = (await f.bodies()).bodies;
  assert.ok(result.check.valid, JSON.stringify(result.check.issues));
  assert.equal(result.check.counts.bodies, 1);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].key, result.key);
  assert.ok(Math.abs(bodies[0].volume - result.volume) < 1e-6);
  return result;
}
function oracle(before, after, face, project) {
  const ids = new Set(before.faces[face]);
  assert.equal(ids.size, 4);
  assert.deepEqual([...ids].map(id => before.positions.slice(id * 3, id * 3 + 3).join(',')).sort(),
    ['20,30,26', '20,35,26', '27.5,30,26', '27.5,35,26']);
  assert.deepEqual(after.faces, before.faces);
  assert.deepEqual(after.creases, before.creases);
  let maxError = 0;
  for (let i = 0; i < before.positions.length; i += 3) {
    const original = before.positions.slice(i, i + 3), actual = after.positions.slice(i, i + 3);
    if (!ids.has(i / 3)) { assert.deepEqual(actual, original); continue; }
    const expected = project(original);
    maxError = Math.max(maxError, ...actual.map((value, axis) => Math.abs(value - expected[axis])));
  }
  assert.ok(maxError < 1e-10, String(maxError));
  return maxError;
}

await f.run(async () => {
  await f.newPage();
  await f.page.setViewportSize({ width: 1440, height: 1000 });
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  await command('subd box');
  const hud = f.page.getByRole('dialog', { name: 'SubD box', exact: true });
  for (const [name, value] of [['Width X', 30], ['Depth Y', 20], ['Height Z', 16], ['Quads along a side', 4], ['Centre X', 20], ['Centre Y', 30], ['At Z', 10]]) {
    await hud.getByLabel(name, { exact: true }).fill(String(value));
  }
  await hud.locator('.status.ok').waitFor();
  await button('Apply', hud).click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.some(node => node.kind === 'subd'));
  await f.ready();
  const source = await f.doc();
  const original = await native('original', source);
  const file = join(f.output, 'local-cage-proposal.bcad');
  await writeFile(file, JSON.stringify(source));
  let face, pivotVertex;
  f.phase = `discover and propose the current cage ${operation} over local MCP`;
  await withMcpSession({ app: f.app, output: f.output, clientName: `agent-subd-${operation}`, autonomy: 1 }, file, `${operation}-proposal`, async (call, request) => {
    const list = await request('tools/list', {});
    assert.ok(list.tools.find(tool => tool.name === 'subd').inputSchema.properties.action.enum.includes(operation));
    const pick = await call('subd', { action: 'select', index: 0, what: 'faces', normal: [0, 0, 1], withinAngle: 5,
      box: { min: [22, 31, 25], max: [25, 34, 27] } });
    assert.equal(pick.count, 1);
    assert.match(pick.cageRevision, /^[a-f0-9]{64}$/);
    [{ face }] = pick.faces;
    assert.deepEqual(pick.faces[0].centre, centre);
    if (rotate) {
      const vertex = await call('subd', { action: 'select', index: 0, what: 'vertices', box: { min: pivot, max: pivot } });
      assert.equal(vertex.count, 1);
      assert.equal(vertex.cageRevision, pick.cageRevision);
      [{ vertex: pivotVertex }] = vertex.vertices;
      assert.deepEqual(vertex.vertices[0].at, pivot);
      assert.ok(!source.nodes[0].cage.faces[face].includes(pivotVertex));
    }
    const args = { action: operation, index: 0, cageRevision: pick.cageRevision, faces: [face],
      ...(rotate ? { axis: 'z', degrees, pivotVertex } : { factor }) };
    assert.match((await call('subd', args, true)).error, /propos/i);
    const placed = await call('proposals', { action: 'propose', title: 'Reject a placed cage',
      ops: [{ tool: 'subd', args: { ...args, part: 'p1' } }] }, true);
    assert.match(placed.error, /UNKNOWN_ARGUMENT.*"part"/);
    const stale = await call('proposals', { action: 'propose', title: 'Reject an old cage',
      ops: [{ tool: 'subd', args: { ...args, cageRevision: '0'.repeat(64) } }] }, true);
    assert.match(stale.error, /cage revision.*changed/i);
    if (rotate) {
      const invalid = await call('proposals', { action: 'propose', title: 'Reject an invalid cage pivot',
        ops: [{ tool: 'subd', args: { ...args, pivotVertex: source.nodes[0].cage.positions.length / 3 } }] }, true);
      assert.match(invalid.error, /current integer cage vertex ID/);
    }
    const proposal = await call('proposals', { action: 'propose', title: `${rotate ? 'Rotate' : 'Scale'} the selected SubD face`,
      ops: [{ tool: 'subd', args }] });
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    assert.deepEqual(proposal.diff.changed.map(change => change.id), ['n0']);
    const refused = await call('proposals', { action: 'accept', id: 'P1' }, true);
    assert.match(refused.error, /user accepts.*studio/i);
    const { proposals } = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(proposals.map(item => [item.id, item.status, item.stale]), [['P1', 'open', false]]);
  });
  const pendingBytes = await readFile(file, 'utf8'), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, source.nodes);
  f.phase = 'preview and explicitly approve the exact cage in Studio';
  await f.freshOpen(file, pending, `agent-${operation}-pending`);
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  await f.snapshot(`agent-${operation}-preview`);
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  assert.equal(approved.nodes[0].id, source.nodes[0].id);
  assert.deepEqual(approved.outputs, source.outputs);
  const maxError = oracle(source.nodes[0].cage, approved.nodes[0].cage, face, targetPoint);
  const decision = approved.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P1', 'user']);
  const result = await native('approved', approved);
  assert.notEqual(result.sha, original.sha);
  assert.notEqual(result.volume, original.volume);
  await f.snapshot(`agent-${operation}-approved`);
  await f.undo(); await f.same(pending);
  await f.redo(); await f.same(approved);
  const saved = await f.save(`agent-subd-${operation}-approved`);
  await f.freshOpen(saved.file, approved, `agent-${operation}-reopened`);
  assert.equal((await native('approved-reopened', approved)).sha, result.sha);

  f.phase = 'edit the accepted cage in Studio without losing the approval';
  await command('edit cage');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Top').click();
  await button('Box', cagePanel()).click();
  await button('Face', cagePanel()).click();
  const pixel = await f.page.evaluate(centre => window.__studioScreenOf(centre), targetPoint(centre));
  assert.ok(pixel);
  await f.page.mouse.click(...pixel);
  const selected = await f.page.evaluate(() => window.__studioCage().sel);
  assert.deepEqual(selected.faces, [face]);
  if (rotate) {
    await button('Rotate selection', cagePanel()).click();
    await cagePanel().getByLabel('Rotation world axis', { exact: true }).selectOption('2');
    await cagePanel().getByLabel('Selection pivot', { exact: true }).selectOption('vertex');
    await cagePanel().getByLabel('Pivot cage vertex', { exact: true }).fill(String(pivotVertex));
    await cagePanel().getByLabel('Selection angle degrees', { exact: true }).fill(String(-degrees));
  } else {
    await button('Scale selection', cagePanel()).click();
    await cagePanel().getByLabel('Selection scale ratio', { exact: true }).fill(String(1 / factor));
  }
  await button('Apply transform', cagePanel()).click();
  await f.page.waitForFunction(() => document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled') === 'false');
  await button('Done editing cage', cagePanel()).click();
  await cagePanel().waitFor({ state: 'detached' });
  await f.changed(approved);
  const restored = await f.doc();
  const restoreError = oracle(source.nodes[0].cage, restored.nodes[0].cage, face, point => point);
  assert.deepEqual(restored.proposals, approved.proposals);
  assert.ok(restored.history.some(entry => JSON.stringify(entry) === JSON.stringify(decision)));
  await native('manual-inverse', restored);
  await f.undo(); await f.same(approved);
  await f.redo(); await f.same(restored);
  const restoredFile = await f.save(`agent-subd-${operation}-manual-inverse`);
  await f.freshOpen(restoredFile.file, restored, `agent-${operation}-manual-edit-reopened`);
  assert.equal(await readFile(file, 'utf8'), pendingBytes);
  f.report.observations.push({ face, centre, ...(rotate ? { pivot, pivotVertex, degrees } : { factor }), maxError, restoreError, originalVolume: original.volume,
    approvedVolume: result.volume, nativeDigest: result.sha });
});

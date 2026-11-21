import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

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
  name: 'agent-subd-scale', output: process.argv[2], envFrozen: 'AGENT_SUBD_SCALE_FROZEN',
  qualification: 'A local MCP cage selection creates an exact Studio-reviewable scale proposal.',
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
const centre = [23.75, 32.5, 26], factor = 1.1;
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
function oracle(before, after, face, scale) {
  const ids = new Set(before.faces[face]);
  assert.equal(ids.size, 4);
  assert.deepEqual([...ids].map(id => before.positions.slice(id * 3, id * 3 + 3).join(',')).sort(),
    ['20,30,26', '20,35,26', '27.5,30,26', '27.5,35,26']);
  assert.deepEqual(after.faces, before.faces);
  assert.deepEqual(after.creases, before.creases);
  let maxError = 0;
  before.positions.forEach((original, i) => {
    if (!ids.has(Math.floor(i / 3))) { assert.equal(after.positions[i], original); return; }
    const pivot = centre[i % 3], expected = pivot + scale * (original - pivot);
    maxError = Math.max(maxError, Math.abs(after.positions[i] - expected));
  });
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
  let face;
  f.phase = 'discover and propose the current cage scale over local MCP';
  await withMcpSession({ app: f.app, output: f.output, clientName: 'agent-subd-scale', autonomy: 1 }, file, 'scale-proposal', async (call, request) => {
    const list = await request('tools/list', {});
    assert.ok(list.tools.find(tool => tool.name === 'subd').inputSchema.properties.action.enum.includes('scale'));
    const pick = await call('subd', { action: 'select', index: 0, what: 'faces', normal: [0, 0, 1], withinAngle: 5,
      box: { min: [22, 31, 25], max: [25, 34, 27] } });
    assert.equal(pick.count, 1);
    assert.match(pick.cageRevision, /^[a-f0-9]{64}$/);
    [{ face }] = pick.faces;
    assert.deepEqual(pick.faces[0].centre, centre);
    const args = { action: 'scale', index: 0, cageRevision: pick.cageRevision, faces: [face], factor };
    assert.match((await call('subd', args, true)).error, /propos/i);
    const placed = await call('proposals', { action: 'propose', title: 'Reject a placed cage',
      ops: [{ tool: 'subd', args: { ...args, part: 'p1' } }] }, true);
    assert.match(placed.error, /UNKNOWN_ARGUMENT.*"part"/);
    const stale = await call('proposals', { action: 'propose', title: 'Reject an old cage',
      ops: [{ tool: 'subd', args: { ...args, cageRevision: '0'.repeat(64) } }] }, true);
    assert.match(stale.error, /cage revision.*changed/i);
    const proposal = await call('proposals', { action: 'propose', title: 'Scale the selected SubD face',
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
  await f.freshOpen(file, pending, 'agent-scale-pending');
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  await f.snapshot('agent-scale-preview');
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  assert.equal(approved.nodes[0].id, source.nodes[0].id);
  assert.deepEqual(approved.outputs, source.outputs);
  const maxError = oracle(source.nodes[0].cage, approved.nodes[0].cage, face, factor);
  const decision = approved.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P1', 'user']);
  const result = await native('approved', approved);
  assert.notEqual(result.sha, original.sha);
  assert.notEqual(result.volume, original.volume);
  await f.snapshot('agent-scale-approved');
  await f.undo(); await f.same(pending);
  await f.redo(); await f.same(approved);
  const saved = await f.save('agent-subd-scale-approved');
  await f.freshOpen(saved.file, approved, 'agent-scale-reopened');
  assert.equal((await native('approved-reopened', approved)).sha, result.sha);

  f.phase = 'edit the accepted cage in Studio without losing the approval';
  await command('edit cage');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Top').click();
  await button('Box', cagePanel()).click();
  await button('Face', cagePanel()).click();
  const pixel = await f.page.evaluate(centre => window.__studioScreenOf(centre), centre);
  assert.ok(pixel);
  await f.page.mouse.click(...pixel);
  const selected = await f.page.evaluate(() => window.__studioCage().sel);
  assert.deepEqual(selected.faces, [face]);
  await button('Scale selection', cagePanel()).click();
  await cagePanel().getByLabel('Selection scale ratio', { exact: true }).fill(String(1 / factor));
  await button('Apply transform', cagePanel()).click();
  await f.page.waitForFunction(() => document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled') === 'false');
  await button('Done editing cage', cagePanel()).click();
  await cagePanel().waitFor({ state: 'detached' });
  await f.changed(approved);
  const restored = await f.doc();
  const restoreError = oracle(source.nodes[0].cage, restored.nodes[0].cage, face, 1);
  assert.deepEqual(restored.proposals, approved.proposals);
  assert.ok(restored.history.some(entry => JSON.stringify(entry) === JSON.stringify(decision)));
  await native('manual-inverse', restored);
  await f.undo(); await f.same(approved);
  await f.redo(); await f.same(restored);
  const restoredFile = await f.save('agent-subd-scale-manual-inverse');
  await f.freshOpen(restoredFile.file, restored, 'agent-scale-manual-edit-reopened');
  assert.equal(await readFile(file, 'utf8'), pendingBytes);
  f.report.observations.push({ face, centre, factor, maxError, restoreError, originalVolume: original.volume,
    approvedVolume: result.volume, nativeDigest: result.sha });
});

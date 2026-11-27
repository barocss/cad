import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/capsule-shell-agent-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad/src/part/part-capsule-shell.ts',
];
const f = await createFlow({
  name: 'capsule-shell-agent', output: process.argv[2], envFrozen: 'CAPSULE_SHELL_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Stage the exact capsule through Shell through local MCP and approve it in desktop Studio.',
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const [output] = outputs;
console.log(JSON.stringify({ count: outputs.length, mass: massPropertiesOf(output),
  report: checkBrep(output.brep, { strict: true }),
  digest: createHash('sha256').update(JSON.stringify(output.brep)).digest('hex') }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'arc', start: [0, -10], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [10, 0] },
      { kind: 'arc', start: [10, 40], center: [0, 40], direction: 'ccw' },
      { kind: 'line', start: [0, 50] },
    ] },
    { id: 'n1', kind: 'revolve', sketch: 0, axis: 'y', angle: 360 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const both = ['n1.side0', 'n1.side2'];
const volume = 1440 * Math.PI, stockVolume = (4000 + 4000 / 3) * Math.PI;
const rounded = value => Number(value.toFixed(3));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);
const title = 'Open both original capsule hemispheres';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);

await f.run(async () => {
  f.phase = 'Read the original capsule and stage Shell through local MCP';
  const file = join(f.output, 'agent-capsule.bcad');
  const original = Buffer.from(JSON.stringify(stock));
  await writeFile(file, original);
  const staged = await mcp(file, 'propose', async call => {
    const expectedRevision = await currentPartRevision(call);
    const summary = await call('query', { action: 'summary', body: 'b1' });
    assert.equal(summary.facts.volume, rounded(stockVolume));
    const discovered = summary.bodies[0].faces.map(face => face.name);
    assert.deepEqual(discovered, ['n1.side0', 'n1.side1', 'n1.side2']);
    const help = await call('describe', { command: 'shell' });
    const command = { action: 'command', command: 'shell', faces: both, expectedRevision, values: { t: 2 } };
    const propose = args => ({ action: 'propose', title, ops: [{ tool: 'features', args }] });
    const duplicate = { ...command, faces: [both[0], both[0]] };
    if (baseline) {
      const proposal = await call('proposals', propose(duplicate));
      assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
      const expected = 5545.958231137181;
      assert.equal(proposal.change.volume, rounded(rounded(expected) - rounded(stockVolume)));
      return { expectedRevision, help, discovered, change: proposal.change };
    }
    assert.match(help.selection, /capsule.*hemisphere.*expectedRevision/i);
    for (const [args, reason] of [
      [{ ...command, expectedRevision: '0'.repeat(16) }, /part changed/i],
      [duplicate, /distinct face names/i],
      [{ ...command, faces: [both[0], { feature: 'n1', role: 'side0' }] }, /distinct face names/i],
      [{ ...command, faces: ['n1.side0#1', both[1]] }, /no face/i],
      [{ ...command, values: { t: 10 } }, /could not build.*nothing was applied/i],
    ]) {
      assert.match((await call('proposals', propose(args), true)).error, reason);
      assert.deepEqual(await readFile(file), original);
    }
    assert.match((await call('features', command, true)).error, /autonomy L1/i);
    const proposal = await call('proposals', propose(command));
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    assert.equal(proposal.change.volume, rounded(rounded(volume) - rounded(stockVolume)));
    const bytes = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: proposal.proposal }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), bytes);
    return { expectedRevision, help, discovered, change: proposal.change };
  });
  f.report.observations.push(staged);
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, stock.nodes);
  assert.equal(pending.proposals[0].status, 'open');
  await f.freshOpen(file, pending, 'original-capsule-with-pending-shell');
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  near((await f.bodies()).bodies[0].volume, stockVolume);
  await f.snapshot(baseline ? 'baseline-repeated-face-previews-one-end' : 'pending-capsule-shell-preview');
  if (baseline) return;

  await button('Hide', card()).click();
  await button('Preview', card()).waitFor();
  await f.same(pending);
  await button('Preview', card()).click();
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  assert.deepEqual([approved.proposals[0].status, approved.proposals[0].decided.by], ['accepted', 'user']);
  assert.deepEqual(approved.nodes.slice(0, 2), stock.nodes);
  const { sigs, ...feature } = approved.nodes[2];
  assert.deepEqual(feature, {
    id: 'n2', kind: 'shell', parent: { node: 1, side: 'solid' }, thickness: 2, open: both,
  });
  assert.deepEqual(Object.keys(sigs).sort(), both);
  const [lower, upper] = both.map(name => sigs[name]);
  assert.deepEqual([lower.k, upper.k, lower.r, upper.r], ['curved', 'curved', 10, 10]);
  assert.ok(lower.p[1] < 0 && upper.p[1] > 40);
  near(lower.p[1] + upper.p[1], 40);
  near(lower.s, upper.s);
  const native = await f.inspect('approved-tube', approved);
  assert.equal(native.count, 1);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(native.report.topology[0].genus, 1);
  near(native.mass.volume, volume);
  near((await f.bodies()).bodies[0].volume, volume);
  assert.equal(native.digest, '462e66fc687aee99eb3d9d2befd45b4ef7affda9c78dbc0ac5c1eec1991ff493');
  await f.snapshot('studio-approved-shell');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(approved);
  const saved = await f.save('agent-approved-capsule-shell');
  const reopened = (await f.freshOpen(saved.file, approved, 'reopened-agent-shell')).doc;
  assert.deepEqual(await f.inspect('reopened-tube-native', reopened), native);
  const bytes = await readFile(saved.file);
  await mcp(saved.file, 'reopened', async call => {
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.facts.volume, rounded(volume));
    assert.deepEqual(summary.features[2].node, reopened.nodes[2]);
  });
  assert.deepEqual(await readFile(saved.file), bytes);
  await button('Front', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => Math.abs(window.__studioCamera?.().pitch ?? Infinity) < 1e-6);
  await f.snapshot('reopened-capsule-through-shell');
  f.report.observations.push({ native, approvedBy: approved.proposals[0].decided.by });
});

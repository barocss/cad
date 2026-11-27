import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/reviewed-draft-agent-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
];
const f = await createFlow({
  name: 'reviewed-draft-agent', output: process.argv[2], envFrozen: 'REVIEWED_DRAFT_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Bind an Agent Draft Extrude to the reviewed sketch, then approve and reopen it in desktop Studio.',
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
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 9,
  nodes: [
    { id: 'n3', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, 0] },
      { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [0, 10] },
    ] },
    { id: 'n8', kind: 'sketch', profile: 'rectangle', min: [16, 0], max: [34, 9] },
  ],
  outputs: {},
};
const volume = 510.3499758161529;
const inset = 10 * Math.tan(10 * Math.PI / 180);
const rectangleVolume = 10 * (18 * 9 - 27 * inset + 4 * inset * inset / 3);
const rounded = value => Number(value.toFixed(3));
const title = baseline ? 'Draft the latest sketch' : 'Draft reviewed sketch n3';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);

await f.run(async () => {
  f.phase = 'Read both sketch IDs and request a pinned Draft Extrude';
  const file = join(f.output, 'two-finished-sketches.bcad');
  const original = Buffer.from(JSON.stringify(stock));
  await writeFile(file, original);
  const staged = await mcp(file, 'propose', async call => {
    const expectedRevision = await currentPartRevision(call);
    const summary = await call('query', { action: 'summary' });
    const ids = summary.features.map(feature => feature.id);
    assert.deepEqual(ids, ['n3', 'n8']);
    const help = await call('describe', { command: 'extrude' });
    const values = { h: 10, draft: 10 };
    const command = { action: 'command', command: 'extrude', expectedRevision, values: { ...values, sketch: ids[0] } };
    const propose = args => ({ action: 'propose', title, ops: [{ tool: 'features', args }] });
    if (baseline) {
      const refusal = await call('proposals', propose(command), true);
      assert.match(refusal.error, /no value "sketch"/i);
      assert.deepEqual(await readFile(file), original);
      const proposal = await call('proposals', propose({ ...command, values }));
      assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P1', false, rounded(rectangleVolume)]);
      return { expectedRevision, ids, refusal, change: proposal.change };
    }
    assert.match(help.selection, /distance draft.*stable sketch ID.*expectedRevision/i);
    for (const [args, message] of [
      [{ ...command, expectedRevision: undefined }, /needs the current expectedRevision/i],
      [{ ...command, expectedRevision: '0'.repeat(16) }, /part changed/i],
      [{ ...command, values: { ...command.values, sketch: 'n0' } }, /active standalone sketch/i],
      [{ ...command, values: { ...command.values, draft: 30 } }, /draft is too steep.*nothing was applied/i],
    ]) {
      assert.match((await call('proposals', propose(args), true)).error, message);
      assert.deepEqual(await readFile(file), original);
    }
    assert.match((await call('features', command, true)).error, /autonomy L1/i);
    const proposal = await call('proposals', propose(command));
    assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P1', false, rounded(volume)]);
    const bytes = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: proposal.proposal }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), bytes);
    return { expectedRevision, ids, change: proposal.change };
  });
  f.report.observations.push(staged);
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, stock.nodes);
  assert.equal(pending.proposals[0].status, 'open');

  f.phase = 'Preview the proposed solid in desktop Studio';
  await f.freshOpen(file, pending, 'two-sketches-with-pending-draft');
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  assert.equal((await f.bodies()).bodies.length, 0);
  await f.snapshot(baseline ? 'baseline-newest-rectangle-preview' : 'reviewed-quarter-disk-preview');
  if (baseline) return;

  f.phase = 'Hide and approve the reviewed proposal';
  await button('Hide', card()).click();
  await button('Preview', card()).waitFor();
  await f.same(pending);
  await button('Preview', card()).click();
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  const feature = { id: 'n9', kind: 'extrude', sketch: 0, height: 10, draft: 10 };
  assert.deepEqual(approved.nodes, [...stock.nodes, feature]);
  assert.deepEqual([approved.proposals[0].status, approved.proposals[0].decided.by], ['accepted', 'user']);
  const native = await f.inspect('approved-native', approved);
  assert.equal(native.count, 1);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(native.report.counts.faces, 6);
  for (const actual of [native.mass.volume, (await f.bodies()).bodies[0].volume])
    assert.ok(Math.abs(actual - volume) < 1e-7, `${actual} vs ${volume}`);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('approved-quarter-disk');

  f.phase = 'Check Undo, Redo and fresh Open';
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(approved);
  const saved = await f.save('reviewed-draft');
  const reopened = (await f.freshOpen(saved.file, approved, 'reopened-quarter-disk')).doc;
  assert.deepEqual(await f.inspect('reopened-native', reopened), native);
  await mcp(saved.file, 'reopened', async call => {
    const result = await call('query', { action: 'summary' });
    assert.equal(result.facts.volume, rounded(volume));
    assert.deepEqual(result.features[2].node, feature);
  });
  f.report.observations.push({ native, approvedBy: approved.proposals[0].decided.by });
});

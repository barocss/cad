import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const openCap = process.argv.includes('--open-bottom') ? 'bottom' : process.argv.includes('--open-top') ? 'top' : undefined;
const capName = openCap && `n1.${openCap}`;
const opening = capName ? [capName] : [];
const direction = openCap === 'bottom' ? -1 : 1;
const capZ = openCap === 'bottom' ? 0 : 20;
const pins = [
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/app/shellCorner.ts',
  'packages/barocss-cad/src/part/part-shell.ts',
  'apps/cad-studio/test/mcp-browser-session.mjs',
];
const f = await createFlow({
  name: 'closed-l-shell-agent', output: process.argv[2], envFrozen: 'CLOSED_L_SHELL_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Stage a revision-bound L Shell corner and approve its native geometry in Studio.',
  limits: ['One local L1 stdio MCP session and one synthetic original L prism.'],
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc), body = outputs[0], { brep } = body;
console.log(JSON.stringify({ count: outputs.length, volume: massPropertiesOf(body).volume,
  topology: checkBrep(brep, { strict: true }),
  cylinders: brep.faces.map(face => faceGeometry(face)).filter(face => face.kind === 'cylinder').map(face => face.r),
  digest: createHash('sha256').update(JSON.stringify(brep)).digest('hex') }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const volume = openCap ? 5952 - 18 * (4 - Math.PI) : 6624 - 16 * (4 - Math.PI);
const title = `Round the inner corner of the original ${openCap ? 'open-' + openCap + ' ' : ''}L Shell`;
const manualNativeDigests = {
  top: 'eb4262eceedfc28daffb702dcd47614b2632e85302c3d6fc6b3db4d68710984f',
  bottom: '5271414d1534ed86dbc9ff8902459b831d25768661a5b88248e025cac06ce0e1',
};
const reportedVolume = Number(volume.toFixed(3));
const reportedChange = Number((reportedVolume - 12000).toFixed(3));
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

await f.run(async () => {
  f.phase = 'Read the native source and stage the original L Shell through local MCP';
  const file = join(f.output, 'agent-closed-l-shell.bcad');
  const original = Buffer.from(JSON.stringify(stock));
  await writeFile(file, original);
  const receipt = await mcp(file, 'propose', async call => {
    const revision = await currentPartRevision(call);
    const summary = await call('query', { action: 'summary' });
    near(summary.facts.volume, 12000);
    const command = { action: 'command', command: 'shell',
      ...(openCap ? { faces: opening } : { bodies: ['b1'] }), values: { t: 2, join: 'arc' } };
    const propose = args => ({ action: 'propose', title, ops: [{ tool: 'features', args }] });
    const stale = await call('proposals', propose({ ...command, expectedRevision: '0'.repeat(16) }), true);
    assert.match(stale.error, /part changed/i);
    assert.deepEqual(await readFile(file), original);
    if (baseline) {
      if (openCap) {
        const refusal = await call('proposals', propose({ ...command, expectedRevision: revision }), true);
        assert.match(refusal.error, /one exact original body/i);
        assert.deepEqual(await readFile(file), original);
        return { revision, originalCapRefused: capName };
      }
      const unpinned = await call('proposals', propose(command));
      assert.deepEqual([unpinned.proposal, unpinned.applied], ['P1', false]);
      assert.equal(unpinned.change.volume, reportedChange);
      return { revision, unpinned: true, volume: unpinned.change.volume };
    }
    const help = await call('describe', { command: 'shell' });
    assert.match(help.values.join, /expectedRevision/);
    if (openCap) assert.match(help.values.join, /original end cap/);
    const badTargets = openCap ? [
      { ...command, faces: ['n1.side0'] },
      { ...command, faces: [capName, capName] },
      { ...command, faces: ['n1.top', 'n1.bottom'] },
      { ...command, faces: [{ feature: 'n1', role: openCap }] },
      { ...command, bodies: ['b1'] },
    ] : [{ ...command, bodies: ['b1', 'b1'] }, { ...command, faces: ['n1.top'] }];
    for (const [args, reason] of [
      [command, /expectedRevision/],
      ...badTargets.map(args => [{ ...args, expectedRevision: revision }, /one exact original body/i]),
      [{ ...command, values: { t: 5, join: 'arc' }, expectedRevision: revision }, /less than 5 mm/i],
    ]) {
      assert.match((await call('proposals', propose(args), true)).error, reason);
      assert.deepEqual(await readFile(file), original);
    }
    const pinned = { ...command, expectedRevision: revision };
    assert.match((await call('features', pinned, true)).error, /autonomy L1/i);
    const candidate = await call('proposals', propose(pinned));
    assert.deepEqual([candidate.proposal, candidate.applied], ['P1', false]);
    assert.equal(candidate.change.volume, reportedChange);
    const pending = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: candidate.proposal }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), pending);
    return { revision, unpinned: false, volume: candidate.change.volume };
  });
  f.report.observations.push(receipt);
  if (baseline && openCap) {
    await f.freshOpen(file, stock, 'original-stock-after-cap-agent-refusal');
    near((await f.bodies()).bodies[0].volume, 12000);
    return;
  }
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, stock.nodes);
  assert.equal(pending.proposals[0].status, 'open');
  await f.freshOpen(file, pending, 'original-stock-with-pending-shell');
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();
  if (openCap === 'bottom') {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name: 'Bottom', exact: true }).click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  }
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  near((await f.bodies()).bodies[0].volume, 12000);
  await f.snapshot(baseline ? 'unbound-proposal-previews' : 'pinned-shell-preview');
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
  assert.deepEqual(approved.nodes[2], {
    id: 'n2', kind: 'shell', parent: { node: 1, side: 'solid' }, thickness: 2, open: opening, join: 'arc',
    ...(capName ? { sigs: { [capName]: { d: [0, 0, direction], k: 'plane', p: [15, 10, capZ], s: 600 } } } : {}),
  });
  const native = await f.inspect('accepted-round-shell', approved);
  assert.equal(native.count, 1);
  assert.ok(native.topology.valid, native.topology.issues.join('\n'));
  assert.equal(native.topology.counts.shells, openCap ? 1 : 2);
  if (openCap) assert.equal(native.digest, manualNativeDigests[openCap]);
  assert.equal(native.cylinders.length, 1);
  near(native.cylinders[0], 2);
  near(native.volume, volume);
  near((await f.bodies()).bodies[0].volume, volume);
  await f.snapshot('studio-approved-round-shell');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(approved);
  const saved = await f.save('approved-agent-round-shell');
  const reopened = (await f.freshOpen(saved.file, approved, 'reopened-agent-round-shell')).doc;
  assert.deepEqual(await f.inspect('reopened-round-native', reopened), native);
  const bytes = await readFile(saved.file);
  await mcp(saved.file, 'reopened', async call => {
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.facts.volume, reportedVolume);
    assert.deepEqual(summary.features[2].node, reopened.nodes[2]);
  });
  assert.deepEqual(await readFile(saved.file), bytes);
  await button('Section view').click();
  await button('Section across Z').click();
  await button('Flip the section').click();
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const state = window.__studioSection();
    return state?.exact && state.planes[0]?.axis === 'z' && Math.abs(state.planes[0].offset + 10) < 1e-7;
  });
  await f.same(reopened);
  await f.snapshot('reopened-agent-round-section');
  f.report.observations.push({ native, approvedBy: approved.proposals[0].decided.by });
});

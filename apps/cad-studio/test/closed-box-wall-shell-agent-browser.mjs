import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/closed-box-wall-shell-agent-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/app/boxShellSelection.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts',
];
const f = await createFlow({
  name: 'closed-box-wall-shell-agent', output: process.argv[2], envFrozen: 'CLOSED_BOX_WALL_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Review and approve a revision-pinned six-wall closed Shell through local MCP and desktop Studio.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepSurfaceArea, checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { createHash } from 'node:crypto';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = partSnapshot(doc).outputs;
console.log(JSON.stringify({
  hash: createHash('sha256').update(JSON.stringify(output.brep)).digest('hex'),
  mass: massPropertiesOf(output), area: brepSurfaceArea(output.brep),
  report: checkBrep(output.brep, { strict: true }),
}));
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const title = 'Hollow the reviewed stock with six independent walls';
const values = { wallMode: 'per-face', leftWall: 3, rightWall: 5, frontWall: 2, backWall: 4, bottomWall: 2, topWall: 3 };
const walls = { 'n1.side3': 3, 'n1.side1': 5, 'n1.side0': 2, 'n1.side2': 4, 'n1.bottom': 2, 'n1.top': 3 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });

async function verify(label, doc) {
  const feature = doc.nodes[2];
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  assert.deepEqual([feature.kind, feature.parent, feature.opening, feature.walls],
    ['shell-walls', { node: 1, side: 'solid' }, null, walls]);
  assert.deepEqual(Object.keys(feature.sigs).sort(), Object.keys(walls).sort());
  const read = await f.inspect(label, doc);
  assert.ok(read.report.valid);
  assert.deepEqual(read.report.counts, { bodies: 1, shells: 2, faces: 12, loops: 12, coedges: 48, edges: 24, vertices: 16 });
  near(read.mass.volume, 24000 - 32 * 24 * 15);
  near(read.area, 2 * (40 * 30 + 40 * 20 + 30 * 20 + 32 * 24 + 32 * 15 + 24 * 15));
  near((await f.bodies()).bodies[0].volume, read.mass.volume);
  f.report.observations.push({ label, digest: read.hash, volume: read.mass.volume, area: read.area });
  return read;
}

await f.run(async () => {
  const file = join(f.output, 'closed-shell-proposal.bcad'), native = Buffer.from(JSON.stringify(source));
  await writeFile(file, native, { flag: 'wx' });
  f.phase = 'Pin the exact body and current revision in local MCP';
  await mcp(file, 'propose-closed-shell', async call => {
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.facts.volume, 24000);
    assert.ok(summary.bodies.some(body => body.key === 'b1'));
    const expectedRevision = await currentPartRevision(call);
    const command = { action: 'command', command: 'shell', bodies: ['b1'], values, expectedRevision };
    const proposal = (args = command) => ({ action: 'propose', title, ops: [{ tool: 'features', args }] });
    if (baseline) {
      const refused = await call('proposals', proposal(), true);
      assert.match(refused.error, /exact original native face names for its openings/);
      assert.deepEqual(await readFile(file), native);
      return;
    }

    const description = await call('describe', { command: 'shell' });
    assert.match(description.values.wallMode, /expectedRevision.*body.*six/i);
    const { topWall, ...missingTop } = values;
    assert.equal(topWall, 3);
    for (const [args, reason] of [
      [{ ...command, expectedRevision: undefined }, /expectedRevision/],
      [{ ...command, expectedRevision: '0000000000000000' }, /part changed/i],
      [{ ...command, bodies: undefined }, /exact original.*body/i],
      [{ ...command, bodies: ['b1', 'b1'] }, /exact original.*body/i],
      [{ ...command, faces: ['n1.top'] }, /exact original.*body/i],
      [{ ...command, values: missingTop }, /topWall/],
      [{ ...command, values: { ...values, topWall: '3' } }, /topWall/],
      [{ ...command, values: { ...values, rightWall: 37 } }, /leave no cavity/i],
    ]) assert.match((await call('proposals', proposal(args), true)).error, reason);
    assert.match((await call('features', command, true)).error, /autonomy L1/i);
    assert.deepEqual(await readFile(file), native);
    const proposed = await call('proposals', proposal());
    assert.deepEqual([proposed.proposal, proposed.applied], ['P1', false]);
    near(proposed.change.volume, 12480 - 24000);
    const pending = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), pending);
  });

  f.phase = 'Open the exact native file in Studio';
  await f.newPage();
  await f.openFile(file, 2);
  const pending = JSON.parse(await readFile(file, 'utf8'));
  await f.same(pending);
  near((await f.bodies()).bodies[0].volume, 24000);
  if (baseline) {
    await f.snapshot('closed-proposal-refused');
    return;
  }

  assert.deepEqual(pending.nodes, source.nodes);
  assert.equal(pending.proposals[0].status, 'open');
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await card().getByLabel('Volume change').getByText(/^[−-]11,?520(?:\.0+)? mm³/).waitFor();
  await f.same(pending);
  await f.snapshot('closed-proposal-preview');
  await button('Hide', card()).click();
  await f.same(pending);
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc(), history = approved.history.at(-1);
  assert.equal(approved.proposals[0].status, 'accepted');
  assert.deepEqual([history.kind, history.proposal, history.by.agent, history.proposed_by.agent], ['accept', 'P1', 'user', 'chat']);
  const made = await verify('local-agent-approved', approved);
  await f.snapshot('closed-proposal-approved');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(approved);
  const saved = await f.save('approved-six-wall-shell');
  const reopened = (await f.freshOpen(saved.file, approved, 'closed-proposal-reopened')).doc;
  assert.deepEqual(await verify('local-agent-reopened', reopened), made);
  const savedBytes = await readFile(saved.file);
  await mcp(saved.file, 'reopened-closed-shell', async call => {
    const summary = await call('query', { action: 'summary' });
    near(summary.facts.volume, 12480);
    assert.deepEqual(summary.features[2].node, approved.nodes[2]);
    const list = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(list.proposals.map(p => [p.id, p.status]), [['P1', 'accepted']]);
  });
  assert.deepEqual(await readFile(saved.file), savedBytes);
});

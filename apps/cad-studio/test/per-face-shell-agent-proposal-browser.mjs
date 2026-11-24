import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/per-face-shell-agent-proposal-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/app/boxShellSelection.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts'];
const f = await createFlow({
  name: 'per-face-shell-agent-proposal', output: process.argv[2], envFrozen: 'D1955_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Propose a reviewed original-face box Shell through local L1 MCP and explicitly approve it in desktop Studio.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({
  mass: brepMassProperties(brep, 1), check: checkBrep(brep, { strict: true }),
  faces: brep.faces.map(face => ({ name: face.name, loops: face.loops.length, plane: faceGeometry(face) })),
}));
`,
});
const button = (label, scope = f.page) => scope.getByRole('button', { name: label, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const mcp = (path, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, path, label, run);
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const opening = 'n1.side1', title = 'Open the right side with five reviewed wall depths';
const values = { wallMode: 'per-face', leftWall: 3, frontWall: 2, backWall: 4, bottomWall: 4, topWall: 6 };
const walls = { 'n1.side3': 3, 'n1.side0': 2, 'n1.side2': 4, 'n1.bottom': 4, 'n1.top': 6 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

async function verify(label, doc, topWall) {
  const feature = doc.nodes.at(-1);
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  assert.equal(feature.kind, 'shell-walls');
  assert.deepEqual(feature.parent, { node: 1, side: 'solid' });
  assert.equal(feature.opening, opening);
  assert.deepEqual(feature.walls, { ...walls, 'n1.top': topWall });
  assert.deepEqual(Object.keys(feature.sigs).sort(), [opening, ...Object.keys(walls)].sort());
  const native = await f.inspect(label, doc);
  const removed = 37 * 24 * (16 - topWall), volume = 24000 - removed;
  const innerCenter = [21.5, 14, (24 - topWall) / 2];
  near(native.mass.volume, volume);
  native.mass.centroid.forEach((value, axis) => near(value, (24000 * [20, 15, 10][axis] - removed * innerCenter[axis]) / volume));
  assert.equal(native.check.valid, true);
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: 11, loops: 12, coedges: 48, edges: 24, vertices: 16 });
  assert.equal(native.faces.find(face => face.name === opening).loops, 2);
  const roof = native.faces.find(face => face.name === 'n2.in.n1.top');
  assert.deepEqual(roof.plane.n, [0, 0, -1]);
  near(roof.plane.o[2], 20 - topWall);
  near((await f.bodies()).bodies[0].volume, volume);
  f.report.observations.push({ label, topWall, volume: native.mass.volume, nativeCentroid: native.mass.centroid });
  return native;
}

await f.run(async () => {
  const file = join(f.output, 'shell-proposal.bcad'), original = Buffer.from(JSON.stringify(source));
  await writeFile(file, original, { flag: 'wx' });
  await mcp(file, 'propose', async call => {
    f.phase = 'Discover per-face Shell and review the current stock revision with local MCP';
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.facts.volume, 24000);
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'shell' });
    const command = { action: 'command', command: 'shell', faces: [opening], values, expectedRevision };
    const proposal = (args = command) => ({ action: 'propose', title, ops: [{ tool: 'features', args }] });
    if (baseline) {
      assert.equal(description.values.wallMode, undefined);
      const refused = await call('proposals', proposal(), true);
      assert.match(refused.error, /Shell has no value.*bottomWall|Shell has no value.*topWall/i);
      assert.deepEqual(await readFile(file), original);
      return;
    }

    assert.match(description.values.wallMode, /per-face.*expectedRevision/);
    assert.ok(description.values.topWall.includes('mm'));
    const missingTop = { ...values };
    delete missingTop.topWall;
    for (const [args, reason] of [
      [{ ...command, expectedRevision: '0000000000000000' }, /part changed/i],
      [{ ...command, expectedRevision: undefined }, /expectedRevision/],
      [{ ...command, faces: ['n1.bottom'] }, /upper or side face/i],
      [{ ...command, faces: [opening, opening] }, /one exact.*face/i],
      [{ ...command, values: missingTop }, /topWall/],
      [{ ...command, values: { ...values, rightWall: 5 } }, /rightWall/],
      [{ ...command, values: { ...values, topWall: 16 } }, /leave no cavity/i],
    ]) assert.match((await call('proposals', proposal(args), true)).error, reason);
    assert.match((await call('features', command, true)).error, /autonomy L1/i);
    assert.deepEqual(await readFile(file), original);
    const candidate = await call('proposals', proposal());
    assert.deepEqual([candidate.proposal, candidate.applied], ['P1', false]);
    near(candidate.change.volume, -8880);
    const pending = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), pending);
  });

  await f.newPage();
  await f.openFile(file, 2);
  const pending = JSON.parse(await readFile(file, 'utf8'));
  await f.same(pending);
  near((await f.bodies()).bodies[0].volume, 24000);
  if (baseline) {
    await f.snapshot('00-prior-command-refused');
    return;
  }
  assert.deepEqual(pending.nodes, source.nodes);
  assert.equal(pending.proposals[0].status, 'open');
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();
  await f.snapshot('01-pending-original-stock');
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await card().getByLabel('Volume change').getByText(/^[−-]8,?880(?:\.0+)? mm³/).waitFor();
  await f.same(pending);
  near((await f.bodies()).bodies[0].volume, 24000);
  await f.snapshot('02-preview-lateral-shell');

  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  assert.equal(approved.proposals[0].status, 'accepted');
  const decision = approved.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent, decision.proposed_by.agent], ['accept', 'P1', 'user', 'chat']);
  await verify('approved', approved, 6);
  await f.snapshot('03-user-approved-shell');
  await f.undo(); await f.same(pending);
  await f.redo(); await f.same(approved);
  await f.openFeatureEditor(2);
  await f.editor().getByLabel('Top wall', { exact: true }).fill('7');
  const edited = (await f.applyEditor(approved, '04-top-wall-edited')).doc;
  const native = await verify('edited', edited, 7);
  const saved = await f.save('approved-lateral-shell');
  await f.freshOpen(saved.file, edited, '05-fresh-open');
  assert.deepEqual(await verify('reopened', await f.doc(), 7), native);
  const bytes = await readFile(saved.file);
  await mcp(saved.file, 'reopened', async call => {
    const summary = await call('query', { action: 'summary' });
    near(summary.facts.volume, 16008);
    assert.deepEqual(summary.features[2].node, edited.nodes[2]);
    const list = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(list.proposals.map(p => [p.id, p.status]), [['P1', 'accepted']]);
  });
  assert.deepEqual(await readFile(saved.file), bytes);
});

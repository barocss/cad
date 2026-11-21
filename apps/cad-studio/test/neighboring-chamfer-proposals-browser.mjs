import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input, mode] = process.argv.slice(2);
assert.ok(input && output && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
assert.ok(mode === undefined || mode === '--finish');
const finish = mode === '--finish';
const sourceBytes = await readFile(input), source = JSON.parse(sourceBytes);
const faces = ['n2.face#1', 'n2.face#2'], titles = ['Restore the left front corner', 'Restore the right front corner'];
const revision = '53136f70095ade85';
const pins = [
  'apps/cad-studio/test/neighboring-chamfer-proposals-browser.mjs', 'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/server/cadMcp.ts', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/state/useProposalPreview.ts', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts', 'packages/barocss-cad/src/part/part-delete-face.ts',
  'packages/barocss-cad/src/features/heal-prismatic-chamfer.ts',
];
const f = await createFlow({
  name: 'neighboring-chamfer-proposals', envFrozen: 'CHAMFER_PROPOSALS_FROZEN', output,
  initialFiles: pins, requiredFrozen: pins,
  qualification: finish ? 'Approve the remaining exact bevel from a fresh revision and preserve both separate decisions.'
    : 'Approve one of two different pinned chamfer repairs and preserve the stale unapproved proposal and its bevel.',
  limits: ['One 40 × 30 × 10 mm box and two neighboring 2 mm chamfers.', finish ? 'Two separate user approvals.' : 'One user approval.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1) }));
`,
});
const mcp = (file, label, run) => withMcpSession({ app: f.app, output, clientName: 'neighboring-chamfer-proposals', autonomy: 1 }, file, label, run);
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = id => f.page.getByRole('listitem', { name: 'Proposal ' + id, exact: true });
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} != ${expected}`);

async function inspect(label, doc, volume) {
  const result = await f.inspect(label, doc);
  assert.ok(result.report.valid, result.report.issues.join(', '));
  near(result.mass.volume, volume);
  near((await f.bodies()).bodies[0].volume, volume);
  return result;
}

async function approveRemaining(saved, savedBytes, initial, first) {
  f.phase = 'Make a new proposal for the exact right bevel on the reopened checkpoint';
  const file = join(output, 'pending-current-right-chamfer.bcad');
  await copyFile(saved.file, file);
  const title = 'Restore the remaining right front corner';
  const reviewed = await mcp(file, 'current-right', async call => {
    const pin = await call('query', { action: 'render', highlight: [faces[1]] });
    assert.notEqual(pin.revision, revision);
    assert.ok(Object.values(pin.legend).includes(faces[1]));
    assert.ok(!Object.values(pin.legend).includes(faces[0]));
    const args = { action: 'command', command: 'delete-face', faces: [faces[1]], expectedRevision: pin.revision };
    const proposal = await call('proposals', { action: 'propose', title, ops: [{ tool: 'features', args }] });
    assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P3', false, 20]);
    const { proposals } = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(proposals.map(p => [p.id, p.status]), [['P1', 'accepted'], ['P2', 'open'], ['P3', 'open']]);
    assert.deepEqual(proposals.slice(1).map(p => p.stale), [true, false]);
    assert.equal((await call('query', { action: 'summary' })).facts.volume, 11980);
    return pin.revision;
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, initial.nodes);
  assert.deepEqual(pending.proposals.slice(0, 2), initial.proposals);
  await f.freshOpen(file, pending, 'current-right-proposal-opened');
  await button('Chat').first().click();
  await card('P3').getByText(title, { exact: false }).waitFor();
  await card('P2').locator('.stale').waitFor();
  assert.equal(await button('Accept', card('P2')).count(), 0);
  await button('Preview', card('P3')).click();
  await card('P3').getByLabel('Volume change').getByText('+20 mm³ (+0.17%)', { exact: true }).waitFor();
  await f.same(pending);
  await f.snapshot('current-right-reviewed');

  f.phase = 'Approve the second exact repair in its separate history step';
  await button('Accept', card('P3')).click();
  await f.changed(pending);
  const complete = await f.doc(), edit = complete.nodes.at(-1);
  assert.deepEqual(complete.nodes.slice(0, -1), initial.nodes);
  assert.deepEqual([edit.kind, edit.parent, edit.faces], ['delete-face', { node: initial.nodes.length - 1, side: 'solid' }, [faces[1]]]);
  assert.equal(edit.sigs[faces[1]].k, 'plane');
  assert.deepEqual(complete.history.filter(entry => entry.kind === 'accept').map(entry => [entry.proposal, entry.by.agent]),
    [['P1', 'user'], ['P3', 'user']]);
  assert.deepEqual(complete.proposals.slice(0, 2), pending.proposals.slice(0, 2));
  const repaired = await inspect('both-sharp', complete, 12000);
  assert.deepEqual(repaired.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.deepEqual(repaired.brep.faces.map(item => [item.name, item.id]).sort(),
    first.brep.faces.filter(item => item.name !== faces[1]).map(item => [item.name, item.id]).sort());
  for (const name of source.nodes.at(-1).edges) assert.ok(repaired.brep.edges.some(edge => edge.name === name));
  await f.snapshot('both-repairs-approved');

  await f.undo(); await f.same(pending);
  assert.deepEqual((await inspect('undo-second', pending, 11980)).brep, first.brep);
  await f.redo(); await f.same(complete);
  const accepted = await f.save('both-chamfer-repairs-approved'), bytes = await readFile(accepted.file);
  await f.freshOpen(accepted.file, complete, 'two-approvals-fresh-open');
  assert.deepEqual((await inspect('reopened-both-sharp', complete, 12000)).brep, repaired.brep);
  await mcp(accepted.file, 'both-reopened', async call => {
    const { proposals } = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(proposals.map(p => [p.id, p.status]), [['P1', 'accepted'], ['P2', 'open'], ['P3', 'accepted']]);
    assert.equal(proposals[1].stale, true);
    assert.equal((await call('query', { action: 'summary' })).facts.volume, 12000);
    assert.deepEqual(await readFile(accepted.file), bytes);
  });
  assert.deepEqual(await readFile(saved.file), savedBytes);
  assert.deepEqual(await readFile(file), pendingBytes);
  f.report.observations.push({ label: 'second-approval', reviewed, previousVolume: first.mass.volume, finalVolume: repaired.mass.volume,
    savedHash: sha256(bytes) });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Prepare both proposals on the exact same source revision';
  const file = join(output, 'two-pending-chamfer-repairs.bcad');
  await copyFile(input, file);
  await mcp(file, 'both-pending', async call => {
    for (const [index, face] of faces.entries()) {
      const pin = await call('query', { action: 'render', highlight: [face] });
      assert.ok(faces.every(name => Object.values(pin.legend).includes(name)));
      assert.equal(pin.revision, revision);
      const args = { action: 'command', command: 'delete-face', faces: [face], expectedRevision: pin.revision };
      const proposal = await call('proposals', { action: 'propose', title: titles[index], ops: [{ tool: 'features', args }] });
      assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P' + (index + 1), false, 20]);
    }
    const list = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(list.proposals.map(p => [p.id, p.status, p.stale]), [['P1', 'open', false], ['P2', 'open', false]]);
    assert.equal((await call('query', { action: 'summary' })).facts.volume, 11960);
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, source.nodes);
  assert.deepEqual(pending.outputs, source.outputs);
  assert.deepEqual(pending.history.map(entry => [entry.kind, entry.proposal]), [['proposal', 'P1'], ['proposal', 'P2']]);
  await f.freshOpen(file, pending, 'two-current-proposals-opened');
  const before = await inspect('both-rounded', pending, 11960);
  await button('Chat').first().click();

  f.phase = 'Review both current proposals before choosing one';
  await button('Preview', card('P2')).click();
  await button('Hide', card('P2')).waitFor();
  await f.same(pending);
  await f.snapshot('right-proposal-preview');
  await button('Preview', card('P1')).click();
  await card('P1').getByLabel('Volume change').getByText('+20 mm³ (+0.17%)', { exact: true }).waitFor();
  assert.equal(await button('Hide', card('P2')).count(), 0);
  await f.same(pending);
  await f.snapshot('left-proposal-preview');

  f.phase = 'Approve only the left repair and block the other original revision';
  await button('Accept', card('P1')).click();
  await f.changed(pending);
  const accepted = await f.doc(), edit = accepted.nodes.at(-1), decision = accepted.history.at(-1);
  assert.deepEqual(accepted.nodes.slice(0, -1), source.nodes);
  assert.deepEqual([edit.kind, edit.faces], ['delete-face', [faces[0]]]);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P1', 'user']);
  assert.deepEqual(accepted.proposals.map(p => [p.id, p.status]), [['P1', 'accepted'], ['P2', 'open']]);
  assert.deepEqual(accepted.proposals[1], pending.proposals[1]);
  const result = await inspect('one-sharp', accepted, 11980);
  assert.deepEqual(result.report.counts, { bodies: 1, shells: 1, faces: 7, loops: 7, coedges: 30, edges: 15, vertices: 10 });
  assert.deepEqual(result.brep.faces.map(face => [face.name, face.id]).sort(),
    before.brep.faces.filter(face => face.name !== faces[0]).map(face => [face.name, face.id]).sort());
  assert.deepEqual(result.brep.faces.find(face => face.name === faces[1]), before.brep.faces.find(face => face.name === faces[1]));
  assert.ok(result.brep.edges.some(edge => edge.name === source.nodes.at(-1).edges[0]));
  await card('P2').locator('.stale').waitFor();
  assert.equal(await button('Preview', card('P2')).isDisabled(), true);
  assert.equal(await button('Accept', card('P2')).count(), 0);
  await f.snapshot('left-approved-right-stale');
  await button('Rebase & preview', card('P2')).click();
  await f.waitToast(/part changed since the requested revision/i);
  await f.same(accepted);

  await f.undo(); await f.same(pending);
  await card('P2').locator('.stale').waitFor({ state: 'hidden' });
  await f.page.getByText('P2 could not be rebased', { exact: true }).waitFor({ state: 'hidden' });
  await f.redo(); await f.same(accepted);
  const saved = await f.save('left-chamfer-repair-approved'), savedBytes = await readFile(saved.file);
  await f.freshOpen(saved.file, accepted, 'one-approval-fresh-open');
  assert.deepEqual((await inspect('reopened-one-sharp', accepted, 11980)).brep, result.brep);
  await mcp(saved.file, 'reopened', async call => {
    assert.equal((await call('query', { action: 'summary' })).facts.volume, 11980);
    const list = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(list.proposals.map(p => [p.id, p.status]), [['P1', 'accepted'], ['P2', 'open']]);
    assert.equal(list.proposals[1].stale, true);
    const refusal = await call('proposals', { action: 'accept', id: 'P2' }, true);
    assert.match(refusal.error, /P2 is stale/);
    assert.deepEqual(await readFile(saved.file), savedBytes);
  });
  if (finish) await approveRemaining(saved, savedBytes, accepted, result);
  assert.deepEqual(await readFile(file), pendingBytes);
  assert.deepEqual(await readFile(input), sourceBytes);
  f.report.observations.push({ revision, approved: 'P1', stale: 'P2', original: before.mass.volume, accepted: result.mass.volume,
    inputHash: sha256(sourceBytes), pendingHash: sha256(pendingBytes), savedHash: sha256(savedBytes) });
});

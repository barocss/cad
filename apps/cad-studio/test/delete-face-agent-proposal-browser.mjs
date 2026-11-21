import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input, mode] = process.argv.slice(2);
assert.ok(input && output && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
assert.ok(mode === undefined || ['--stale', '--notice-ownership', '--fresh-on-r3'].includes(mode));
const noticeOwnership = mode === '--notice-ownership';
const freshRevision = mode === '--fresh-on-r3';
const staleRecovery = mode === '--stale' || noticeOwnership || freshRevision;
const stockBytes = await readFile(input), stock = JSON.parse(stockBytes);
const title = 'Restore the sharp upper cap edge', face = 'n2.face', sharp = 'n1.side0|n1.top';
const roundedVolume = 12000 - 40 * (4 - Math.PI);
const verifyNear = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} != ${expected}`);
const pins = [
  'apps/cad-studio/test/delete-face-agent-proposal-browser.mjs', 'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/server/cadMcp.ts', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/state/useProposalPreview.ts', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts', 'packages/barocss-cad/src/part/part-delete-face.ts',
  'packages/barocss-cad/src/features/heal-prismatic-fillet.ts',
];
const f = await createFlow({
  name: 'delete-face-agent-proposal', envFrozen: 'DELETE_FACE_PROPOSAL_FROZEN', output,
  initialFiles: pins, requiredFrozen: pins,
  qualification: freshRevision ? 'Propose and approve a new repair on the edited R3 source while the earlier R2 proposal stays stale.'
    : staleRecovery ? 'Block a pending exact repair after a Studio radius edit, then restore the original review with Undo.'
    : 'Propose the exact full-span fillet repair via local MCP, then preview, approve, save and reopen in Studio.',
  limits: ['One R2 upper front fillet on a 40 × 30 × 10 mm box. Local autonomy L1 and one human approval.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1) }));
`,
});
const mcp = (file, label, run) => withMcpSession({ app: f.app, output, clientName: 'delete-face-proposal', autonomy: 1 }, file, label, run);
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = (id = 'P1') => f.page.getByRole('listitem', { name: 'Proposal ' + id, exact: true });
const recheckNotice = () => f.page.getByText('P1 could not be rebased', { exact: true });

async function shownVolume(key) {
  await f.page.waitForFunction(key => {
    const shown = window.__studioSection?.();
    return shown?.shownKeys?.length === 1 && shown.shownKeys[0] === key && Number.isFinite(shown.shownVolume);
  }, key);
  return f.page.evaluate(() => window.__studioSection().shownVolume);
}

async function editSource(pending) {
  await f.openFeatureEditor(2, 'original R2 fillet');
  const radius = f.editor().getByLabel('Radius', { exact: true });
  assert.equal(await radius.inputValue(), '2');
  await radius.fill('3');
  await f.applyEditor(pending, 'edited-source-r3');
  const edited = await f.doc();
  assert.equal(edited.nodes.length, pending.nodes.length);
  assert.equal(edited.nodes.at(-1).radius, 3);
  assert.deepEqual(edited.proposals, pending.proposals);
  const actual = await f.inspect('edited-r3-native', edited), volume = 12000 - 40 * 9 * (1 - Math.PI / 4);
  assert.ok(actual.report.valid);
  verifyNear(actual.mass.volume, volume);
  verifyNear((await f.bodies()).bodies[0].volume, volume);

  f.phase = 'Refuse the pinned R2 repair on the edited R3 source';
  await card().locator('.stale').waitFor();
  assert.equal(await button('Preview', card()).isDisabled(), true);
  assert.equal(await button('Accept', card()).count(), 0);
  await f.snapshot('stale-preview-blocked');
  await button('Rebase & preview', card()).click();
  await f.waitToast(/part changed since the requested revision/i);
  await f.same(edited);
  await recheckNotice().waitFor();
  await f.snapshot('stale-repair-refused');

  const saved = await f.save('stale-cap-heal-r3'), savedBytes = await readFile(saved.file);
  await mcp(saved.file, 'stale-source', async call => {
    const list = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(list.proposals.map(p => [p.id, p.status, p.stale]), [['P1', 'open', true]]);
    const refused = await call('proposals', { action: 'accept', id: 'P1' }, true);
    assert.match(refused.error, /P1 is stale\. Its source or requirements changed/);
    assert.deepEqual(await readFile(saved.file), savedBytes);
  });
  f.report.observations.push({ label: 'stale-source', volume, revisionStillBlocked: true, savedHash: sha256(savedBytes) });
  return { edited, saved, savedBytes, volume, actual };
}

async function restoreSource(pending, edited) {
  const notice = recheckNotice();
  await f.undo();
  await f.same(pending);
  await card().locator('.stale').waitFor({ state: 'hidden' });
  if (noticeOwnership) {
    f.phase = 'Retire the notice with its source and keep it retired on Redo';
    await f.snapshot('undo-restored-source-notice-check');
    await notice.waitFor({ state: 'hidden', timeout: 2500 });
    await f.redo();
    await f.same(edited);
    await card().locator('.stale').waitFor();
    await notice.waitFor({ state: 'hidden', timeout: 2500 });
    await f.snapshot('redo-stale-without-old-notice');
    await f.undo();
    await f.same(pending);
    await card().locator('.stale').waitFor({ state: 'hidden' });
    await notice.waitFor({ state: 'hidden', timeout: 2500 });
  }
  await f.page.waitForFunction(() => {
    const preview = [...document.querySelectorAll('[aria-label="Proposal P1"] button')].find(button => button.textContent === 'Preview');
    return preview && !preview.disabled;
  });
  await f.snapshot('source-undo-restores-review');
}

async function approveFreshRevision({ edited, saved, savedBytes, volume, actual }, oldRevision) {
  f.phase = 'Make a new pinned repair from the current R3 file through local MCP';
  const file = join(output, 'pending-r3-delete-face.bcad');
  await copyFile(saved.file, file);
  const newTitle = 'Restore the sharp edge of the R3 source';
  const revision = await mcp(file, 'fresh-r3', async call => {
    const pin = await call('query', { action: 'render', highlight: [face] });
    assert.ok(Object.values(pin.legend).includes(face));
    assert.notEqual(pin.revision, oldRevision);
    const args = { action: 'command', command: 'delete-face', faces: [face], expectedRevision: pin.revision };
    const proposal = await call('proposals', { action: 'propose', title: newTitle, ops: [{ tool: 'features', args }] });
    assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P2', false, Number((12000 - volume).toFixed(3))]);
    const list = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(list.proposals.map(p => [p.id, p.status, p.stale]), [['P1', 'open', true], ['P2', 'open', false]]);
    return pin.revision;
  });
  const bytes = await readFile(file), pending = JSON.parse(bytes);
  assert.deepEqual(pending.nodes, edited.nodes);
  assert.deepEqual(pending.proposals[0], edited.proposals[0]);
  await f.freshOpen(file, pending, 'pending-two-proposals-opened');
  await button('Chat').first().click();
  await card('P2').getByText(newTitle, { exact: false }).waitFor();
  await card().locator('.stale').waitFor();
  assert.equal(await button('Preview', card()).isDisabled(), true);
  assert.equal(await button('Accept', card()).count(), 0);
  f.phase = 'Review and approve only the new R3 proposal';
  await button('Preview', card('P2')).click();
  await card('P2').getByLabel('Volume change').getByText('+77.26 mm³ (+0.65%)', { exact: true }).waitFor();
  verifyNear(await shownVolume('b3'), 12000);
  await f.same(pending);
  await f.snapshot('fresh-p2-review-p1-stale');
  await button('Accept', card('P2')).click();
  await f.changed(pending);
  const accepted = await f.doc(), edit = accepted.nodes.at(-1), decision = accepted.history.at(-1);
  assert.deepEqual(accepted.nodes.slice(0, -1), edited.nodes);
  assert.deepEqual([edit.kind, edit.faces, edit.sigs[face].r], ['delete-face', [face], 3]);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P2', 'user']);
  assert.deepEqual(accepted.proposals[0], pending.proposals[0]);
  assert.deepEqual(accepted.proposals.map(p => [p.id, p.status]), [['P1', 'open'], ['P2', 'accepted']]);
  const native = await f.inspect('approved-r3', accepted);
  assert.ok(native.report.valid);
  verifyNear(native.mass.volume, 12000);
  assert.deepEqual(native.brep.faces.map(item => [item.name, item.id]).sort(),
    actual.brep.faces.filter(item => item.name !== face).map(item => [item.name, item.id]).sort());
  assert.ok(native.brep.edges.some(item => item.name === sharp));
  await f.snapshot('fresh-p2-approved');
  await f.undo(); await f.same(pending);
  await f.redo(); await f.same(accepted);

  const approved = await f.save('approved-r3-cap-heal');
  await f.freshOpen(approved.file, accepted, 'fresh-open-approved-r3');
  assert.deepEqual((await f.inspect('reopened-r3', accepted)).brep, native.brep);
  await mcp(approved.file, 'reopened-r3', async call => {
    assert.equal((await call('query', { action: 'summary' })).facts.volume, 12000);
    const list = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(list.proposals.map(p => [p.id, p.status]), [['P1', 'open'], ['P2', 'accepted']]);
    assert.equal(list.proposals[0].stale, true);
  });
  assert.deepEqual(await readFile(saved.file), savedBytes);
  assert.deepEqual(await readFile(file), bytes);
  f.report.observations.push({ label: 'fresh-r3-proposal', oldRevision, revision, volumeBefore: volume, volumeAfter: native.mass.volume });
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

  f.phase = 'Propose the exact revision in local MCP without applying';
  const file = join(output, 'pending-delete-face.bcad');
  await copyFile(input, file);
  const revision = await mcp(file, 'pending', async call => {
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.facts.volume, 11965.664);
    const pin = await call('query', { action: 'render', highlight: [face] });
    assert.ok(Object.values(pin.legend).includes(face));
    const edit = { action: 'command', command: 'delete-face', faces: [face], expectedRevision: pin.revision };
    assert.match((await call('features', edit, true)).error, /autonomy L1/i);
    const propose = args => ({ action: 'propose', title, ops: [{ tool: 'features', args }] });
    const stale = await call('proposals', propose({ ...edit, expectedRevision: '0000000000000000' }), true);
    assert.match(JSON.stringify(stale), /part changed.*requested revision/i);
    assert.deepEqual(await readFile(file), stockBytes);
    const proposal = await call('proposals', propose(edit));
    assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P1', false, 34.336]);
    const bytes = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts proposals in the studio/i);
    assert.deepEqual(await readFile(file), bytes);
    assert.deepEqual(await call('query', { action: 'summary' }), summary);
    return pin.revision;
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, stock.nodes);
  assert.deepEqual(pending.outputs, stock.outputs);
  assert.deepEqual(pending.history.map(entry => entry.kind), ['proposal']);
  assert.deepEqual(pending.proposals.map(p => [p.id, p.status]), [['P1', 'open']]);

  await f.freshOpen(file, pending, 'pending-proposal-opened');
  f.phase = 'Review before and after without applying the proposed heal';
  const before = await f.inspect('rounded', pending);
  assert.ok(before.report.valid);
  verifyNear(before.mass.volume, roundedVolume);
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();
  const initial = await shownVolume('b2');
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  const delta = card().getByLabel('Volume change');
  await delta.getByText('+34.34 mm³ (+0.29%)', { exact: true }).waitFor();
  const candidate = await shownVolume('b3');
  assert.ok(candidate > initial, 'The viewport shows the added material before approval.');
  verifyNear(candidate, 12000);
  await f.same(pending);
  await f.snapshot('pending-native-preview');
  await button('Show before', card()).click();
  assert.equal(await shownVolume('b2'), initial);
  await f.same(pending);
  await f.snapshot('pending-original-preview');
  await button('Hide', card()).click();
  assert.equal(await shownVolume('b2'), initial);
  assert.deepEqual(await readFile(file), pendingBytes);

  if (staleRecovery) {
    const revised = await editSource(pending);
    if (freshRevision) {
      await approveFreshRevision(revised, revision);
      assert.deepEqual(await readFile(input), stockBytes);
      assert.deepEqual(await readFile(file), pendingBytes);
      return;
    }
    await restoreSource(pending, revised.edited);
  }

  f.phase = 'Accept only in Studio and inspect the native result';
  await button('Preview', card()).click();
  assert.equal(await shownVolume('b3'), candidate);
  await button('Accept', card()).click();
  await f.changed(pending);
  const accepted = await f.doc(), edit = accepted.nodes.at(-1), decision = accepted.history.at(-1);
  assert.deepEqual(accepted.nodes.slice(0, -1), stock.nodes);
  assert.deepEqual([edit.kind, edit.faces, edit.sigs[face].r], ['delete-face', [face], 2]);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent, decision.proposed_by.agent],
    ['accept', 'P1', 'user', 'chat']);
  assert.deepEqual(accepted.proposals.map(p => [p.id, p.status]), [['P1', 'accepted']]);
  const native = await f.inspect('accepted', accepted);
  assert.ok(native.report.valid);
  verifyNear(native.mass.volume, 12000);
  verifyNear((await f.bodies()).bodies[0].volume, 12000);
  assert.deepEqual(native.brep.faces.map(item => [item.name, item.id]).sort(),
    before.brep.faces.filter(item => item.name !== face).map(item => [item.name, item.id]).sort());
  assert.ok(native.brep.edges.some(item => item.name === sharp));
  await f.snapshot('approved-sharp-cap');
  await f.undo(); await f.same(pending);
  assert.equal(await shownVolume('b2'), initial);
  await f.redo(); await f.same(accepted);
  const saved = await f.save('approved-cap-heal');
  await f.freshOpen(saved.file, accepted, 'fresh-open-approved');
  assert.deepEqual((await f.inspect('reopened', accepted)).brep, native.brep);
  await mcp(saved.file, 'reopened', async call => {
    assert.equal((await call('query', { action: 'summary' })).facts.volume, 12000);
    const result = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(result.proposals.map(p => [p.id, p.status]), [['P1', 'accepted']]);
  });
  assert.deepEqual(await readFile(input), stockBytes);
  assert.deepEqual(await readFile(file), pendingBytes);
  f.report.observations.push({ revision, proposal: 'P1', initial, candidate, sourceHash: sha256(stockBytes),
    pendingHash: sha256(pendingBytes), savedHash: sha256(await readFile(saved.file)) });
});

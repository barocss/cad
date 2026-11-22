import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { captureCounterboreSheet, oracleSource } from './two-sheet-counterbore-svg-oracles.mjs';

const fixture = 'apps/cad-studio/test/fixtures/b06-counterbore-two-sheets-depth-four.bcad';
const bytes = await readFile(new URL('./fixtures/b06-counterbore-two-sheets-depth-four.bcad', import.meta.url));
const seedHash = '0ad88b52c61fb1d1701df7eea8f123cc6f70cfc928082cd7b2ec178b4ae49991';
assert.equal(sha256(bytes), seedHash);
const seed = JSON.parse(bytes);
const pins = [
  fixture,
  'apps/cad-studio/test/counterbore-drawing-agent-revision-browser.mjs',
  'apps/cad-studio/test/two-sheet-counterbore-svg-oracles.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/state/useProposalPreview.ts',
  'apps/cad-studio/src/state/useProposalDrawingCallouts.ts',
  'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  'apps/cad-studio/src/ui/ProposalDrawingCallouts.tsx',
  'apps/cad-studio/src/engine/engine.worker.ts',
  'apps/cad-studio/src/engine/client.ts',
  'apps/cad-studio/src/engine/proposalDrawingCallouts.ts',
  'apps/cad-studio/src/styles.css',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/part/drawingReview.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/proposals.ts',
  'packages/barocss-cad-model/src/chat/tools.ts',
  'packages/barocss-cad-model/src/chat/drawingToleranceStack.ts',
  'packages/barocss-cad-model/src/chat/contract.ts',
  'packages/barocss-cad-model/src/chat/groups.ts',
  'packages/barocss-cad-model/src/drawing/callout.ts',
  'packages/barocss-cad-model/src/drawing/printableCallouts.ts',
  'packages/barocss-cad-model/src/chat/drawing.ts',
  'packages/barocss-cad-model/src/io/svg.ts',
];
const f = await createFlow({
  name: 'counterbore-drawing-agent-revision', envFrozen: 'D1690_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins, oracleSource,
  qualification: 'Switch the displayed proposal, compare its drawing callout in Studio before approval, and match the approved callout against exact SVG after native Open.',
  limits: ['One D675 counterbore and Top callout, two A4 sheets, desktop Studio WebGPU, scripted local L1 MCP. Delay and Retry controls use real worker replies with test-controlled delivery.'],
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });

function checkModel(actual, depth) {
  const model = { ...actual };
  delete model.proposals;
  delete model.history;
  // The proposal may record native signatures for the same drawing references.
  model.drawing = JSON.parse(JSON.stringify(model.drawing, (key, value) => key === 'sig' ? undefined : value));
  const nodes = [...seed.nodes];
  nodes[3] = { ...nodes[3], depth };
  assert.deepEqual(model, { ...seed, nodes });
}

const mcp = { app: f.app, output: f.output, clientName: f.name };

async function matchPrintableCallouts(call, front, top) {
  const read = (sheet, flags) => call('drawing', { action: 'dimensions', sheet, ...flags });
  const first = await read(1, { include_callouts: true });
  const topOnly = await read(2, { include_callouts: true });
  const full = await read(2, { include_callouts: true, include_diameters: true });
  const plain = await read(2, { include_diameters: true });
  const { source, callouts, ...geometric } = full;
  assert.deepEqual(geometric, plain);
  assert.equal(plain.dimensions.find(dimension => dimension.id === top.id).kind, 'diameter');
  assert.deepEqual([first.sheet, full.sheet], [1, 2]);
  assert.deepEqual([first.source, source], [front.source, top.source]);
  assert.equal(first.source, source);
  assert.deepEqual(first.callouts, []);
  assert.deepEqual(callouts, [{ id: top.id, view: 'top', kind: 'diameter', lines: top.printedLines }]);
  assert.deepEqual(topOnly.callouts, callouts);
  assert.match(first.revision, /^[a-f0-9]{64}$/);
  assert.match(full.revision, /^[a-f0-9]{64}$/);
  assert.notEqual(first.revision, full.revision);
  return { source, firstRevision: first.revision, secondRevision: full.revision, callouts };
}

function installCalloutReplyControl() {
  const send = Worker.prototype.postMessage, listening = new WeakSet();
  let armed = false, target, held;
  Worker.prototype.postMessage = function (request, ...args) {
    if (armed && request.type === 'proposalDrawingCallouts') {
      target = { id: request.id, worker: this };
      armed = false;
      if (!listening.has(this)) {
        const receive = this.onmessage;
        this.onmessage = event => {
          if (target?.worker === this && target.id === event.data?.id && event.data?.callouts) {
            held = { worker: this, reply: event.data.callouts, deliver: () => receive.call(this, event) };
            target = undefined;
          } else receive.call(this, event);
        };
        listening.add(this);
      }
    }
    return Reflect.apply(send, this, [request, ...args]);
  };
  window.__calloutReply = {
    arm() { armed = true; },
    read() { return held?.reply; },
    release() { const reply = held; held = undefined; reply.deliver(); },
    fail() {
      const { worker } = held;
      held = undefined;
      worker.dispatchEvent(new ErrorEvent('error', { message: 'Controlled drawing review worker failure', cancelable: true }));
    },
  };
}

await f.run(async () => {
  const stagedFile = join(f.output, 'counterbore-proposal.bcad');
  await writeFile(stagedFile, bytes);
  await f.freshOpen(stagedFile, seed, '01-source-depth-four');
  await button('Drawing').click();
  const initialFront = await captureCounterboreSheet(f, 1, 4, '02-source-sheet-one');
  const initialTop = await captureCounterboreSheet(f, 2, 4, '03-source-sheet-two');
  assert.equal(initialTop.id, 'd4');
  assert.deepEqual(initialFront.callouts, []);
  await f.same(seed);

  f.phase = 'Discover the depth field and stage the revision';
  const { initialPrint, comparisons, pins } = await withMcpSession(mcp, stagedFile, 'counterbore', async call => {
    const printed = await matchPrintableCallouts(call, initialFront, initialTop);
    assert.equal(sha256(await readFile(stagedFile)), seedHash);
    const fields = await call('query', { action: 'edit_fields', index: 3 });
    assert.deepEqual([fields.id, fields.index, fields.revision], ['n3', 3, await currentPartRevision(call)]);
    const depth = fields.fields.find(field => field.key === 'depth');
    assert.deepEqual(depth, { key: 'depth', label: 'Depth', kind: 'number', value: 4, unit: 'mm' });
    const drawing = await call('drawing', { action: 'issues' });
    assert.deepEqual(drawing.sheets.map(sheet => sheet.views.includes('top')), [false, true]);
    const op = { tool: 'features', args: { action: 'edit', index: fields.index, expectedRevision: fields.revision,
      values: { [depth.key]: 2 } } };
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.equal(dry.dryRun, true);
    assert.ok(Math.abs(dry.change.volume - 24 * Math.PI) < .001);
    assert.equal(sha256(await readFile(stagedFile)), seedHash);
    const proposal = await call('proposals', { action: 'propose', title: 'Set the counterbore depth to 2 mm', ops: [op] });
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    const other = await call('proposals', { action: 'propose', title: 'Alternative counterbore depth of 3 mm',
      ops: [{ ...op, args: { ...op.args, values: { [depth.key]: 3 } } }] });
    assert.deepEqual([other.proposal, other.applied], ['P2', false]);
    const staged = await readFile(stagedFile);
    const { proposals } = await call('proposals', { action: 'list' });
    const [p1, p2] = proposals;
    assert.deepEqual(proposals.map(p => [p.id, p.status, p.stale]), [['P1', 'open', false], ['P2', 'open', false]]);
    assert.match(p1.proposalRevision, /^[a-f0-9]{64}$/);
    assert.match(p2.proposalRevision, /^[a-f0-9]{64}$/);
    assert.notEqual(p1.proposalRevision, p2.proposalRevision);
    const readReview = (sheet, expectedRevision, proposal, expectedProposalRevision, refused = false) =>
      call('drawing', { action: 'dimensions', sheet, review: { proposal, expectedRevision, expectedProposalRevision } }, refused);
    const first = await readReview(1, printed.firstRevision, 'P1', p1.proposalRevision);
    const second = await readReview(2, printed.secondRevision, 'P1', p1.proposalRevision);
    assert.deepEqual([first.callouts, first.candidate.callouts], [[], []]);
    assert.deepEqual(second.callouts, printed.callouts);
    assert.deepEqual([first.sheet, first.candidate.sheet, second.sheet, second.candidate.sheet], [1, 1, 2, 2]);
    assert.deepEqual([first.source, second.source], [printed.source, printed.source]);
    assert.equal(first.candidate.source, second.candidate.source);
    assert.notEqual(second.candidate.source, second.source);
    assert.notEqual(first.candidate.revision, second.candidate.revision);
    assert.deepEqual(second.candidate.callouts, [{ id: 'd4', view: 'top', kind: 'diameter', lines: ['Ø4 THRU  CBORE Ø8 × 2 DEEP'] }]);
    assert.deepEqual([second.candidate.proposal, second.candidate.proposalRevision], ['P1', p1.proposalRevision]);
    assert.equal((await readReview(2, printed.secondRevision, 'P1', p2.proposalRevision, true)).code, 'DRAWING_REVIEW_STALE');
    assert.equal((await readReview(1, printed.secondRevision, 'P1', p1.proposalRevision, true)).code, 'DRAWING_REVIEW_BASE');
    assert.equal((await readReview(2, printed.secondRevision, 'P3', p1.proposalRevision, true)).code, 'DRAWING_REVIEW_PROPOSAL');
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(stagedFile), staged);
    return { initialPrint: printed, comparisons: [first, second], pins: [p1.proposalRevision, p2.proposalRevision] };
  });

  const staged = await readFile(stagedFile);
  const pending = JSON.parse(staged);
  checkModel(pending, 4);
  await f.freshOpen(stagedFile, pending, '04-pending-depth-two');
  await button('Chat').first().click();
  let card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  const delta = card.getByLabel('Volume change', { exact: true });
  await delta.getByText(/^\+75\.\d+ mm³/).waitFor();
  assert.ok(Math.abs(Number.parseFloat(await delta.innerText()) - 24 * Math.PI) < .1);
  const calloutChanges = scope => scope.getByRole('group', { name: 'Drawing callout changes', exact: true });
  const checkCalloutChanges = async (scope, expected) => {
    const change = calloutChanges(scope);
    await change.getByText('Sheet 2 · Top · d4', { exact: true }).waitFor();
    assert.deepEqual(await change.locator('dt').allTextContents(), ['Before', 'After']);
    assert.deepEqual(await change.locator('dd').allTextContents(), [initialTop.printedLines[0], expected]);
  };
  await checkCalloutChanges(card, comparisons[1].candidate.callouts[0].lines[0]);
  assert.equal(await calloutChanges(f.page).count(), 1);
  await f.same(pending);
  assert.deepEqual(await readFile(stagedFile), staged);
  await f.snapshot('05-preview-retains-depth-four');

  const alternative = f.page.getByRole('listitem', { name: 'Proposal P2', exact: true });
  await button('Preview', alternative).click();
  await checkCalloutChanges(alternative, 'Ø4 THRU  CBORE Ø8 × 3 DEEP');
  assert.equal(await calloutChanges(card).count(), 0);
  await f.snapshot('05b-alternative-depth-three');
  await button('Hide', alternative).click();
  await calloutChanges(f.page).waitFor({ state: 'detached' });
  await f.same(pending);
  await f.snapshot('05c-callouts-hidden');

  const p1Text = comparisons[1].candidate.callouts[0].lines[0];
  await f.page.evaluate(installCalloutReplyControl);
  const armReply = () => f.page.evaluate(() => window.__calloutReply.arm());
  const waitReply = async () => {
    await f.page.waitForFunction(() => !!window.__calloutReply.read());
    const reply = await f.page.evaluate(() => window.__calloutReply.read());
    return reply.changes[0].after.lines[0];
  };
  f.phase = 'Release the older real P2 callout reply after the visible P1 reply';
  await armReply();
  await button('Preview', alternative).click();
  assert.equal(await waitReply(), 'Ø4 THRU  CBORE Ø8 × 3 DEEP');
  await button('Preview', card).click();
  await checkCalloutChanges(card, p1Text);
  await f.page.evaluate(async () => {
    window.__calloutReply.release();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await checkCalloutChanges(card, p1Text);
  assert.equal(await calloutChanges(alternative).count(), 0);

  f.phase = 'Retry the engine while the same proposal comparison is pending';
  await button('Hide', card).click();
  await armReply();
  await button('Preview', card).click();
  assert.equal(await waitReply(), p1Text);
  await f.page.evaluate(() => window.__calloutReply.fail());
  await button('Retry engine').click();
  await f.ready();
  await button('Preview', card).waitFor();
  await calloutChanges(f.page).waitFor({ state: 'detached' });
  assert.equal(await button('Show before', card).count(), 0);
  await button('Preview', card).click();
  await delta.getByText(/^\+75\.\d+ mm³/).waitFor();
  await checkCalloutChanges(card, p1Text);
  await f.same(pending);
  await f.snapshot('05d-callouts-after-engine-retry');

  f.phase = 'Reject the other proposal while P1 remains previewed';
  await button('Reject', alternative).click();
  await f.changed(pending);
  const rejected = await f.doc();
  checkModel(rejected, 4);
  assert.deepEqual(rejected.proposals.map(p => p.status), ['open', 'rejected']);
  await checkCalloutChanges(card, p1Text);
  assert.deepEqual(await readFile(stagedFile), staged);
  await f.snapshot('05e-other-proposal-rejected');

  await f.freshOpen(stagedFile, pending, '05f-open-original-pending-file');
  await button('Chat').first().click();
  card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await checkCalloutChanges(card, comparisons[1].candidate.callouts[0].lines[0]);
  await button('Show before', card).click();
  await button('Show after', card).waitFor();
  await checkCalloutChanges(card, comparisons[1].candidate.callouts[0].lines[0]);
  await f.same(pending);
  assert.deepEqual(await readFile(stagedFile), staged);
  await button('Accept', card).click();
  await calloutChanges(f.page).waitFor({ state: 'detached' });
  await f.changed(pending);
  const accepted = await f.doc();
  checkModel(accepted, 2);
  assert.deepEqual(accepted.proposals.map(proposal => proposal.status), ['accepted', 'open']);
  assert.deepEqual(accepted.proposals[1], pending.proposals[1]);
  const decision = accepted.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P1', 'user']);

  await button('Drawing').click();
  await f.page.getByRole('tab', { name: 'Sheet 2', exact: true }).click();
  await f.page.getByLabel('Drawing sheet', { exact: true }).getByText('Ø4 THRU CBORE Ø8 × 2 DEEP', { exact: true }).waitFor();
  await f.snapshot('06-current-drawing-after-approval');
  await button('Model').click();
  const saved = await f.save('counterbore-depth-two');
  f.phase = 'Open the approved file in a fresh browser context';
  await f.newPage();
  await f.openFile(saved.file, 4);
  const reopened = await f.doc();
  assert.deepEqual(reopened, saved.doc, 'native Open retains the saved document and proposal decision');
  await f.snapshot('07-fresh-open-depth-two');

  f.phase = 'Read both actual SVGs after fresh Open';
  await button('Drawing').click();
  const front = await captureCounterboreSheet(f, 1, 2, '08-reopened-sheet-one');
  const top = await captureCounterboreSheet(f, 2, 2, '09-reopened-sheet-two');
  assert.deepEqual(front.views, initialFront.views);
  assert.deepEqual(front.callouts, initialFront.callouts);
  assert.equal(top.id, initialTop.id);
  await f.same(reopened);
  const savedBytes = await readFile(saved.file);
  const currentPrint = await withMcpSession(mcp, saved.file, 'reopened-print', async call => {
    const printed = await matchPrintableCallouts(call, front, top);
    const { proposals } = await call('proposals', { action: 'list' });
    assert.deepEqual(proposals.map(p => [p.id, p.status, p.stale]), [['P2', 'open', true]]);
    const offered = await call('drawing', { action: 'dimensions', sheet: 2, review: {
      proposal: 'P2', expectedRevision: printed.secondRevision, expectedProposalRevision: pins[1],
    } }, true);
    assert.equal(offered.code, 'DRAWING_REVIEW_STALE');
    assert.equal(offered.candidate, undefined);
    const acceptedReview = await call('drawing', { action: 'dimensions', sheet: 2, review: {
      proposal: 'P1', expectedRevision: printed.secondRevision, expectedProposalRevision: pins[0],
    } }, true);
    assert.equal(acceptedReview.code, 'DRAWING_REVIEW_PROPOSAL');
    return printed;
  });
  assert.deepEqual(await readFile(saved.file), savedBytes);
  assert.notEqual(currentPrint.source, initialPrint.source);
  assert.notEqual(currentPrint.firstRevision, initialPrint.firstRevision);
  assert.notEqual(currentPrint.secondRevision, initialPrint.secondRevision);
  const [candidateFront, candidateTop] = comparisons.map(comparison => comparison.candidate);
  assert.deepEqual([candidateFront.revision, candidateTop.revision], [currentPrint.firstRevision, currentPrint.secondRevision]);
  assert.equal(candidateTop.source, currentPrint.source);
  assert.deepEqual(candidateTop.callouts, currentPrint.callouts);
  await button('Chat').first().click();
  await button('Rebase & preview', f.page.getByRole('listitem', { name: 'Proposal P2', exact: true })).waitFor();
  assert.equal(await calloutChanges(f.page).count(), 0);
  await f.snapshot('09b-reopened-alternative-is-stale');
  await writeFile(join(f.output, 'printable-callouts.json'), JSON.stringify({ initialPrint, comparisons, currentPrint }, null, 2));

  f.phase = 'Edit the same depth after Open and restore the first callout';
  await button('Model').click();
  await f.openFeatureEditor(3, 'counterbore');
  const depth = f.editor().getByLabel('Depth', { exact: true });
  assert.equal(await depth.inputValue(), '2');
  await depth.fill('4');
  await f.applyEditor(reopened, '10-edit-reopened-depth-to-four');
  checkModel(await f.doc(), 4);
  await button('Drawing').click();
  const restored = await captureCounterboreSheet(f, 2, 4, '11-restored-sheet-two');
  assert.deepEqual(restored.printedLines, initialTop.printedLines);
  assert.deepEqual(restored.paperRadiiMm, initialTop.paperRadiiMm);
  assert.equal(restored.id, initialTop.id);
});

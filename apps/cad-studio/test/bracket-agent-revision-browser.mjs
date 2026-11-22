import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectorSource, oracleSource, seedSHA256, seedText } from './bracket-baseline-oracles.mjs';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

assert.equal(sha256(seedText), seedSHA256);
const seed = JSON.parse(seedText);
const pins = [
  'apps/cad-studio/test/bracket-agent-revision-browser.mjs',
  'apps/cad-studio/test/bracket-baseline-oracles.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/scripts/ai-eval/bracket-revision.ts',
  'apps/cad-studio/server/cadMcp.ts',
  'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'apps/cad-studio/test/fixtures/b01-bracket-w60.bcad',
];
const f = await createFlow({
  name: 'bracket-agent-revision', output: process.argv[2], envFrozen: 'D1683_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins, inspectorSource, oracleSource,
  qualification: 'Discover the locked width through a read-only query, approve a revision-bound proposal, and verify current fields after Studio Save and fresh Open.',
  limits: ['One exact B01 bracket. The scripted L1 MCP calls exercise the tool and approval path. No live model or provider.'],
  snapshotExtra: () => ({
    documentJSON: JSON.stringify(window.__studioDoc),
    rootFresh: window.__studioFresh,
    worker: window.__studioBodies(),
  }),
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const volume = width => 400 * width - 160 + 1315 * Math.PI;

async function verify(snapshot, width) {
  const model = { ...snapshot.doc };
  delete model.history;
  delete model.proposals;
  const parameters = { width };
  const read = await f.inspect(snapshot.label, model, parameters);
  const consumer = { ...snapshot, doc: model, documentJSON: JSON.stringify(model) };
  assert.equal(snapshot.documentJSON, JSON.stringify(snapshot.doc));
  const verdict = await f.runOracle({ doc: model, expectedDoc: model, seedDoc: seed, read, consumer, parameters }, snapshot.label,
    { expectedStatus: 'PASS_ONE_DECLARED_D538_BRACKET_STATE' });
  assert.equal(verdict.worker, 'PASS_ORIGINAL_FRESH_STUDIO_DOC_WORKER');
  return verdict.nativeBRepSHA256;
}

async function lockedWidth(width) {
  await f.page.waitForFunction(expected => {
    const panel = document.querySelector('.sk-panel');
    const length = panel?.querySelector('[aria-label="Edge 1 length"]');
    const depth = panel?.querySelector('[aria-label="Edge 2 length"]');
    return Number(length?.value) === expected && Number(depth?.value) === 40 &&
      length.classList.contains('locked') && depth.classList.contains('locked') &&
      /Fully defined/.test(panel.textContent) && /rank\s*8\s*·\s*0 DOF/.test(panel.textContent);
  }, width);
}

await f.run(async () => {
  const file = join(f.output, 'staged-bracket.bcad');
  await writeFile(file, seedText);
  const start = await f.freshOpen(file, seed, '01-original-W60');
  const native60 = await verify(start, 60);

  f.phase = 'Read the width and stage one revision-bound L1 proposal';
  const session = { app: f.app, output: f.output, clientName: f.name };
  const source = await withMcpSession(session, file, 'bracket', async (call, request) => {
    const summary = await call('query', { action: 'summary', response_format: 'concise' });
    const sketch = summary.features.find(feature => feature.id === seed.nodes[0].id);
    assert.ok(sketch);
    const description = await call('describe', { tool: 'query', action: 'edit_fields' });
    assert.match(JSON.stringify(description), /expectedRevision/);
    const edit = await call('describe', { tool: 'features', action: 'edit' });
    assert.match(JSON.stringify(edit), /query\.edit_fields/);
    const result = await request('tools/call', { name: 'query', arguments: { action: 'edit_fields', index: sketch.index } });
    assert.equal(result.isError, false);
    const fields = result.structuredContent;
    assert.deepEqual(JSON.parse(result.content[0].text), fields);
    assert.deepEqual([fields.id, fields.index, fields.revision], [sketch.id, sketch.index, await currentPartRevision(call)]);
    const field = fields.fields.find(row => row.label === 'Length of edge 1');
    assert.deepEqual(field, { key: 'olen0', label: 'Length of edge 1', kind: 'number', value: 60, unit: 'mm' });
    assert.equal(sha256(await readFile(file)), seedSHA256);
    const revision = fields.revision;
    const op = expectedRevision => ({ tool: 'features', args: { action: 'edit', index: fields.index, expectedRevision, values: { [field.key]: 80 } } });
    const direct = await call('features', op(revision).args, true);
    assert.match(direct.error, /autonomy L1.*only proposes/i);
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [op('0000000000000000')] }, true);
    assert.match(stale.error, /part changed/i);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op(revision)] });
    assert.equal(dry.dryRun, true);
    assert.ok(Math.abs(dry.change.volume - (volume(80) - volume(60))) < .001);
    assert.equal(sha256(await readFile(file)), seedSHA256);
    const proposal = await call('proposals', { action: 'propose', title: 'Widen the support bracket to 80 mm', ops: [op(revision)] });
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    const bytes = await readFile(file);
    const denied = await call('proposals', { action: 'accept', id: 'P1' }, true);
    assert.match(denied.error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), bytes);
    return { index: fields.index, revision, key: field.key };
  });

  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, seed.nodes);
  await f.freshOpen(file, pending, '02-open-pending');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await card.getByLabel('Volume change').getByText(/^\+8,?000(?:\.0+)? mm³(?: \(.*\))?$/).waitFor();
  assert.equal(await verify(await f.snapshot('03-review-W80-with-W60-retained'), 60), native60);
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.snapshot('04-approved-W80');
  assert.deepEqual(accepted.doc.proposals.map(p => p.status), ['accepted']);
  const decision = accepted.doc.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P1', 'user']);
  const native80 = await verify(accepted, 80);
  assert.notEqual(native80, native60);

  const saved = await f.save('b01-bracket-W80');
  const reopened = await f.freshOpen(saved.file, saved.doc, '05-fresh-open-W80');
  assert.equal(await verify(reopened, 80), native80);
  f.phase = 'Read the saved W80 fields and refuse the previous revision';
  await withMcpSession(session, saved.file, 'reopened-bracket', async call => {
    const before = await readFile(saved.file);
    const current = await call('query', { action: 'edit_fields', index: source.index });
    assert.equal(current.id, seed.nodes[0].id);
    assert.equal(current.fields.find(row => row.key === source.key).value, 80);
    assert.notEqual(current.revision, source.revision);
    assert.equal(current.revision, await currentPartRevision(call));
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args: {
      action: 'edit', index: current.index, expectedRevision: source.revision, values: { [source.key]: 60 },
    } }] }, true);
    assert.match(stale.error, /part changed/i);
    assert.deepEqual(await readFile(saved.file), before);
  });
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await lockedWidth(80);
  await f.snapshot('06-locked-W80');
  const field = f.sketchPanel().getByLabel('Edge 1 length', { exact: true });
  await field.fill('60');
  await field.press('Enter');
  await lockedWidth(60);
  await f.same(saved.doc);
  const edited = await f.finishSketch('07-edit-reopened-width-to-W60');
  assert.equal(await verify(edited, 60), native60);
});

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const channel = process.argv.includes('--channel');
const pins = ['apps/cad-studio/test/corner-shell-proposal-rebase-browser.mjs', 'apps/cad-studio/src/state/useProposalPreview.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/part/reviewedShellWalls.ts',
  ...(!baseline ? ['packages/barocss-cad-model/src/chat/cornerShellProposalRebase.ts'] : [])];
const f = await createFlow({
  name: 'corner-shell-proposal-rebase', output: process.argv[2], envFrozen: 'CORNER_SHELL_PROPOSAL_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Rebase one revision-pinned three-opening Shell after an independent body edit. Require a separate Studio approval.',
  limits: ['Two separate rectangular bodies in the base part. The six original Shell source planes must remain exactly identical.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
import { revisionOf } from '@barocss/cad-model/util/revision';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const outputs = partSnapshot(doc).outputs.map(output => ({ id: output.id, digest: digestOf(output.brep),
  valid: checkBrep(output.brep, { strict: true }).valid, volume: massPropertiesOf(output).volume }));
console.log(JSON.stringify({ outputs, revision: revisionOf(doc) }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [55, 0], max: [65, 10] },
    { id: 'n3', kind: 'extrude', sketch: 2, height: 5 }],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
};
const openings = channel ? ['n1.top', 'n1.bottom', 'n1.side0'] : ['n1.top', 'n1.side1', 'n1.side0'];
const walls = channel ? { leftWall: 3, rightWall: 5, backWall: 4 } : { leftWall: 3, backWall: 4, bottomWall: 2 };
const acceptedVolume = channel ? 7360 : 6684;
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const alert = () => f.page.getByText('P1 could not be rebased', { exact: true });
async function showStale() {
  if (!(await card().isVisible())) await button('Chat').first().click();
  await button('Rebase & preview', card()).waitFor();
  assert.equal(await button('Preview', card()).isDisabled(), true);
  assert.equal(await button('Accept', card()).count(), 0);
}
const inspect = (label, doc, volumes) => f.inspect(label, doc).then(result => {
  assert.equal(result.outputs.length, volumes.length);
  assert.ok(result.outputs.every(output => output.valid));
  assert.deepEqual(result.outputs.map(output => Math.round(output.volume)).sort((a, b) => a - b), volumes.slice().sort((a, b) => a - b));
  assert.ok(result.outputs.every(output => Math.abs(output.volume - Math.round(output.volume)) < 1e-7));
  f.report.observations.push({ label, ...result });
  return result;
});
async function edit(index, height, original, label) {
  await f.openFeatureEditor(index, label);
  await f.editor().getByRole('spinbutton', { name: 'Distance', exact: true }).fill(String(height));
  await f.applyEditor(original, label);
  return f.doc();
}

await f.run(async () => {
  const file = join(f.output, 'pending-corner-shell.bcad');
  await writeFile(file, JSON.stringify(stock));
  await withMcpSession({ app: f.app, output: f.output, clientName: 'corner-shell-rebase', autonomy: 1 }, file, 'stage', async call => {
    const expectedRevision = await currentPartRevision(call);
    const result = await call('proposals', { action: 'propose', title: channel ? 'Open both original caps and the front face' : 'Open the original box corner', ops: [{ tool: 'features', args: {
      action: 'command', command: 'shell', faces: [...openings].reverse(), expectedRevision,
      values: { wallMode: 'per-face', ...walls },
    } }] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  await f.freshOpen(file, pending, 'pending');
  const original = await inspect('original', pending, [24000, 500]);
  const changed = await edit(3, 8, pending, 'independent-height-edit');
  const current = await inspect('unrelated-body-edit', changed, [24000, 800]);
  const nativeOf = (result, id) => result.outputs.find(output => output.id === id);
  assert.equal(nativeOf(current, 'n1').digest, nativeOf(original, 'n1').digest);
  assert.notEqual(nativeOf(current, 'n3').digest, nativeOf(original, 'n3').digest);
  const staleFile = baseline ? undefined : await f.save('stale-independent-edit');
  await showStale();
  f.phase = 'rebase review after unrelated body edit';
  await button('Rebase & preview', card()).click();
  if (baseline) {
    await alert().waitFor();
    await f.same(changed);
    assert.equal(await button('Accept', card()).count(), 0);
    await f.snapshot('baseline-rebase-refused');
    return;
  }
  await button('Hide', card()).waitFor();
  const rebased = await f.doc(), [proposal] = rebased.proposals;
  assert.deepEqual(rebased.nodes, changed.nodes);
  assert.equal(proposal.status, 'open');
  assert.equal(proposal.ops[0].args.expectedRevision, current.revision);
  assert.deepEqual(proposal.ops[0].args.faces, pending.proposals[0].ops[0].args.faces);
  assert.ok(proposal.risk.approval.includes('rebased Shell openings'));
  await f.snapshot('rebased-corner-preview');
  await button('Accept', card()).click();
  await f.changed(rebased);
  const accepted = await f.doc();
  assert.deepEqual(accepted.history.map(entry => [entry.kind, entry.by.agent]), [['proposal', 'chat'], ['rebase', 'user'], ['accept', 'user']]);
  assert.deepEqual(accepted.nodes.slice(0, 4), changed.nodes);
  const outcome = await inspect('user-approved', accepted, [800, acceptedVolume]);
  assert.equal(nativeOf(outcome, 'n3').digest, nativeOf(current, 'n3').digest);
  assert.ok(Math.abs(nativeOf(outcome, 'n4').volume - acceptedVolume) < 1e-7);
  const shell = accepted.nodes[4];
  assert.deepEqual([shell.parent.node, shell.opening, shell.secondOpening, shell.thirdOpening], [1, ...openings]);
  await f.undo();
  await f.same(rebased);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('reviewed-corner-shell');
  await f.freshOpen(saved.file, accepted, 'approved-fresh-open');
  assert.deepEqual(await inspect('reopened', accepted, [800, acceptedVolume]), outcome);

  await f.freshOpen(file, pending, 'pending-source-edit');
  const retargeted = await edit(1, 22, pending, 'the-original-stock-changed');
  await showStale();
  await button('Rebase & preview', card()).click();
  await alert().waitFor();
  await f.page.getByText(/original Shell stock changed/i).waitFor();
  await f.same(retargeted);
  assert.equal(await button('Accept', card()).count(), 0);
  await f.snapshot('changed-source-refused');

  f.phase = 'refuse evidence in a previous file across Open';
  await f.freshOpen(file, pending, 'previous-file-with-exact-base');
  await f.openFile(staleFile.file, changed.nodes.length);
  await f.same(changed);
  await showStale();
  await button('Rebase & preview', card()).click();
  await alert().waitFor();
  await f.page.getByText(/original Shell review is missing from this document’s Undo history/i).waitFor();
  await f.same(changed);
  assert.equal(await button('Accept', card()).count(), 0);
  await f.snapshot('cross-document-review-refused');
});

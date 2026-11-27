import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/sketch-corner-proposal-rebase-browser.mjs',
  'apps/cad-studio/src/state/useProposalPreview.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/cornerProposalReview.ts',
];
const f = await createFlow({
  name: 'sketch-corner-proposal-rebase', output: process.argv[2], envFrozen: 'D2066_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Rebase an original two-edge-pair sketch proposal after a Studio extrusion height edit and require separate approval.',
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
import { revisionOf } from '@barocss/cad-model/util/revision';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (input.seed) {
  const profile = profileOf([{ kind:'polygon', closed:true, points:[[0,0],[80,0],[80,40],[0,40]],
    ids:['e1','e2','e3','e4'], hv:{ h:[0,2], v:[1,3] } }]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind:'extrude', sketch:0, height:8 })));
} else {
  const [body, ...other] = partSnapshot(input).outputs;
  assert.equal(other.length, 0);
  const report = checkBrep(body.brep, { strict:true });
  const rounds = body.brep.faces.flatMap(face => {
    const geometry = faceGeometry(face);
    return geometry.kind === 'cylinder' ? [{ name:face.name, ...geometry }] : [];
  });
  console.log(JSON.stringify({ valid:report.valid, volume:massPropertiesOf(body).volume,
    nativeSha256:digestOf(body.brep), revision:revisionOf(input), rounds }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const alert = () => f.page.getByText('P1 could not be rebased', { exact: true });
const corners = [['e1', 'e2'], ['e3', 'e4']];
const session = { app: f.app, output: f.output, clientName: 'D2066', autonomy: 1 };
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} vs ${expected}`);
const inspect = async (label, doc, volume) => {
  const result = await f.inspect(label, doc);
  assert.equal(result.valid, true);
  near(result.volume, volume);
  f.report.observations.push({ label, ...result });
  return result;
};
async function openCard() {
  if (!(await card().isVisible())) await button('Chat').first().click();
  await card().waitFor();
}
async function staleCard() {
  await openCard();
  await button('Rebase & preview', card()).waitFor();
  assert.equal(await button('Preview', card()).isDisabled(), true);
  assert.equal(await button('Accept', card()).count(), 0);
}
async function readCurrentImage(path, earlier, owner) {
  return withMcpSession(session, path, 'rebased-review', async (call, request) => {
    const base = await currentPartRevision(call);
    assert.equal(base, owner);
    const { proposals: [pending] } = await call('proposals', { action: 'list' });
    assert.equal(pending.id, 'P1');
    assert.match(pending.modelReviewRevision, /^[a-f0-9]{64}$/);
    assert.notEqual(pending.modelReviewRevision, earlier);
    const args = { action: 'render', expectedRevision: base, proposal: pending.id, expectedProposalRevision: pending.modelReviewRevision };
    const oldPin = await call('query', { ...args, expectedProposalRevision: earlier }, true);
    assert.equal(oldPin.code, 'MODEL_REVIEW_PROPOSAL_STALE');
    const wire = await request('tools/call', { name: 'query', arguments: args });
    assert.equal(wire.isError, false);
    const meta = JSON.parse(wire.content[0].text), png = Buffer.from(wire.content.find(block => block.type === 'image').data, 'base64');
    assert.equal(sha256(png), meta.imageSha256);
    assert.equal(meta.candidate.baseRevision, base);
    assert.equal(meta.candidate.proposalRevision, pending.modelReviewRevision);
    assert.notEqual(meta.revision, base);
    assert.deepEqual(meta.cornerBatch.faces.map(face => face.sides), corners);
    const native = await call('query', { ...args, action: 'inspect', faces: meta.cornerBatch.faces.map(face => face.name),
      expectedReviewRevision: meta.candidate.reviewRevision });
    assert.deepEqual(native.candidate, meta.candidate);
    for (const face of native.faces) near(face.geometry.radius, 4);
    assert.match((await call('proposals', { action: 'accept', id: pending.id }, true)).error, /user accepts.*studio/i);
    await writeFile(join(f.output, 'rebased-mcp-image.png'), png, { flag: 'wx' });
    f.report.observations.push({ label: 'rebased-mcp-review', ...meta.candidate, candidateRevision: meta.revision, imageSha256: meta.imageSha256 });
    return meta;
  });
}
await f.run(async () => {
  const seed = await f.inspect('seed', { seed: true });
  const file = join(f.output, 'pending-stock.bcad');
  await writeFile(file, JSON.stringify(seed));
  const original = await withMcpSession(session, file, 'stage', async call => {
    const expectedRevision = await currentPartRevision(call);
    const pending = await call('proposals', { action: 'propose', title: 'Round two plate corners',
      ops: [{ tool: 'features', args: { action: 'edit', index: 0, expectedRevision, sketchRound: { sketch: 'n0', corners, radius: 4 } } }] });
    assert.deepEqual([pending.proposal, pending.applied], ['P1', false]);
    return (await call('proposals', { action: 'list' })).proposals[0];
  });
  const staged = JSON.parse(await readFile(file, 'utf8'));
  await f.freshOpen(file, staged, '01-pending-eight-mm');
  await openCard();
  await f.openFeatureEditor(1, 'extrusion');
  await f.editor().getByRole('spinbutton', { name: 'Distance', exact: true }).fill('9');
  await f.applyEditor(staged, '02-stock-height-nine');
  const changed = await f.doc();
  assert.deepEqual(changed.proposals[0], staged.proposals[0]);
  const current = await inspect('stock-nine-native', changed, 28800);
  assert.notEqual(current.revision, staged.proposals[0].ops[0].args.expectedRevision);
  const staleSaved = await f.save('stale-nine');
  await staleCard();
  f.phase = 'User rebase and preview on the modified plate';
  await button('Rebase & preview', card()).click();
  if (baseline) {
    await alert().waitFor();
    await f.same(changed);
    assert.equal(await button('Accept', card()).count(), 0);
    await f.snapshot('03-baseline-pinned-rebase-refused');
    return;
  }

  await button('Hide', card()).waitFor();
  const rebased = await f.doc();
  const [proposal] = rebased.proposals;
  assert.deepEqual(rebased.nodes, changed.nodes);
  assert.equal(proposal.status, 'open');
  assert.deepEqual(proposal.ops[0], { ...staged.proposals[0].ops[0], args: {
    ...staged.proposals[0].ops[0].args, expectedRevision: current.revision,
  } });
  assert.equal(proposal.rebased.original, staged.proposals[0].base);
  assert.deepEqual(rebased.history.map(entry => [entry.kind, entry.by.agent]), [['proposal', 'chat'], ['rebase', 'user']]);
  await f.snapshot('03-rebased-before-approval');
  await button('Hide', card()).click();
  await f.undo();
  await f.same(changed);
  await staleCard();
  await f.redo();
  await f.same(rebased);
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();

  const ready = await f.save('rebased-nine');
  const image = await readCurrentImage(ready.file, original.modelReviewRevision, current.revision);
  await f.same(rebased);
  await button('Accept', card()).click();
  await f.changed(rebased);
  const accepted = await f.doc();
  assert.equal(accepted.proposals[0].status, 'accepted');
  assert.deepEqual(accepted.history.map(entry => [entry.kind, entry.by.agent]), [['proposal', 'chat'], ['rebase', 'user'], ['accept', 'user']]);
  assert.deepEqual(accepted.nodes[1], changed.nodes[1]);
  const expectedVolume = 9 * (80 * 40 - 2 * (16 - 4 * Math.PI));
  const native = await inspect('accepted-nine-native', accepted, expectedVolume);
  assert.equal(native.nativeSha256, image.candidate.bodySha256);
  assert.equal(native.revision, image.revision);
  assert.deepEqual(native.rounds.map(round => round.name).sort(), image.cornerBatch.faces.map(face => face.name).sort());
  for (const round of native.rounds) near(round.r, 4);
  await f.undo();
  await f.same(rebased);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('accepted-nine');
  const reopened = await f.freshOpen(saved.file, accepted, '04-approved-nine-reopens');
  assert.deepEqual(await inspect('reopened-native', reopened.doc, expectedVolume), native);

  await f.freshOpen(staleSaved.file, staleSaved.doc, '05-stale-without-source-history');
  await staleCard();
  await button('Rebase & preview', card()).click();
  await alert().waitFor();
  await f.page.getByText(/original reviewed model is no longer in this document’s Undo history/).waitFor();
  await f.same(changed);
  await f.snapshot('06-missing-original-review-refused');
});

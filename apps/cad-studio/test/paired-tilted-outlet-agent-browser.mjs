import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { render } from './duct-proposal-review-browser-steps.mjs';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { pairedOutletFixture } from './paired-outlet-fixture.mjs';

const baseline = process.argv.includes('--baseline');
const inlet = process.argv.includes('--inlet');
const endpoint = inlet ? 'inlet' : 'outlet';
const sourceFace = inlet ? 'n1.start' : 'n1.end';
const evidenceKey = inlet ? 'pairedTiltedInletReplacement' : 'pairedTiltedOutletReplacement';
const otherEvidenceKey = inlet ? 'pairedTiltedOutletReplacement' : 'pairedTiltedInletReplacement';
const seed = pairedOutletFixture({ replace: true, inlet });
const faces = [sourceFace, 'n3.bottom'];
const pins = [
  'apps/cad-studio/test/paired-outlet-fixture.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/src/ui/ProposalBrowser.tsx', 'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/part/modelCandidate.ts', 'packages/barocss-cad-model/src/chat/part/views.ts',
  ...(!baseline ? ['packages/barocss-cad-model/src/chat/pairedTiltedOutletProposalReview.ts'] : []),
];
const f = await createFlow({
  name: `paired-tilted-${endpoint}-agent`, output: process.argv[2], envFrozen: inlet ? 'D1886_SOURCE_FROZEN' : 'D1882_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Review and explicitly approve the same revision-bound inward tilted ${endpoint} through local MCP and Studio.`,
  limits: [`One native five-span paired duct, its original ${endpoint}, and one isolated tilted donor. The Agent is local.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const part = partBreps(doc).find(entry => entry.key === 'b5');
const { brep } = part, report = checkBrep(brep, { strict: true });
console.log(JSON.stringify({ digest: digestOf(brep), strict: report.valid, genus: report.topology[0].genus,
  volume: brepMassProperties(brep, 1).volume }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} vs ${expected}`);

await f.run(async () => {
  const file = join(f.output, `tilted-${endpoint}-pending.bcad`), seedBytes = Buffer.from(JSON.stringify(seed));
  await writeFile(file, seedBytes);
  const session = { app: f.app, output: f.output, clientName: f.name };
  f.phase = `Propose the named native tilted ${endpoint} through local MCP`;
  const reviewed = await withMcpSession(session, file, 'tilted-pending', async (call, request) => {
    const expectedRevision = await currentPartRevision(call);
    const action = { tool: 'features', args: { action: 'command', command: 'replace-face', faces, expectedRevision } };
    const trial = await call('features', { action: 'batch', dryRun: true, ops: [action] });
    near(trial.change.volume, -32);
    assert.deepEqual(await readFile(file), seedBytes);
    const pending = await call('proposals', { action: 'propose', title: `Replace the original paired duct ${endpoint}`, ops: [action] });
    assert.deepEqual([pending.proposal, pending.applied], ['P1', false]);
    const proposedBytes = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    const { proposals: [entry] } = await call('proposals', { action: 'list' });
    if (baseline) {
      assert.equal(entry.modelReviewRevision, undefined);
      const refused = await call('query', { action: 'render', proposal: 'P1', expectedRevision,
        expectedProposalRevision: '0'.repeat(64) }, true);
      assert.equal(refused.code, 'MODEL_REVIEW_UNAVAILABLE');
      assert.deepEqual(await readFile(file), proposedBytes);
      f.report.observations.push({ label: 'baseline-pinned-review-unavailable', command: 'replace-face', code: refused.code });
      return;
    }
    assert.match(entry.modelReviewRevision, /^[a-f0-9]{64}$/);
    const pin = { expectedRevision, proposal: 'P1', expectedProposalRevision: entry.modelReviewRevision };
    const image = await render(request, pin), opposite = await render(request, { ...pin, orientation: 'opposite' });
    const geometry = image.meta[evidenceKey];
    assert.deepEqual(geometry, opposite.meta[evidenceKey]);
    assert.equal(image.meta[otherEvidenceKey], undefined);
    assert.equal(opposite.meta[otherEvidenceKey], undefined);
    assert.notDeepEqual(image.png, opposite.png);
    assert.notEqual(image.meta.candidate.reviewRevision, opposite.meta.candidate.reviewRevision);
    const identities = [geometry.source, geometry.reference, geometry.candidate];
    assert.deepEqual(identities.map(owner => [owner.body, owner.feature, owner.face]),
      [['b1', 'n1', sourceFace], ['b4', 'n4', 'n3.bottom'], ['b5', 'n5', sourceFace]]);
    if (inlet) {
      const outward = [-4, 1, 0].map(value => value / Math.sqrt(17));
      geometry.candidate.plane.n.forEach((value, axis) => near(value, outward[axis]));
      geometry.reference.plane.n.forEach((value, axis) => near(value, -outward[axis]));
      near(geometry.candidate.plane.o[0] - geometry.candidate.plane.o[1] / 4, -9);
    }
    assert.equal(geometry.source.faceId, geometry.candidate.faceId);
    assert.equal(image.meta.candidate.bodySha256, geometry.candidate.bodySha256);
    assert.equal(opposite.meta.candidate.bodySha256, geometry.candidate.bodySha256);
    assert.equal(geometry.apertures.length, 2);
    assert.equal(new Set(geometry.joins).size, 48);
    near(geometry.volume.delta, -32);
    const inspect = { ...pin, action: 'inspect', faces, expectedReviewRevision: image.meta.candidate.reviewRevision };
    const first = await call('query', inspect);
    const second = await call('query', { ...inspect, orientation: 'opposite', expectedReviewRevision: opposite.meta.candidate.reviewRevision });
    assert.deepEqual(first.faces, second.faces);
    assert.deepEqual(first[evidenceKey], geometry);
    assert.equal(first[otherEvidenceKey], undefined);
    assert.equal(first.imageSha256, image.meta.imageSha256);
    assert.equal(second.imageSha256, opposite.meta.imageSha256);
    assert.equal((await call('query', { ...inspect, orientation: 'opposite' }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
    assert.deepEqual(await readFile(file), proposedBytes);
    await writeFile(join(f.output, 'tilted-review-normal.png'), image.png);
    await writeFile(join(f.output, 'tilted-review-opposite.png'), opposite.png);
    f.report.observations.push({ label: `pinned-tilted-${endpoint}`, geometry, normal: image.meta.candidate, opposite: opposite.meta.candidate });
    return { geometry, inspect };
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, seed.nodes);
  if (reviewed) {
    // Proposal content can change while the base geometry and its revision stay the same.
    const changedProposal = structuredClone(pending), alteredFile = join(f.output, 'tilted-different-proposal.bcad');
    changedProposal.proposals[0].ops[0].args.faces[1] = 'n3.top';
    await writeFile(alteredFile, JSON.stringify(changedProposal));
    await withMcpSession(session, alteredFile, 'tilted-changed-proposal', async call => {
      assert.equal(await currentPartRevision(call), reviewed.inspect.expectedRevision);
      const { proposals: [entry] } = await call('proposals', { action: 'list' });
      assert.match(entry.modelReviewRevision, /^[a-f0-9]{64}$/);
      assert.notEqual(entry.modelReviewRevision, reviewed.inspect.expectedProposalRevision);
      assert.equal((await call('query', reviewed.inspect, true)).code, 'MODEL_REVIEW_PROPOSAL_STALE');
    });
    f.report.observations.push({ label: 'changed-donor-face-on-same-base-refused', code: 'MODEL_REVIEW_PROPOSAL_STALE' });
  }
  const openCard = async label => {
    await f.freshOpen(file, pending, label);
    await button('Chat').first().click();
    return f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  };
  const preview = async (card, label) => {
    await button('Preview', card).click();
    await button('Hide', card).waitFor();
    await f.same(pending);
    await f.snapshot(label);
  };
  const card = await openCard('tilted-pending-studio');
  await preview(card, baseline ? 'tilted-baseline-preview-without-native-pin' : 'tilted-pinned-studio-preview');
  if (baseline) return;
  await button('Hide', card).click();
  await f.openFeatureEditor(4, 'change the donor after native review');
  await f.editor().getByLabel('ΔX').fill(inlet ? '1' : '-1');
  const moved = (await f.applyEditor(pending, 'tilted-donor-changed')).doc;
  assert.equal(moved.nodes.length, 5);
  await card.getByText('stale ·', { exact: true }).waitFor();
  assert.equal(await button('Accept', card).count(), 0);
  await f.snapshot('tilted-stale-approval-withheld');
  const stale = await f.save('tilted-stale-review');
  await withMcpSession(session, stale.file, 'tilted-stale', async call => {
    assert.equal((await call('query', reviewed.inspect, true)).code, 'MODEL_REVIEW_BASE_STALE');
    const { proposals: [entry] } = await call('proposals', { action: 'list' });
    assert.equal(entry.modelReviewRevision, undefined);
  });

  const current = await openCard('tilted-fresh-proposal');
  await preview(current, 'tilted-fresh-preview');
  await button('Accept', current).click();
  await f.changed(pending);
  const approved = (await f.snapshot('tilted-explicitly-approved')).doc;
  assert.equal(approved.proposals[0].status, 'accepted');
  const accepted = await f.inspect('tilted-accepted-native', approved);
  assert.ok(accepted.strict && accepted.genus === 2);
  assert.equal(accepted.digest, reviewed.geometry.candidate.bodySha256);
  near(accepted.volume, 32 * (23 + 15 * Math.PI));
  const saved = await f.save('tilted-approved-review');
  await f.freshOpen(saved.file, approved, 'tilted-approved-fresh-open');
  assert.deepEqual(await f.inspect('tilted-reopened-native', await f.doc()), accepted);
});

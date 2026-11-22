import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { part } from '../src/api';
import { v2Result } from '../src/chat/groups';
import { directInspectionRevision } from '../src/chat/sweepSource';
import { acceptProposal, dispatchTool, previewProposal, type ChatState } from '../src/chat/tools';
import { directOps, emptyDirect, importSource } from '../src/engine/direct';
import { evaluatePart } from '../src/engine/evaluate';
import { featureId } from '../src/engine/ids';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: ChatState['doc']) => evaluatePart(doc, 1);
const call = (state: ChatState, tool: string, args: Record<string, unknown>) => dispatchTool(state, tool, args, evaluate);

test('a pinned Exact Thicken image shows the candidate solids without advancing the working part', async () => {
  const direct = importSource(emptyDirect(), `@model plate {version:0;length-unit:mm;
    @surface #s {type:nurbs;degree-u:1;degree-v:1;knots-u:[0,0,1,1];knots-v:[0,0,1,1];
      control-points:[[[10,0,0],[10,12,0]],[[30,0,0],[30,12,0]]];weights:[[1,1],[1,1]];}
  }`, 'Plate');
  const doc = { ...part().box({ w: 6, d: 6, h: 8 }).doc, direct };
  const base = await evaluate(doc);
  assert.ok(base.ok);
  const state: ChatState = { doc, bodies: base.bodies };
  const firstRevision = directInspectionRevision(doc), surface = direct.objects[0].id;
  const candidateArgs = { action: 'command', command: 'direct-thicken', expectedRevision: firstRevision, values: { surface, t: 3, mode: 'exact-planar' } };
  const propose = (args: Record<string, unknown>) =>
    call(state, 'proposals', { action: 'propose', title: 'Thicken the plate', ops: [{ tool: 'features', args }] });
  const proposal = await propose(candidateArgs);
  assert.equal(proposal.isError, false, proposal.content);
  const pending = proposal.state, [entry] = pending.doc.proposals!;
  const bytes = JSON.stringify(pending.doc);
  const listed = await call(pending, 'proposals', { action: 'list' });
  const [{ directReviewRevision: expectedProposalRevision }] = JSON.parse(listed.content).proposals;
  assert.match(expectedProposalRevision, /^[a-f0-9]{64}$/);
  const args = { action: 'render', expectedDirectRevision: firstRevision, proposal: entry.id, expectedProposalRevision };
  const shown = await call(pending, 'query', args);
  assert.equal(shown.isError, false, shown.content);
  assert.equal(shown.state, pending);
  assert.equal(shown.changed, false);
  assert.equal(JSON.stringify(pending.doc), bytes);
  const [png] = shown.images!;
  assert.equal(png.mediaType, 'image/png');
  const meta = JSON.parse(shown.content);
  const preview = await previewProposal(pending, entry.id, evaluate);
  assert.ok('doc' in preview);
  const candidateDirectRevision = directInspectionRevision(preview.doc);
  assert.equal(meta.imageSha256, createHash('sha256').update(Buffer.from(png.data, 'base64')).digest('hex'));
  assert.deepEqual(meta.candidate, { proposal: entry.id, proposalRevision: expectedProposalRevision,
    baseDirectRevision: firstRevision, directRevision: candidateDirectRevision });
  assert.notEqual(candidateDirectRevision, firstRevision);
  assert.equal(preview.bodies.length, 2);
  assert.equal(meta.revision, revisionOf(preview.doc));
  const names = Object.values(meta.legend) as string[];
  assert.ok(names.some(name => name.startsWith(featureId(doc.nodes, 1) + '.')));
  assert.ok(names.some(name => name.startsWith(featureId(preview.doc.nodes, preview.doc.nodes.length - 1) + '.')));
  const face = names.find(name => name.endsWith('.normal'));
  assert.ok(face, 'the exact top face appears in the image legend');
  const inspect = { ...args, action: 'inspect', faces: [face] };
  const measured = await call(pending, 'query', inspect);
  assert.equal(measured.isError, false, measured.content);
  assert.equal(measured.state, pending);
  assert.equal(measured.changed, false);
  const details = JSON.parse(measured.content);
  assert.equal(details.revision, meta.revision);
  assert.deepEqual(details.candidate, meta.candidate);
  assert.equal(details.unit, 'mm');
  const [measuredFace] = details.faces;
  assert.equal(measuredFace.name, face);
  assert.equal(measuredFace.geometry.kind, 'plane');
  assert.deepEqual(measuredFace.geometry.outwardNormal, [0, 0, 1]);
  assert.equal(measuredFace.geometry.point[2], 3);
  const aliasLikeName = 'get_part_summary.top';
  const imageNames = JSON.stringify({ ...meta, legend: { 1: aliasLikeName } });
  const inspectedNames = JSON.stringify({ ...details, faces: [{ ...measuredFace, name: aliasLikeName }] });
  assert.equal(v2Result(imageNames, 'render_views'), imageNames);
  assert.equal(v2Result(inspectedNames, 'inspect'), inspectedNames);

  const changed = { ...pending, doc: { ...pending.doc, direct: directOps.move(direct, [surface], [0, 0, 1]) } };
  const rejected = { ...pending, doc: { ...pending.doc, proposals: [{ ...entry, status: 'rejected' as const }] } };
  const accepted = await acceptProposal(pending, entry.id, evaluate);
  assert.ok('state' in accepted);
  const approved = await call(accepted.state, 'query', { action: 'render', expectedRevision: meta.revision });
  assert.equal(approved.isError, false, approved.content);
  assert.equal(JSON.parse(approved.content).imageSha256, meta.imageSha256);
  assert.equal(approved.images?.[0].data, png.data);
  const approvedMeasurement = await call(accepted.state, 'query', { action: 'inspect', faces: [face], expectedRevision: meta.revision });
  assert.equal(approvedMeasurement.isError, false, approvedMeasurement.content);
  assert.deepEqual(JSON.parse(approvedMeasurement.content).faces, details.faces);
  for (const [from, input, code] of [
    [pending, { ...args, expectedProposalRevision: 'a'.repeat(64) }, 'DIRECT_RENDER_PROPOSAL_STALE'],
    [changed, args, 'DIRECT_RENDER_STALE'],
    [changed, { ...args, expectedDirectRevision: directInspectionRevision(changed.doc) }, 'DIRECT_RENDER_PROPOSAL_STALE'],
    [rejected, args, 'DIRECT_RENDER_PROPOSAL_UNAVAILABLE'],
    [accepted.state, { ...args, expectedDirectRevision: candidateDirectRevision }, 'DIRECT_RENDER_PROPOSAL_UNAVAILABLE'],
    [pending, { action: 'render', expectedDirectRevision: firstRevision }, 'DIRECT_RENDER_SCOPE'],
  ] as const) {
    const refused = await call(from, 'query', input);
    assert.equal(JSON.parse(refused.content).code, code);
    assert.equal(refused.images, undefined);
    assert.equal(refused.state, from);
  }
  for (const [from, input, code] of [
    [pending, { ...inspect, faces: ['missing'] }, 'NATIVE_FACE_NAME'],
    [pending, { ...inspect, faces: [{ kind: 'plane' }] }, 'NATIVE_FACE_INPUT'],
    [pending, { ...inspect, expectedProposalRevision: undefined }, 'DIRECT_INSPECT_PROPOSAL_INPUT'],
    [pending, { ...inspect, expectedProposalRevision: 'a'.repeat(64) }, 'DIRECT_INSPECT_PROPOSAL_STALE'],
    [changed, inspect, 'DIRECT_INSPECT_STALE'],
    [changed, { ...inspect, expectedDirectRevision: directInspectionRevision(changed.doc) }, 'DIRECT_INSPECT_PROPOSAL_STALE'],
    [rejected, inspect, 'DIRECT_INSPECT_PROPOSAL_UNAVAILABLE'],
    [accepted.state, { ...inspect, expectedDirectRevision: candidateDirectRevision }, 'DIRECT_INSPECT_PROPOSAL_UNAVAILABLE'],
    [accepted.state, { action: 'inspect', faces: [face], expectedRevision: revisionOf(pending.doc) }, 'NATIVE_FACE_STALE'],
  ] as const) {
    const refused = await call(from, 'query', input);
    const reply = JSON.parse(refused.content);
    assert.equal(reply.code, code);
    assert.equal(reply.faces, undefined);
    assert.equal(refused.state, from);
    assert.equal(refused.changed, false);
  }
  assert.equal(JSON.stringify(pending.doc), bytes);
});

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

async function render(request, args) {
  const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });
  assert.equal(reply.isError, false, JSON.stringify(reply.content[0]));
  const meta = JSON.parse(reply.content[0].text);
  const png = Buffer.from(reply.content.find(item => item.type === 'image').data, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(meta.imageSha256, sha256(png));
  assert.equal(Object.keys(meta.views).length, 4);
  return { meta, png };
}

export async function reviewPendingDuct(f, call, request, expectedRevision, values, pathKind, orientationMode) {
  const { proposals: [first, second] } = await call('proposals', { action: 'list' });
  assert.deepEqual([first.id, second.id], ['P1', 'P2']);
  for (const item of [first, second]) assert.match(item.modelReviewRevision, /^[0-9a-f]{64}$/);
  assert.notEqual(first.modelReviewRevision, second.modelReviewRevision);
  const pins = { expectedRevision, proposal: first.id, expectedProposalRevision: first.modelReviewRevision };
  const twin = { ...pins, proposal: second.id, expectedProposalRevision: second.modelReviewRevision };
  const { meta, png } = await render(request, pins);
  const other = await render(request, twin);
  assert.deepEqual(other.png, png);
  assert.notEqual(other.meta.candidate.reviewRevision, meta.candidate.reviewRevision);
  assert.deepEqual([meta.candidate.proposal, meta.candidate.proposalRevision, meta.candidate.baseRevision],
    [first.id, first.modelReviewRevision, expectedRevision]);
  assert.notEqual(meta.revision, expectedRevision);
  assert.match(meta.candidate.bodySha256, /^[0-9a-f]{64}$/);
  assert.equal(meta.rectangularDuct.pathKind, pathKind);
  const { body, sketch, path, pathRevision, caps, exteriorSeams, interiorSeams } = meta.rectangularDuct;
  assert.deepEqual([body, sketch, path, pathRevision], ['b1', values.sketch, values.path, values.pathRevision]);
  const faces = ['n1.start', 'n1.end'];
  assert.deepEqual(caps.map(({ name, outerEdges, innerEdges }) => [name, outerEdges.length, innerEdges.length]),
    faces.map(name => [name, 4, 4]));
  assert.deepEqual([exteriorSeams.length, interiorSeams.length], [4, 4]);
  assert.equal(new Set([...exteriorSeams, ...interiorSeams]).size, 8);
  const labels = Object.values(meta.legend);
  const visibleCaps = faces.filter(name => Object.values(meta.views).some(view => view.visible_faces.includes(name)));
  if (pathKind) {
    assert.ok(labels.some(name => name.startsWith('n1.line.side[')));
    assert.ok(labels.some(name => name.startsWith('n1.bend.side[')));
  } else {
    assert.ok(faces.some(name => labels.includes(name)));
  }
  for (const [changed, code] of [
    [{ expectedRevision: '0'.repeat(16) }, 'MODEL_REVIEW_BASE_STALE'],
    [{ expectedProposalRevision: second.modelReviewRevision }, 'MODEL_REVIEW_PROPOSAL_STALE'],
  ]) assert.equal((await call('query', { action: 'render', ...pins, ...changed }, true)).code, code);
  const lookup = { action: 'inspect', faces, ...pins };
  assert.equal((await call('query', lookup, true)).code, 'MODEL_REVIEW_INPUT');
  const reviewPin = { ...lookup, expectedReviewRevision: meta.candidate.reviewRevision };
  assert.equal((await call('query', { ...reviewPin, ...twin }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  const native = await call('query', reviewPin);
  assert.deepEqual([native.candidate, native.revision, native.imageSha256, native.rectangularDuct],
    [meta.candidate, meta.revision, meta.imageSha256, meta.rectangularDuct]);
  assert.deepEqual(native.faces.map(face => [face.name, face.body, face.geometry.kind]), faces.map(name => [name, 'b1', 'plane']));
  await writeFile(join(f.output, 'candidate-duct-four-views.png'), png);
  f.report.observations.push({ label: 'pending-duct-review', ...meta.candidate, imageSha256: meta.imageSha256,
    revision: meta.revision, rectangularDuct: meta.rectangularDuct, visibleCaps });
  const alternate = orientationMode && await reviewOppositeDuct(f, call, request, pins, { meta, faces, lookup, native }, orientationMode);
  return { meta, png, faces, native, reviewPin, alternate };
}

async function reviewOppositeDuct(f, call, request, pins, standard, mode) {
  const orientation = 'opposite', args = { ...pins, orientation };
  if (mode === 'baseline') {
    const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });
    const result = JSON.parse(reply.content[0].text);
    assert.ok(reply.isError || result.imageSha256 === standard.meta.imageSha256);
    f.report.observations.push({ label: 'opposite-orientation-unavailable', toolError: reply.isError, result });
    return;
  }
  const { meta, png } = await render(request, args);
  assert.equal(meta.orientation, orientation);
  assert.notEqual(meta.imageSha256, standard.meta.imageSha256);
  assert.deepEqual(Object.keys(meta.views), ['back', 'top', 'left', 'iso']);
  const arcFirst = standard.meta.rectangularDuct.pathKind === 'arc-and-line';
  assert.ok(meta.views.left.visible_faces.includes(arcFirst ? 'n1.end' : 'n1.start'));
  assert.ok(meta.views.back.visible_faces.includes(arcFirst ? 'n1.start' : 'n1.end'));
  assert.deepEqual(meta.rectangularDuct, standard.meta.rectangularDuct);
  assert.equal(meta.candidate.bodySha256, standard.meta.candidate.bodySha256);
  assert.notEqual(meta.candidate.reviewRevision, standard.meta.candidate.reviewRevision);
  const pin = { ...standard.lookup, orientation, expectedReviewRevision: meta.candidate.reviewRevision };
  assert.equal((await call('query', { ...pin, orientation: 'standard' }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  assert.equal((await call('query', { ...pin, expectedReviewRevision: standard.meta.candidate.reviewRevision }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  const native = await call('query', pin);
  assert.deepEqual(native.faces, standard.native.faces);
  assert.deepEqual([native.candidate, native.imageSha256], [meta.candidate, meta.imageSha256]);
  await writeFile(join(f.output, 'candidate-duct-opposite-views.png'), png);
  f.report.observations.push({ label: 'opposite-duct-review', ...meta.candidate, orientation, imageSha256: meta.imageSha256,
    left: meta.views.left.visible_faces, back: meta.views.back.visible_faces });
  return { png, orientation };
}

export async function checkApprovedDuctReview(call, request, reviewed) {
  const expectedRevision = await currentPartRevision(call);
  assert.equal(expectedRevision, reviewed.meta.revision);
  assert.deepEqual((await render(request, { expectedRevision })).png, reviewed.png);
  if (reviewed.alternate) {
    const { orientation, png } = reviewed.alternate;
    assert.deepEqual((await render(request, { expectedRevision, orientation })).png, png);
  }
  const current = await call('query', { action: 'inspect', faces: reviewed.faces, expectedRevision });
  assert.deepEqual(current.faces, reviewed.native.faces);
  assert.equal((await call('query', { ...reviewed.reviewPin, expectedRevision }, true)).code, 'MODEL_REVIEW_UNAVAILABLE');
}

export async function checkChangedDuctPath(session, pending, reviewed, controlPoints) {
  const altered = structuredClone(pending), { path, pathRevision } = reviewed.meta.rectangularDuct;
  const { source } = altered.direct.objects.find(object => object.id === path);
  const before = altered.direct.sources[source];
  const nextPoints = controlPoints.map(point => point.map(value => value * 2));
  altered.direct.sources[source] = before.replace(JSON.stringify(controlPoints), JSON.stringify(nextPoints));
  assert.notEqual(altered.direct.sources[source], before);
  const file = join(session.output, 'duct-proposal-changed-path.bcad'), bytes = JSON.stringify(altered);
  await writeFile(file, bytes);
  await withMcpSession(session, file, 'duct-changed-path', async call => {
    const expectedRevision = await currentPartRevision(call);
    const { direct_curves: curves } = await call('query', { action: 'summary' });
    assert.notEqual(curves.find(curve => curve.id === path).revision, pathRevision);
    assert.equal(expectedRevision, reviewed.meta.candidate.baseRevision);
    const result = await call('query', { action: 'render', expectedRevision, proposal: reviewed.meta.candidate.proposal,
      expectedProposalRevision: reviewed.meta.candidate.proposalRevision }, true);
    assert.equal(result.code, 'MODEL_REVIEW_PROPOSAL_STALE');
  });
  assert.equal(await readFile(file, 'utf8'), bytes);
}

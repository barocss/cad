import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

export async function render(request, args) {
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

export async function reviewPendingPairedDuct(f, call, request, expectedRevision, pathRevision, expected, sideTags, { lead = 0, tail, spaced, sameTurn, directArcs, arcAndLine }) {
  const { proposals: [proposal] } = await call('proposals', { action: 'list' });
  assert.equal(proposal.id, 'P1');
  assert.match(proposal.modelReviewRevision, /^[0-9a-f]{64}$/);
  const pins = { expectedRevision, proposal: proposal.id, expectedProposalRevision: proposal.modelReviewRevision };
  const { meta, png } = await render(request, pins);
  const opposite = await render(request, { ...pins, orientation: 'opposite' });
  const evidence = meta.rectangularDuct;
  assert.deepEqual([evidence.body, evidence.sketch, evidence.path, evidence.pathRevision, evidence.pathKind],
    ['b1', 'n0', 'rail', pathRevision, lead ? 'line-arc-line-arc' : spaced ? 'arc-line-arc' : directArcs ? 'two-arc' : arcAndLine ? 'arc-and-line' : tail ? 'line-arc-line' : 'line-and-arc']);
  assert.deepEqual(opposite.meta.rectangularDuct, evidence);
  assert.notEqual(opposite.meta.imageSha256, meta.imageSha256);
  assert.notEqual(opposite.meta.candidate.reviewRevision, meta.candidate.reviewRevision);
  for (const review of [meta, opposite.meta]) {
    assert.deepEqual([review.candidate.proposal, review.candidate.baseRevision, review.candidate.bodySha256],
      [proposal.id, expectedRevision, expected.digest]);
  }
  const startView = arcAndLine ? opposite.meta.views.back : opposite.meta.views.left;
  assert.ok(startView.visible_faces.includes('n1.start'));
  assert.ok((sameTurn || arcAndLine ? opposite.meta.views.left : spaced || directArcs ? meta.views.right : opposite.meta.views.back).visible_faces.includes('n1.end'));

  const tagOf = name => name.match(/\[(e\d+)\]$/)?.[1];
  const sorted = values => values.toSorted();
  const near = (actual, value) => assert.ok(Math.abs(actual - value) < 1e-7, JSON.stringify({ actual, value }));
  const pointNear = (actual, value) => actual.forEach((coordinate, axis) => near(coordinate, value[axis]));
  const ownedBy = (names, tags) => names.some(name => tags.includes(tagOf(name)));
  const seamIds = (tags, junction) => expected.joints
    .filter(joint => (junction === undefined || joint.junction === junction) && ownedBy(joint.faces.map(face => face.name), tags))
    .map(joint => joint.edgeId);
  const wallNames = tags => expected.wallNames.filter(name => tags.includes(tagOf(name)));
  const paired = evidence.throughApertures;
  const { dimensions, volume, centroid } = paired;
  if (spaced || directArcs) {
    near(dimensions.firstRadius, 12);
    near(dimensions.secondRadius, 18);
    if (spaced) near(dimensions.lineLength, 8);
    else assert.equal(dimensions.lineLength, undefined);
    if (lead) near(dimensions.leadLength, lead);
    else assert.equal(dimensions.leadLength, undefined);
    near(dimensions.firstSweepRadians, Math.PI / 2);
    near(dimensions.secondSweepRadians, Math.PI / 2);
  } else {
    near(dimensions.pathRadius, 20);
    if (arcAndLine) {
      assert.equal(dimensions.leadLength, undefined);
      near(dimensions.tailLength, 10);
    } else {
      near(dimensions.leadLength, 10);
      if (tail) near(dimensions.tailLength, tail);
      else assert.equal(dimensions.tailLength, undefined);
    }
    near(dimensions.sweepRadians, Math.PI / 2);
  }
  near(dimensions.axialWeb, 2);
  assert.deepEqual(dimensions.exterior, { radial: 4, axial: 10 });
  near(volume.analytic, 32 * (spaced ? lead + 8 + 15 * Math.PI : directArcs ? 15 * Math.PI : 10 + 10 * Math.PI + tail));
  near(volume.native, expected.quadrature.volume);
  pointNear(centroid.analytic, expected.quadrature.centroid);
  pointNear(centroid.native, expected.quadrature.centroid);
  assert.ok(paired.maximumGapMM < 1e-8);
  assert.deepEqual(sorted(paired.exteriorFaces), sorted(wallNames(sideTags.outer)));
  assert.deepEqual(sorted(evidence.exteriorSeams), sorted(seamIds(sideTags.outer)));
  assert.equal(paired.apertures.length, 2);
  for (const [index, tags] of sideTags.holes.entries()) {
    const aperture = paired.apertures[index];
    assert.deepEqual([aperture.index, aperture.tags, aperture.dimensions], [index, tags, { radial: 2, axial: 2 }]);
    assert.deepEqual(sorted(aperture.faces), sorted(wallNames(tags)));
    assert.deepEqual(sorted(aperture.seams), sorted(seamIds(tags)));
    assert.deepEqual(sorted(evidence.interiorSeams[index]), sorted(aperture.seams));
  }
  if (tail || spaced || directArcs || arcAndLine) {
    const pieces = spaced ? [['first', 'line'], ['line', 'second']] : directArcs ? [['first', 'second']] : arcAndLine ? [['bend', 'line']] : [['line', 'bend'], ['bend', 'tail']];
    if (lead) pieces.unshift(['lead', 'first']);
    assert.deepEqual(paired.junctions.map(joint => joint.pieces), pieces);
    for (const [index, joint] of paired.junctions.entries()) {
      assert.deepEqual(sorted(joint.exteriorSeams), sorted(seamIds(sideTags.outer, index)));
      assert.deepEqual(joint.interiorSeams.map(sorted), sideTags.holes.map(tags => sorted(seamIds(tags, index))));
    }
  } else assert.equal(paired.junctions, undefined);
  assert.deepEqual(evidence.caps.map(cap => cap.name), ['n1.start', 'n1.end']);
  for (const cap of evidence.caps) {
    const native = expected.caps.find(value => value.name === cap.name);
    const centers = spaced ? [[lead ? -lead : 0, 0, 0], [sameTurn ? -6 : 30, 38, 0]] : directArcs ? [[0, 0, 0], [sameTurn ? -6 : 30, 30, 0]] : [[-10, 0, 0], [20, 20 + tail, 0]];
    const authoredCenters = arcAndLine ? centers.toReversed() : centers;
    pointNear(cap.center, authoredCenters[cap.name === 'n1.start' ? 0 : 1]);
    if (arcAndLine || (lead && cap.name === 'n1.start')) assert.ok(native.loops.flatMap(loop => loop.edges).every(edge => edge.bound));
    pointNear(cap.plane.origin, native.plane.o);
    pointNear(cap.plane.normal, native.plane.n);
    const loopIds = tags => sorted(native.loops.find(loop => ownedBy(loop.edges.map(edge => edge.side), tags)).edges.map(edge => edge.id));
    assert.deepEqual(sorted(cap.outerEdges), loopIds(sideTags.outer));
    assert.equal(cap.apertures.length, 2);
    for (const [index, tags] of sideTags.holes.entries()) {
      const aperture = cap.apertures[index];
      assert.deepEqual([aperture.index, aperture.tags, aperture.dimensions], [index, tags, { radial: 2, axial: 2 }]);
      assert.deepEqual(sorted(aperture.edges), loopIds(tags));
      pointNear(aperture.center, [...cap.center.slice(0, 2), index ? 2 : -2]);
    }
    assert.deepEqual(cap.innerEdges, cap.apertures.flatMap(aperture => aperture.edges));
  }

  const faces = spaced
    ? ['n1.start', 'n1.end', 'n1.line.side[e6]', 'n1.first.side[e8]', 'n1.line.side[e10]', 'n1.second.side[e12]']
    : directArcs ? ['n1.start', 'n1.end', 'n1.first.side[e6]', 'n1.first.side[e10]', 'n1.second.side[e6]', 'n1.second.side[e10]']
    : ['n1.start', 'n1.end', 'n1.line.side[e6]', 'n1.bend.side[e8]', 'n1.line.side[e10]', 'n1.bend.side[e12]'];
  if (tail) faces.push('n1.tail.side[e6]', 'n1.tail.side[e10]');
  if (lead) faces.push('n1.lead.side[e6]', 'n1.lead.side[e10]');
  const reviewPin = { ...pins, action: 'inspect', faces, expectedReviewRevision: meta.candidate.reviewRevision };
  const native = await call('query', reviewPin);
  assert.deepEqual([native.candidate, native.revision, native.imageSha256, native.rectangularDuct],
    [meta.candidate, meta.revision, meta.imageSha256, evidence]);
  assert.deepEqual(native.faces.map(face => [face.name, face.geometry.kind]), faces.map(name => [name, 'plane']));
  for (const face of native.faces) {
    const plane = expected.wallPlanes.find(value => value.name === face.name)?.plane
      ?? expected.caps.find(value => value.name === face.name).plane;
    pointNear(face.geometry.outwardNormal, plane.n);
    near(face.geometry.point.reduce((sum, value, axis) => sum + (value - plane.o[axis]) * plane.n[axis], 0), 0);
  }
  assert.equal((await call('query', { ...reviewPin, orientation: 'opposite' }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  assert.equal((await call('query', { ...reviewPin, expectedProposalRevision: '0'.repeat(64) }, true)).code, 'MODEL_REVIEW_PROPOSAL_STALE');
  assert.equal((await call('query', { ...reviewPin, expectedRevision: '0'.repeat(16) }, true)).code, 'MODEL_REVIEW_BASE_STALE');
  const otherRead = await call('query', { ...reviewPin, orientation: 'opposite', expectedReviewRevision: opposite.meta.candidate.reviewRevision });
  assert.deepEqual(otherRead.faces, native.faces);
  await writeFile(join(f.output, 'paired-duct-four-views.png'), png);
  await writeFile(join(f.output, 'paired-duct-opposite.png'), opposite.png);
  f.report.observations.push({ label: 'pending-paired-duct-review', ...meta.candidate, imageSha256: meta.imageSha256,
    oppositeImageSha256: opposite.meta.imageSha256, evidence });
  return { meta, png, faces, native, reviewPin, alternate: { png: opposite.png, orientation: 'opposite' } };
}

export async function checkChangedDuctPath(session, pending, reviewed, controlPoints, sourceRail = reviewed.meta.rectangularDuct) {
  const altered = structuredClone(pending), { path, pathRevision } = sourceRail;
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
  return file;
}

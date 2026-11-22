import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const input = resolve(process.argv[3]), bytes = await readFile(input);
const source = JSON.parse(bytes), outer = 'n0.normal', inner = 'n0.reverse';
const faces = [outer, inner, 'n7.side0#1', 'n7.side0#2'];
assert.deepEqual(source.proposals.map(entry => [entry.id, entry.status]), [['P1', 'open'], ['P2', 'open']]);
assert.equal(source.nodes[9].distance, -1);

const pins = [
  'apps/cad-studio/server/cadMcp.ts', 'apps/cad-studio/test/mcp-browser-session.mjs',
  ...['chat/groups', 'chat/part/views', 'chat/part/proposals', 'chat/part/modelCandidate', 'chat/modelProposalReview', 'chat/toolDefinitions']
    .map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  'packages/barocss-cad/src/part/part-exact-cylinder-bore.ts',
];
const f = await createFlow({
  name: 'bored-wall-candidate-review', output: process.argv[2], envFrozen: 'D1669_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Read an exact pending bore and compare its pinned PNG and native B-rep with Studio approval and Open.',
  limits: ['Supported D1668 outer-wall Offset. Local L1 MCP and desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { brep } = partBreps(doc).find(body => body.key === 'b9');
const report = checkBrep(brep, { strict: true });
const openings = ['n0.normal', 'n0.reverse'].map(name => {
  const face = brep.faces.find(face => face.name === name);
  const loop = brep.loops.find(loop => face.loops.includes(loop.id) && loop.kind === 'inner');
  const edges = loop.coedges.map(id => brep.coedges.find(use => use.id === id).edge);
  return { face: name, loop: loop.id, edges };
});
const cylinders = ['n0.normal', 'n0.reverse', 'n7.side0#1', 'n7.side0#2'].map(name => ({
  name, ...faceGeometry(brep.faces.find(face => face.name === name)),
}));
console.log(JSON.stringify({ openings, cylinders, digest: digestOf(brep), genus: report.topology[0].genus,
  valid: report.valid, volume: brepMassProperties(brep, 1).volume }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = id => f.page.getByRole('listitem', { name: `Proposal ${id}`, exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

async function image(request, args) {
  const result = await request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });
  assert.equal(result.isError, false, JSON.stringify(result.content[0]));
  const meta = JSON.parse(result.content[0].text);
  const png = Buffer.from(result.content.find(item => item.type === 'image').data, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) > 1 && png.readUInt32BE(20) > 1);
  assert.equal(meta.imageSha256, sha256(png));
  return { meta, png };
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const file = join(f.output, 'with-compared-proposals.bcad');
  await writeFile(file, bytes);
  f.phase = 'Read the current model, the pending candidate and a duplicate candidate through local MCP';
  const review = await mcp(file, 'candidate-before-approval', async (call, request) => {
    const expectedRevision = await currentPartRevision(call);
    const listed = await call('proposals', { action: 'list' });
    const stale = listed.proposals.find(p => p.id === 'P1'), pending = listed.proposals.find(p => p.id === 'P2');
    assert.equal(stale.stale, true);
    assert.equal(pending.stale, false);
    assert.match(stale.modelReviewRevision, /^[a-f0-9]{64}$/);
    assert.match(pending.modelReviewRevision, /^[a-f0-9]{64}$/);
    const options = { expectedRevision, proposal: pending.id, expectedProposalRevision: pending.modelReviewRevision };
    const base = await image(request, { expectedRevision });
    const candidate = await image(request, options);
    const { meta } = candidate;
    assert.notEqual(base.meta.imageSha256, meta.imageSha256);
    assert.notEqual(meta.revision, expectedRevision);
    assert.deepEqual([meta.candidate.proposal, meta.candidate.proposalRevision, meta.candidate.baseRevision],
      ['P2', pending.modelReviewRevision, expectedRevision]);
    assert.match(meta.candidate.reviewRevision, /^[a-f0-9]{64}$/);
    assert.deepEqual(meta.bore.faces, faces.slice(2));
    const inspect = { action: 'inspect', ...options, expectedReviewRevision: meta.candidate.reviewRevision, faces };
    const native = await call('query', inspect);
    assert.deepEqual([native.revision, native.imageSha256, native.candidate, native.bore],
      [meta.revision, meta.imageSha256, meta.candidate, meta.bore]);
    const current = await call('query', { action: 'inspect', expectedRevision, faces });
    assert.deepEqual(current.faces.map(face => face.name), faces);
    assert.deepEqual(native.faces.map(face => face.name), faces);
    [11, 8, 1.5, 1.5].forEach((radius, i) => near(current.faces[i].geometry.radius, radius));
    [13, 8, 1.5, 1.5].forEach((radius, i) => near(native.faces[i].geometry.radius, radius));
    assert.deepEqual(native.faces.map(face => face.geometry.outwardNormal),
      ['away-from-axis', 'toward-axis', 'toward-axis', 'toward-axis']);
    near(native.bore.diameter, 3);
    assert.deepEqual(native.bore.openings.map(opening => [opening.face, opening.edges.length]), [[outer, 8], [inner, 8]]);
    const old = await call('query', { action: 'render', expectedRevision, proposal: 'P1', expectedProposalRevision: stale.modelReviewRevision }, true);
    assert.equal(old.code, 'MODEL_REVIEW_PROPOSAL_STALE');
    assert.deepEqual(await readFile(file), bytes);

    const sameEdit = { action: 'edit', index: 9, expectedRevision, values: { offsetDistance: 1 } };
    const other = await call('proposals', { action: 'propose', title: 'Compare the same geometry under a separate proposal',
      ops: [{ tool: 'features', args: sameEdit }] });
    assert.deepEqual([other.proposal, other.applied], ['P3', false]);
    const newBytes = await readFile(file);
    const p3 = (await call('proposals', { action: 'list' })).proposals.find(p => p.id === 'P3');
    const otherOptions = { ...options, proposal: 'P3', expectedProposalRevision: p3.modelReviewRevision };
    const twin = await image(request, otherOptions);
    assert.deepEqual(twin.png, candidate.png);
    assert.notEqual(twin.meta.candidate.reviewRevision, meta.candidate.reviewRevision);
    const mismatch = await call('query', { ...inspect, ...otherOptions }, true);
    assert.equal(mismatch.code, 'MODEL_REVIEW_IMAGE_STALE');
    assert.deepEqual(await call('query', inspect), native);
    assert.deepEqual(await readFile(file), newBytes);
    await writeFile(join(f.output, 'candidate-review.png'), candidate.png);
    f.report.observations.push({ label: 'candidate', ...meta.candidate, revision: meta.revision, imageSha256: meta.imageSha256, bore: meta.bore });
    return { meta, png: candidate.png, native, inspect };
  });

  f.phase = 'Open and preview the same candidate in Studio';
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual(pending.nodes, source.nodes);
  assert.deepEqual(pending.outputs, source.outputs);
  await f.freshOpen(file, pending, '01-pending-open');
  await button('Chat').first().click();
  await card('P1').locator('.stale').waitFor();
  await button('Preview', card('P2')).click();
  await button('Hide', card('P2')).waitFor();
  await f.same(pending);
  await f.snapshot('02-pending-studio-preview');

  f.phase = 'Approve and reopen the inspected bore';
  await button('Accept', card('P2')).click();
  await f.changed(pending);
  const approved = await f.doc();
  const decision = approved.history.at(-1);
  assert.deepEqual([approved.nodes[9].distance, decision.kind, decision.proposal, decision.by.agent], [1, 'accept', 'P2', 'user']);
  assert.deepEqual(approved.nodes.slice(0, 9), source.nodes.slice(0, 9));
  assert.deepEqual(approved.outputs, source.outputs);
  await f.snapshot('03-approved-bore');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(approved);
  const saved = await f.save('inspected-bore-approved');
  await f.freshOpen(saved.file, approved, '04-reopened');
  const geometry = await f.inspect('independent-native', approved);
  assert.ok(geometry.valid);
  assert.equal(geometry.genus, 1);
  assert.equal(geometry.digest, review.meta.candidate.bodySha256);
  assert.deepEqual(geometry.openings, review.meta.bore.openings);
  assert.deepEqual(geometry.cylinders.map(cylinder => cylinder.name), faces);
  [13, 8, 1.5, 1.5].forEach((radius, i) => near(geometry.cylinders[i].r, radius));
  near(geometry.volume, 1382.097360255641);
  f.report.observations.push({ label: 'reopened-native', ...geometry });
  const afterBytes = await readFile(saved.file);
  await mcp(saved.file, 'approved-native-review', async (call, request) => {
    const expectedRevision = await currentPartRevision(call);
    assert.equal(expectedRevision, review.meta.revision);
    const current = await image(request, { expectedRevision });
    assert.deepEqual(current.png, review.png);
    const native = await call('query', { action: 'inspect', expectedRevision, faces });
    assert.deepEqual(native.faces, review.native.faces);
    const retired = await call('query', { ...review.inspect, expectedRevision }, true);
    assert.equal(retired.code, 'MODEL_REVIEW_UNAVAILABLE');
    const open = await call('proposals', { action: 'list', all: true });
    assert.equal(open.proposals.find(p => p.id === 'P3').stale, true);
  });
  assert.deepEqual(await readFile(saved.file), afterBytes);
  assert.deepEqual(await readFile(input), bytes);
});

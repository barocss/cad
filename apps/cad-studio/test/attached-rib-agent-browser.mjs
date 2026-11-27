import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const pins = [
  'apps/cad-studio/test/attached-rib-agent-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'packages/barocss-cad-model/src/app/attachedRibCommand.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/engine/attachedRib.ts',
  'packages/barocss-cad-model/src/chat/attachedRibProposalReview.ts', 'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/part/views.ts',
];
const f = await createFlow({
  name: 'attached-rib-agent', output: process.argv[2], envFrozen: 'ATTACHED_RIB_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Review and approve one revision-pinned attached Rib from local MCP in actual Studio.',
  limits: ['Local L1 MCP, one upright rectangular plate and desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ volume: brepMassProperties(brep, 1).volume,
  strict: checkBrep(brep, { strict: true }).valid, closed: brep.shells[0].closed,
  bodies: brep.bodies.map(body => body.kind), zMax: Math.max(...brep.vertices.map(vertex => vertex.point[2])) }));
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { H: 10 }, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: { parameter: 'H' } }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

async function image(request, options, label) {
  const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', ...options } });
  assert.equal(reply.isError, false, JSON.stringify(reply.content[0]));
  const [metadata, image] = reply.content;
  assert.equal(image.mimeType, 'image/png');
  const png = Buffer.from(image.data, 'base64'), meta = JSON.parse(metadata.text);
  assert.equal(meta.imageSha256, sha256(png));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1000, 1000]);
  await writeFile(join(f.output, `${label}.png`), png);
  return meta;
}

async function verify(label, doc, height) {
  const node = doc.nodes.at(-1);
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  assert.equal(node.kind, 'rib');
  assert.deepEqual(node.sigs, { 'n1.top': { k: 'plane', p: [20, 15, 10], d: [0, 0, 1], s: 1200 } });
  assert.deepEqual([node.min, node.max], [[10, 14, 9], [30, 16, 15]]);
  const native = await f.inspect(label, doc);
  near(native.volume, 1200 * height + 200);
  assert.deepEqual([native.strict, native.closed, native.bodies, native.zMax], [true, true, ['solid'], height + 5]);
  return native;
}

await f.run(async () => {
  f.phase = 'Discover a revision-pinned original face and stage one attached Rib';
  const file = join(f.output, 'rib-proposal.bcad'), original = Buffer.from(JSON.stringify(source));
  await writeFile(file, original, { flag: 'wx' });
  const candidate = await mcp(file, 'propose', async (call, request) => {
    const help = await call('describe', { command: 'rib' });
    assert.match(help.selection, /expectedRevision.*proposals\.propose/);
    const expectedRevision = await currentPartRevision(call);
    const { bodies } = await call('query', { action: 'summary', body: 'b1' });
    const face = bodies[0].faces.find(face => face.name === 'n1.top');
    assert.deepEqual(face?.normal, [0, 0, 1]);
    const command = { action: 'command', command: 'rib', faces: [face.name], expectedRevision,
      values: { length: 20, width: 2, height: 5, x: 20, y: 15 } };
    const propose = args => ({ action: 'propose', title: 'Attach a straight Rib to the original stock cap', ops: [{ tool: 'features', args }] });
    for (const [patch, reason] of [
      [{ expectedRevision: '0'.repeat(16) }, /part changed/],
      [{ expectedRevision: undefined }, /expectedRevision/],
      [{ faces: ['n1.top', 'n1.top'] }, /one exact original/],
      [{ faces: ['n1.side0'] }, /original top or bottom/],
      [{ values: { ...command.values, x: '' } }, /finite numbers/],
    ]) assert.match((await call('proposals', propose({ ...command, ...patch }), true)).error, reason);
    assert.match((await call('features', command, true)).error, /autonomy L1/i);
    assert.deepEqual(await readFile(file), original);
    const base = await image(request, { expectedRevision }, '01-mcp-original');
    const { proposal, applied, change } = await call('proposals', propose(command));
    assert.deepEqual([proposal, applied], ['P1', false]);
    near(change.volume, 200);
    const pending = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: proposal }, true)).error, /user accepts.*Studio/i);
    const [{ modelReviewRevision, stale }] = (await call('proposals', { action: 'list' })).proposals;
    assert.equal(stale, false);
    assert.match(modelReviewRevision, /^[a-f0-9]{64}$/);
    const pins = { expectedRevision, proposal, expectedProposalRevision: modelReviewRevision };
    const result = await image(request, pins, '02-mcp-review');
    assert.equal(result.candidate.baseRevision, expectedRevision);
    assert.deepEqual(result.attachedRib, { body: 'b2', sourceBody: 'b1', face: 'n1.top', direction: [0, 0, 1],
      lengthMM: 20, widthMM: 2, protrusionMM: 5, engagementMM: 1, addedVolumeMM3: 200 });
    const read = { ...pins, action: 'inspect', faces: ['n1.top'], expectedReviewRevision: result.candidate.reviewRevision };
    const native = await call('query', read);
    assert.deepEqual(native.attachedRib, result.attachedRib);
    assert.equal(native.imageSha256, result.imageSha256);
    assert.equal((await call('query', { ...read, expectedReviewRevision: '0'.repeat(64) }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
    assert.notEqual(result.imageSha256, base.imageSha256);
    assert.deepEqual(await readFile(file), pending);
    return result;
  });

  f.phase = 'Preview, hide and explicitly accept the same staged Rib in Studio';
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, source.nodes);
  await f.freshOpen(file, pending, '03-studio-original');
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await card().getByLabel('Volume change').getByText(/200(?:\.0+)? mm³/).waitFor();
  await f.same(pending);
  await f.snapshot('04-studio-preview');
  await button('Hide', card()).click();
  await button('Preview', card()).waitFor();
  await f.same(pending);
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  assert.deepEqual([approved.proposals[0].status, approved.proposals[0].decided.by], ['accepted', 'user']);
  await verify('05-approved-native', approved, 10);
  await f.snapshot('05-studio-approved');
  await f.undo(); await f.same(pending);
  await f.redo(); await f.same(approved);
  const saved = await f.save('approved-rib');
  await f.freshOpen(saved.file, approved, '06-reopened-approved');
  await mcp(saved.file, 'read-approved', async (call, request) => {
    const result = await image(request, { expectedRevision: await currentPartRevision(call) }, '06-mcp-approved');
    assert.equal(result.imageSha256, candidate.imageSha256);
    assert.deepEqual(await readFile(join(f.output, '06-mcp-approved.png')), await readFile(join(f.output, '02-mcp-review.png')));
  });

  f.phase = 'Edit the accepted stock thickness and reopen its attached Rib';
  await f.setParameter('H', 12, '07-thickness-12');
  const edited = await f.doc(), native = await verify('07-thickened-native', edited, 12);
  const thickened = await f.save('thickened-rib');
  await f.freshOpen(thickened.file, edited, '08-reopened-thickened');
  assert.deepEqual(await verify('08-reopened-native', await f.doc(), 12), native);
  f.report.observations.push({ revision: candidate.revision, imageSha256: candidate.imageSha256, afterThicknessEdit: native });
});

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';
import { guidedJunctionDocument as input } from './fixtures/guided-junction.mjs';

const pins = [
  'apps/cad-studio/test/guided-fill-agent-browser.mjs', 'apps/cad-studio/test/fixtures/guided-junction.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/server/cadMcp.ts',
  'packages/barocss-cad-model/src/chat/directGuidedFillProposal.ts',
  'packages/barocss-cad-model/src/chat/directProposalReview.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/part/directCandidate.ts', 'packages/barocss-cad-model/src/chat/part/views.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
  'packages/barocss-cad-model/src/chat/part/guidedFillInspection.ts', 'packages/barocss-cad-model/src/chat/contract.ts',
  'packages/barocss-cad-model/src/engine/direct.ts', 'packages/barocss-cad-model/src/engine/guidedJunction.ts',
];
const f = await createFlow({
  name: 'guided-fill-agent', output: process.argv[2], envFrozen: 'GUIDED_FILL_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Pin a local Agent Guided Fill, review it in desktop Studio and match the approved native document.',
  limits: ['One open Direct junction and planar donor. Desktop WebGPU and local MCP at autonomy level 4.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluateCurve, evaluateSurface } from '@barocss/cad';
import { geometryOf } from '@barocss/cad-model/engine/direct';
const {direct} = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const patch = direct.objects.find(object => object.name === 'Guided Fill');
const surface = geometryOf(direct, patch);
const guide = geometryOf(direct, direct.objects.find(object => object.id === 'guide'));
const gaps = Array.from({length:65}, (_,i) => {
  const t=i/64, original=evaluateCurve(guide,t), result=evaluateSurface(surface,.25,.75*t);
  return Math.hypot(...original.map((x,k) => x-result[k]));
});
console.log(JSON.stringify({ surface, trim:patch.trims, gap:Math.max(...gaps), interior:evaluateSurface(surface,.25,.5) }));
`,
});
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 4 }, file, label, run);
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const waitForSheets = count => f.page.waitForFunction(count => (window.__studioProposalOverlay?.()?.directSheets ?? 0) === count, count);
const shapeRow = name => f.page.locator('.ol.direct').getByText(name, { exact: true });
const render = (request, args) => request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });
const selections = { seam: 'bodyEdge', first: 'sideEdge', second: 'handleEdge', guide: 'guide', donor: 'body' };
const inspect = (call, args, error = false) => call('query', { action: 'inspect', guidedFill: selections, ...args }, error);

async function image(request, args, label) {
  const result = await render(request, args);
  assert.equal(result.isError, false, JSON.stringify(result.content[0]));
  assert.deepEqual(result.content.map(block => block.type), ['text', 'image']);
  assert.equal(result.content[1].mimeType, 'image/png');
  const png = Buffer.from(result.content[1].data, 'base64'), meta = JSON.parse(result.content[0].text);
  assert.equal(meta.imageSha256, sha256(png));
  assert.deepEqual(result.structuredContent, meta);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1000, 1000]);
  await writeFile(join(f.output, label + '.png'), png);
  return meta;
}

async function refuse(request, args, code) {
  const result = await render(request, args);
  assert.equal(result.isError, true);
  assert.deepEqual(result.content.map(block => block.type), ['text']);
  assert.equal(JSON.parse(result.content[0].text).code, code);
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };

  f.phase = 'Render the current and private candidate through native local MCP';
  const file = join(f.output, 'pending.bcad');
  await writeFile(file, JSON.stringify(input));
  const { base, candidate, args, nativeEvidence } = await mcp(file, 'proposal', async (call, request) => {
    const baseline = await readFile(file);
    const help = await call('describe', { command: 'direct-guided-fill' });
    assert.match(help.hint, /user reviews and approves/);
    const { direct_revision: revision, direct_curves, direct_surfaces } = await call('query', { action: 'summary' });
    for (const id of ['bodyEdge','sideEdge','handleEdge','guide']) assert.ok(direct_curves.some(curve => curve.id === id));
    assert.ok(direct_surfaces.some(surface => surface.id === 'body'));
    const command = { action: 'command', command: help.command, expectedRevision: revision, values: selections };
    const op = args => ({ tool: 'features', args });
    const propose = args => ({ action: 'propose', title: 'Guided Fill for the body junction', ops: [op(args)] });
    assert.match((await call('features', command, true)).error, /user approval/i);
    assert.match((await call('features', { action:'batch', ops:[op(command)] }, true)).error, /user approval/i);
    assert.match((await call('proposals', propose({ ...command, expectedRevision:'0'.repeat(64) }), true)).error, /Direct inputs changed/);
    assert.match((await call('proposals', propose({ ...command, values:{ ...command.values, guide:'disconnected' } }), true)).error, /connected.*guide/i);
    assert.deepEqual(await readFile(file), baseline);
    const proposed = await call('proposals', propose(command));
    assert.deepEqual([proposed.proposal, proposed.applied, proposed.risk.approval], ['P1', false, ['Direct geometry']]);
    const pending = await readFile(file);
    assert.match((await call('proposals', { action:'accept', id:'P1' }, true)).error, /user.*approval.*Direct geometry/i);
    const [{ id: proposal, directReviewRevision: expectedProposalRevision, stale }] = (await call('proposals', { action: 'list' })).proposals;
    assert.equal(stale, false);
    const base = await image(request, { expectedDirectRevision: revision }, '01-mcp-current');
    const args = { expectedDirectRevision: revision, proposal, expectedProposalRevision };
    const candidate = await image(request, args, '02-mcp-candidate');
    assert.deepEqual(candidate.candidate, { proposal, proposalRevision: expectedProposalRevision, baseDirectRevision: revision });
    assert.deepEqual(base.directObjects.map(item => item.id), input.direct.objects.map(item => item.id));
    assert.equal(candidate.directObjects.length, base.directObjects.length+1);
    assert.deepEqual(candidate.directObjects.slice(0,-1), base.directObjects);
    assert.deepEqual([candidate.directObjects.at(-1).name, candidate.directObjects.at(-1).kind], ['Guided Fill','surface']);
    assert.notEqual(candidate.revision, base.revision);
    assert.notEqual(candidate.imageSha256, base.imageSha256);
    const native = await inspect(call, args);
    assert.deepEqual(native.candidate, { ...candidate.candidate, directRevision: candidate.revision });
    assert.deepEqual(native.guidedFill, { surfaceId: candidate.directObjects.at(-1).id, sources: selections,
      boundaryMaximumGapMM: 0, guideMaximumGapMM: 0, seamNormalAngleBoundDegrees: 0, sampleCount: 33,
      topology: { kind: 'sheet', closed: false, faceCount: 1, edgeCount: 3, openEdges: 3 }, revision: candidate.revision });
    assert.equal((await inspect(call, { ...args, guidedFill: { ...selections, guide: 'disconnected' } }, true)).code,
      'DIRECT_GUIDED_FILL_INSPECT_SOURCE');
    assert.deepEqual(await readFile(file), pending);
    return { base, candidate, args, nativeEvidence: native.guidedFill };
  });
  const original = await readFile(file), pending = JSON.parse(original);
  assert.deepEqual(pending.direct, input.direct);
  await f.freshOpen(file, pending, '03-studio-current');
  await button('Chat').first().click();
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await card().getByText(/Add an open Guided Fill at seam bodyEdge with guide guide/).waitFor();
  await button('Preview', card()).click();
  await waitForSheets(1);
  await f.same(pending);
  assert.equal(await shapeRow('Guided Fill').count(), 0);
  await f.snapshot('04-studio-candidate');

  f.phase = 'An actual visibility edit invalidates both the old source pin and the candidate';
  await shapeRow('guide').click();
  await button('Hide', f.page.getByRole('complementary', { name: 'Direct geometry' })).click();
  await f.changed(pending);
  await waitForSheets(0);
  assert.equal(await button('Preview', card()).isDisabled(), true);
  await f.snapshot('05-studio-stale');
  const edited = await f.save('edited');
  await mcp(edited.file, 'stale', async (call, request) => {
    const byteBaseline = await readFile(edited.file);
    const { direct_revision: revision } = await call('query', { action: 'summary' });
    const [{ stale }] = (await call('proposals', { action: 'list' })).proposals;
    assert.equal(stale, true);
    await refuse(request, args, 'DIRECT_RENDER_STALE');
    await refuse(request, { ...args, expectedDirectRevision: revision }, 'DIRECT_RENDER_PROPOSAL_STALE');
    assert.equal((await inspect(call, args, true)).code, 'DIRECT_GUIDED_FILL_INSPECT_STALE');
    assert.equal((await inspect(call, { ...args, expectedDirectRevision: revision }, true)).code,
      'DIRECT_GUIDED_FILL_INSPECT_PROPOSAL_STALE');
    assert.deepEqual(await readFile(edited.file), byteBaseline);
  });

  f.phase = 'Approve in Studio and match the candidate image exactly after fresh Open';
  await f.undo();
  await f.same(pending);
  await button('Preview', card()).click();
  await waitForSheets(1);
  await button('Accept', card()).click();
  await f.changed(pending);
  await shapeRow('Guided Fill').waitFor();
  const accepted = await f.save('accepted');
  assert.equal(accepted.doc.history.at(-1).by.agent, 'user');
  assert.deepEqual(accepted.doc.direct.objects.slice(0,-1),input.direct.objects);
  for (const [id,text] of Object.entries(input.direct.sources)) assert.equal(accepted.doc.direct.sources[id],text);
  const native = await f.inspect('approved-native',accepted.doc);
  assert.deepEqual(native.trim,[{ keep:'inside',uv:[[0,0],[1,0],[0,1]] }]);
  assert.deepEqual(native.interior,[7.5,12,4.5]);
  assert.equal(native.gap,0);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted.doc);
  await f.freshOpen(accepted.file, accepted.doc, '06-studio-accepted');
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('07-studio-accepted-framed');
  assert.deepEqual(await f.inspect('reopened-native',await f.doc()),native);
  const reopened = await mcp(accepted.file, 'accepted', async (call, request) => {
    const { direct_revision: revision } = await call('query', { action: 'summary' });
    const result = await image(request, { expectedDirectRevision: revision }, '08-mcp-accepted');
    assert.equal(result.candidate, undefined);
    assert.deepEqual([result.revision, result.imageSha256, result.directObjects], [candidate.revision, candidate.imageSha256, candidate.directObjects]);
    const savedEvidence = await inspect(call, { expectedDirectRevision: revision, guidedFill: { ...selections, surface: nativeEvidence.surfaceId } });
    assert.equal(savedEvidence.candidate, undefined);
    assert.deepEqual(savedEvidence.guidedFill, nativeEvidence);
    assert.equal((await inspect(call, { expectedDirectRevision: revision, guidedFill: { ...selections, surface: 'body' } }, true)).code,
      'DIRECT_GUIDED_FILL_INSPECT_GEOMETRY');
    await refuse(request, { ...args, expectedDirectRevision: revision }, 'DIRECT_RENDER_PROPOSAL_UNAVAILABLE');
    return result;
  });
  f.phase = 'Refuse an edited support even with its current revision';
  const changedFile = join(f.output, 'edited-guided-surface.bcad');
  const changedSurface = structuredClone(accepted.doc);
  const { source } = changedSurface.direct.objects.find(object => object.id === nativeEvidence.surfaceId);
  const originalText = changedSurface.direct.sources[source];
  changedSurface.direct.sources[source] = originalText.replace('-84', '-83');
  assert.notEqual(changedSurface.direct.sources[source], originalText);
  await writeFile(changedFile, JSON.stringify(changedSurface));
  await mcp(changedFile, 'different-support', async call => {
    const originalBytes = await readFile(changedFile);
    const { direct_revision: revision } = await call('query', { action: 'summary' });
    const failure = await inspect(call, { expectedDirectRevision: revision, guidedFill: { ...selections, surface: nativeEvidence.surfaceId } }, true);
    assert.equal(failure.code, 'DIRECT_GUIDED_FILL_INSPECT_GEOMETRY');
    assert.match(failure.error, /stored Guided Fill no longer matches/);
    assert.deepEqual(await readFile(changedFile), originalBytes);
  });
  assert.deepEqual(await readFile(file), original);
  f.report.observations.push({ base, candidate, reopened, nativeEvidence, staleRepliesWithImages: 0 });
});

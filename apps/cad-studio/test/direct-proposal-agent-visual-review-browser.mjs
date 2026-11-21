import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = [
  'apps/cad-studio/test/direct-proposal-agent-visual-review-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/directRuledProposal.ts',
  'packages/barocss-cad-model/src/chat/part/views.ts', 'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/views.ts', 'packages/barocss-cad-model/src/chat/tools.ts',
  'packages/barocss-cad-model/src/engine/direct.ts',
];
const f = await createFlow({
  name: 'direct-proposal-agent-visual-review', output: process.argv[2], envFrozen: 'D1627_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Compare a local MCP candidate image with the Studio preview and the approved native file. Refuse a stale candidate.',
  limits: ['One straight and one cubic rail, one Direct Ruled proposal, desktop WebGPU.'],
});
const input = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: {
      a: '@model rails {version:0;length-unit:mm;@curve #straight {type:nurbs;degree:1;knots:[2,2,4,4];control-points:[[10,10,0],[40,10,6]];weights:[1,1];}}',
      b: '@model rails {version:0;length-unit:mm;@curve #crown {type:nurbs;degree:3;knots:[2,2,2,2,4,4,4,4];control-points:[[10,30,3],[18,34,12],[32,34,-3],[40,30,9]];weights:[1,1,1,1];}}',
    },
    objects: [{ id: 'a', name: 'Straight rail', source: 'a', geometry: 'straight' },
      { id: 'b', name: 'Crown rail', source: 'b', geometry: 'crown' }],
  },
};
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const waitForSheets = count => f.page.waitForFunction(count => (window.__studioProposalOverlay?.()?.directSheets ?? 0) === count, count);
const shapeRow = name => f.page.locator('.ol.direct').filter({ hasText: name });
const render = (request, args) => request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });

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
  const { base, candidate, args } = await mcp(file, 'proposal', async (call, request) => {
    const { direct_revision: revision } = await call('query', { action: 'summary' });
    const proposed = await call('proposals', { action: 'propose', title: 'Ruled sheet for review', ops: [{ tool: 'features',
      args: { action: 'command', command: 'direct-ruled', expectedRevision: revision, values: { first: 'a', second: 'b' } } }] });
    assert.deepEqual([proposed.proposal, proposed.applied], ['P1', false]);
    const pending = await readFile(file);
    const [{ id: proposal, directReviewRevision: expectedProposalRevision, stale }] = (await call('proposals', { action: 'list' })).proposals;
    assert.equal(stale, false);
    const base = await image(request, { expectedDirectRevision: revision }, '01-mcp-current');
    const args = { expectedDirectRevision: revision, proposal, expectedProposalRevision };
    const candidate = await image(request, args, '02-mcp-candidate');
    assert.deepEqual(candidate.candidate, { proposal, proposalRevision: expectedProposalRevision, baseDirectRevision: revision });
    assert.deepEqual(base.directObjects.map(item => item.kind), ['curve', 'curve']);
    assert.deepEqual(candidate.directObjects.map(item => item.kind), ['curve', 'curve', 'surface']);
    assert.deepEqual(candidate.directObjects.slice(0, 2), base.directObjects);
    assert.notEqual(candidate.revision, base.revision);
    assert.notEqual(candidate.imageSha256, base.imageSha256);
    assert.deepEqual(await readFile(file), pending);
    return { base, candidate, args };
  });
  const original = await readFile(file), pending = JSON.parse(original);
  assert.deepEqual(pending.direct, input.direct);
  await f.freshOpen(file, pending, '03-studio-current');
  await button('Chat').first().click();
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Preview', card()).click();
  await waitForSheets(1);
  await f.same(pending);
  assert.equal(await shapeRow('Ruled surface').count(), 0);
  await f.snapshot('04-studio-candidate');

  f.phase = 'An actual visibility edit invalidates both the old source pin and the candidate';
  await shapeRow('Crown rail').click();
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
    assert.deepEqual(await readFile(edited.file), byteBaseline);
  });

  f.phase = 'Approve in Studio and match the candidate image exactly after fresh Open';
  await f.undo();
  await f.same(pending);
  await button('Preview', card()).click();
  await waitForSheets(1);
  await button('Accept', card()).click();
  await f.changed(pending);
  await shapeRow('Ruled surface').waitFor();
  const accepted = await f.save('accepted');
  assert.equal(accepted.doc.history.at(-1).by.agent, 'user');
  await f.freshOpen(accepted.file, accepted.doc, '06-studio-accepted');
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('07-studio-accepted-framed');
  const reopened = await mcp(accepted.file, 'accepted', async (call, request) => {
    const { direct_revision: revision } = await call('query', { action: 'summary' });
    const result = await image(request, { expectedDirectRevision: revision }, '08-mcp-accepted');
    assert.equal(result.candidate, undefined);
    assert.deepEqual([result.revision, result.imageSha256, result.directObjects], [candidate.revision, candidate.imageSha256, candidate.directObjects]);
    await refuse(request, { ...args, expectedDirectRevision: revision }, 'DIRECT_RENDER_PROPOSAL_UNAVAILABLE');
    return result;
  });
  assert.deepEqual(await readFile(file), original);
  f.report.observations.push({ base, candidate, reopened, staleRepliesWithImages: 0 });
});

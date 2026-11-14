import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { twoGuideInspector, verifyTwoGuideLoft } from './loft-two-guides-oracle.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const output = resolve(process.argv[2]);
assert.ok(relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const pins = [
  'apps/cad-studio/test/two-guide-loft-agent-proposal-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/test/loft-two-guides-oracle.mjs',
  'apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/server/cadDoc.ts', 'apps/cad-studio/server/cadMcp.ts',
  'packages/barocss-cad-model/src/chat/features.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/features/loft-two-guides.ts',
];
const f = await createFlow({
  name: 'two-guide-loft-agent-proposal', envFrozen: 'D1276_SOURCE_FROZEN', output,
  initialFiles: pins, requiredFrozen: pins, inspectorSource: twoGuideInspector,
  qualification: 'Discover and propose a two-guide Loft in local MCP, approve and edit it in Studio, then read the saved part in both.',
  limits: ['Two congruent XY rectangles, two quadratic Bézier rails, desktop WebGPU and local autonomy L1.'],
});
const mcp = (path, label, run) => withMcpSession({ app: f.app, output, clientName: 'barocss-two-guide-loft-test' }, path, label, run);
const title = 'Loft two rectangular sections with separate guides';
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 2, parameters: {}, outputs: {},
  nodes: [0, 1].map(i => ({ id: 'n' + i, kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6] })),
};
const recipe = {
  kind: 'loft', sections: [{ sketch: 0, z: 0 }, { sketch: 1, z: 12 }],
  guides: [[0, 2], [10, 14]].map(([x, middle]) => ({
    kind: 'quadratic-bezier', controlPoints: [[x, 0, 0], [middle, 0, 6], [x, 0, 12]],
  })),
};
const featureArgs = node => ({ action: 'add', features: [node] });
const proposalArgs = node => ({ action: 'propose', title, ops: [{ tool: 'features', args: featureArgs(node) }] });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
async function shown(key) {
  await f.page.waitForFunction(keys => JSON.stringify(window.__studioSection?.().shownKeys) === JSON.stringify(keys), key ? [key] : []);
  return f.page.evaluate(() => window.__studioSection().shownVolume);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Discover the Loft node and exercise MCP refusal before proposing';
  const path = join(output, 'agent-proposal.bcad'), original = Buffer.from(JSON.stringify(seed));
  await writeFile(path, original, { flag: 'wx' });
  await mcp(path, 'propose', async call => {
    const before = await call('query', { action: 'summary' });
    assert.deepEqual(before.features.map(({ index, node }) => [index, node.profile]), [[0, 'rectangle'], [1, 'rectangle']]);
    assert.deepEqual(before.bodies, []);
    const desc = await call('describe', { feature: 'loft' });
    const advertised = desc.nodes.find(node => node.includes('"guides"'));
    assert.match(advertised, /quadratic-bezier.*minimum-Y corners.*minimum X for guide 1, maximum X for guide 2/);
    assert.match(advertised, /world-mm.*halfway between the section planes/);
    assert.match((await call('features', featureArgs(recipe), true)).error, /autonomy L1/i);
    assert.match((await call('proposals', proposalArgs({ ...recipe, guides: [recipe.guides[0]] }), true)).error, /loft\.guides: two ordered quadratic Bézier guides/);
    assert.match((await call('proposals', proposalArgs({ ...recipe, guide: recipe.guides[0] }), true)).error, /use either guide or guides/);
    assert.match((await call('proposals', proposalArgs({ ...recipe, guides: [...recipe.guides].reverse() }), true)).error, /guide misses a section corner|endpoints to exactly match/i);
    assert.deepEqual(await readFile(path), original);
    const made = await call('proposals', proposalArgs(recipe));
    assert.deepEqual([made.proposal, made.applied, made.change.volume], ['P1', false, 819.84]);
    const pending = await readFile(path);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /the user accepts proposals in the studio/i);
    assert.deepEqual(await readFile(path), pending);
    assert.deepEqual(await call('query', { action: 'summary' }), before);
    f.report.observations.push({ label: 'mcp-proposal', changeVolume: made.change.volume, pendingHash: sha256(pending) });
  });
  const pendingBytes = await readFile(path), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, seed.nodes);
  assert.deepEqual(pending.outputs, seed.outputs);
  assert.deepEqual(pending.proposals.map(p => [p.id, p.status]), [['P1', 'open']]);

  f.phase = 'Open and preview the proposal while the accepted document remains unchanged';
  await f.newPage();
  await f.openFile(path, seed.nodes.length);
  await f.same(pending);
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();
  assert.equal(await shown(), 0);
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await card().getByLabel('Volume change').getByText('+819.84 mm³', { exact: true }).waitFor();
  const candidateMeshVolume = await shown('b2');
  assert.ok(Math.abs(candidateMeshVolume - 819.84) < 4, String(candidateMeshVolume));
  assert.deepEqual((await f.bodies()).bodies, []);
  await f.same(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('proposal-preview');
  await button('Before or after', card()).click();
  assert.equal(await shown(), 0);
  await button('Hide', card()).click();
  assert.equal(await shown(), 0);
  await f.same(pending);
  assert.deepEqual(await readFile(path), pendingBytes);

  f.phase = 'Approve only in Studio and verify authored rails and attribution';
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  assert.equal(await shown('b2'), candidateMeshVolume);
  await button('Accept', card()).click();
  await f.page.waitForFunction(() => window.__studioDoc?.proposals?.[0]?.status === 'accepted');
  await f.ready();
  const accepted = await f.doc(), acceptedFeature = accepted.nodes.at(-1);
  assert.deepEqual(accepted.nodes.slice(0, 2), seed.nodes);
  assert.deepEqual(acceptedFeature, { ...recipe, id: 'n2' });
  const decision = accepted.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent, decision.proposed_by.agent, accepted.proposals[0].decided.by], ['accept', 'P1', 'user', 'chat', 'user']);
  assert.equal(await shown('b2'), candidateMeshVolume);
  await verifyTwoGuideLoft(f, accepted, 2, 4, 'approved');
  await f.snapshot('approved');
  await f.undo();
  await f.same(pending);
  assert.equal(await shown(), 0);
  await f.redo();
  await f.same(accepted);

  f.phase = 'Edit the accepted Loft, save it and compare the reopened geometry';
  await f.openFeatureEditor(2, 'approved Loft');
  await f.editor().getByText('Two guides', { exact: true }).waitFor();
  await f.editor().getByLabel('Guide 2 middle X', { exact: true }).fill('16');
  const edited = (await f.applyEditor(accepted, 'edited-approved-loft')).doc;
  assert.deepEqual(edited.nodes.at(-1).guides[0], recipe.guides[0]);
  const geometry = await verifyTwoGuideLoft(f, edited, 2, 6, 'edited');
  const saved = await f.save('approved-two-guide-loft');
  await f.freshOpen(saved.file, edited, 'reopened');
  const reopened = await verifyTwoGuideLoft(f, await f.doc(), 2, 6, 'reopened');
  assert.deepEqual(reopened, geometry);

  f.phase = 'Read the reopened Loft and approval in a fresh MCP process';
  const savedBytes = await readFile(saved.file);
  await mcp(saved.file, 'reopened', async call => {
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.feature_count, 3);
    assert.equal(summary.facts.volume, 927.36);
    assert.deepEqual(summary.features[2].node, edited.nodes.at(-1));
    const decided = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(decided.proposals.map(p => [p.id, p.status]), [['P1', 'accepted']]);
    f.report.observations.push({ label: 'mcp-reopened', volume: summary.facts.volume, savedHash: sha256(savedBytes) });
  });
  assert.deepEqual(await readFile(saved.file), savedBytes);
  assert.deepEqual(await readFile(path), pendingBytes);
});

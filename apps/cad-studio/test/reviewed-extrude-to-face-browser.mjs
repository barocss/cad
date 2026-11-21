import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [5, 5], radius: 12 },
    { id: 'n1', kind: 'extrude', sketch: 0, from: 20, height: 5 },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const recipe = { id: 'n3', kind: 'face-end-extrude', sketch: 2,
  target: { body: { node: 1, side: 'solid' }, feature: 'n1', face: 'n1.bottom' } };
const pins = [
  'apps/cad-studio/test/reviewed-extrude-to-face-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/app/extrudeEndFacePick.ts', 'packages/barocss-cad-model/src/engine/faceEndExtrude.ts',
];
const f = await createFlow({
  name: 'reviewed-extrude-to-face', output: process.argv[2], envFrozen: 'D1604_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Propose a revision-pinned Extrude to face locally, approve in Studio and edit the retained target after Open.',
  limits: ['One literal XY rectangle and one original upright circular end cap in the base part.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, valid: checkBrep(brep, { strict: true }).valid, volume: brepMassProperties(brep, 1).volume,
  corners: brep.vertices.map(vertex => vertex.point),
}))));
`,
});
const button = (name, parent = f.page) => parent.getByRole('button', { name, exact: true });
const withTarget = from => source.nodes.map(node => node.id === 'n1' ? { ...node, from } : node);

async function check(label, doc, level) {
  assert.deepEqual(doc.nodes, [...withTarget(level), recipe]);
  const native = await f.inspect(label, doc), { bodies } = await f.bodies();
  assert.deepEqual(native.map(body => body.key), ['b1', 'b3']);
  assert.ok(native.every(body => body.valid));
  assert.ok(Math.abs(native[0].volume - 720 * Math.PI) < 1e-8);
  const post = native[1];
  assert.ok(Math.abs(post.volume - 100 * level) < 1e-8);
  assert.ok(Math.abs(bodies.find(body => body.key === 'b3').volume - 100 * level) < 1e-8);
  for (const x of [0, 10]) for (const y of [0, 10]) for (const z of [0, level])
    assert.ok(post.corners.some(point => point[0] === x && point[1] === y && point[2] === z));
  f.report.observations.push({ label, level, postVolumeMm3: post.volume, targetVolumeMm3: native[0].volume });
  return native;
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin || !['http:', 'https:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    return context;
  };
  const old = join(f.output, 'earlier-target.bcad'), current = join(f.output, 'reviewed-target.bcad');
  await writeFile(old, JSON.stringify({ ...source, nodes: withTarget(15) }));
  const bytes = JSON.stringify(source);
  await writeFile(current, bytes);
  const session = { app: f.app, output: f.output, clientName: 'reviewed-extrude-to-face', autonomy: 1 };
  const revision = async call => (await call('query', { action: 'rebuild' })).revision;
  const stale = await withMcpSession(session, old, 'older-state', revision);
  f.phase = 'refuse unpinned and invalid inputs, then create a pending proposal from the current state';
  const proposal = await withMcpSession(session, current, 'current-state', async call => {
    const expectedRevision = await revision(call);
    assert.match(expectedRevision, /^[a-f0-9]{16}$/);
    assert.notEqual(expectedRevision, stale);
    const request = { action: 'command', command: 'extrude', expectedRevision, faces: ['n1.bottom'],
      values: { depth: 'to-face', sketch: 'n2' } };
    const propose = args => ({ action: 'propose', title: 'Extrude sketch n2 to the original lower cap', ops: [{ tool: 'features', args }] });
    const denied = async (args, reason) => {
      const reply = await call('proposals', propose(args), true);
      assert.match(reply.error, reason);
      assert.equal(await readFile(current, 'utf8'), bytes);
    };
    assert.match(JSON.stringify(await call('describe', { tool: 'features', action: 'command', command: 'extrude' })),
      /one exact native face name|to-face/i);
    await denied({ ...request, expectedRevision: undefined }, /current expectedRevision/);
    await denied({ ...request, expectedRevision: stale }, /part changed/);
    await denied({ ...request, values: { ...request.values, h: 20 } }, /only values.depth and values.sketch/);
    await denied({ ...request, faces: ['n1.top'] }, /could not build.*nothing was applied/i);
    assert.match((await call('features', request, true)).error, /propos/i);
    const pending = await call('proposals', propose(request));
    assert.equal(pending.applied, false);
    const prepared = await readFile(current, 'utf8');
    assert.match((await call('proposals', { action: 'accept', id: pending.proposal }, true)).error, /user accepts.*studio/i);
    assert.equal(await readFile(current, 'utf8'), prepared);
    return pending.proposal;
  });
  const pending = JSON.parse(await readFile(current, 'utf8'));
  assert.deepEqual(pending.nodes, source.nodes);
  assert.deepEqual(pending.outputs, source.outputs);
  await f.freshOpen(current, pending, '01-original-stock');
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${proposal}`, exact: true });
  await card.waitFor();
  f.phase = 'preview and explicitly approve the bound extrusion in Studio';
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('02-proposed-bound-extrude');
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = await f.doc();
  const approval = approved.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', proposal, 'user']);
  const native = await check('approved-native', approved, 20);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(approved);
  const saved = await f.save('approved-extrude-to-face');
  await f.freshOpen(saved.file, approved, '03-reopened-approved-extrude');
  assert.deepEqual(await check('reopened-native', approved, 20), native);
  await f.openFeatureEditor(1, 'move the original end cap after reopening');
  await f.editor().getByLabel('Start Z', { exact: true }).fill('26');
  await f.applyEditor(approved, '04-target-moved');
  await check('moved-native', await f.doc(), 26);
});

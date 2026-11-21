import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const olderBytes = await readFile(resolve(process.argv[3]));
const currentBytes = await readFile(resolve(process.argv[4]));
const source = JSON.parse(currentBytes), index = source.nodes.length - 1;
const wall = source.nodes[index], face = 'n1.side1';
assert.deepEqual([wall.kind, wall.faces, wall.distance], ['offset-face', [face], 4]);
const at = distance => [...source.nodes.slice(0, index), { ...wall, distance }];
assert.deepEqual(JSON.parse(olderBytes).nodes, at(3));

const pins = [
  'apps/cad-studio/test/saved-wall-agent-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/toolDefinitions.ts', 'packages/barocss-cad-model/src/app/offsetFaceEdit.ts',
];
const f = await createFlow({
  name: 'saved-wall-agent', output: process.argv[2], envFrozen: 'SAVED_WALL_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Local MCP proposes a revision-pinned distance change for one supported saved right drafted wall.',
  limits: ['Desktop WebGPU Studio and autonomy 1 MCP. One 40 × 30 × 10 mm rectangular taper with 10° draft.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const [{ brep, key }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const ids = Object.fromEntries(['vertices', 'edges', 'coedges', 'loops', 'faces', 'shells', 'bodies'].map(field =>
  [field, brep[field].map(item => [item.id, item.name ?? null])]));
console.log(JSON.stringify({ key, ids, digest: digestOf(brep), closed: brep.shells.length === 1 && brep.shells[0].closed,
  check: checkBrep(brep, { strict: true }), volume: brepMassProperties(brep, 1).volume,
  points: brep.vertices.map(v => v.point), planes: brep.faces.map(item => [item.name, faceGeometry(item)]) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const radians = Math.PI / 18, t = Math.tan(radians), sec = 1 / Math.cos(radians);
const area = (z, d) => (40 - 2 * z * t + d * sec) * (30 - 2 * z * t);
const volume = d => (area(0, d) + 4 * area(5, d) + area(10, d)) * 10 / 6;
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const vectorNear = (a, b) => a.every((value, i) => near(value, b[i]));

async function review(request, label) {
  const reply = await request('tools/call', { name: 'query', arguments: { action: 'render' } });
  assert.equal(reply.isError, false, JSON.stringify(reply));
  const data = JSON.parse(reply.content[0].text);
  const png = Buffer.from(reply.content.find(item => item.type === 'image').data, 'base64');
  const sha = createHash('sha256').update(png).digest('hex');
  assert.equal(sha, data.imageSha256);
  assert.match(data.revision, /^[a-f0-9]{16}$/);
  f.report.observations.push({ label, revision: data.revision, imageSha256: sha });
  return { revision: data.revision, sha };
}

async function native(label, doc, distance) {
  assert.deepEqual(doc.nodes, at(distance));
  const read = await f.inspect(label, doc), bodies = (await f.bodies()).bodies;
  assert.ok(read.check.valid && read.closed);
  assert.deepEqual(read.check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.deepEqual(bodies.map(body => body.key), [read.key]);
  const planes = [
    [[-1 / sec, 0, t / sec], 0], [[1 / sec, 0, t / sec], 40 / sec + distance],
    [[0, -1 / sec, t / sec], 0], [[0, 1 / sec, t / sec], 30 / sec],
    [[0, 0, -1], 0], [[0, 0, 1], 10],
  ];
  for (const [normal, support] of planes) {
    const matches = read.planes.filter(([, plane]) => plane.kind === 'plane' && vectorNear(plane.n, normal));
    assert.equal(matches.length, 1);
    const [[name, plane]] = matches;
    assert.ok(near(plane.o.reduce((sum, n, i) => sum + n * normal[i], 0), support));
    if (normal[0] > 0.9) assert.equal(name, face);
  }
  for (const z of [0, 10]) {
    for (const x of [t * z, 40 - t * z + distance * sec]) {
      for (const y of [t * z, 30 - t * z]) assert.equal(read.points.filter(p => vectorNear(p, [x, y, z])).length, 1);
    }
  }
  const expected = volume(distance);
  assert.ok(near(read.volume, expected, 1e-7));
  assert.ok(near(bodies[0].volume, expected, 1e-7));
  f.report.observations.push({ label, distance, expectedVolume: expected, nativeVolume: read.volume,
    studioVolume: bodies[0].volume, digest: read.digest });
  return read;
}

async function frame() {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const older = join(f.output, 'older-saved-wall.bcad'), current = join(f.output, 'current-saved-wall.bcad');
  await writeFile(older, olderBytes);
  await writeFile(current, currentBytes);
  const session = { app: f.app, output: f.output, clientName: 'saved-wall-review', autonomy: 1 };
  f.phase = 'review the older +3 mm wall through local MCP';
  const stale = await withMcpSession(session, older, 'older', (_, request) => review(request, 'older-review'));
  assert.deepEqual(await readFile(older), olderBytes);

  f.phase = 'reject unsafe edits and submit one pending proposal for the current revision';
  const proposalId = await withMcpSession(session, current, 'current', async (call, request) => {
    const fresh = await review(request, 'current-review');
    assert.notEqual(fresh.revision, stale.revision);
    assert.notEqual(fresh.sha, stale.sha);
    const edit = { action: 'edit', index, values: { offsetDistance: -2 } };
    const pinned = { ...edit, expectedRevision: fresh.revision };
    const proposed = args => ({ action: 'propose', title: 'Change the reviewed right wall Offset to −2 mm', ops: [{ tool: 'features', args }] });
    const denied = async (args, reason) => {
      const result = await call('proposals', proposed(args), true);
      assert.match(JSON.stringify(result), reason);
      assert.deepEqual(await readFile(current), currentBytes);
    };
    const detail = await call('describe', { tool: 'features', action: 'edit' });
    assert.match(JSON.stringify(detail), /values\.offsetDistance.*required expectedRevision/);
    assert.match((await call('features', pinned, true)).error, /propos/i);
    await denied(edit, /current expectedRevision/);
    await denied({ ...pinned, expectedRevision: stale.revision }, /part changed/i);
    await denied({ ...pinned, values: { offsetDistance: -2, d: 4 } }, /only values\.offsetDistance/);
    await denied({ ...pinned, values: { offsetDistance: 0 } }, /nonzero signed distance/i);
    await denied({ ...pinned, values: { offsetDistance: -40 } }, /could not build|close a section/i);
    const proposal = await call('proposals', proposed(pinned));
    assert.equal(proposal.applied, false);
    const pendingBytes = await readFile(current);
    assert.match((await call('proposals', { action: 'accept', id: proposal.proposal }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(current), pendingBytes);
    return proposal.proposal;
  });

  const pending = JSON.parse(await readFile(current));
  assert.deepEqual(pending.nodes, source.nodes);
  assert.deepEqual(pending.outputs, source.outputs);
  await f.freshOpen(current, pending, 'proposal-pending');
  const before = await native('reviewed-plus-four-native', pending, 4);
  await frame();
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${proposalId}`, exact: true });
  await card.waitFor();
  await f.snapshot('reviewed-plus-four-wall');

  f.phase = 'preview the signed distance and accept it through desktop Studio';
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  const change = await card.locator('[aria-label="Volume change"]').innerText();
  const mm3 = /^−([\d,.]+) mm³/.exec(change)?.[1];
  assert.ok(mm3 && near(Number(mm3.replaceAll(',', '')), volume(4) - volume(-2), 0.6), change);
  await f.same(pending);
  await f.snapshot('proposed-minus-two-wall');
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.doc();
  const approval = accepted.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', proposalId, 'user']);
  assert.deepEqual(accepted.outputs, source.outputs);
  const after = await native('accepted-minus-two-native', accepted, -2);
  assert.deepEqual(after.ids, before.ids);
  assert.notEqual(after.digest, before.digest);

  f.phase = 'Undo, Redo, Save, and fresh Open the approved native edit';
  await f.undo();
  await f.same(pending);
  await native('undo-plus-four-native', pending, 4);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('approved-right-wall-minus-two');
  await f.freshOpen(saved.file, accepted, 'reopened-approved-wall');
  assert.equal((await native('reopened-minus-two-native', accepted, -2)).digest, after.digest);
  await frame();
  await f.openFeatureEditor(index, 'approved saved right wall');
  await button('Edit offset', f.editor()).click();
  const editor = f.page.getByRole('dialog', { name: 'Edit Offset face', exact: true });
  await editor.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  assert.equal(Number(await editor.getByLabel('Offset', { exact: true }).inputValue()), -2);
  await f.snapshot('reopened-minus-two-editor');
});

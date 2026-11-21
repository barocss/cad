import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const previousFile = resolve(process.argv[3]), currentFile = resolve(process.argv[4]);
const source = JSON.parse(await readFile(currentFile, 'utf8'));
const index = source.nodes.length - 1;
const pins = [
  'apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/toolDefinitions.ts', 'packages/barocss-cad-model/src/app/smoothLoftTurn.ts',
];
const f = await createFlow({
  name: 'smooth-turn-reviewed-angle-edit',
  output: process.argv[2],
  envFrozen: 'SMOOTH_TURN_PIN_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Pin a local Agent angle edit to the currently reviewed native Smooth Turn.',
  limits: ['Local MCP and desktop Studio. A saved 16-station Smooth Turn at 70 mm.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, evaluateCurveD1 } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const [{ brep, key }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const check = checkBrep(brep, { strict: true });
console.log(JSON.stringify({ key, sha: digestOf(brep), valid: check.valid, count: check.counts.bodies,
  volume: brepMassProperties(brep, 1).volume, closed: brep.shells.length === 1 && brep.shells[0].closed,
  faces: brep.faces.map(face => face.name), edges: brep.edges.map(edge => edge.name),
  rails: brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(({ id, curve }) => ({
    id, stations: Array.from({ length: 16 }, (_, i) => evaluateCurveD1(curve, i / 15)),
  })),
}));
`,
});
const corners = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => Math.hypot(...a.map((value, index) => value - b[index])) < 1e-8;

async function review(request, label) {
  const reply = await request('tools/call', { name: 'query', arguments: { action: 'render' } });
  assert.equal(reply.isError, false, JSON.stringify(reply));
  const data = JSON.parse(reply.content[0].text);
  const png = Buffer.from(reply.content.find(item => item.type === 'image').data, 'base64');
  const sha = createHash('sha256').update(png).digest('hex');
  assert.equal(sha, data.imageSha256);
  assert.match(data.revision, /^[a-f0-9]{16}$/);
  await writeFile(join(f.output, label + '.png'), png);
  f.report.observations.push({ label, revision: data.revision, imageSha256: sha });
  return { revision: data.revision, sha };
}

async function native(label, doc, angle) {
  assert.deepEqual(doc.nodes[index], source.nodes[index]);
  const result = await f.inspect(label, doc);
  assert.deepEqual([result.valid, result.count, result.closed, result.faces.length, result.edges.length, result.rails.length],
    [true, 1, true, 6, 12, 4]);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].key, result.key);
  assert.ok(Math.abs(bodies[0].volume - result.volume) < 1e-7);
  for (const [index, rail] of result.rails.entries()) {
    const [u, v] = corners[index];
    for (const [i, { point, derivative }] of rail.stations.entries()) {
      const t = i / 15, radians = angle * Math.PI / 180 * t;
      const c = Math.cos(radians), s = Math.sin(radians);
      assert.ok(near(point, [18 + c * u - s * v, -11 + s * u + c * v, 3 + 70 * t]));
      assert.ok(((point[0] - 18) * derivative[1] - (point[1] + 11) * derivative[0]) * Math.sign(angle) > 0);
    }
  }
  f.report.observations.push({ label, angle, digest: result.sha, volume: result.volume });
  return result;
}

async function frame() {
  await button('Iso').click();
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
  const older = join(f.output, 'older-turn.bcad'), current = join(f.output, 'current-turn.bcad');
  const olderBytes = await readFile(previousFile), currentBytes = await readFile(currentFile);
  await writeFile(older, olderBytes);
  await writeFile(current, currentBytes);
  const session = { app: f.app, output: f.output, clientName: 'smooth-turn-angle-review', autonomy: 1 };
  const stale = await withMcpSession(session, older, 'older', (_, request) => review(request, 'older-review'));
  assert.deepEqual(await readFile(older), olderBytes);

  f.phase = 'reject an edit based on the older review and accept a fresh proposal only';
  const proposalId = await withMcpSession(session, current, 'current', async (call, request) => {
    const fresh = await review(request, 'current-review');
    assert.notEqual(fresh.revision, stale.revision);
    assert.notEqual(fresh.sha, stale.sha);
    const args = { action: 'edit', index, values: { smoothTurnAngle: -360 } };
    const proposed = (args) => ({ action: 'propose', title: 'Reverse the reviewed Smooth Turn to −360°', ops: [{ tool: 'features', args }] });
    const detail = await call('describe', { tool: 'features', action: 'edit' });
    assert.match(JSON.stringify(detail), /values\.smoothTurnAngle.*required expectedRevision/);
    assert.match((await call('features', { ...args, expectedRevision: fresh.revision }, true)).error, /propos/i);
    assert.match((await call('proposals', proposed(args), true)).error, /current expectedRevision/);
    assert.match((await call('proposals', proposed({ ...args, expectedRevision: stale.revision }), true)).error, /part changed/i);
    assert.match((await call('proposals', proposed({ ...args, expectedRevision: fresh.revision, values: { smoothTurnAngle: 451 } }), true)).error, /−450° to \+450°/);
    assert.deepEqual(await readFile(current), currentBytes);
    const proposal = await call('proposals', proposed({ ...args, expectedRevision: fresh.revision }));
    assert.equal(proposal.applied, false);
    assert.match((await call('proposals', { action: 'accept', id: proposal.proposal }, true)).error, /user accepts.*studio/i);
    return proposal.proposal;
  });

  const pending = JSON.parse(await readFile(current, 'utf8'));
  assert.deepEqual(pending.nodes, source.nodes);
  await f.freshOpen(current, pending, 'review-pending');
  const before = await native('reviewed-positive-native', pending, 360);
  await frame();
  await f.snapshot('reviewed-positive-turn');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${proposalId}`, exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('reverse-angle-proposal');
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.doc();
  const approval = accepted.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', proposalId, 'user']);
  const result = await native('agent-negative-native', accepted, -360);
  assert.deepEqual([result.key, result.faces, result.edges], [before.key, before.faces, before.edges]);
  assert.notEqual(result.sha, before.sha);
  assert.ok(Math.abs(result.volume - before.volume) < 1e-7);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('reviewed-smooth-turn-reversed');
  await f.freshOpen(saved.file, accepted, 'reversed-angle-reopened');
  assert.equal((await native('agent-negative-reopened-native', accepted, -360)).sha, result.sha);
  await frame();
  await f.openFeatureEditor(index, 'approved turn angle after reopen');
  assert.equal(Number(await f.editor().getByLabel('Turn angle', { exact: true }).inputValue()), -360);
  assert.equal(Number(await f.editor().getByLabel('Total height', { exact: true }).inputValue()), 70);
  await f.snapshot('reversed-angle-reopened-editor');
});

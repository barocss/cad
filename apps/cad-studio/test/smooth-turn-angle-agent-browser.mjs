import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const previousFile = resolve(process.argv[3]), currentFile = resolve(process.argv[4]);
const source = JSON.parse(await readFile(currentFile, 'utf8'));
const index = source.nodes.length - 1;
const widthEdit = process.argv.includes('--width');
const triangular = process.argv.includes('--triangle');
assert.ok(!(widthEdit && triangular));
const edit = triangular ? {
  key: 'smoothTurnAngle', value: -450, invalid: 451, refusal: /−450° to \+450°/,
  title: 'Reverse the reviewed triangular Smooth Turn to −450°', before: { angle: 450 }, after: { angle: -450 },
  centre: [18, -21, 26], height: 50, stations: 16, bodies: 1,
} : widthEdit ? {
  key: 'smoothTurnWidth', value: 20, invalid: 0, refusal: /takes a width greater than/,
  title: 'Widen the reviewed Smooth Turn to 20 mm', before: { angle: 360, width: 16 }, after: { angle: 360, width: 20 },
  centre: [47, -11, 3], height: 40, stations: 13, bodies: 2,
} : {
  key: 'smoothTurnAngle', value: -360, invalid: 451, refusal: /−450° to \+450°/,
  title: 'Reverse the reviewed Smooth Turn to −360°', before: { angle: 360, width: 12 }, after: { angle: -360, width: 12 },
  centre: [18, -11, 3], height: 70, stations: 16, bodies: 1,
};
const pins = [
  'apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/toolDefinitions.ts', 'packages/barocss-cad-model/src/app/smoothLoftTurn.ts',
];
const f = await createFlow({
  name: triangular ? 'triangular-turn-reviewed-angle-edit' : widthEdit ? 'smooth-turn-reviewed-width-edit' : 'smooth-turn-reviewed-angle-edit',
  output: process.argv[2],
  envFrozen: 'SMOOTH_TURN_PIN_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Pin a local Agent edit to the currently reviewed native Smooth Turn.',
  limits: [`Local MCP and desktop Studio. A saved ${edit.stations}-station Smooth Turn at ${edit.height} mm.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, evaluateCurveD1 } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const outputs = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const { brep, key } = outputs.at(-1)!;
const check = checkBrep(brep, { strict: true });
console.log(JSON.stringify({ key, controls: outputs.slice(0, -1).map(out => digestOf(out.brep)), sha: digestOf(brep), valid: check.valid, count: check.counts.bodies,
  volume: brepMassProperties(brep, 1).volume, closed: brep.shells.length === 1 && brep.shells[0].closed,
  faces: brep.faces.map(face => face.name), edges: brep.edges.map(edge => edge.name),
  ids: [brep.vertices, brep.edges, brep.coedges, brep.loops, brep.faces, brep.shells, brep.bodies].map(items => items.map(item => item.id)),
  rails: brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(({ id, curve }) => ({
    id, stations: Array.from({ length: ${edit.stations} }, (_, i) => evaluateCurveD1(curve, i / ${edit.stations - 1})),
  })),
}));
`,
});
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

async function native(label, doc, { angle, width }) {
  const sections = new Set(source.nodes[index].sections.map(section => section.sketch));
  assert.deepEqual(doc.nodes.filter((_, i) => !sections.has(i)), source.nodes.filter((_, i) => !sections.has(i)));
  assert.deepEqual(doc.outputs, source.outputs);
  assert.deepEqual(doc.nodes.map(node => node.id), source.nodes.map(node => node.id));
  const result = await f.inspect(label, doc);
  assert.deepEqual([result.valid, result.count, result.closed, result.faces.length, result.edges.length, result.rails.length],
    triangular ? [true, 1, true, 5, 9, 3] : [true, 1, true, 6, 12, 4]);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, edit.bodies);
  assert.equal(bodies.at(-1).key, result.key);
  assert.ok(Math.abs(bodies.at(-1).volume - result.volume) < 1e-7);
  const [x, y, z] = edit.centre, half = width / 2;
  const corners = triangular ? [[-4, -2], [5, -1], [-1, 3]] : [[-half, -4], [half, -4], [half, 4], [-half, 4]];
  for (const [index, rail] of result.rails.entries()) {
    const [u, v] = corners[index];
    for (const [i, { point, derivative }] of rail.stations.entries()) {
      const t = i / (edit.stations - 1), radians = angle * Math.PI / 180 * t;
      const c = Math.cos(radians), s = Math.sin(radians);
      const across = c * u - s * v, side = s * u + c * v, height = edit.height * t;
      const expected = triangular ? [x + across, y + .8 * side + .6 * height, z - .6 * side + .8 * height]
        : [x + across, y + side, z + height];
      assert.ok(near(point, expected));
      const localY = triangular ? .8 * (point[1] - y) - .6 * (point[2] - z) : point[1] - y;
      const localDY = triangular ? .8 * derivative[1] - .6 * derivative[2] : derivative[1];
      assert.ok(((point[0] - x) * localDY - localY * derivative[0]) * Math.sign(angle) > 0);
    }
  }
  f.report.observations.push({ label, angle, width, digest: result.sha, volume: result.volume, controls: result.controls });
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
  const previous = JSON.parse(olderBytes);
  assert.deepEqual(previous.outputs, source.outputs);
  assert.deepEqual(previous.nodes.map(node => node.id), source.nodes.map(node => node.id));
  await writeFile(older, olderBytes);
  await writeFile(current, currentBytes);
  const session = { app: f.app, output: f.output, clientName: 'smooth-turn-review', autonomy: 1 };
  const stale = await withMcpSession(session, older, 'older', (_, request) => review(request, 'older-review'));
  assert.deepEqual(await readFile(older), olderBytes);

  f.phase = 'reject an edit based on the older review and accept a fresh proposal only';
  const proposalId = await withMcpSession(session, current, 'current', async (call, request) => {
    const fresh = await review(request, 'current-review');
    assert.notEqual(fresh.revision, stale.revision);
    assert.notEqual(fresh.sha, stale.sha);
    const args = { action: 'edit', index, values: { [edit.key]: edit.value } };
    const proposed = (args) => ({ action: 'propose', title: edit.title, ops: [{ tool: 'features', args }] });
    const detail = await call('describe', { tool: 'features', action: 'edit' });
    assert.match(JSON.stringify(detail), new RegExp(`values[.]${edit.key}.*required expectedRevision`));
    assert.match((await call('features', { ...args, expectedRevision: fresh.revision }, true)).error, /propos/i);
    assert.match((await call('proposals', proposed(args), true)).error, /current expectedRevision/);
    assert.match((await call('proposals', proposed({ ...args, expectedRevision: stale.revision }), true)).error, /part changed/i);
    const pinned = { ...args, expectedRevision: fresh.revision };
    assert.match((await call('proposals', proposed({ ...pinned, values: { [edit.key]: edit.invalid } }), true)).error, edit.refusal);
    if (widthEdit) {
      assert.match((await call('proposals', proposed({ ...pinned, values: { ...args.values, smoothTurnAngle: -360 } }), true)).error, /only values[.]smoothTurn/);
      assert.match((await call('proposals', proposed({ ...pinned, values: { [edit.key]: edit.before.width } }), true)).error, /already has this width/);
    }
    assert.deepEqual(await readFile(current), currentBytes);
    const proposal = await call('proposals', proposed({ ...args, expectedRevision: fresh.revision }));
    assert.equal(proposal.applied, false);
    const pendingBytes = await readFile(current);
    assert.match((await call('proposals', { action: 'accept', id: proposal.proposal }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(current), pendingBytes);
    return proposal.proposal;
  });

  const pending = JSON.parse(await readFile(current, 'utf8'));
  assert.deepEqual(pending.nodes, source.nodes);
  await f.freshOpen(current, pending, 'review-pending');
  const before = await native('reviewed-native', pending, edit.before);
  await frame();
  await f.snapshot('reviewed-turn');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${proposalId}`, exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  if (widthEdit) {
    const change = await card.locator('[aria-label="Volume change"]').innerText();
    const mm3 = /^\+([\d,.]+) mm³/.exec(change)?.[1];
    assert.ok(mm3 && Math.abs(Number(mm3.replaceAll(',', '')) - before.volume / 4) < 0.05, change);
  }
  await f.same(pending);
  await f.snapshot('reviewed-turn-proposal');
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.doc();
  const approval = accepted.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', proposalId, 'user']);
  const result = await native('agent-approved-native', accepted, edit.after);
  assert.deepEqual([result.key, result.faces, result.edges, result.controls, result.ids],
    [before.key, before.faces, before.edges, before.controls, before.ids]);
  assert.notEqual(result.sha, before.sha);
  const volumeFactor = widthEdit ? edit.after.width / edit.before.width : 1;
  assert.ok(Math.abs(result.volume - volumeFactor * before.volume) < 1e-7);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save(widthEdit ? 'reviewed-smooth-turn-widened' : 'reviewed-smooth-turn-reversed');
  await f.freshOpen(saved.file, accepted, 'approved-turn-reopened');
  assert.equal((await native('agent-approved-reopened-native', accepted, edit.after)).sha, result.sha);
  await frame();
  await f.openFeatureEditor(index, 'approved turn after reopen');
  for (const [label, value] of [['Turn angle', edit.after.angle], ['Total height', edit.height]])
    assert.equal(Number(await f.editor().getByLabel(label, { exact: true }).inputValue()), value);
  const width = f.editor().getByLabel('Turn width', { exact: true });
  if (triangular) assert.equal(await width.count(), 0);
  else assert.equal(Number(await width.inputValue()), edit.after.width);
  await f.snapshot('approved-turn-reopened-editor');
});

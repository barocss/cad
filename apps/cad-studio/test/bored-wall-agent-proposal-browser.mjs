import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const input = resolve(process.argv[3]), referenceFile = resolve(process.argv[4]);
const inputBytes = await readFile(input), referenceBytes = await readFile(referenceFile);
const source = JSON.parse(inputBytes), reference = JSON.parse(referenceBytes);
const index = 9, donorIndex = 3, outer = 'n0.normal', inner = 'n0.reverse', cap = 'n0.v-max';
const title = 'Move the original outer wall while keeping both bore openings';
assert.deepEqual([source.nodes[index].kind, source.nodes[index].distance, source.nodes[index].faces], ['offset-face', -1, [outer]]);
assert.deepEqual(source.nodes[donorIndex].offset, [0, 0, 0]);
assert.deepEqual([reference.nodes[index].distance, reference.nodes[donorIndex].offset], [1, [0, 0, -1]]);
const pins = [
  'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/src/state/useProposalPreview.ts',
  'apps/cad-studio/src/ui/ProposalBrowser.tsx', 'apps/cad-studio/server/cadMcp.ts',
  ...['chat/part/features', 'chat/part/proposals', 'chat/toolDefinitions', 'app/nativeOffsetFace', 'app/offsetFaceEdit', 'engine/doc']
    .map(path => 'packages/barocss-cad-model/src/' + path + '.ts'),
  'packages/barocss-cad/src/part/part-exact-cylinder-bore.ts',
];
const f = await createFlow({
  name: 'bored-wall-agent-proposal', output: process.argv[2], envFrozen: 'D1668_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Review a current radial through bore before approving the signed outer-wall Offset in Studio.',
  limits: ['One Exact semicylinder, linked inclined cap, single 3 mm radial bore, local L1 MCP and desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const report = checkBrep(brep, { strict: true });
  return { key, report, digest: digestOf(brep), volume: brepMassProperties(brep, 1).volume,
    supports: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face)])),
    openings: Object.fromEntries(brep.faces.filter(face => ['n0.normal', 'n0.reverse'].includes(face.name))
      .map(face => [face.name, face.loops.map(id => brep.loops.find(loop => loop.id === id).kind).sort()])),
    incidence: {
      faces: brep.faces.map(({ id, name, loops }) => [id, name, loops]),
      edges: brep.edges.map(({ id, name, vertices }) => [id, name, vertices]),
      coedges: brep.coedges.map(({ id, edge, loop, sense, next, prev, twin }) => [id, edge, loop, sense, next, prev, twin]),
    },
  };
})));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = id => f.page.getByRole('listitem', { name: `Proposal ${id}`, exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);
const edit = (expectedRevision, offsetDistance) => ({ action: 'edit', index, values: { offsetDistance }, expectedRevision });
const propose = (args, label) => ({ action: 'propose', title: label, ops: [{ tool: 'features', args }] });
const near = (actual, expected, tol = 1e-7) => assert.ok(Math.abs(actual - expected) < tol, `${actual} != ${expected}`);

async function review(request, label) {
  const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', highlight: [outer] } });
  assert.equal(reply.isError, false);
  const pin = JSON.parse(reply.content[0].text);
  const png = Buffer.from(reply.content.find(item => item.type === 'image').data, 'base64');
  assert.equal(sha256(png), pin.imageSha256);
  assert.match(pin.revision, /^[a-f0-9]{16}$/);
  assert.ok(Object.values(pin.legend).includes(outer));
  f.report.observations.push({ label, revision: pin.revision, imageSha256: pin.imageSha256 });
  return pin;
}

async function native(label, doc, radius, height) {
  const bodies = await f.inspect(label, doc);
  const stock = bodies.find(body => body.key === 'b9'), donor = bodies.find(body => body.key === 'b3');
  assert.deepEqual(bodies.map(body => body.key).sort(), ['b3', 'b9']);
  assert.ok(stock.report.valid && donor.report.valid);
  assert.equal(stock.report.topology[0].genus, 1);
  assert.deepEqual(stock.report.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 60, edges: 30, vertices: 24 });
  assert.deepEqual(stock.openings, { [outer]: ['inner', 'outer'], [inner]: ['inner', 'outer'] });
  for (const [name, r, sense] of [[outer, radius, 1], [inner, 8, -1]]) {
    const wall = stock.supports[name];
    assert.deepEqual([wall.kind, wall.out, wall.a], ['cylinder', sense, [0, 0, 1]]);
    near(wall.r, r);
  }
  for (const face of ['n7.side0#1', 'n7.side0#2']) {
    const bore = stock.supports[face];
    assert.deepEqual([bore.kind, bore.out, bore.a], ['cylinder', -1, [0, 1, 0]]);
    near(bore.r, 1.5);
    near(bore.c[0], 20);
    near(bore.c[2], 3);
  }
  for (const plane of [stock.supports[cap], donor.supports['n2.bottom']]) {
    assert.equal(plane.kind, 'plane');
    near(plane.n[1] / plane.n[2], .5);
    near(plane.o[2] + .5 * (plane.o[1] - 20), height);
  }
  f.report.observations.push({ label, radius, height, volume: stock.volume, digest: stock.digest, donor: donor.digest });
  return { stock, donor };
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
  const manual = await native('d1666-manual-reference', reference, 13, 12);
  const first = join(f.output, 'pending-original-donor.bcad');
  await copyFile(input, first);
  f.phase = 'Stage a proposal from the original reviewed image';
  const oldPin = await mcp(first, 'initial-proposal', async (call, request) => {
    const pin = await review(request, 'before-donor-move');
    const args = edit(pin.revision, 1);
    assert.match((await call('features', args, true)).error, /only proposes/i);
    assert.deepEqual(await readFile(first), inputBytes);
    const result = await call('proposals', propose(args, title));
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
    return pin;
  });
  const pending = JSON.parse(await readFile(first));
  assert.deepEqual(pending.nodes, source.nodes);
  assert.deepEqual(pending.outputs, source.outputs);
  await f.freshOpen(first, pending, '01-original-pending');
  await button('Chat').first().click();
  await button('Preview', card('P1')).click();
  await button('Hide', card('P1')).waitFor();
  await f.same(pending);
  const original = await native('accepted-before-donor-move', pending, 11, 13);
  await f.snapshot('02-original-preview');
  await button('Hide', card('P1')).click();

  f.phase = 'Change the linked donor and refuse the old proposal';
  await f.openFeatureEditor(donorIndex, 'inclined reference position');
  await f.editor().getByLabel('ΔZ', { exact: true }).fill('-1');
  await f.applyEditor(pending, '03-donor-moved');
  const moved = await f.doc();
  assert.deepEqual(moved.nodes.slice(4), source.nodes.slice(4));
  assert.deepEqual(moved.proposals, pending.proposals);
  const before = await native('current-accepted', moved, 11, 12);
  assert.deepEqual(before.stock.incidence, original.stock.incidence);
  near(original.stock.volume - before.stock.volume, Math.PI * (11 ** 2 - 8 ** 2) / 2);
  near((await f.bodies()).bodies.find(body => body.key === 'b9').volume, before.stock.volume);
  await card('P1').locator('.stale').waitFor();
  assert.ok(await button('Preview', card('P1')).isDisabled());
  assert.equal(await button('Accept', card('P1')).count(), 0);
  await button('Rebase & preview', card('P1')).click();
  await f.waitToast(/part changed since the requested revision/i);
  await f.same(moved);
  await f.snapshot('04-stale-review-refused');

  const savedMoved = await f.save('current-donor');
  const movedBytes = await readFile(savedMoved.file);
  const next = join(f.output, 'pending-current-donor.bcad');
  await copyFile(savedMoved.file, next);
  f.phase = 'Refuse stale and blind results and stage a current proposal';
  await mcp(next, 'current-proposal', async (call, request) => {
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /P1 is stale/i);
    const pin = await review(request, 'after-donor-move');
    assert.notEqual(pin.revision, oldPin.revision);
    assert.notEqual(pin.imageSha256, oldPin.imageSha256);
    const detail = await call('describe', { tool: 'features', action: 'edit' });
    assert.match(JSON.stringify(detail), /radial through bore/);
    const stale = await call('proposals', propose(edit(oldPin.revision, 1), 'Refuse an old review'), true);
    assert.match(stale.error, /part changed/i);
    const blind = await call('proposals', propose(edit(pin.revision, 3), 'Refuse a blind result'), true);
    assert.match(blind.error, /could not build.*nothing was applied/i);
    assert.deepEqual(await readFile(next), movedBytes);
    const result = await call('proposals', propose(edit(pin.revision, 1), title));
    assert.deepEqual([result.proposal, result.applied], ['P2', false]);
    const staged = await readFile(next);
    assert.match((await call('proposals', { action: 'accept', id: 'P2' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(next), staged);
  });

  const current = JSON.parse(await readFile(next));
  assert.deepEqual(current.nodes, moved.nodes);
  assert.deepEqual(current.outputs, moved.outputs);
  assert.deepEqual(current.requirements, moved.requirements);
  await f.freshOpen(next, current, '05-current-pending');
  await button('Chat').first().click();
  await card('P1').locator('.stale').waitFor();
  await button('Preview', card('P2')).click();
  await button('Hide', card('P2')).waitFor();
  const delta = await card('P2').getByLabel('Volume change').innerText();
  const amount = /^\+([\d,.]+) mm³/.exec(delta)?.[1];
  assert.ok(amount, delta);
  near(Number(amount.replaceAll(',', '')), manual.stock.volume - before.stock.volume, .01);
  await f.same(current);
  near((await f.bodies()).bodies.find(body => body.key === 'b9').volume, before.stock.volume);
  await f.snapshot('06-fresh-preview');

  f.phase = 'Approve in Studio and retain the exact native bore';
  await button('Accept', card('P2')).click();
  await f.changed(current);
  const accepted = await f.doc(), decision = accepted.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P2', 'user']);
  assert.deepEqual(accepted.proposals.map(p => [p.id, p.status]), [['P1', 'open'], ['P2', 'accepted']]);
  assert.deepEqual(accepted.nodes, reference.nodes);
  assert.deepEqual(accepted.outputs, reference.outputs);
  assert.deepEqual(accepted.requirements, source.requirements);
  const approved = await native('approved', accepted, 13, 12);
  assert.deepEqual(approved, manual);
  assert.deepEqual(approved.stock.incidence, before.stock.incidence);
  assert.equal(approved.donor.digest, before.donor.digest);
  near((await f.bodies()).bodies.find(body => body.key === 'b9').volume, approved.stock.volume);
  await f.snapshot('07-approved-wall');
  await f.undo();
  await f.same(current);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('approved-bored-wall');
  await f.freshOpen(saved.file, accepted, '08-reopened');
  assert.deepEqual(await native('reopened', await f.doc(), 13, 12), manual);
  await f.openFeatureEditor(index, 'reopened approved Offset');
  await button('Edit offset', f.editor()).click();
  const editor = f.page.getByRole('dialog', { name: 'Edit Offset face', exact: true });
  await editor.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  assert.equal(await editor.getByLabel('Offset', { exact: true }).inputValue(), '1');
  await f.snapshot('09-reopened-editable-offset');
  assert.deepEqual(await readFile(input), inputBytes);
  assert.deepEqual(await readFile(referenceFile), referenceBytes);
});

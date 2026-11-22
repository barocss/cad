import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const input = resolve(process.argv[3]), originalBytes = await readFile(input);
const source = JSON.parse(originalBytes), index = 5, donorIndex = 3;
const outer = 'n0.normal', inner = 'n0.reverse', reference = 'n2.bottom';
const title = 'Increase the wall Offset on the moved inclined cap to +3 mm';
assert.deepEqual(source.nodes[donorIndex].offset, [0, 0, 0]);
assert.deepEqual([source.nodes[index].kind, source.nodes[index].faces, source.nodes[index].distance], ['offset-face', [outer], 2]);
assert.deepEqual([source.nodes[index - 1].kind, source.nodes[index - 1].target.face], ['replace-face', reference]);
const pins = [
  'apps/cad-studio/test/linked-cap-wall-agent-proposal-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'apps/cad-studio/src/state/useProposalPreview.ts', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  ...['chat/part/features', 'chat/part/proposals', 'chat/toolDefinitions', 'app/offsetFaceEdit', 'engine/exactThickenEdit']
    .map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  'packages/barocss-cad/src/features/exact-cylinder-cap-offset.ts',
];
const f = await createFlow({
  name: 'linked-cap-wall-agent-proposal', output: process.argv[2], envFrozen: 'D1662_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Refuse a stale wall proposal after a Studio donor move and approve a fresh one through native Save/Open.',
  limits: ['One exact semicylinder, one inclined planar donor, local L1 Agent, desktop Studio WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key, brep}) => {
  const cap = brep.faces.find(face => face.name === 'n0.v-max');
  const ids = new Set(brep.coedges.filter(use => cap?.loops.includes(use.loop)).map(use => use.edge));
  const rims = brep.edges.filter(edge => ids.has(edge.id) && edge.curve.degree === 2).map(({curve}) => {
    const [lo, hi] = curveDomain(curve);
    return Array.from({length: 17}, (_, i) => evaluateCurve(curve, lo + (hi - lo) * i / 16));
  });
  return { key, rims, volume: brepMassProperties(brep, 1).volume, digest: digestOf(brep), report: checkBrep(brep, { strict: true }),
    ids: Object.fromEntries(['vertices','edges','coedges','loops','faces','shells','bodies'].map(field =>
      [field, brep[field].map(item => [item.id, item.name ?? null])])),
    support: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face)])) };
})));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = id => f.page.getByRole('listitem', { name: `Proposal ${id}`, exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 1 }, file, label, run);
const wallPass = () => f.page.getByRole('listitem', { name: 'Requirement WALL-4', exact: true }).and(f.page.locator('.req.pass')).waitFor();
const volume = (r, h) => Math.PI / 2 * (r ** 2 - 64) * h - (r ** 3 - 512) / 3;
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

async function renderReview(request, label) {
  const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', highlight: [outer] } });
  assert.equal(reply.isError, false);
  const pin = JSON.parse(reply.content[0].text);
  const png = Buffer.from(reply.content.find(item => item.type === 'image').data, 'base64');
  assert.equal(sha256(png), pin.imageSha256);
  assert.match(pin.revision, /^[a-f0-9]{16}$/);
  assert.ok(Object.values(pin.legend).includes(outer));
  f.report.observations.push({ label, revision: pin.revision, renderSha: pin.imageSha256 });
  return pin;
}

async function inspect(label, doc, radius, height, retained) {
  const rows = await f.inspect(label, doc);
  const stock = rows.find(row => row.key === 'b5'), donor = rows.find(row => row.key === 'b3');
  assert.deepEqual(rows.map(row => row.key).sort(), ['b3', 'b5']);
  assert.ok(stock.report.valid && donor.report.valid);
  assert.deepEqual(stock.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  if (retained) assert.deepEqual(stock.ids, retained.stock.ids);
  for (const [name, r, out] of [[outer, radius, 1], [inner, 8, -1]]) {
    const wall = stock.support[name];
    assert.deepEqual([wall.kind, wall.out, wall.a], ['cylinder', out, [0, 0, 1]]);
    near(wall.r, r);
  }
  near(stock.support['n0.v-min'].o[2], 0);
  for (const plane of [stock.support['n0.v-max'], donor.support[reference]]) {
    assert.equal(plane.kind, 'plane');
    near(plane.n[1] / plane.n[2], .5);
    near(plane.o[2] + .5 * (plane.o[1] - 20), height);
  }
  const levels = stock.rims.flat().map(([x, y, z]) => {
    near(z, height - .5 * (y - 20));
    assert.ok([radius, 8].some(r => Math.abs(Math.hypot(x - 20, y - 20) - r) < 1e-7));
    return z;
  });
  near(Math.min(...levels), height - .5 * radius);
  near(Math.max(...levels), height);
  near(stock.volume, volume(radius, height));
  near((await f.bodies()).bodies.find(body => body.key === 'b5').volume, stock.volume);
  f.report.observations.push({ label, radius, height, volume: stock.volume, stockDigest: stock.digest, donorDigest: donor.digest,
    crown: Math.min(...levels), gap: stock.report.maximumPcurveGap });
  return { stock, donor };
}

const edit = (revision, distance) => ({ action: 'edit', index, values: { offsetDistance: distance }, expectedRevision: revision });
const propose = (args, title) => ({ action: 'propose', title, ops: [{ tool: 'features', args }] });

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
  const initial = join(f.output, 'pending-original-donor.bcad');
  await copyFile(input, initial);
  f.phase = 'Propose a signed wall edit from the first rendered revision';
  const oldPin = await mcp(initial, 'original-proposal', async (call, request) => {
    const pin = await renderReview(request, 'original-review');
    const args = edit(pin.revision, 3);
    assert.match((await call('features', args, true)).error, /only proposes/i);
    assert.deepEqual(await readFile(initial), originalBytes);
    const result = await call('proposals', propose(args, 'Increase the wall on the original inclined cap to +3 mm'));
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
    return pin;
  });
  const initialPending = JSON.parse(await readFile(initial));
  assert.deepEqual(initialPending.nodes, source.nodes);
  assert.deepEqual(initialPending.outputs, source.outputs);
  await f.freshOpen(initial, initialPending, '01-pending-on-original-plane');
  const old = await inspect('original-accepted-geometry', initialPending, 12, 13);
  await button('Chat').first().click();
  await button('Preview', card('P1')).click();
  await button('Hide', card('P1')).waitFor();
  await f.same(initialPending);
  await f.snapshot('02-original-proposal-preview');
  await button('Hide', card('P1')).click();

  f.phase = 'Move the accepted reference in Studio and block the old preview and approval';
  await f.openFeatureEditor(donorIndex, 'inclined reference position');
  await f.editor().getByLabel('ΔZ', { exact: true }).fill('-2');
  await f.applyEditor(initialPending, '03-donor-moved');
  const moved = await f.doc();
  assert.deepEqual(moved.nodes[index], source.nodes[index]);
  assert.deepEqual(moved.nodes[index - 1], source.nodes[index - 1]);
  assert.deepEqual(moved.proposals, initialPending.proposals);
  const before = await inspect('current-accepted-geometry', moved, 12, 11, old);
  await card('P1').locator('.stale').waitFor();
  assert.equal(await button('Preview', card('P1')).isDisabled(), true);
  assert.equal(await button('Accept', card('P1')).count(), 0);
  await button('Rebase & preview', card('P1')).click();
  await f.waitToast(/part changed since the requested revision/i);
  await f.same(moved);
  await f.snapshot('04-stale-proposal-after-donor-motion');

  const movedFile = await f.save('reviewed-moved-reference');
  const movedBytes = await readFile(movedFile.file);
  const pendingFile = join(f.output, 'pending-current-donor.bcad');
  await copyFile(movedFile.file, pendingFile);
  f.phase = 'Refuse stale and contacting candidates, then prepare a fresh proposal';
  await mcp(pendingFile, 'current-proposal', async (call, request) => {
    const error = await call('proposals', { action: 'accept', id: 'P1' }, true);
    assert.match(error.error, /P1 is stale.*source or requirements changed/i);
    const pin = await renderReview(request, 'moved-reference-review');
    assert.notEqual(pin.revision, oldPin.revision);
    assert.notEqual(pin.imageSha256, oldPin.imageSha256);
    const detail = await call('describe', { tool: 'features', action: 'edit' });
    assert.match(JSON.stringify(detail), /linked inclined upper-cap replacement/);
    const stale = await call('proposals', propose(edit(oldPin.revision, 3), 'Reject an old wall revision'), true);
    assert.match(stale.error, /part changed/i);
    const contact = await call('proposals', propose(edit(pin.revision, 12), 'Reject wall contact'), true);
    assert.match(contact.error, /could not build.*nothing was applied/i);
    assert.deepEqual(await readFile(pendingFile), movedBytes);
    const result = await call('proposals', propose(edit(pin.revision, 3), title));
    assert.deepEqual([result.proposal, result.applied], ['P2', false]);
    const staged = await readFile(pendingFile);
    assert.match((await call('proposals', { action: 'accept', id: 'P2' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(pendingFile), staged);
  });

  const pending = JSON.parse(await readFile(pendingFile));
  assert.deepEqual(pending.nodes, moved.nodes);
  assert.deepEqual(pending.outputs, moved.outputs);
  assert.deepEqual(pending.proposals[0], moved.proposals[0]);
  await f.freshOpen(pendingFile, pending, '05-both-proposals-open');
  await button('Chat').first().click();
  await card('P1').locator('.stale').waitFor();
  await card('P2').getByText(title, { exact: false }).waitFor();
  await button('Preview', card('P2')).click();
  await button('Hide', card('P2')).waitFor();
  const delta = await card('P2').getByLabel('Volume change').innerText();
  const shown = /^\+([\d,.]+) mm³/.exec(delta)?.[1];
  assert.ok(shown, delta);
  near(Number(shown.replaceAll(',', '')), volume(13, 11) - volume(12, 11), .01);
  await f.same(pending);
  await inspect('current-geometry-during-preview', pending, 12, 11, before);
  await f.snapshot('06-fresh-proposal-preview');
  await button('Accept', card('P2')).click();
  await f.changed(pending);
  const accepted = await f.doc(), decision = accepted.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P2', 'user']);
  assert.deepEqual(accepted.proposals.map(p => [p.id, p.status]), [['P1', 'open'], ['P2', 'accepted']]);
  assert.deepEqual(accepted.proposals[0], pending.proposals[0]);
  assert.deepEqual(accepted.nodes.slice(0, index), moved.nodes.slice(0, index));
  assert.deepEqual(accepted.nodes[index], { ...moved.nodes[index], distance: 3 });
  assert.deepEqual(accepted.outputs, moved.outputs);
  const after = await inspect('approved', accepted, 13, 11, before);
  assert.equal(after.donor.digest, before.donor.digest);
  await wallPass();
  await f.snapshot('07-approved-wall');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);

  const saved = await f.save('approved-linked-cap-wall');
  await f.freshOpen(saved.file, accepted, '08-reopened');
  const reopened = await inspect('reopened', await f.doc(), 13, 11, before);
  assert.deepEqual([reopened.stock.digest, reopened.donor.digest], [after.stock.digest, before.donor.digest]);
  await wallPass();
  const bytes = await readFile(saved.file);
  await mcp(saved.file, 'approved-evidence', async call => {
    const proof = await call('requirements', { action: 'evidence' });
    const row = JSON.parse(proof.files[0].text).evidence.find(entry => entry.requirement?.id === 'WALL-4');
    assert.deepEqual([row.result.verdict, row.result.value.entities, row.freshness.state], ['pass', [outer, inner], 'current']);
    near(row.result.number, 5, 1e-10);
    const list = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(list.proposals.map(p => [p.id, p.status]), [['P1', 'open'], ['P2', 'accepted']]);
    assert.equal(list.proposals[0].stale, true);
    f.report.observations.push({ wall: row.result.number, revision: proof.revision, stale: 'P1', accepted: 'P2', by: decision.by.agent });
  });
  assert.deepEqual(await readFile(saved.file), bytes);
  assert.deepEqual(await readFile(input), originalBytes);
  await f.openFeatureEditor(index, 'reopened approved Offset');
  await button('Edit offset', f.editor()).click();
  const editor = f.page.getByRole('dialog', { name: 'Edit Offset face', exact: true });
  await editor.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  assert.equal(await editor.getByLabel('Offset', { exact: true }).inputValue(), '3');
  await f.snapshot('09-reopened-editable-offset');
});

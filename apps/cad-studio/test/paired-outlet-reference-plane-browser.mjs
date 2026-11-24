import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { render } from './duct-proposal-review-browser-steps.mjs';
import { createFlow } from './flow-helper.mjs';
import { pairedOutletFixture, tiltedDonor, tiltedInletDonor } from './paired-outlet-fixture.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const solid = node => ({ node, side: 'solid' });
const outlet = 'n1.end';
const agentReview = process.argv.includes('--agent-review');
const agent = agentReview || process.argv.includes('--agent');
const inlet = process.argv.includes('--inlet');
const replaceBaseline = process.argv.includes('--replace-baseline');
const replace = replaceBaseline || process.argv.includes('--replace');
const moving = inlet ? 'n1.start' : outlet;
const fixed = inlet ? outlet : 'n1.start';
const dock = inlet ? {
  donorMin: [-19, -14], donorMax: [-14, -8], sourceView: 'Left', sourcePoint: [-10, 0, 0],
  tiltedPoint: [-16.5, -11, 14], initialView: 'Right', initialPoint: [-14, -11, 12], initialFace: 'n3.side1',
  shift: '8', movedX: -6, retargetView: 'Left', retargetPoint: [-11, -11, 12], retargetFace: 'n3.side3',
  collapse: 19,
} : {
  donorMin: [40, 52], donorMax: [45, 58], sourceView: 'Right', sourcePoint: [36, 38, 0],
  tiltedPoint: [42.5, 55, 14], initialView: 'Left', initialPoint: [40, 55, 12], initialFace: 'n3.side3',
  shift: '-8', movedX: 32, retargetView: 'Right', retargetPoint: [37, 55, 12], retargetFace: 'n3.side1',
  collapse: -15,
};
const endpoint = inlet ? 'inlet' : 'outlet';
const input = pairedOutletFixture({ replace, inlet, donorMin: dock.donorMin, donorMax: dock.donorMax });
const pins = ['apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs', 'apps/cad-studio/test/paired-outlet-fixture.mjs', 'apps/cad-studio/src/App.tsx',
  ...['engine/doc', 'engine/offsetPlane', 'app/nativeOffsetFace', 'app/offsetFaceEdit', 'app/profileCommands', 'app/offsetPlanePick']
    .map(path => `packages/barocss-cad-model/src/${path}.ts`),
  ...(replace ? ['packages/barocss-cad-model/src/app/replaceFaceCommand.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts',
    'packages/barocss-cad/src/brep/exact-sweep-end-trim.ts', 'packages/barocss-cad/src/part/part-model.ts'] : []),
  ...(agent ? ['apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
    ...['features', 'proposals'].map(file => `packages/barocss-cad-model/src/chat/part/${file}.ts`)] : []),
  ...(agentReview ? ['apps/cad-studio/test/duct-proposal-review-browser-steps.mjs',
    'packages/barocss-cad-model/src/chat/pairedElbowOutletPlaneProposalReview.ts',
    'packages/barocss-cad-model/src/chat/pairedElbowOutletOffsetEvidence.ts',
    'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
    'packages/barocss-cad-model/src/chat/part/views.ts'] : [])];
const f = await createFlow({
  name: `paired-${endpoint}-reference-plane`, output: process.argv[2],
  envFrozen: replace ? inlet ? 'D1885_SOURCE_FROZEN' : 'D1881_SOURCE_FROZEN' : agentReview ? inlet ? 'D1859_SOURCE_FROZEN' : 'D1856_SOURCE_FROZEN' : agent ? 'D1855_SOURCE_FROZEN' : inlet ? 'D1858_SOURCE_FROZEN' : 'D1854_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: replace ? `Replace the original five-span ${endpoint} with a tilted plane inside its straight span in desktop Studio.`
    : agent ? `#324 proposes a revision-bound ${endpoint} plane edit through local MCP and real Studio review.`
    : `#17 moves the original five-span paired ${endpoint} to a live parallel native face in desktop Studio.`,
  limits: [`One original five-span S-bend, one detached native donor and the original straight ${endpoint}.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const evaluated = evaluateDoc(doc, 1);
if (!evaluated.ok) throw new Error(evaluated.error.detail);
const out = partBreps(doc).map(({key, brep}) => {
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const owners = new Map(brep.faces.flatMap(face => face.loops.map(id => [id, face.name])));
  const byEdge = new Map();
  for (const use of uses.values()) byEdge.set(use.edge, [...(byEdge.get(use.edge) ?? []), use]);
  const planes = Object.fromEntries(brep.faces.flatMap(face => {
    const plane = faceGeometry(face);
    if (plane.kind !== 'plane') return [];
    const faceLoops = brep.loops.filter(loop => face.loops.includes(loop.id));
    return [[face.name, { plane, holes: faceLoops.filter(loop => loop.kind === 'inner').length,
      points: faceLoops.flatMap(loop => loop.coedges.flatMap(id => edges.get(uses.get(id)!.edge)!.curve.controlPoints)) }]];
  }));
  const joins = [['lead','first'],['first','line'],['line','second'],['second','tail']].map(pair =>
    brep.edges.flatMap(edge => {
      const attached = byEdge.get(edge.id) ?? [], names = attached.map(use => owners.get(use.loop));
      return pair.every(piece => names.some(name => name?.startsWith('n1.' + piece + '.'))) ? [{ edge, attached }] : [];
    }));
  const display = evaluated.bodies.find(body => body.key === key)!;
  const incidence = [brep.faces, brep.edges, brep.vertices, brep.loops, brep.coedges]
    .map(records => records.map(record => [record.id, 'name' in record ? record.name : null]));
  const { volume, centroid } = brepMassProperties(brep, 1);
  return { key, hash: digestOf(brep), incidence, planes, joins, topology: checkBrep(brep, {strict:true}),
    mesh: display.mesh.faces.map(face => [face.name, face.index]), volume, centroid };
});
console.log(JSON.stringify(out));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const field = (scope, name) => scope.getByLabel(name, { exact: true });
const status = (scope, state) => scope.locator('.status').filter({ hasText: new RegExp(`^${state}$`) }).waitFor();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-8, `${actual} vs ${expected}`);

async function view(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.waitForFunction(label => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === label;
  }, name.toUpperCase());
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function clickWorld(point) {
  const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), point);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
}

async function verifyReplacement(label, doc, original, expectedX) {
  const records = await f.inspect(label, doc), part = records.find(record => record.key === 'b5');
  assert.equal(records.length, 2);
  assert.ok(part.topology.valid);
  assert.deepEqual(part.topology.counts, { bodies: 1, shells: 1, faces: 62, loops: 66, coedges: 264, edges: 132, vertices: 72 });
  assert.equal(part.topology.topology[0].genus, 2);
  assert.deepEqual(part.incidence, original.incidence);
  assert.deepEqual(part.joins, original.joins);
  assert.deepEqual(part.planes[fixed], original.planes[fixed]);
  const cap = part.planes[moving], baselineY = inlet ? 0 : 38;
  assert.equal(cap.holes, 2);
  cap.points.forEach(([x, y]) => near(x, expectedX + (y - baselineY) / 4));
  const normal = (inlet ? [-4, 1, 0] : [4, -1, 0]).map(value => value / Math.sqrt(17));
  cap.plane.n.forEach((value, axis) => near(value, normal[axis]));
  near(Math.min(...cap.points.map(([x]) => x)), expectedX - .5);
  near(Math.max(...cap.points.map(([x]) => x)), expectedX + .5);
  const trim = inlet ? expectedX + 10 : 36 - expectedX;
  const expectedVolume = 32 * (24 + 15 * Math.PI - trim);
  near(part.volume, expectedVolume);
  near((await f.bodies()).bodies.find(body => body.key === 'b5').volume, expectedVolume);
  if (inlet) {
    const mx = 32 * (270 * Math.PI + 64) + 320 * trim - 16 * trim ** 2 - 19 / 12;
    const my = 32 * (252 * Math.PI + 536) - 38 / 3;
    part.centroid.forEach((value, axis) => near(value, [mx / expectedVolume, my / expectedVolume, 0][axis]));
  } else if (expectedX === 35) part.centroid.forEach((value, axis) => near(value, [12.503292359971336, 18.397113817368265, 0][axis]));
  f.report.observations.push({ label, expectedX, expectedVolume, volume: part.volume, centroid: part.centroid, hash: part.hash, joins: 48 });
  return part.hash;
}

async function exerciseReplacement(original) {
  const donor = inlet ? tiltedInletDonor : tiltedDonor;
  const bottomView = inlet ? 'Right' : 'Left', topView = inlet ? 'Left' : 'Right';
  const firstX = inlet ? -9 : 35, shift = inlet ? 1 : -1;
  // The same tilted donor must still refuse through the parallel Offset command.
  f.phase = 'Refuse the tilted donor through the parallel Offset command';
  await f.command('Offset face');
  const offset = hud('Offset face');
  await field(offset, 'Mode').selectOption('to-plane');
  await view(bottomView);
  await clickWorld(donor.origin);
  await status(offset, 'refused');
  assert.match(await offset.locator('.hud-error').innerText(), /parallel/i);
  await f.same(input);
  await f.snapshot('replace-parallel-offset-refused');
  await button('Cancel', offset).click();
  await view(dock.sourceView);
  await clickWorld(dock.sourcePoint);
  await f.page.evaluate(() => document.activeElement?.blur());

  f.phase = `Pick the separate tilted native plane for the original ${endpoint}`;
  await f.command('Replace face');
  const panel = hud('Replace face');
  await view(bottomView);
  await clickWorld(donor.origin);
  await status(panel, 'preview');
  await panel.getByText('n3.bottom', { exact: false }).waitFor();
  await f.same(input);
  await f.snapshot('replace-tilted-preview');
  await button('Apply', panel).click();
  await f.changed(input);
  const first = await f.doc(), binding = first.nodes[5];
  assert.equal(binding.kind, 'replace-face');
  assert.deepEqual(binding.parent, solid(1));
  assert.deepEqual(binding.faces, [moving]);
  assert.deepEqual({ body: binding.target.body, feature: binding.target.feature, face: binding.target.face },
    { body: solid(4), feature: 'n4', face: 'n3.bottom' });
  await verifyReplacement('replace-applied-native', first, original, firstX);
  await button('Iso', f.page.locator('.views')).click();
  await f.snapshot('replace-applied');

  await f.openFeatureEditor(4, 'move the same tilted donor');
  await field(f.editor(), 'ΔX').fill(String(shift));
  const moved = (await f.applyEditor(first, 'replace-donor-moved')).doc;
  assert.deepEqual(moved.nodes[5], binding);
  await verifyReplacement('replace-moved-native', moved, original, firstX + shift);

  f.phase = 'Retarget the original Replace face in History';
  await f.openFeatureEditor(5, `edit the tilted ${endpoint} binding`);
  const edit = hud('Edit Replace face');
  await button('Edit Replace face', f.editor()).click();
  const top = donor.origin.map((value, axis) => value + .5 * donor.normal[axis] + (axis === 0 ? shift : 0));
  await view(topView);
  await clickWorld(top);
  await status(edit, 'preview');
  await edit.getByText('n3.top', { exact: false }).waitFor();
  await button('Apply', edit).click();
  await f.changed(moved);
  const retargeted = (await f.snapshot('replace-other-donor-face')).doc;
  assert.equal(retargeted.nodes[5].id, binding.id);
  assert.equal(retargeted.nodes[5].target.face, 'n3.top');
  const expectedX = firstX + shift - shift * Math.sqrt(17) / 8;
  const digest = await verifyReplacement('replace-retargeted-native', retargeted, original, expectedX);
  await f.undo(); await f.same(moved);
  await f.redo(); await f.same(retargeted);
  const saved = await f.save(`tilted-paired-${endpoint}`);
  await f.freshOpen(saved.file, retargeted, 'replace-fresh-open');
  assert.equal(await verifyReplacement('replace-reopened-native', retargeted, original, expectedX), digest);

  const collapsed = { ...retargeted, nodes: retargeted.nodes.map((node, index) => index === 4 ? { ...node, offset: [inlet ? 10 : -6, 0, 0] } : node) };
  await open(collapsed, `tilted-${endpoint}-reaches-join.bcad`);
  await f.waitToast(/strictly between.*Your part is unchanged/is);
  await f.same(retargeted);
  await f.snapshot('replace-collapse-refused');

  await f.dismissToasts();
  const held = { ...retargeted, nodes: retargeted.nodes.map((node, index) => index === 4 ? { ...node, held: 'stale donor' } : node) };
  await open(held, `tilted-${endpoint}-held-donor.bcad`);
  await f.waitToast(/available reference body.*Your part is unchanged/is);
  await f.same(retargeted);
  await f.snapshot('replace-held-donor-refused');
}

const open = (doc, name) => field(f.page, 'Model file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });

async function verify(label, doc, original, key, face, x) {
  const records = await f.inspect(label, doc), part = records.find(record => record.key === key), donor = records.find(record => record.key === 'b4');
  assert.ok(part && donor && records.length === 2);
  assert.ok(part.topology.valid && donor.topology.valid);
  assert.deepEqual(part.topology.counts, { bodies: 1, shells: 1, faces: 62, loops: 66, coedges: 264, edges: 132, vertices: 72 });
  assert.equal(part.topology.topology[0].genus, 2);
  assert.deepEqual(part.joins.map(joins => joins.length), [12, 12, 12, 12]);
  assert.deepEqual(part.joins, original.joins);
  assert.deepEqual(part.incidence, original.incidence);
  assert.deepEqual(part.planes[fixed], original.planes[fixed]);
  assert.equal(part.planes[moving].holes, 2);
  const plane = donor.planes[face].plane;
  near(plane.o[0], x);
  const cap = part.planes[moving];
  near(cap.plane.o[0], x);
  cap.points.forEach(point => near(point[0], x));
  const distance = inlet ? -x - 10 : x - 36;
  const length = 24 + 15 * Math.PI + distance;
  const expected = 32 * length;
  if (inlet) {
    const centre = [(270 * Math.PI + 64 - 10 * distance - distance ** 2 / 2) / length,
      (252 * Math.PI + 536) / length, 0];
    part.centroid.forEach((value, axis) => near(value, centre[axis]));
  }
  near(part.volume, expected);
  near((await f.bodies()).bodies.find(body => body.key === key).volume, expected);
  f.report.observations.push({ label, x, donor: face, volume: part.volume, centroid: part.centroid, joins: 48, hash: part.hash, referenceHash: donor.hash });
  return { part, donor };
}

async function reviewAgentImages(file, call, request, expectedRevision) {
  const bytes = await readFile(file);
  const { proposals: [proposal] } = await call('proposals', { action: 'list' });
  assert.match(proposal.modelReviewRevision, /^[a-f0-9]{64}$/);
  const pins = { expectedRevision, proposal: 'P1', expectedProposalRevision: proposal.modelReviewRevision };
  const normal = await render(request, pins), opposite = await render(request, { ...pins, orientation: 'opposite' });
  assert.notDeepEqual(normal.png, opposite.png);
  assert.notEqual(normal.meta.candidate.reviewRevision, opposite.meta.candidate.reviewRevision);
  assert.equal(normal.meta.candidate.bodySha256, opposite.meta.candidate.bodySha256);
  const fieldName = inlet ? 'pairedElbowInletPlaneOffset' : 'pairedElbowOutletPlaneOffset';
  const geometry = normal.meta[fieldName];
  assert.deepEqual(geometry, opposite.meta[fieldName]);
  assert.deepEqual([geometry.source.body, geometry.source.feature, geometry.source.face], ['b1', 'n1', moving]);
  assert.deepEqual([geometry.reference.body, geometry.reference.feature, geometry.reference.face], ['b4', 'n4', dock.initialFace]);
  assert.deepEqual([geometry.candidate.body, geometry.candidate.feature, geometry.candidate.face], ['b5', 'n5', moving]);
  assert.equal(geometry.candidate.bodySha256, normal.meta.candidate.bodySha256);
  for (const entity of [geometry.source, geometry.reference, geometry.candidate]) {
    assert.match(entity.bodySha256, /^[a-f0-9]{64}$/);
    assert.equal(typeof entity.faceId, 'string');
    assert.ok(entity.faceId.length > 0);
  }
  assert.equal(geometry.source.faceId, geometry.candidate.faceId);
  assert.deepEqual(geometry.reference.target.body, solid(4));
  const x = dock.initialPoint[0];
  assert.deepEqual([geometry.originalCap.center, geometry.movedCap.center], [dock.sourcePoint, [x, ...dock.sourcePoint.slice(1)]]);
  assert.deepEqual(geometry.displacement, { normal: [inlet ? -1 : 1, 0, 0], vector: [inlet ? -4 : 4, 0, 0] });
  assert.equal(geometry.movedCap.apertures.length, 2);
  const joins = geometry.retained.junctions.flatMap(join => join.exteriorSeams.concat(...join.interiorSeams));
  assert.equal(new Set(joins).size, 48);
  near(geometry.materialChange.native, 128);
  near(geometry.volume.candidate.native, 32 * (28 + 15 * Math.PI));
  const inspect = { ...pins, action: 'inspect', faces: [moving, dock.initialFace], expectedReviewRevision: normal.meta.candidate.reviewRevision };
  const first = await call('query', inspect), second = await call('query', { ...inspect, orientation: 'opposite',
    expectedReviewRevision: opposite.meta.candidate.reviewRevision });
  assert.deepEqual(first[fieldName], geometry);
  assert.deepEqual(first.faces, second.faces);
  assert.equal(first.imageSha256, normal.meta.imageSha256);
  assert.equal(second.imageSha256, opposite.meta.imageSha256);
  for (const face of first.faces) near(face.geometry.point[0], x);
  assert.equal(first.faces.length, 2);
  assert.equal((await call('query', { ...inspect, orientation: 'opposite' }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  assert.equal((await call('query', { ...inspect, expectedProposalRevision: '0'.repeat(64) }, true)).code, 'MODEL_REVIEW_PROPOSAL_STALE');
  assert.deepEqual(await readFile(file), bytes);
  await writeFile(join(f.output, 'pending-reference-normal.png'), normal.png);
  await writeFile(join(f.output, 'pending-reference-opposite.png'), opposite.png);
  f.report.observations.push({ label: 'pinned-agent-review', geometry, pins,
    normal: normal.meta.candidate, opposite: opposite.meta.candidate,
    normalImage: normal.meta.imageSha256, oppositeImage: opposite.meta.imageSha256 });
  return { geometry, inspect };
}

async function exerciseAgent() {
  const file = join(f.output, 'agent-reference-proposal.bcad'), originalBytes = Buffer.from(JSON.stringify(input));
  await writeFile(file, originalBytes);
  f.phase = `Propose the paired native ${endpoint} through local MCP`;
  const session = { app: f.app, output: f.output, clientName: f.name };
  const reviewed = await withMcpSession(session, file, `paired-${endpoint}-reference`, async (call, request) => {
    const description = await call('describe', { command: 'offset-face' });
    assert.match(description.selection, /original five-span inlet and outlet accept To plane/);
    const expectedRevision = await currentPartRevision(call);
    const command = { action: 'command', command: 'offset-face', expectedRevision,
      faces: [moving, dock.initialFace], values: { offsetMode: 'to-plane' } };
    const operation = (overrides = {}) => ({ tool: 'features', args: { ...command, ...overrides } });
    const dry = (op, error = false) => call('features', { action: 'batch', dryRun: true, ops: [op] }, error);
    const preview = await dry(operation());
    assert.equal(preview.dryRun, true);
    near(preview.change.volume, 128);
    const detail = JSON.parse(preview.would_apply[0].did.slice('Offset face '.length));
    assert.deepEqual(detail, { offsetMode: 'to-plane', sourceFace: moving, referenceFeature: 'n4', referenceFace: dock.initialFace });
    assert.match((await dry(operation({ faces: [moving, 'n3.top'] }), true)).error, /parallel/i);
    assert.match((await dry(operation({ expectedRevision: '0000000000000000' }), true)).error, /part changed/i);
    assert.deepEqual(await readFile(file), originalBytes);
    const pending = await call('proposals', { action: 'propose', title: `Move the paired ${endpoint} to the native donor face`, ops: [operation()] });
    assert.deepEqual([pending.proposal, pending.applied], ['P1', false]);
    const savedPending = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), savedPending);
    if (agentReview) return reviewAgentImages(file, call, request, expectedRevision);
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, input.nodes);
  const records = await f.inspect('agent-original', pending), original = records.find(record => record.key === 'b1');
  const donor = records.find(record => record.key === 'b4');
  const openCard = async label => {
    await f.freshOpen(file, pending, label);
    await button('Chat').first().click();
    const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
    await card.getByText(`${moving} to ${dock.initialFace} on n4`, { exact: false }).waitFor();
    return card;
  };
  const previewCard = async (card, label) => {
    await button('Preview', card).click();
    await button('Hide', card).waitFor();
    await card.getByLabel('Volume change').getByText(/^\+128(?:\.0+)? mm³(?: \(.*\))?$/).waitFor();
    await f.same(pending);
    await f.snapshot(label);
  };
  const staleCard = await openCard('01-agent-pending');
  await previewCard(staleCard, '02-agent-preview');
  await button('Hide', staleCard).click();
  await button('Preview', staleCard).waitFor();
  await f.same(pending);
  await f.openFeatureEditor(4, 'move the donor after review');
  await field(f.editor(), 'ΔX').fill(dock.shift);
  const moved = (await f.applyEditor(pending, '03-agent-donor-changed')).doc;
  await staleCard.getByText('stale ·', { exact: true }).waitFor();
  assert.ok(await button('Preview', staleCard).isDisabled());
  assert.equal(await button('Accept', staleCard).count(), 0);
  await button('Rebase & preview', staleCard).waitFor();
  assert.equal(moved.nodes.length, input.nodes.length);
  assert.equal(moved.proposals[0].status, 'open');
  await f.snapshot('04-agent-stale-no-approval');
  if (reviewed) {
    const stale = await f.save('agent-stale-reference');
    await withMcpSession(session, stale.file, `stale-${endpoint}-reference`, async call => {
      assert.equal((await call('query', reviewed.inspect, true)).code, 'MODEL_REVIEW_BASE_STALE');
      const { proposals: [proposal] } = await call('proposals', { action: 'list' });
      assert.equal(proposal.modelReviewRevision, undefined);
    });
  }

  const card = await openCard('05-agent-fresh-reference');
  await previewCard(card, '06-agent-preview-before-approval');
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('07-agent-approved')).doc, feature = approved.nodes[5];
  assert.deepEqual(feature.parent, solid(1));
  assert.deepEqual(feature.target.body, solid(4));
  assert.equal(feature.target.feature, 'n4');
  assert.equal(feature.target.face, dock.initialFace);
  assert.deepEqual([approved.history.at(-1).by.agent, approved.proposals[0].status], ['user', 'accepted']);
  const result = await verify('agent-approved-native', approved, original, 'b5', dock.initialFace, dock.initialPoint[0]);
  assert.equal(result.donor.hash, donor.hash);
  if (reviewed) {
    assert.deepEqual(feature.target, reviewed.geometry.reference.target);
    assert.equal(result.part.hash, reviewed.geometry.candidate.bodySha256);
    assert.equal(result.donor.hash, reviewed.geometry.reference.bodySha256);
  }
  const saved = await f.save('agent-approved-reference');
  await f.freshOpen(saved.file, approved, '08-agent-fresh-open');
  assert.equal((await verify('agent-reopened-native', approved, original, 'b5', dock.initialFace, dock.initialPoint[0])).part.hash, result.part.hash);
}

await f.run(async () => {
  if (agent) return exerciseAgent();
  await f.newPage();
  await open(input, `paired-${endpoint}-reference.bcad`);
  await f.same(input);
  const inspect = await f.inspect('original', input), original = inspect.find(record => record.key === 'b1');
  const originalDonor = inspect.find(record => record.key === 'b4');
  const originalIndex = original.mesh.find(([name]) => name === moving)[1];
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await view(dock.sourceView);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await clickWorld(dock.sourcePoint);
  await f.page.waitForFunction(index => window.__studioSelection.selection.faces.some(face => face.face === index), originalIndex);
  await f.page.evaluate(() => document.activeElement?.blur());
  if (replaceBaseline) {
    f.phase = `Check Replace face after picking the original ${endpoint}`;
    const { o: donor } = originalDonor.planes['n3.bottom'].plane;
    near(donor[0] - (donor[1] - (inlet ? 0 : 38)) / 4, inlet ? -9 : 35);
    await f.page.keyboard.press('Space');
    await f.page.locator('.palette input').fill('Replace face');
    const row = f.page.getByRole('option').filter({ has: f.page.getByText('Replace face', { exact: true }) });
    await row.waitFor();
    assert.match(await row.getAttribute('class'), /\boff\b/);
    assert.match(await row.innerText(), /Select a supported extrusion face/);
    await f.page.keyboard.press('Enter');
    assert.equal(await hud('Replace face').count(), 0);
    await f.same(input);
    await f.snapshot(`replace-${endpoint}-unavailable`);
    return;
  }
  if (replace) return exerciseReplacement(original);
  await f.command('Offset face');
  const panel = hud('Offset face');
  await field(panel, 'Mode').selectOption('to-plane');
  await panel.getByText('Pick a parallel face on another solid', { exact: true }).waitFor();
  await view('Top');
  await clickWorld(dock.tiltedPoint);
  await status(panel, 'refused');
  assert.match(await panel.locator('.hud-error').innerText(), /parallel/i);
  assert.ok(await button('Apply', panel).isDisabled());
  await f.same(input);
  await f.snapshot('01-nonparallel-refused');
  await view(dock.initialView);
  await clickWorld(dock.initialPoint);
  await status(panel, 'preview');
  await panel.getByText(dock.initialFace, { exact: false }).waitFor();
  await f.same(input);
  await button('Apply', panel).click();
  await f.changed(input);
  await button('Iso', f.page.locator('.views')).click();
  const forward = (await f.snapshot('02-reference-applied')).doc, binding = forward.nodes[5];
  assert.deepEqual(binding.parent, solid(1));
  assert.deepEqual(binding.target.body, solid(4));
  assert.equal(binding.target.feature, 'n4');
  assert.ok(!Object.hasOwn(binding, 'distance'));
  assert.equal((await verify('forward', forward, original, 'b5', dock.initialFace, dock.initialPoint[0])).donor.hash, originalDonor.hash);

  await f.openFeatureEditor(4, 'move the same donor');
  await field(f.editor(), 'ΔX').fill(dock.shift);
  const moved = (await f.applyEditor(forward, '03-donor-moved')).doc;
  assert.deepEqual(moved.nodes[5], binding);
  const inward = await verify('inward', moved, original, 'b5', dock.initialFace, dock.movedX);
  await f.openFeatureEditor(5, `edit the ${endpoint} binding`);
  await button('Edit offset', f.editor()).click();
  const edit = hud('Edit Offset face');
  assert.equal(await field(edit, 'Mode').inputValue(), 'to-plane');
  await view(dock.retargetView);
  await clickWorld(dock.retargetPoint);
  await status(edit, 'preview');
  await edit.getByText(dock.retargetFace, { exact: false }).waitFor();
  await button('Apply', edit).click();
  await f.changed(moved);
  const rebound = (await f.snapshot('04-other-donor-face')).doc;
  assert.equal(rebound.nodes[5].id, binding.id);
  assert.equal(rebound.nodes[5].target.face, dock.retargetFace);
  const shifted = await verify('retarget', rebound, original, 'b5', dock.retargetFace, dock.retargetPoint[0]);
  assert.equal(shifted.donor.hash, inward.donor.hash);
  await f.undo();
  await f.same(moved);
  await f.redo();
  await f.same(rebound);
  const saved = await f.save(`paired-${endpoint}-reference`);
  await f.freshOpen(saved.file, rebound, '05-fresh-open');
  assert.equal((await verify('reopened', rebound, original, 'b5', dock.retargetFace, dock.retargetPoint[0])).part.hash, shifted.part.hash);

  const collapsed = { ...rebound, nodes: rebound.nodes.map((node, index) => index === 4 ? { ...node, offset: [dock.collapse, 0, 0] } : node) };
  await open(collapsed, `paired-${endpoint}-collapse.bcad`);
  await f.waitToast(/Your part is unchanged/i);
  await f.same(rebound);
  await f.snapshot('06-collapse-refused');
});

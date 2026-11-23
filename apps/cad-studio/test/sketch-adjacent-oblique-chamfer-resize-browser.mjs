import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const reviewBaseline = process.argv.includes('--expect-review-unavailable');
const review = reviewBaseline || process.argv.includes('--review-pair');
const turn = Math.atan2(3, 4);
const pointsAt = setback => [[50, 15], [50, 45], [0, 45], [0, setback], [setback, 0],
  [30 - setback, 0], [30 + .8 * setback, .6 * setback]];
const ids = ['e3', 'e4', 'e5', 'e6', 'e1', 'e7', 'e2'];
const shape = { kind: 'polygon', closed: true, points: pointsAt(6), ids, hv: { h: [1, 4], v: [0, 2] },
  lengths: { 3: 6 * Math.SQRT2, 5: 12 * Math.cos(turn / 2) }, rules: [
    { kind: 'fix', point: 2, at: [0, 45] },
    { kind: 'angle', a: 4, b: 6, value: turn * 180 / Math.PI },
    { kind: 'angle', a: 2, b: 3, value: 135 },
    { kind: 'angle', a: 4, b: 5, value: 180 - turn * 90 / Math.PI },
  ] };
const pins = [
  'apps/cad-studio/test/sketch-adjacent-oblique-chamfer-resize-browser.mjs',
  'apps/cad-studio/src/sketch/cornerDraft.ts', 'apps/cad-studio/src/ui/SketchCornerTools.tsx',
  'packages/barocss-cad-model/src/sketch/chamferEdit.ts', 'packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
];
if (review) pins.push(
  'packages/barocss-cad-model/src/chat/cornerProposalReview.ts',
  'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/part/views.ts',
);
const f = await createFlow({
  name: 'sketch-adjacent-oblique-chamfer-resize', output: process.argv[2],
  envFrozen: review ? 'D1780_SOURCE_FROZEN' : 'D1779_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Resize adjacent right and oblique saved Chamfers on a shared carrier through one retained sketch edit.',
  limits: ['One independent XY outline with its anchor away from both bevels, one 10 mm Extrude, desktop WebGPU.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
const value = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (JSON.parse(process.argv[3] ?? 'false')) {
  const profile = profileOf([value]);
  assert.ok('node' in profile, JSON.stringify(profile));
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const { outputs: [output] } = partSnapshot(value), { brep } = output, check = checkBrep(brep, { strict: true });
  console.log(JSON.stringify({ check, volume: massPropertiesOf(output).volume, digest: digestOf(brep),
    walls: brep.faces.filter(face => ['n1.side[e1]', 'n1.side[e6]', 'n1.side[e7]'].includes(face.name))
      .map(face => [face.name, faceGeometry(face)]) }));
}
`,
});

const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const edit = () => f.sketchPanel().getByRole('group', { name: 'Edit Chamfers', exact: true });
const openEdit = () => button('Edit Chamfers', f.sketchPanel().getByRole('group', { name: 'Corner tools', exact: true })).click();
const distance = () => edit().getByLabel('Distance', { exact: true });
const preview = () => f.page.locator('.sk-corner-preview');

async function verify(label, doc, original, setback) {
  const { outline, sideTags } = doc.nodes[0], expected = pointsAt(setback);
  assert.deepEqual(sideTags.outer, ids);
  assert.deepEqual([doc.nodes[1], doc.outputs], [original.nodes[1], original.outputs]);
  assert.equal(outline.points.length, expected.length);
  outline.points.forEach((point, index) => point.forEach((coordinate, axis) => near(coordinate, expected[index][axis])));
  assert.deepEqual(outline.rules, original.nodes[0].outline.rules);
  near(outline.lengths[3], setback * Math.SQRT2);
  near(outline.lengths[5], 2 * setback * Math.cos(turn / 2));
  near(outline.points[5][0] - outline.points[4][0], 30 - 2 * setback);
  const native = await f.inspect(label, doc);
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  near(native.volume, 21000 - 5 * setback ** 2 * (1 + Math.sin(turn)));
  const normals = new Map([['n1.side[e1]', [0, -1, 0]], ['n1.side[e6]', [-Math.SQRT1_2, -Math.SQRT1_2, 0]],
    ['n1.side[e7]', [1 / Math.sqrt(10), -3 / Math.sqrt(10), 0]]]);
  assert.equal(native.walls.length, normals.size);
  for (const [name, wall] of native.walls) {
    assert.equal(wall.kind, 'plane');
    wall.n.forEach((value, axis) => near(value, normals.get(name)[axis]));
  }
  f.report.observations.push({ label, setback, volume: native.volume, sharedSide: 30 - 2 * setback, digest: native.digest });
  return native.digest;
}

async function modelImage(request, args) {
  const response = await request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });
  assert.equal(response.isError, false, response.content[0].text);
  const meta = JSON.parse(response.content[0].text);
  const png = Buffer.from(response.content.find(item => item.type === 'image').data, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(meta.imageSha256, sha256(png));
  assert.equal(Object.keys(meta.views).length, 4);
  return { meta, png };
}

async function reviewPending(call, request, revision, expected) {
  const { proposals: [entry] } = await call('proposals', { action: 'list' });
  assert.equal(entry.id, 'P1');
  assert.match(entry.modelReviewRevision, /^[0-9a-f]{64}$/);
  const pins = { proposal: entry.id, expectedRevision: revision, expectedProposalRevision: entry.modelReviewRevision };
  const first = await modelImage(request, pins), opposite = await modelImage(request, { ...pins, orientation: 'opposite' });
  assert.equal(first.meta.candidate.bodySha256, expected);
  assert.equal(opposite.meta.candidate.bodySha256, expected);
  assert.notEqual(first.meta.candidate.reviewRevision, opposite.meta.candidate.reviewRevision);
  const evidence = first.meta.chamferResize;
  assert.deepEqual(opposite.meta.chamferResize, evidence);
  assert.deepEqual([evidence.body, evidence.sketch, evidence.bevels], ['b1', 'n0', ['e6', 'e7']]);
  const bevelFaces = ['n1.side[e6]', 'n1.side[e7]'];
  assert.deepEqual(evidence.faces.map(face => [face.name, face.sides]),
    [[bevelFaces[0], ['e5', 'e1']], [bevelFaces[1], ['e1', 'e2']]]);
  for (const face of evidence.faces) {
    near(face.before, 6);
    near(face.after, 8);
  }
  const carrierFaces = ['n1.side[e5]', 'n1.side[e1]', 'n1.side[e2]'];
  const original = await call('query', { action: 'inspect', faces: carrierFaces, expectedRevision: revision });
  const lookup = { ...pins, action: 'inspect', faces: [...bevelFaces, ...carrierFaces],
    expectedReviewRevision: first.meta.candidate.reviewRevision };
  const inspection = await call('query', lookup);
  assert.deepEqual([inspection.candidate, inspection.revision, inspection.imageSha256, inspection.chamferResize],
    [first.meta.candidate, first.meta.revision, first.meta.imageSha256, evidence]);
  assert.deepEqual(inspection.faces.map(face => face.name), lookup.faces);
  const expectedNormals = [[-Math.SQRT1_2, -Math.SQRT1_2, 0], [1 / Math.sqrt(10), -3 / Math.sqrt(10), 0]];
  for (const [index, face] of inspection.faces.slice(0, 2).entries()) {
    assert.equal(face.geometry.kind, 'plane');
    face.geometry.outwardNormal.forEach((value, axis) => near(value, expectedNormals[index][axis]));
  }
  for (const [index, face] of inspection.faces.slice(2).entries()) {
    const before = original.faces[index].geometry, after = face.geometry;
    assert.deepEqual([before.kind, after.kind], ['plane', 'plane']);
    after.outwardNormal.forEach((value, axis) => near(value, before.outwardNormal[axis]));
    near(after.point.reduce((sum, value, axis) => sum + (value - before.point[axis]) * before.outwardNormal[axis], 0), 0);
  }
  const oppositeRead = await call('query', { ...lookup, orientation: 'opposite', expectedReviewRevision: opposite.meta.candidate.reviewRevision });
  assert.deepEqual(oppositeRead.faces, inspection.faces);
  assert.deepEqual(oppositeRead.chamferResize, evidence);
  assert.equal((await call('query', { ...lookup, orientation: 'opposite' }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  assert.equal((await call('query', { ...lookup, expectedProposalRevision: '0'.repeat(64) }, true)).code, 'MODEL_REVIEW_PROPOSAL_STALE');
  assert.equal((await call('query', { ...lookup, expectedRevision: '0'.repeat(16) }, true)).code, 'MODEL_REVIEW_BASE_STALE');
  await writeFile(join(f.output, 'saved-pair-agent-four-views.png'), first.png);
  await writeFile(join(f.output, 'saved-pair-agent-opposite-views.png'), opposite.png);
  f.report.observations.push({ label: 'paired-chamfer-review', ...first.meta.candidate, revision: first.meta.revision,
    imageSha256: first.meta.imageSha256, oppositeImageSha256: opposite.meta.imageSha256, evidence });
  return { first, opposite, lookup, faces: inspection.faces };
}

async function approve(source, expected) {
  const file = join(f.output, 'mixed-chamfer-resize-proposal.bcad'), bytes = JSON.stringify(source);
  const session = { app: f.app, output: f.output, clientName: f.name };
  await writeFile(file, bytes);
  const reviewed = await withMcpSession(session, file, 'mixed-chamfer-resize', async (call, request) => {
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.equal(fields.revision, await currentPartRevision(call));
    assert.deepEqual(fields.sketchChamfers, [{ bevel: 'e6', distance: 6 }, { bevel: 'e7', distance: 6 }]);
    const op = value => ({ tool: 'features', args: { action: 'edit', index: 0, expectedRevision: fields.revision,
      sketchChamfer: { sketch: fields.id, bevels: ['e6', 'e7'], distance: value } } });
    const propose = (value, refused) => call('proposals', { action: 'propose', title: 'Resize both saved Chamfers', ops: [op(value)] }, refused);
    assert.match((await propose(16, true)).error, /collapse|touch|cross|shared/i);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op(8)] });
    assert.ok(dry.dryRun);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const staged = await propose(8, false);
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    if (reviewBaseline) {
      const pending = await readFile(file);
      const { proposals: [entry] } = await call('proposals', { action: 'list' });
      assert.equal(entry.id, 'P1');
      assert.equal(entry.modelReviewRevision, undefined);
      assert.match(entry.proposalRevision, /^[0-9a-f]{64}$/);
      const refused = await call('query', { action: 'render', proposal: entry.id, expectedRevision: fields.revision,
        expectedProposalRevision: entry.proposalRevision }, true);
      assert.equal(refused.code, 'MODEL_REVIEW_UNAVAILABLE');
      assert.deepEqual(await readFile(file), pending);
      f.report.observations.push({ label: 'paired-chamfer-review-unavailable', ...refused });
    }
    if (review && !reviewBaseline) {
      const pending = await readFile(file);
      const result = await reviewPending(call, request, fields.revision, expected);
      assert.deepEqual(await readFile(file), pending);
      return result;
    }
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [source.nodes, source.outputs]);
  await f.freshOpen(file, pending, '08-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('09-proposal-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('10-proposal-approved')).doc;
  assert.equal(await verify('approved-native', approved, source, 8), expected);
  if (review) {
    const saved = await f.save('approved-mixed-d8-pair');
    const reopened = (await f.freshOpen(saved.file, approved, '11-approved-fresh-open')).doc;
    assert.equal(await verify('approved-reopened-native', reopened, source, 8), expected);
    if (reviewed) await withMcpSession(session, saved.file, 'reviewed-mixed-chamfer-resize', async (call, request) => {
      const expectedRevision = await currentPartRevision(call);
      assert.equal(expectedRevision, reviewed.first.meta.revision);
      assert.deepEqual((await modelImage(request, { expectedRevision })).png, reviewed.first.png);
      assert.deepEqual((await modelImage(request, { expectedRevision, orientation: 'opposite' })).png, reviewed.opposite.png);
      const inspection = await call('query', { action: 'inspect', faces: reviewed.lookup.faces, expectedRevision });
      assert.deepEqual(inspection.faces, reviewed.faces);
      assert.equal((await call('query', { ...reviewed.lookup, expectedRevision }, true)).code, 'MODEL_REVIEW_UNAVAILABLE');
    });
  }
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
  const source = await f.inspect('saved-pair-source', shape, true), file = join(f.output, 'saved-d6-pair.bcad');
  await writeFile(file, JSON.stringify(source));
  await f.freshOpen(file, source, '01-d6-pair-open');
  await verify('source-native', source, source, 6);
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(pointsAt(6));
  f.phase = 'Select the two saved Chamfer bevels';
  await f.worldClick([3, 3]);
  const second = await f.screenOf([29.4, 1.8]);
  await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...second); } finally { await f.page.keyboard.up('Shift'); }
  assert.deepEqual(await f.page.locator('.vp-overlay .sk-pick-edge.on').evaluateAll(nodes => nodes.map(node => node.dataset.sketchEntity).sort()),
    ['edge:3', 'edge:5']);
  await openEdit();
  assert.equal(await distance().inputValue(), '6');
  assert.ok(await button('Apply', edit()).isDisabled());

  f.phase = 'Refuse overlap and compare the numeric and handle previews';
  await distance().fill('16');
  await edit().getByRole('alert').getByText(/collapse|touch|cross|shared/i).waitFor();
  assert.ok(await button('Apply', edit()).isDisabled());
  await f.same(source);
  await f.snapshot('02-d16-refused');
  await distance().fill('8');
  await preview().waitFor();
  const numeric = await preview().getAttribute('points');
  assert.ok(numeric);
  await f.snapshot('03-numeric-d8-preview');
  await button('Cancel', edit()).click();
  await preview().waitFor({ state: 'hidden' });
  await f.same(source);

  await openEdit();
  const handle = button('Chamfer setback handle');
  await handle.waitFor();
  const bounds = await handle.boundingBox(), from = await f.screenOf([3, 3]), to = await f.screenOf([4, 4]);
  const press = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  assert.ok(Math.hypot(press[0] - from[0], press[1] - from[1]) < .5);
  await f.page.mouse.move(...press);
  await f.page.mouse.down();
  await f.page.mouse.move(press[0] + to[0] - from[0], press[1] + to[1] - from[1], { steps: 12 });
  await f.page.mouse.up();
  assert.equal(Number(await distance().inputValue()), 8);
  assert.equal(await preview().getAttribute('points'), numeric);
  await f.same(source);
  await f.snapshot('04-shared-handle-d8-preview');
  await button('Apply', edit()).click();
  const resized = (await f.finishSketch('05-d8-applied')).doc;
  const expected = await verify('resized-native', resized, source, 8);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(resized);
  const saved = await f.save('saved-mixed-d8-pair');
  const reopened = (await f.freshOpen(saved.file, resized, '06-d8-fresh-open')).doc;
  assert.equal(await verify('reopened-native', reopened, source, 8), expected);
  await approve(source, expected);
});

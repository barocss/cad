import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const review = process.argv.includes('--review');
const agent = review || process.argv.includes('--agent');
const resizeFillets = process.argv.includes('--resize-fillets');
const resizeChamfers = process.argv.includes('--resize-chamfers');
const resize = resizeFillets || resizeChamfers;
const resizeName = resizeFillets ? 'Fillet' : 'Chamfer';
const resizeBaseline = process.argv.includes('--expect-no-group-editor');
const original = [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]];
const sizedCorners = size => [[0, 0], [60, 0], [60, 40], [38 + size, 40], [38, 40 - size],
  [38, 15 + size], [38 - size, 15], [22, 15], [22, 40], [0, 40]];
const result = sizedCorners(6);
const originalIds = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'];
const resultIds = ['e1', 'e2', 'e3', 'e9', 'e4', 'e10', 'e5', 'e6', 'e7', 'e8'];
const reviewPlane = { origin: [60, 40, 0], normal: [0, 0, 1], xAxis: [-1, 0, 0] };
const worldXY = ([x, y]) => review ? [60 - x, 40 - y] : [x, y];
const pins = [
  'apps/cad-studio/test/sketch-corner-batch-browser.mjs',
  'apps/cad-studio/src/sketch/cornerDraft.ts', 'apps/cad-studio/src/sketch/constraintInspection.ts',
  'apps/cad-studio/src/ui/SketchCornerTools.tsx', 'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/sketch/useSketchDraftHistory.ts', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/sketchOverlay.tsx',
  'packages/barocss-cad-model/src/sketch/corner.ts', 'packages/barocss-cad-model/src/sketch/cornerBatch.ts',
  ...(resize ? [
    'apps/cad-studio/src/viewport/SketchCornerSizeHandle.tsx',
    `packages/barocss-cad-model/src/sketch/${resizeName.toLowerCase()}Edit.ts`,
  ] : []),
  ...(agent ? [
    'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
    'apps/cad-studio/src/state/useProposalPreview.ts',
    'packages/barocss-cad-model/src/chat/part/sketchCorner.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
    'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
  ] : []),
  ...(review ? [
    'packages/barocss-cad-model/src/chat/cornerProposalReview.ts',
    'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
    'packages/barocss-cad-model/src/chat/part/proposals.ts',
    'packages/barocss-cad-model/src/chat/part/views.ts',
  ] : []),
];
const f = await createFlow({
  name: resize ? `saved-sketch-${resizeName.toLowerCase()}-pair` : review ? 'sketch-corner-batch-review' : agent ? 'sketch-corner-batch-agent' : 'sketch-corner-batch',
  output: process.argv[2], envFrozen: resizeChamfers ? 'D1728_SOURCE_FROZEN' : resizeFillets ? 'D1726_SOURCE_FROZEN'
    : review ? 'D1697_SOURCE_FROZEN' : agent ? 'D1696_SOURCE_FROZEN' : 'D1695_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: review ? 'Pin a mixed-turn sketch corner proposal to the Agent image and native walls. Approve it in Studio and reopen the same geometry and image.'
    : resize ? `Resize adjacent saved convex and reflex ${resizeName}s as one edit.`
      : agent ? 'Discover and propose a whole corner edit through local MCP. Approve one proposal and reopen the editable result.'
      : 'Round and chamfer adjacent convex and reflex sketch corners. Refuse shared-edge consumption as a group.',
  limits: ['One notched XY outline, one 10 mm Extrude, desktop Studio WebGPU.'],
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] === '"seed"') {
  const profile = profileOf([{ kind: 'polygon', closed: true, points: input.points, ids: input.ids,
    hv: { h: [0, 2, 4, 6], v: [1, 3, 5, 7] },
    lengths: { 0: 60 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
  }]);
  assert.ok('node' in profile);
  const sketch = input.plane ? { ...profile.node, plane: input.plane } : profile.node;
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), sketch), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [body] = partSnapshot(input).outputs;
  const b = body.brep;
  assert.ok(checkBrep(b, { strict: true }).valid && b.shells.every(shell => shell.closed));
  const vertices = new Map(b.vertices.map(vertex => [vertex.id, vertex.point]));
  const edges = new Map(b.edges.map(edge => [edge.id, edge]));
  const coedges = new Map(b.coedges.map(coedge => [coedge.id, coedge]));
  const loops = new Map(b.loops.map(loop => [loop.id, loop]));
  const faces = b.faces.map(face => ({ name: face.name, geometry: faceGeometry(face),
    vertices: face.loops.flatMap(id => loops.get(id).coedges.flatMap(key => edges.get(coedges.get(key).edge).vertices.map(v => vertices.get(v)))) }));
  console.log(JSON.stringify({ volume: massPropertiesOf(body).volume, faces, bodySha256: digestOf(b) }));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const group = name => f.sketchPanel().getByRole('group', { name, exact: true });
const preview = () => f.page.locator('.sk-corner-preview');
const session = { app: f.app, output: f.output, clientName: f.name };
async function edit() {
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(original.map(worldXY));
}
async function expectPoints(points) {
  const outline = group('Outline points');
  for (const [i, point] of points.entries()) for (const [axis, k] of [['X', 0], ['Y', 1]])
    assert.equal(Number(await outline.getByLabel(`Point ${i + 1} ${axis}`, { exact: true }).inputValue()), point[k]);
  assert.equal(await outline.getByLabel(`Point ${points.length + 1} X`, { exact: true }).count(), 0);
}
async function pick(points) {
  await f.worldClick(points[0]);
  await f.page.keyboard.down('Shift');
  try { for (const point of points.slice(1)) await f.worldClick(point); }
  finally { await f.page.keyboard.up('Shift'); }
}
async function expectTargets() {
  const targets = f.page.locator('.sk-corner-target');
  assert.deepEqual(await targets.evaluateAll(items => items.map(item => item.dataset.cornerIndex)), ['3', '4']);
}
function cornerMidpoints(size) {
  const offset = (resizeFillets ? 1 - Math.SQRT1_2 : .5) * size;
  return [[38 + offset, 40 - offset], [38 - offset, 15 + offset]];
}
async function selectSavedCorners(size) {
  await pick(cornerMidpoints(size));
  const selected = f.page.locator('.vp-overlay .sk-pick-edge.on');
  assert.deepEqual(await selected.evaluateAll(edges => edges.map(edge => edge.dataset.sketchEntity).sort()), ['edge:3', 'edge:5']);
}
async function resizeSavedCorners(accepted) {
  f.phase = `Select saved convex and reflex ${resizeName}s`;
  const single = 'Edit ' + resizeName, name = single + 's';
  const handleLabel = resizeFillets ? 'Fillet radius handle' : 'Chamfer setback handle';
  await edit();
  await selectSavedCorners(6);
  if (resizeBaseline) {
    assert.equal(await button(single, group('Corner tools')).count(), 0);
    assert.equal(await button(name, group('Corner tools')).count(), 0);
    assert.equal(await button(handleLabel).count(), 0);
    await expectPoints(result);
    await f.same(accepted);
    await f.snapshot('08-saved-pair-without-group-editor');
    return;
  }
  const editor = () => group(name);
  const open = () => button(name, group('Corner tools')).click();
  const field = () => editor().getByLabel(resizeFillets ? 'Radius' : 'Distance', { exact: true });
  const apply = () => button('Apply', editor());
  const cancel = () => button('Cancel', editor()).click();
  await open();
  assert.equal(Number(await field().inputValue()), 6);
  assert.equal(await apply().isDisabled(), true);
  f.phase = 'Refuse a size that would consume the shared straight carrier';
  await field().fill('13');
  await editor().getByRole('alert').getByText(/collapse|touch|cross/i).waitFor();
  assert.equal(await apply().isDisabled(), true);
  await preview().waitFor({ state: 'hidden' });
  await expectPoints(result);
  await f.same(accepted);
  await f.snapshot('08-saved-pair-refused');

  f.phase = 'Get the 8 mm numeric preview and cancel it';
  await field().fill('8');
  await preview().waitFor();
  const numeric = await preview().getAttribute('points');
  assert.ok(numeric);
  await cancel();
  await preview().waitFor({ state: 'hidden' });
  await expectPoints(result);
  await open();

  f.phase = `Drag the shared handle to 8 mm and apply both ${resizeName}s`;
  const handle = button(handleLabel);
  await handle.waitFor();
  const box = await handle.boundingBox();
  const from = await f.screenOf(cornerMidpoints(6)[0]), to = await f.screenOf(cornerMidpoints(8)[0]);
  const at = [box.x + box.width / 2, box.y + box.height / 2];
  assert.ok(Math.hypot(at[0] - from[0], at[1] - from[1]) < .5);
  await f.page.mouse.move(...at);
  await f.page.mouse.down();
  await f.page.mouse.move(at[0] + to[0] - from[0], at[1] + to[1] - from[1], { steps: 10 });
  await f.page.mouse.up();
  assert.equal(Number(await field().inputValue()), 8);
  assert.equal(await preview().getAttribute('points'), numeric);
  assert.deepEqual(await f.page.locator('.sk-corner-target').evaluateAll(items => items.map(item => item.dataset.cornerIndex).sort()),
    ['3', '4', '5', '6']);
  await expectPoints(result);
  await f.same(accepted);
  await f.snapshot('09-saved-pair-drag-preview');
  await apply().click();
  const resized = sizedCorners(8);
  await expectPoints(resized);
  await f.same(accepted);
  await f.page.keyboard.press('Meta+z');
  await expectPoints(result);
  await f.page.keyboard.press('Meta+Shift+z');
  await expectPoints(resized);
  const { doc } = await f.finishSketch('10-saved-pair-finished');
  assert.deepEqual([doc.nodes[1], doc.outputs], [accepted.nodes[1], accepted.outputs]);
  const receiptLabel = resizeFillets ? 'both-R8' : 'both-C8';
  const native = await checkNative(receiptLabel + '-native', doc, resizeFillets, 8);
  await f.undo(); await f.same(accepted);
  await f.redo(); await f.same(doc);
  const saved = await f.save(`resized-${resizeName.toLowerCase()}s`);
  await f.freshOpen(saved.file, doc, '11-saved-pair-fresh-open');
  assert.deepEqual(await checkNative(receiptLabel + '-reopened', await f.doc(), resizeFillets, 8), native);
  await edit();
  await expectPoints(resized);
  await selectSavedCorners(8);
  await open();
  assert.equal(Number(await field().inputValue()), 8);
  assert.equal(await apply().isDisabled(), true);
  await f.snapshot('12-saved-pair-editable-after-open');
}
async function checkNative(label, doc, fillet, size = 6) {
  const native = await f.inspect(label, doc);
  const points = sizedCorners(size);
  // The convex removal and reflex addition cancel in this fixture. Check both named walls and their endpoints too.
  assert.ok(Math.abs(native.volume - (60 * 40 - 16 * 25) * 10) < 1e-8);
  assert.equal(native.faces.length, 12);
  const [source] = doc.nodes;
  assert.deepEqual(source.sideTags.outer, resultIds);
  assert.deepEqual(source.outline.lengths, fillet ? { 0: 60 } : { 0: 60, 3: size * Math.SQRT2, 5: size * Math.SQRT2 });
  const fixed = [{ kind: 'fix', point: 0, at: [0, 0] }];
  assert.deepEqual(source.outline.rules, fillet ? fixed : [...fixed,
    { kind: 'angle', a: 2, b: 3, value: 135 }, { kind: 'angle', a: 4, b: 5, value: 135 }]);
  if (fillet) {
    assert.deepEqual(source.outline.radii, { 3: size, 5: size });
    assert.ok(source.outline.bulges[3] > 0 && source.outline.bulges[5] < 0);
  }
  for (const [i, id] of resultIds.entries()) {
    const face = native.faces.find(item => item.name === `n1.side[${id}]`);
    assert.ok(face, id);
    const newWall = id === 'e9' || id === 'e10';
    assert.equal(face.geometry.kind, fillet && newWall ? 'cylinder' : 'plane');
    if (fillet && newWall) {
      const center = worldXY(id === 'e9' ? [38 + size, 40 - size] : [38 - size, 15 + size]);
      assert.ok(Math.hypot(face.geometry.c[0] - center[0], face.geometry.c[1] - center[1]) < 1e-8);
      assert.ok(Math.abs(face.geometry.r - size) < 1e-8);
      assert.equal(face.geometry.out, id === 'e9' ? 1 : -1);
    }
    for (const [x, y] of [points[i], points[(i + 1) % points.length]].map(worldXY)) for (const z of [0, 10])
      assert.ok(face.vertices.some(p => Math.hypot(p[0] - x, p[1] - y, p[2] - z) < 1e-8), `${id} at ${[x, y, z]}`);
  }
  return native;
}

async function render(request, args) {
  const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });
  assert.equal(reply.isError, false, JSON.stringify(reply.content[0]));
  const meta = JSON.parse(reply.content[0].text);
  const png = Buffer.from(reply.content.find(item => item.type === 'image').data, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(meta.imageSha256, sha256(png));
  assert.equal(Object.keys(meta.views).length, 4);
  return { meta, png };
}

async function reviewAgentEdit(call, request, tag, fillet, expectedRevision) {
  f.phase = `Review both ${tag} walls from the pinned Agent image`;
  const { proposals: [pending, twin] } = await call('proposals', { action: 'list' });
  assert.deepEqual([pending.id, twin.id], ['P1', 'P2']);
  assert.match(pending.modelReviewRevision, /^[a-f0-9]{64}$/);
  assert.match(twin.modelReviewRevision, /^[a-f0-9]{64}$/);
  assert.notEqual(pending.modelReviewRevision, twin.modelReviewRevision);
  const options = { expectedRevision, proposal: pending.id, expectedProposalRevision: pending.modelReviewRevision };
  const twinOptions = { ...options, proposal: twin.id, expectedProposalRevision: twin.modelReviewRevision };
  for (const [overrides, code] of [
    [{ expectedRevision: '0000000000000000' }, 'MODEL_REVIEW_BASE_STALE'],
    [{ expectedProposalRevision: twin.modelReviewRevision }, 'MODEL_REVIEW_PROPOSAL_STALE'],
  ]) assert.equal((await call('query', { action: 'render', ...options, ...overrides }, true)).code, code);
  const base = await render(request, { expectedRevision });
  const { meta, png } = await render(request, options);
  assert.notEqual(meta.imageSha256, base.meta.imageSha256);
  assert.notEqual(meta.revision, expectedRevision);
  assert.deepEqual([meta.candidate.proposal, meta.candidate.proposalRevision, meta.candidate.baseRevision],
    [pending.id, pending.modelReviewRevision, expectedRevision]);
  assert.match(meta.candidate.bodySha256, /^[a-f0-9]{64}$/);
  assert.match(meta.candidate.reviewRevision, /^[a-f0-9]{64}$/);
  const twinImage = await render(request, twinOptions);
  assert.deepEqual(twinImage.png, png);
  assert.notEqual(twinImage.meta.candidate.reviewRevision, meta.candidate.reviewRevision);
  const faces = ['n1.side[e9]', 'n1.side[e10]'];
  const { cornerBatch } = meta;
  assert.deepEqual([cornerBatch.sketch, cornerBatch.operation, cornerBatch.size], ['n0', tag, 6]);
  assert.deepEqual(cornerBatch.faces.map(face => [face.name, face.sides]).sort(),
    [[faces[1], ['e4', 'e5']], [faces[0], ['e3', 'e4']]]);
  for (const face of faces) assert.ok(Object.values(meta.legend).includes(face), face);
  const inspect = { action: 'inspect', ...options, faces, expectedReviewRevision: meta.candidate.reviewRevision };
  const rejected = await call('query', { ...inspect, ...twinOptions }, true);
  assert.equal(rejected.code, 'MODEL_REVIEW_IMAGE_STALE');
  const native = await call('query', inspect);
  assert.deepEqual([native.revision, native.candidate, native.imageSha256, native.cornerBatch],
    [meta.revision, meta.candidate, meta.imageSha256, cornerBatch]);
  assert.deepEqual(native.faces.map(face => [face.name, face.body, face.geometry.kind]),
    faces.map(name => [name, cornerBatch.body, fillet ? 'cylinder' : 'plane']));
  if (fillet) {
    assert.deepEqual(native.faces.map(face => face.geometry.outwardNormal), ['away-from-axis', 'toward-axis']);
    for (const face of native.faces) assert.ok(Math.abs(face.geometry.radius - 6) < 1e-8);
  }
  await writeFile(join(f.output, `${tag}-agent-review.png`), png);
  f.report.observations.push({ label: `${tag}-candidate`, ...meta.candidate, revision: meta.revision, imageSha256: meta.imageSha256, cornerBatch });
  return { meta, png, native, inspect, faces };
}

async function approveAgentEdit(seed, tag, fillet) {
  const file = join(f.output, `${tag}-proposal.bcad`);
  const source = JSON.stringify(seed);
  const editKey = fillet ? 'sketchRound' : 'sketchChamfer';
  const sizeKey = fillet ? 'radius' : 'distance';
  const propose = (call, args, denied = false) => call('proposals', {
    action: 'propose', title: `${fillet ? 'Round' : 'Chamfer'} two sketch corners by 6 mm`, ops: [{ tool: 'features', args }],
  }, denied);
  await writeFile(file, source);
  f.phase = `Discover, reject invalid pairs and propose the ${tag} batch`;
  const { op, reviewed } = await withMcpSession(session, file, `${tag}-proposal`, async (call, request) => {
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.deepEqual([fields.index, fields.id, fields.revision], [0, 'n0', await currentPartRevision(call)]);
    const corners = fields.sketchCorners.filter(({ point }) => point[0] === 38 && [40, 15].includes(point[1])).map(item => item.sides);
    assert.deepEqual(corners, [['e3', 'e4'], ['e4', 'e5']]);
    const edit = { sketch: fields.id, corners: [corners[1].toReversed(), corners[0]], [sizeKey]: 6 };
    const args = { action: 'edit', index: 0, expectedRevision: fields.revision, [editKey]: edit };
    for (const [patch, message] of [
      [{ expectedRevision: '0000000000000000' }, /part changed/i],
      [{ [editKey]: { ...edit, sides: corners[0] } }, /use sides.*or corners/i],
      [{ [editKey]: { ...edit, corners: [corners[0], corners[0].toReversed()] } }, /each selected corner once/],
      [{ [editKey]: { ...edit, corners: [corners[0], ['e3', 'e5']] } }, /straight sides of one corner/],
      [{ [editKey]: { ...edit, [sizeKey]: 12.5 } }, /shared edge/],
    ]) {
      assert.match((await propose(call, { ...args, ...patch }, true)).error, message);
      assert.equal(await readFile(file, 'utf8'), source);
    }
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args }] });
    assert.equal(dry.dryRun, true);
    assert.equal(dry.change.volume, undefined); // The two volume changes cancel. Dry-run facts omit zero deltas.
    assert.deepEqual([dry.change.faces, dry.change.vertices], [2, 4]);
    assert.deepEqual(dry.diff.changed.map(feature => feature.id), ['n0']);
    assert.equal(await readFile(file, 'utf8'), source);
    const proposal = await propose(call, args);
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    if (review) {
      const twin = await propose(call, args);
      assert.deepEqual([twin.proposal, twin.applied], ['P2', false]);
    }
    const staged = await readFile(file);
    const reviewed = review ? await reviewAgentEdit(call, request, tag, fillet, fields.revision) : undefined;
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), staged);
    return { op: args, reviewed };
  });
  const bytes = await readFile(file);
  const previous = JSON.parse(bytes);
  assert.deepEqual([previous.nodes, previous.outputs], [seed.nodes, seed.outputs]);
  assert.equal(previous.proposals.length, review ? 2 : 1);
  assert.equal(previous.proposals[0].ops.length, 1);
  assert.deepEqual(previous.proposals[0].ops[0].args[editKey], op[editKey]);

  await f.freshOpen(file, previous, `02-${tag}-open-proposal`);
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await card.getByLabel('Volume change').getByText(/^[+−]0(?:\.0+)? mm³/).waitFor();
  await f.same(previous);
  assert.deepEqual(await readFile(file), bytes);
  await f.snapshot(`03-${tag}-proposal-preview`);
  await button('Accept', card).click();
  await f.changed(previous);
  const { doc: accepted } = await f.snapshot(`04-${tag}-proposal-approved`);
  assert.equal(accepted.proposals[0].status, 'accepted');
  const approval = accepted.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', 'P1', 'user']);
  assert.deepEqual([accepted.nodes[1], accepted.outputs], [seed.nodes[1], seed.outputs]);
  assert.deepEqual(await readFile(file), bytes);
  return { previous, accepted, reviewed, readReopened: async saved => {
    await withMcpSession(session, saved.file, `${tag}-reopened`, async (call, request) => {
      const after = await readFile(saved.file);
      const expectedRevision = await currentPartRevision(call);
      assert.notEqual(expectedRevision, op.expectedRevision);
      assert.match((await propose(call, op, true)).error, /part changed/i);
      if (reviewed) {
        assert.equal(expectedRevision, reviewed.meta.revision);
        assert.deepEqual((await render(request, { expectedRevision })).png, reviewed.png);
        const native = await call('query', { action: 'inspect', expectedRevision, faces: reviewed.faces });
        assert.deepEqual(native.faces, reviewed.native.faces);
        const retired = await call('query', { ...reviewed.inspect, expectedRevision }, true);
        assert.equal(retired.code, 'MODEL_REVIEW_UNAVAILABLE');
      }
      assert.deepEqual(await readFile(saved.file), after);
    });
  } };
}

async function applySketchEdit(seed, name, field, selection, tag, fillet) {
  await edit();
  f.phase = `Pick ${tag} targets and refuse a consumed shared edge`;
  await pick(selection);
  await button(name, group('Corner tools')).click();
  const input = group(name).getByLabel(field, { exact: true });
  const apply = button('Apply', group(name));
  await preview().waitFor();
  await expectTargets();
  await input.fill('12.5');
  await preview().waitFor({ state: 'hidden' });
  await group(name).getByRole('alert').getByText(/share|fit|overlap|shorter/i).waitFor();
  assert.equal(await apply.isDisabled(), true);
  await expectTargets();
  await expectPoints(original);
  await f.same(seed);
  await f.snapshot(`02-${tag}-shared-edge-refused`);

  f.phase = `Review and apply the two ${tag} corners once`;
  await input.fill('6');
  await preview().waitFor();
  await expectTargets();
  const projected = await preview().evaluate(polygon => polygon.points.numberOfItems);
  assert.ok(fillet ? projected > result.length : projected === result.length);
  await expectPoints(original);
  await f.same(seed);
  await f.snapshot(`03-${tag}-preview`);
  if (!fillet) {
    await button('Cancel', group(name)).click();
    await preview().waitFor({ state: 'hidden' });
    await expectPoints(original);
    await button(name, group('Corner tools')).click();
    await input.fill('6');
  }
  await apply.click();
  await preview().waitFor({ state: 'hidden' });
  await expectPoints(result);
  await f.same(seed);
  await f.page.keyboard.press('Meta+z');
  await expectPoints(original);
  await f.page.keyboard.press('Meta+Shift+z');
  await expectPoints(result);
  return { previous: seed, accepted: (await f.finishSketch(`04-${tag}-applied`)).doc };
}

await f.run(async () => {
  const seed = await f.inspect('seed', { points: original, ids: originalIds, ...(review ? { plane: reviewPlane } : {}) }, 'seed');
  const file = join(f.output, 'notched-source.bcad');
  const bytes = JSON.stringify(seed);
  await writeFile(file, bytes);
  await f.freshOpen(file, seed, '01-original');
  for (const { name, field, selection } of [
    { name: 'Fillet', field: 'Radius', selection: [[49, 40], [38, 27], [30, 15]] },
    { name: 'Chamfer', field: 'Distance', selection: [original[3], original[4]] },
  ]) {
    const fillet = name === 'Fillet', tag = name.toLowerCase();
    if (resize && fillet !== resizeFillets) continue;
    const { previous, accepted, reviewed, readReopened } = agent
      ? await approveAgentEdit(seed, tag, fillet)
      : await applySketchEdit(seed, name, field, selection, tag, fillet);
    const native = await checkNative(`${tag}-native`, accepted, fillet);
    if (resize) {
      assert.equal(await readFile(file, 'utf8'), bytes);
      await resizeSavedCorners(accepted);
      return;
    }
    if (reviewed) assert.equal(native.bodySha256, reviewed.meta.candidate.bodySha256);
    await f.undo();
    await f.same(previous);
    await f.redo();
    await f.same(accepted);
    const saved = await f.save(`batched-${tag}`);
    await f.freshOpen(saved.file, saved.doc, `05-${tag}-fresh-open`);
    assert.deepEqual(await checkNative(`${tag}-reopened`, await f.doc(), fillet), native);
    await readReopened?.(saved);
    await edit();
    await expectPoints(result);
    await f.snapshot(`06-${tag}-editable-sketch`);
    if (fillet) await f.freshOpen(file, seed, '07-reset-original');
  }
  assert.equal(await readFile(file, 'utf8'), bytes);
});

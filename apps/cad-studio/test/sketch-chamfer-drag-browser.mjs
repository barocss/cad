import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const original = [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]];
const chamfered = [[0, 0], [60, 0], [60, 40], [44, 40], [38, 34], [38, 21], [32, 15], [22, 15], [22, 40], [0, 40]];
const ids = ['e1', 'e2', 'e3', 'e9', 'e4', 'e10', 'e5', 'e6', 'e7', 'e8'];
const pairs = [['e9', 'e3', 'e4'], ['e10', 'e4', 'e5']];
const resize = process.argv.includes('--resize');
const agentResize = process.argv.includes('--agent-resize');
const pins = [
  'apps/cad-studio/src/viewport/sketchPointDrag.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'apps/cad-studio/src/sketch/cornerDraft.ts',
  'apps/cad-studio/src/ui/SketchCornerTools.tsx',
  'packages/barocss-cad-model/src/sketch/corner.ts',
  'packages/barocss-cad-model/src/sketch/cornerBatch.ts',
  'packages/barocss-cad-model/src/sketch/pointDrag.ts',
  ...(resize || agentResize ? ['apps/cad-studio/src/ui/ConstraintTools.tsx',
    'apps/cad-studio/src/sketch/constraintInspection.ts', 'packages/barocss-cad-model/src/sketch/chamferEdit.ts'] : []),
  ...(agentResize ? [
    'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
    'packages/barocss-cad-model/src/chat/contract.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
    'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
  ] : []),
];
const f = await createFlow({
  output: process.argv[2], name: agentResize ? 'sketch-chamfer-agent-resize' : resize ? 'sketch-chamfer-resize' : 'sketch-chamfer-drag',
  envFrozen: agentResize ? 'D1701_SOURCE_FROZEN' : resize ? 'D1700_SOURCE_FROZEN' : 'D1699_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: agentResize ? 'Discover and propose a revision-pinned saved bevel resize through local MCP, then approve it in Studio.'
    : resize ? 'Edit one saved orthogonal Chamfer in a mixed-turn group and retain both named native walls.'
      : 'Apply one mixed convex and reflex chamfer group in desktop Studio and keep all four setbacks through a later point drag.',
  limits: ['One independent notched XY outline with orthogonal carriers, 6 and 8 mm chamfers and one 10 mm Extrude.'],
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
  const profile = profileOf([{ kind: 'polygon', closed: true, points: input,
    ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
    hv: { h: [0, 2, 4, 6], v: [1, 3, 5, 7] }, lengths: { 0: 60 },
  }]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [body] = partSnapshot(input).outputs;
  const brep = body.brep;
  assert.ok(checkBrep(brep, { strict: true }).valid && brep.shells.every(shell => shell.closed));
  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  const wall = tag => {
    const face = brep.faces.find(face => face.name === 'n1.side[' + tag + ']');
    assert.ok(face, tag);
    const plane = faceGeometry(face);
    assert.equal(plane.kind, 'plane');
    return { face, plane };
  };
  function seam(bevel, carrier) {
    const [ring] = bevel.face.loops;
    const uses = loops.get(ring).coedges.map(id => coedges.get(id));
    const matches = uses.filter(use => {
      const twin = coedges.get(use.twin);
      return twin && loops.get(twin.loop).face === carrier.face.id;
    });
    assert.equal(matches.length, 1);
    const [use] = matches;
    assert.equal(coedges.get(use.twin).edge, use.edge);
    assert.equal(faces.get(loops.get(use.loop).face), bevel.face);
    const edge = edges.get(use.edge);
    const points = edge.vertices.map(id => vertices.get(id)).sort((a, b) => a[2] - b[2]);
    assert.equal(points.length, 2);
    assert.ok(Math.abs(points[0][2]) < 1e-8 && Math.abs(points[1][2] - 10) < 1e-8);
    assert.ok(Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]) < 1e-8);
    return { edge: edge.id, at: points[0].slice(0, 2) };
  }
  const dotXY = (n, p) => n[0] * p[0] + n[1] * p[1];
  const bevels = [['e9', 'e3', 'e4'], ['e10', 'e4', 'e5']].map(([tag, a, b]) => {
    const bevel = wall(tag), first = wall(a), second = wall(b);
    const n = first.plane.n, m = second.plane.n;
    assert.ok(Math.abs(dotXY(n, m)) < 1e-8 && Math.abs(n[2]) < 1e-8 && Math.abs(m[2]) < 1e-8);
    const d = n[0] * m[1] - n[1] * m[0], j = dotXY(n, first.plane.o), k = dotXY(m, second.plane.o);
    const tip = [(j * m[1] - n[1] * k) / d, (n[0] * k - j * m[0]) / d];
    const seams = [seam(bevel, first), seam(bevel, second)];
    const [[ax, ay], [bx, by]] = seams.map(({ at }) => [at[0] - tip[0], at[1] - tip[1]]);
    return { wall: bevel.face.name, carriers: [first.face.name, second.face.name], seams, tip, turn: Math.sign(ax * by - ay * bx),
      setbacks: seams.map(({ at }) => Math.hypot(at[0] - tip[0], at[1] - tip[1])) };
  });
  console.log(JSON.stringify({ volume: massPropertiesOf(body).volume, hash: digestOf(brep), bevels,
    faces: brep.faces.map(face => face.name) }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const group = name => f.sketchPanel().getByRole('group', { name, exact: true });
const points = () => group('Outline points').getByRole('spinbutton', { name: /^Point \d+ [XY]$/ })
  .evaluateAll(inputs => Array.from({ length: inputs.length / 2 }, (_, i) => [Number(inputs[2 * i].value), Number(inputs[2 * i + 1].value)]));
const keyboard = process.platform === 'darwin' ? 'Meta' : 'Control';
const near = (a, b, tolerance = 2e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const target = [50, 44];
const collapsed = [60, 44];
const pickedMark = '.sk-pick-point.on[data-sketch-entity="point:3"]';
const enlarged = chamfered.map((point, i) => i === 3 ? [46, 40] : i === 4 ? [38, 32] : point);
const boundChamfer = prior => ({ ...prior, parameters: { bevelX: 44 },
  nodes: [{ ...prior.nodes[0], points: chamfered.map((p, i) => i === 3 ? [{ parameter: 'bevelX' }, p[1]] : p) }, prior.nodes[1]] });

async function edit() {
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame([...original, target, collapsed]);
}
async function move(at) {
  const pixel = await f.screenOf(at);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.move(...pixel);
}
async function waitForPreview(at) {
  const pixel = await f.screenOf(at);
  await f.page.waitForFunction(({ selector, pixel }) => {
    const r = document.querySelector(selector)?.getBoundingClientRect();
    return r && Math.hypot(r.x + r.width / 2 - pixel[0], r.y + r.height / 2 - pixel[1]) < 1.5;
  }, { selector: pickedMark, pixel });
}
async function checkNative(label, doc, distances = [6, 6]) {
  assert.deepEqual(doc.nodes[0].sideTags.outer, ids);
  assert.equal(doc.nodes[0].outline.lengths[0], 60);
  const outline = doc.nodes[0].outline.points;
  const area = Math.abs(outline.reduce((twice, [x, y], i) => {
    const [u, v] = outline[(i + 1) % outline.length];
    return twice + x * v - y * u;
  }, 0)) / 2;
  const native = await f.inspect(label, doc);
  near(native.volume, area * 10);
  assert.equal(native.faces.length, 12);
  for (const [i, [wall, a, b]] of pairs.entries()) {
    const bevel = native.bevels[i];
    assert.deepEqual([bevel.wall, ...bevel.carriers], [wall, a, b].map(tag => `n1.side[${tag}]`));
    for (const setback of bevel.setbacks) near(setback, distances[i]);
  }
  assert.deepEqual(native.bevels.map(bevel => bevel.turn), [-1, 1]);
  return native;
}

async function checkEnlarged(label, doc, prior, before) {
  const native = await checkNative(label, doc, [8, 6]);
  assert.deepEqual(doc.nodes[0].outline.points, enlarged);
  near(native.volume, before.volume - 140);
  assert.notEqual(native.hash, before.hash);
  assert.deepEqual(native.bevels[1], before.bevels[1]);
  assert.deepEqual(native.bevels.map(bevel => bevel.tip), before.bevels.map(bevel => bevel.tip));
  assert.deepEqual(doc.nodes[0].outline.rules, prior.nodes[0].outline.rules);
  assert.deepEqual(doc.nodes[0].outline.hv, prior.nodes[0].outline.hv);
  near(doc.nodes[0].outline.lengths[3], 8 * Math.SQRT2);
  near(doc.nodes[0].outline.lengths[5], 6 * Math.SQRT2);
  return native;
}

async function resizeSavedChamfer(prior, before) {
  const originalSave = await f.save('two-constrained-chamfers');
  await f.freshOpen(originalSave.file, prior, 'resize-01-original-open');
  const startBytes = await readFile(originalSave.file);
  await edit();
  const tool = () => button('Edit Chamfer', group('Corner tools'));
  const panel = () => group('Edit Chamfer');
  const input = () => panel().getByLabel('Distance', { exact: true });
  const apply = () => button('Apply', panel());
  const preview = () => f.page.locator('.sk-corner-preview');
  const start = [41, 37];
  f.phase = 'Discover the saved setback by selecting the native bevel edge';
  await f.worldClick([60, 20]);
  assert.equal(await tool().count(), 0);
  await f.worldClick(start);
  await tool().click();
  assert.equal(Number(await input().inputValue()), 6);
  assert.equal(await apply().isDisabled(), true);
  await preview().waitFor({ state: 'hidden' });

  f.phase = 'Reject blank and shared-side-consuming values without changing the sketch';
  await input().fill('');
  await input().press('Enter');
  assert.equal(await f.sketchPanel().isVisible(), true);
  assert.equal(await apply().isDisabled(), true);
  await input().fill('24');
  await panel().getByRole('alert').waitFor();
  await preview().waitFor({ state: 'hidden' });
  assert.equal(await apply().isDisabled(), true);
  assert.deepEqual(await points(), chamfered);
  await f.same(prior);
  await button('Cancel', panel()).click();

  f.phase = 'Preview C8 on one saved bevel and apply one edit through Enter';
  await tool().click();
  assert.equal(Number(await input().inputValue()), 6);
  await input().fill('8');
  await preview().waitFor();
  assert.deepEqual(await points(), chamfered);
  await f.same(prior);
  await f.snapshot('resize-02-preview-c8');
  await input().press('Enter');
  await preview().waitFor({ state: 'hidden' });
  assert.equal(await f.sketchPanel().isVisible(), true);
  assert.deepEqual(await points(), enlarged);
  await f.page.keyboard.press(`${keyboard}+z`);
  assert.deepEqual(await points(), chamfered);
  await f.page.keyboard.press(`${keyboard}+Shift+z`);
  assert.deepEqual(await points(), enlarged);
  const { doc } = await f.finishSketch('resize-03-rebuilt-c8');
  const native = await checkEnlarged('native-resized', doc, prior, before);
  const saved = await f.save('resized-chamfer');
  await f.freshOpen(saved.file, doc, 'resize-04-reopened-extrude');
  assert.deepEqual(await checkNative('native-resized-open', await f.doc(), [8, 6]), native);
  await edit();
  await f.worldClick([42, 36]);
  await tool().click();
  assert.equal(Number(await input().inputValue()), 8);
  await button('Cancel', panel()).click();
  await f.worldClick([35, 18]);
  await tool().click();
  assert.equal(Number(await input().inputValue()), 6);
  await button('Cancel', panel()).click();
  assert.deepEqual(await readFile(originalSave.file), startBytes);
  f.report.observations.push({ label: 'one-bevel-resized', points: doc.nodes[0].outline.points, before, native });

  f.phase = 'Refuse a resize that would detach an authored coordinate binding';
  const bound = boundChamfer(prior);
  const boundFile = join(f.output, 'bound-chamfer.bcad'), boundBytes = JSON.stringify(bound);
  await writeFile(boundFile, boundBytes);
  await f.freshOpen(boundFile, bound, 'resize-05-bound-open');
  await edit();
  await f.worldClick(start);
  await tool().click();
  await input().fill('8');
  await panel().getByRole('alert').getByText(/parameter binding/i).waitFor();
  assert.equal(await apply().isDisabled(), true);
  await preview().waitFor({ state: 'hidden' });
  assert.deepEqual(await points(), chamfered);
  await f.same(bound);
  assert.equal(await readFile(boundFile, 'utf8'), boundBytes);
  await f.snapshot('resize-06-bound-refusal');
}

async function proposeSavedChamferResize(prior, before) {
  const title = 'Change saved bevel e9 from 6 to 8 mm';
  const file = join(f.output, 'saved-chamfer-proposal.bcad'), bytes = JSON.stringify(prior);
  const session = { app: f.app, output: f.output, clientName: f.name };
  const propose = (call, args, refused = false) => call('proposals', {
    action: 'propose', title, ops: [{ tool: 'features', args }],
  }, refused);
  await writeFile(file, bytes);
  f.phase = 'Read saved bevels and stage a guarded local L1 Agent proposal';
  const op = await withMcpSession(session, file, 'agent-resize-stage', async (call, request) => {
    const detail = await call('describe', { tool: 'features', action: 'edit' });
    assert.deepEqual(detail.input.properties.sketchChamfer.oneOf,
      [{ required: ['sides'] }, { required: ['corners'] }, { required: ['bevel'] }]);
    assert.equal((await call('query', { action: 'edit_fields', index: 0 })).sketchChamfers, undefined);
    const response = await request('tools/call', { name: 'query', arguments: { action: 'edit_fields', index: 0, includeSketchCorners: true } });
    assert.equal(response.isError, false);
    const fields = JSON.parse(response.content[0].text);
    assert.deepEqual(response.structuredContent, fields);
    assert.deepEqual([fields.index, fields.id, fields.revision], [0, 'n0', await currentPartRevision(call)]);
    assert.deepEqual(fields.sketchChamfers, [{ bevel: 'e9', distance: 6 }, { bevel: 'e10', distance: 6 }]);
    const chamfer = { sketch: fields.id, bevel: fields.sketchChamfers[0].bevel, distance: 8 };
    const args = { action: 'edit', index: fields.index, expectedRevision: fields.revision, sketchChamfer: chamfer };
    assert.match((await call('features', args, true)).error, /propos/i);
    for (const [patch, reason] of [
      [{ expectedRevision: undefined }, /expectedRevision/i],
      [{ expectedRevision: '0000000000000000' }, /part changed/i],
      [{ sketchChamfer: { ...chamfer, bevel: 'e1' } }, /saved.*chamfer|bevel/i],
      [{ sketchChamfer: { ...chamfer, sides: ['e3', 'e4'] } }, /bevel|corner selector/i],
      [{ sketchChamfer: { ...chamfer, distance: 6 } }, /already|same/i],
      [{ sketchChamfer: { ...chamfer, distance: 24 } }, /collapse|cross/i],
    ]) {
      assert.match((await propose(call, { ...args, ...patch }, true)).error, reason);
      assert.equal(await readFile(file, 'utf8'), bytes);
    }
    assert.deepEqual((await call('proposals', { action: 'list' })).proposals, []);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args }] });
    assert.equal(dry.dryRun, true);
    near(dry.change.volume, -140);
    assert.deepEqual(dry.diff.changed.map(feature => feature.id), ['n0']);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const pending = await propose(call, args);
    assert.deepEqual([pending.proposal, pending.applied], ['P1', false]);
    const staged = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), staged);
    return args;
  });

  const staged = await readFile(file), pending = JSON.parse(staged);
  assert.deepEqual([pending.nodes, pending.outputs], [prior.nodes, prior.outputs]);
  const [proposal] = pending.proposals;
  assert.equal(pending.proposals.length, 1);
  assert.equal(proposal.ops.length, 1);
  assert.deepEqual(proposal.ops[0].args.sketchChamfer, op.sketchChamfer);
  assert.equal(proposal.ops[0].args.expectedRevision, op.expectedRevision);

  f.phase = 'Preview and explicitly accept the saved Chamfer resize in Studio';
  await f.freshOpen(file, pending, 'agent-01-pending');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await card.getByLabel('Volume change').getByText(/^−140(?:\.0+)? mm³/).waitFor();
  await f.same(pending);
  assert.deepEqual(await readFile(file), staged);
  await f.snapshot('agent-02-resize-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const { doc } = await f.snapshot('agent-03-accepted');
  assert.equal(doc.proposals[0].status, 'accepted');
  const approval = doc.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', 'P1', 'user']);
  assert.deepEqual([doc.nodes[1], doc.outputs], [prior.nodes[1], prior.outputs]);
  const native = await checkEnlarged('native-agent-resize', doc, prior, before);
  assert.equal(native.hash, '40b2dbef36d61300a322886b40ebb35f2705924408a483ec11c586c862e35c42', 'same native body as the prior direct Studio edit');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(doc);
  const saved = await f.save('agent-resized-chamfer');
  await f.freshOpen(saved.file, doc, 'agent-04-reopened');
  assert.deepEqual(await checkNative('native-agent-reopened', await f.doc(), [8, 6]), native);
  await withMcpSession(session, saved.file, 'agent-resize-reopened', async call => {
    const savedBytes = await readFile(saved.file);
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.notEqual(fields.revision, op.expectedRevision);
    assert.deepEqual(fields.sketchChamfers, [{ bevel: 'e9', distance: 8 }, { bevel: 'e10', distance: 6 }]);
    assert.match((await propose(call, op, true)).error, /part changed/i);
    assert.deepEqual(await readFile(saved.file), savedBytes);
  });
  assert.deepEqual(await readFile(file), staged);
  f.report.observations.push({ label: 'agent-resize-matches-studio', op, before, native });

  const boundFile = join(f.output, 'bound-agent-chamfer.bcad'), boundBytes = JSON.stringify(boundChamfer(prior));
  await writeFile(boundFile, boundBytes);
  await withMcpSession(session, boundFile, 'agent-resize-binding', async call => {
    const expectedRevision = await currentPartRevision(call);
    assert.match((await propose(call, { ...op, expectedRevision }, true)).error, /parameter binding/i);
    assert.equal(await readFile(boundFile, 'utf8'), boundBytes);
  });
}

await f.run(async () => {
  const seed = await f.inspect('seed', original, 'seed');
  const source = join(f.output, 'notched-source.bcad');
  const bytes = JSON.stringify(seed);
  await writeFile(source, bytes);
  await f.freshOpen(source, seed, '01-original');
  await edit();
  f.phase = 'Select convex and reflex corners and apply a 6 mm Chamfer in Studio';
  await f.worldClick(original[3]);
  await f.page.keyboard.down('Shift');
  try { await f.worldClick(original[4]); } finally { await f.page.keyboard.up('Shift'); }
  await button('Chamfer', group('Corner tools')).click();
  await group('Chamfer').getByLabel('Distance', { exact: true }).fill('6');
  await f.page.locator('.sk-corner-preview').waitFor();
  await f.same(seed);
  await f.snapshot('02-chamfer-group-preview');
  await button('Apply', group('Chamfer')).click();
  assert.deepEqual(await points(), chamfered);
  const { doc: prior } = await f.finishSketch('03-constrained-chamfers');
  const before = await checkNative('native-before-drag', prior);
  if (resize || agentResize) {
    if (agentResize) await proposeSavedChamferResize(prior, before);
    else await resizeSavedChamfer(prior, before);
    assert.equal(await readFile(source, 'utf8'), bytes);
    return;
  }

  await edit();
  f.phase = 'Move one chamfer endpoint and preview the constrained pair';
  await f.worldClick(chamfered[3]);
  await f.page.locator(pickedMark).waitFor();
  await move(chamfered[3]);
  await f.page.mouse.down();
  await move(target);
  await waitForPreview(target);
  assert.deepEqual(await points(), chamfered);
  await f.same(prior);
  await f.snapshot('04-moving-chamfer-point');
  f.phase = 'Keep the last valid preview when the incoming side collapses';
  await move(collapsed);
  await waitForPreview(target);
  await f.page.mouse.up();
  await f.page.waitForFunction(([x, y]) => Number(document.querySelector('input[aria-label="Point 4 X"]')?.value) === x
    && Number(document.querySelector('input[aria-label="Point 4 Y"]')?.value) === y, target);
  const moved = await points();
  assert.deepEqual(moved[0], original[0]);
  assert.deepEqual(moved[3], target);
  await f.page.keyboard.press(`${keyboard}+z`);
  assert.deepEqual(await points(), chamfered);
  await f.page.keyboard.press(`${keyboard}+Shift+z`);
  assert.deepEqual(await points(), moved);
  await f.snapshot('05-redone');

  const { doc: accepted } = await f.finishSketch('06-rebuilt-extrude');
  const native = await checkNative('native-after-drag', accepted);
  assert.notEqual(native.hash, before.hash);
  assert.notDeepEqual(native.bevels[0].tip, before.bevels[0].tip);
  assert.notDeepEqual(native.bevels[1].tip, before.bevels[1].tip);
  assert.deepEqual(accepted.nodes[0].outline.rules, prior.nodes[0].outline.rules);
  assert.deepEqual(accepted.nodes[0].outline.lengths, prior.nodes[0].outline.lengths);
  const save = await f.save('dragged-chamfers');
  await f.freshOpen(save.file, accepted, '07-reopened-extrude');
  assert.deepEqual(await checkNative('native-after-open', await f.doc()), native);
  await edit();
  assert.deepEqual(await points(), moved);
  await f.snapshot('08-reopened-constraints');
  assert.equal(await readFile(source, 'utf8'), bytes);
  f.report.observations.push({ label: 'both-chamfers-moved', points: accepted.nodes[0].outline.points, before, native });
});

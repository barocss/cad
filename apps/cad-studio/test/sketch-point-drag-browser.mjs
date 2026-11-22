import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const radiusBaseline = process.argv.includes('--radius-baseline');
const radiusEdit = process.argv.includes('--radius-edit');
const radiusAgent = process.argv.includes('--radius-agent');
const radiusDrag = process.argv.includes('--radius-drag');
const radiusDragBase = process.argv.includes('--radius-drag-base');
const savedRadius = radiusBaseline || radiusEdit || radiusAgent || radiusDrag || radiusDragBase;
const pins = [
  ...(savedRadius ? ['apps/cad-studio/src/ui/ConstraintTools.tsx',
    'apps/cad-studio/src/ui/SketchCornerTools.tsx', 'apps/cad-studio/src/sketch/cornerDraft.ts',
    'packages/barocss-cad-model/src/sketch/rules.ts'] : []),
  ...(radiusEdit || radiusAgent || radiusDrag || radiusDragBase ? ['packages/barocss-cad-model/src/sketch/filletEdit.ts'] : []),
  ...(radiusDrag ? ['apps/cad-studio/src/viewport/SketchCornerSizeHandle.tsx'] : []),
  ...(radiusAgent ? ['packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
    'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/chat/contract.ts',
    'packages/barocss-cad-model/src/chat/toolDefinitions.ts'] : []),
  'apps/cad-studio/src/viewport/sketchPointDrag.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/SceneViewport.tsx',
  'apps/cad-studio/src/sketch/useSketchDraftHistory.ts',
  'packages/barocss-cad-model/src/sketch/pointDrag.ts',
];
const f = await createFlow({
  output: process.argv[2], name: savedRadius ? 'saved-sketch-fillet-radius' : 'sketch-point-drag',
  envFrozen: radiusDrag || radiusDragBase ? 'D1718_SOURCE_FROZEN' : radiusAgent ? 'D1711_SOURCE_FROZEN' : savedRadius ? 'D1710_SOURCE_FROZEN' : 'D1698_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: radiusBaseline ? 'Measure the saved Fillet through the existing generic radius editor.'
    : radiusEdit || radiusDrag || radiusDragBase ? 'Edit the saved Fillet radius while keeping both straight carriers in place.'
      : radiusAgent ? 'Discover and explicitly approve a revision-bound Fillet radius edit in Studio.'
    : 'Drag one closed sketch vertex with its constraints, then finish and reopen the downstream solid.',
  limits: ['Desktop Studio WebGPU, one tagged XY outline, 10 mm native Extrude, one optional convex R6 Fillet.'],
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
  const profile = profileOf([input]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [body] = partSnapshot(input).outputs;
  const brep = body.brep;
  assert.ok(checkBrep(brep, { strict: true }).valid && brep.shells.every(shell => shell.closed));
  console.log(JSON.stringify({ volume: massPropertiesOf(body).volume, hash: digestOf(brep),
    faces: brep.faces.map(face => ({ name: face.name, geometry: faceGeometry(face) })) }));
}
`,
});

const coordinates = () => f.sketchPanel().getByRole('group', { name: 'Outline points', exact: true })
  .getByRole('spinbutton', { name: /^Point \d+ [XY]$/ });
const cursor = () => f.page.locator('.vp-canvas').evaluate(canvas => canvas.style.cursor);
const selected = index => f.page.locator(`.sk-pick-point.on[data-sketch-entity="point:${index}"]`);
const keyboard = process.platform === 'darwin' ? 'Meta' : 'Control';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
async function expectPoints(points) {
  await f.page.waitForFunction(expected => {
    const fields = [...document.querySelectorAll('.sk-panel input[aria-label^="Point "]')];
    return fields.length === expected.length && fields.every((field, i) => Number(field.value) === expected[i]);
  }, points.flat());
  assert.deepEqual(await coordinates().evaluateAll(inputs => inputs.map(input => Number(input.value))), points.flat());
}
async function expectPreviewAt(index, at) {
  const pixel = await f.screenOf(at);
  await f.page.waitForFunction(({ index, pixel }) => {
    const mark = document.querySelector(`.sk-pick-point.on[data-sketch-entity="point:${index}"]`);
    const r = mark?.getBoundingClientRect();
    return r && Math.hypot(r.x + r.width / 2 - pixel[0], r.y + r.height / 2 - pixel[1]) < 1.5;
  }, { index, pixel });
}
async function edit(points) {
  await f.openFeatureEditor(1, 'extrude');
  await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(points);
}
async function move(point) {
  const pixel = await f.screenOf(point);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.move(...pixel);
}
async function begin(point) {
  await move(point);
  await f.page.mouse.down();
}

const fixed = [{ kind: 'fix', point: 0, at: [0, 0] }];
const common = { kind: 'polygon', closed: true, lengths: { 0: 40 }, rules: fixed };
const fixtures = [{
  label: 'straight', index: 2, target: [46, 40], blocked: [46, 0], escape: [44, 46],
  shape: { ...common, points: [[0, 0], [40, 0], [40, 30], [0, 30]], hv: { h: [0, 2], v: [1, 3] }, ids: ['e1', 'e2', 'e3', 'e4'] },
  expected: [[0, 0], [40, 0], [40, 40], [0, 40]], volume: 16000,
}, {
  label: 'fillet', index: 3, target: [40, 40], escape: [40, 46],
  shape: { ...common, points: [[0, 0], [40, 0], [40, 24], [34, 30], [0, 30]],
    bulges: [0, 0, Math.tan(Math.PI / 8), 0, 0], hv: { h: [0, 3], v: [1, 4] },
    radii: { 2: 6 }, tangents: [2, 3], ids: ['e1', 'e2', 'e5', 'e3', 'e4'] },
  expected: [[0, 0], [40, 0], [40, 34], [34, 40], [0, 40]], volume: (1600 - 36 + 9 * Math.PI) * 10,
}];

async function checkSavedRadius() {
  const { shape } = fixtures.find(fixture => fixture.label === 'fillet');
  const source = await f.inspect('seed-saved-fillet', shape, 'seed');
  const file = join(f.output, 'saved-fillet-source.bcad');
  const bytes = JSON.stringify(source);
  await writeFile(file, bytes);
  const original = await f.freshOpen(file, source, '01-saved-fillet-open');
  if (radiusAgent) {
    await approveSavedRadius(source);
    assert.equal(await readFile(file, 'utf8'), bytes);
    return;
  }
  const arcMidpoint = [34 + 6 * Math.SQRT1_2, 24 + 6 * Math.SQRT1_2];
  await edit(shape.points);
  const pick = f.page.locator('.vp-overlay .sk-pick-edge.on[data-sketch-entity="edge:2"]');
  f.phase = 'Select the saved R6 fillet by its rounded edge';
  await f.worldClick(arcMidpoint);
  await pick.waitFor();
  await f.snapshot('02-saved-fillet-selected');
  if (radiusDragBase) {
    f.phase = 'Confirm the saved Fillet offers numeric editing without a radius handle';
    await f.sketchPanel().getByRole('button', { name: 'Edit Fillet', exact: true }).click();
    const editor = f.sketchPanel().getByRole('group', { name: 'Edit Fillet', exact: true });
    near(Number(await editor.getByLabel('Radius', { exact: true }).inputValue()), 6);
    assert.equal(await f.page.getByLabel('Fillet radius handle', { exact: true }).count(), 0);
    await f.snapshot('03-no-radius-drag-handle');
    await f.same(source);
    f.report.observations.push({ directRadiusDrag: 'FAIL: no handle', numericEditAvailable: true });
    return;
  }
  if (radiusEdit || radiusDrag) {
    await editSavedRadius(source, shape, arcMidpoint);
    assert.equal(await readFile(file, 'utf8'), bytes);
    return;
  }

  f.phase = 'Change R6 to R8 through the existing radius dimension';
  await f.sketchPanel().getByRole('button', { name: 'Dimension the selection', exact: true }).click();
  const field = f.page.locator('input.dim-edit');
  await field.waitFor();
  near(Number(await field.inputValue()), 6);
  await field.fill('8');
  await field.press('Enter');
  await f.snapshot('03-generic-radius-changed');
  const { doc } = await f.finishSketch('04-generic-radius-finished');
  const native = await f.inspect('generic-radius-native', doc);
  const arc = native.faces.find(face => face.name === 'n1.side[e5]').geometry;
  const expected = [[0, 0], [40, 0], [40, 22], [32, 30], [0, 30]];
  const changes = doc.nodes[0].outline.points.map((point, i) => Math.hypot(point[0] - expected[i][0], point[1] - expected[i][1]));
  f.report.observations.push({ label: 'generic-radius-edit', original: original.doc.nodes[0].outline.points,
    actual: doc.nodes[0].outline.points, expected, changes, arc, nativeVolume: native.volume,
    supportsRetained: Math.max(...changes) < 1e-7, tagsRetained: JSON.stringify(doc.nodes[0].sideTags) === JSON.stringify(source.nodes[0].sideTags) });
  assert.equal(await readFile(file, 'utf8'), bytes);
}

async function editSavedRadius(source, shape, arcMidpoint) {
  const button = (label, scope = f.sketchPanel()) => scope.getByRole('button', { name: label, exact: true });
  const editor = () => f.sketchPanel().getByRole('group', { name: 'Edit Fillet', exact: true });
  const field = () => editor().getByLabel('Radius', { exact: true });
  const apply = () => button('Apply', editor());
  const preview = () => f.page.locator('.sk-corner-preview');
  const handle = () => f.page.getByRole('button', { name: 'Fillet radius handle', exact: true });
  const handlePoint = async radius => {
    const offset = (1 - Math.SQRT1_2) * radius;
    return f.screenOf([40 - offset, 30 - offset]);
  };
  const drag = async (from, to) => {
    await handle().waitFor();
    const box = await handle().boundingBox();
    const start = [box.x + box.width / 2, box.y + box.height / 2];
    const reference = await handlePoint(from);
    assert.ok(Math.hypot(start[0] - reference[0], start[1] - reference[1]) < 0.5, 'Handle is at the native arc midpoint');
    const end = await handlePoint(to);
    await f.page.mouse.move(...start);
    await f.page.mouse.down();
    await f.page.mouse.move(start[0] + end[0] - reference[0], start[1] + end[1] - reference[1], { steps: 10 });
    await f.page.mouse.up();
  };
  const points = [[0, 0], [40, 0], [40, 22], [32, 30], [0, 30]];
  const seedNative = await f.inspect('original-radius-native', source);
  near(seedNative.volume, (1200 - 36 + 9 * Math.PI) * 10);

  f.phase = 'Refuse a blank radius and a radius that consumes a carrier';
  await button('Edit Fillet').click();
  near(Number(await field().inputValue()), 6);
  assert.equal(await apply().isDisabled(), true);
  for (const value of ['', '30']) {
    await field().fill(value);
    await editor().getByRole('alert').waitFor();
    assert.equal(await apply().isDisabled(), true);
    await preview().waitFor({ state: 'hidden' });
    await expectPoints(shape.points);
    await f.same(source);
  }
  await f.snapshot('03-overflow-radius-refused');
  await button('Cancel', editor()).click();

  if (radiusDrag) {
    f.phase = 'Drag beyond the valid radius and cancel without changing the accepted sketch';
    await button('Edit Fillet').click();
    await handle().click();
    near(Number(await field().inputValue()), 6);
    assert.equal(await apply().isDisabled(), true);
    await drag(6, 30);
    await editor().getByRole('alert').waitFor();
    assert.equal(await apply().isDisabled(), true);
    await preview().waitFor({ state: 'hidden' });
    await expectPoints(shape.points); await f.same(source);
    await f.snapshot('03-drag-overflow-refused');
    await button('Cancel', editor()).click();
    await handle().waitFor({ state: 'hidden' });
  }

  f.phase = 'Preview R8 on the saved Fillet and apply one local edit';
  await button('Edit Fillet').click();
  near(Number(await field().inputValue()), 6);
  if (radiusDrag) {
    await drag(6, 8);
    near(Number(await field().inputValue()), 8);
    await preview().waitFor();
    const dragged = await preview().getAttribute('points');
    await expectPoints(shape.points); await f.same(source);
    await f.snapshot('04-physical-radius-drag-preview');
    await button('Cancel', editor()).click();
    await expectPoints(shape.points); await f.same(source);
    await button('Edit Fillet').click(); await field().fill('8');
    await preview().waitFor();
    assert.equal(await preview().getAttribute('points'), dragged, 'Typed R8 and dragged R8 use the same preview outline');
    await button('Cancel', editor()).click();
    await button('Edit Fillet').click(); await drag(6, 8);
    near(Number(await field().inputValue()), 8);
  } else {
    await field().fill('8');
  }
  await preview().waitFor();
  await expectPoints(shape.points);
  await f.same(source);
  await f.snapshot('04-local-radius-preview');
  if (radiusDrag) await apply().click();
  else await field().press('Enter');
  await expectPoints(points);
  await f.page.keyboard.press(`${keyboard}+z`);
  await expectPoints(shape.points);
  await f.page.keyboard.press(`${keyboard}+Shift+z`);
  await expectPoints(points);
  const { doc } = await f.finishSketch('05-local-radius-rebuilt');
  assert.deepEqual(doc.nodes[0].outline.points, points);
  assert.deepEqual(doc.nodes[0].outline.radii, { 2: 8 });
  for (const key of ['tangents', 'rules', 'lengths', 'hv']) {
    assert.deepEqual(doc.nodes[0].outline[key], source.nodes[0].outline[key]);
  }
  assert.deepEqual(doc.nodes[0].sideTags, source.nodes[0].sideTags);
  assert.deepEqual(doc.nodes[1], source.nodes[1]);
  const native = await f.inspect('edited-radius-native', doc);
  near(native.volume, (1200 - 64 + 16 * Math.PI) * 10);
  assert.deepEqual(native.faces.map(face => face.name), seedNative.faces.map(face => face.name));
  const geometry = (tag, model) => model.faces.find(face => face.name === `n1.side[${tag}]`).geometry;
  const arc = geometry('e5', native);
  assert.equal(arc.kind, 'cylinder');
  near(arc.r, 8);
  near(arc.c[0], 32);
  near(arc.c[1], 22);
  for (const tag of ['e1', 'e2', 'e3', 'e4']) {
    const before = geometry(tag, seedNative), after = geometry(tag, native);
    assert.equal(after.kind, 'plane');
    after.n.forEach((value, i) => near(value, before.n[i]));
    near(after.n.reduce((dot, value, i) => dot + value * (after.o[i] - before.o[i]), 0), 0);
  }
  const saved = await f.save('edited-saved-fillet');
  await f.freshOpen(saved.file, doc, '06-radius-fresh-open');
  assert.deepEqual(await f.inspect('reopened-radius-native', await f.doc()), native);
  await edit(points);
  await f.worldClick([32 + 8 * Math.SQRT1_2, 22 + 8 * Math.SQRT1_2]);
  await button('Edit Fillet').click();
  near(Number(await field().inputValue()), 8);
  await f.snapshot('07-reopened-radius-editor');
  f.report.observations.push({ label: 'local-radius-edit', points, before: seedNative, after: native });

  f.phase = 'Refuse an edit that would remove an authored tangent coordinate binding';
  const bound = structuredClone(source);
  bound.parameters.FilletTangentY = 24;
  bound.nodes[0].segments[2].start[1] = { parameter: 'FilletTangentY' };
  const boundFile = join(f.output, 'bound-saved-fillet.bcad');
  const boundBytes = JSON.stringify(bound);
  await writeFile(boundFile, boundBytes);
  await f.freshOpen(boundFile, bound, '08-radius-binding-open');
  await edit(shape.points);
  await f.worldClick(arcMidpoint);
  await button('Edit Fillet').click();
  if (radiusDrag) await drag(6, 8);
  else await field().fill('8');
  await editor().getByRole('alert').getByText(/parameter binding/i).waitFor();
  assert.equal(await apply().isDisabled(), true);
  await preview().waitFor({ state: 'hidden' });
  await expectPoints(shape.points);
  await f.same(bound);
  assert.equal(await readFile(boundFile, 'utf8'), boundBytes);
  await f.snapshot('09-radius-binding-refused');
}

async function approveSavedRadius(source) {
  const file = join(f.output, 'saved-fillet-proposal.bcad'), bytes = JSON.stringify(source);
  const session = { app: f.app, output: f.output, clientName: f.name };
  const title = 'Change saved Fillet e5 from R6 to R8';
  const propose = (call, args, refused = false) => call('proposals', {
    action: 'propose', title, ops: [{ tool: 'features', args }],
  }, refused);
  await writeFile(file, bytes);
  f.phase = 'Discover the saved Fillet and stage one revision-bound local proposal';
  const args = await withMcpSession(session, file, 'fillet-agent-stage', async (call, request) => {
    const detail = await call('describe', { tool: 'features', action: 'edit' });
    assert.deepEqual(detail.input.properties.sketchRound.oneOf, [
      { required: ['sides'] }, { required: ['corners'] }, { required: ['fillet'] },
    ]);
    assert.equal((await call('query', { action: 'edit_fields', index: 0 })).sketchFillets, undefined);
    const response = await request('tools/call', { name: 'query', arguments: { action: 'edit_fields', index: 0, includeSketchCorners: true } });
    assert.equal(response.isError, false);
    const fields = JSON.parse(response.content[0].text);
    assert.deepEqual(response.structuredContent, fields);
    assert.deepEqual([fields.index, fields.id, fields.revision], [0, 'n0', await currentPartRevision(call)]);
    assert.deepEqual(fields.sketchFillets, [{ fillet: 'e5', radius: 6 }]);
    const round = { sketch: fields.id, fillet: fields.sketchFillets[0].fillet, radius: 8 };
    const args = { action: 'edit', index: fields.index, expectedRevision: fields.revision, sketchRound: round };
    assert.match((await call('features', args, true)).error, /propos/i);
    for (const [patch, reason] of [
      [{ expectedRevision: undefined }, /expectedRevision/i],
      [{ expectedRevision: '0000000000000000' }, /part changed/i],
      [{ sketchRound: { ...round, fillet: 'e1' } }, /saved fillet/i],
      [{ sketchRound: { ...round, sides: ['e2', 'e3'] } }, /fillet/i],
      [{ sketchRound: { ...round, radius: 6 } }, /already|same/i],
      [{ sketchRound: { ...round, radius: 30 } }, /collapse|cross/i],
    ]) {
      assert.match((await propose(call, { ...args, ...patch }, true)).error, reason);
      assert.equal(await readFile(file, 'utf8'), bytes);
    }
    assert.deepEqual((await call('proposals', { action: 'list' })).proposals, []);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args }] });
    assert.equal(dry.dryRun, true);
    // Dry-run volume compares body summaries rounded to 0.001 mm³.
    assert.ok(Math.abs(dry.change.volume + 280 * (1 - Math.PI / 4)) < .001);
    assert.deepEqual(dry.diff.changed.map(feature => feature.id), ['n0']);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const proposed = await propose(call, args);
    assert.deepEqual([proposed.proposal, proposed.applied], ['P1', false]);
    const staged = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), staged);
    return args;
  });
  const staged = await readFile(file), pending = JSON.parse(staged);
  assert.deepEqual([pending.nodes, pending.outputs], [source.nodes, source.outputs]);
  assert.deepEqual(pending.proposals[0].ops[0].args.sketchRound, args.sketchRound);
  await f.freshOpen(file, pending, '02-fillet-agent-pending');
  const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  assert.deepEqual(await readFile(file), staged);
  await f.snapshot('03-fillet-agent-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const { doc } = await f.snapshot('04-fillet-agent-accepted');
  const approval = doc.history.at(-1);
  assert.deepEqual([doc.proposals[0].status, approval.kind, approval.proposal, approval.by.agent],
    ['accepted', 'accept', 'P1', 'user']);
  const native = await f.inspect('fillet-agent-native', doc);
  assert.deepEqual(doc.nodes[0].outline.points, [[0, 0], [40, 0], [40, 22], [32, 30], [0, 30]]);
  assert.deepEqual(doc.nodes[0].outline.radii, { 2: 8 });
  assert.deepEqual([doc.nodes[0].sideTags, doc.nodes[1]], [source.nodes[0].sideTags, source.nodes[1]]);
  near(native.volume, (1200 - 64 + 16 * Math.PI) * 10);
  assert.equal(native.hash, '7681b66cb929f4b39a58e3018636f1da717bd5619ad21ec2b7be31c943a435bd',
    'same native body as the D1710 direct Studio radius edit');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(doc);
  const saved = await f.save('agent-edited-fillet');
  await f.freshOpen(saved.file, doc, '05-fillet-agent-reopened');
  assert.deepEqual(await f.inspect('fillet-agent-reopened-native', await f.doc()), native);
  await withMcpSession(session, saved.file, 'fillet-agent-reopened', async call => {
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.deepEqual(fields.sketchFillets, [{ fillet: 'e5', radius: 8 }]);
    assert.notEqual(fields.revision, args.expectedRevision);
  });
  f.report.observations.push({ label: 'saved-fillet-agent-approval', native, previousRevision: args.expectedRevision });
}

await f.run(async () => {
  if (savedRadius) return checkSavedRadius();
  for (const { label, shape, index, target, expected, blocked, escape, volume } of fixtures) {
    const original = shape.points, start = original[index];
    const seed = await f.inspect(`${label}-seed`, shape, 'seed');
    const file = join(f.output, `${label}-source.bcad`), bytes = JSON.stringify(seed);
    await writeFile(file, bytes);
    await f.freshOpen(file, seed, `${label}-opened`);
    await edit([...original, target, escape]);
    await expectPoints(original);
    f.phase = `Click and Shift-click ${label} points without moving them`;
    await f.worldClick(start);
    await selected(index).waitFor();
    await f.page.keyboard.down('Shift');
    try { await f.worldClick(original[0]); } finally { await f.page.keyboard.up('Shift'); }
    await selected(0).waitFor();
    await selected(index).waitFor();
    await expectPoints(original);
    await f.worldClick(start);
    assert.equal(await selected(0).count(), 0);

    if (blocked) {
      f.phase = 'Drag an authored fixed point';
      await begin(original[0]);
      await move([8, 8]);
      await f.page.mouse.up();
      await expectPoints(original);
    }
    f.phase = `Cancel ${label} point drag with Escape`;
    await begin(start);
    await move(escape);
    assert.equal(await cursor(), 'grabbing');
    await f.page.keyboard.press('Escape');
    await f.page.mouse.up();
    assert.notEqual(await cursor(), 'grabbing');
    await expectPoints(original);
    assert.equal(await f.sketchPanel().isVisible(), true);

    f.phase = `Preview ${label} point drag before mouse release`;
    await begin(start);
    await move(target);
    assert.equal(await cursor(), 'grabbing');
    await expectPreviewAt(index, expected[index]);
    await expectPoints(original);
    await f.same(seed);
    await f.snapshot(`${label}-drag-preview`);
    if (blocked) {
      f.phase = 'A collapsed side keeps the last valid point preview';
      await move(blocked);
      await expectPreviewAt(index, expected[index]);
    }
    await f.page.mouse.up();
    await expectPoints(expected);
    await f.page.keyboard.press(`${keyboard}+z`);
    await expectPoints(original);
    await f.page.keyboard.press(`${keyboard}+Shift+z`);
    await expectPoints(expected);
    assert.deepEqual(await f.doc(), seed);
    await f.snapshot(`${label}-drag-committed`);

    const { doc } = await f.finishSketch(`${label}-extrude-rebuilt`);
    assert.deepEqual(doc.nodes[0].outline.points, expected);
    assert.deepEqual(doc.nodes[0].outline.rules, fixed);
    assert.deepEqual(doc.nodes[0].outline.lengths, { 0: 40 });
    assert.deepEqual(doc.nodes[0].sideTags, seed.nodes[0].sideTags);
    assert.equal(doc.nodes[1].height, 10);
    const native = await f.inspect(`${label}-native`, doc);
    near(native.volume, volume);
    for (const id of shape.ids) assert.ok(native.faces.some(face => face.name === `n1.side[${id}]`));
    if (shape.radii) {
      assert.deepEqual(doc.nodes[0].outline.radii, shape.radii);
      assert.deepEqual(doc.nodes[0].outline.tangents, shape.tangents);
      const arc = native.faces.find(face => face.name === 'n1.side[e5]').geometry;
      assert.equal(arc.kind, 'cylinder');
      near(arc.r, 6);
      near(arc.c[0], 34);
      near(arc.c[1], 34);
      const walls = ['e2', 'e3'].map(tag => native.faces.find(face => face.name === `n1.side[${tag}]`).geometry);
      for (const wall of walls) {
        assert.equal(wall.kind, 'plane');
        near(Math.abs(wall.n.reduce((d, n, i) => d + n * (arc.c[i] - wall.o[i]), 0)), 6);
      }
    }
    const saved = await f.save(`${label}-dragged`);
    await f.freshOpen(saved.file, saved.doc, `${label}-fresh-open`);
    assert.deepEqual(await f.inspect(`${label}-reopened-native`, await f.doc()), native);
    f.report.observations.push({ label, expected, volume: native.volume, nativeHash: native.hash });
    await edit(expected);
    await expectPoints(expected);
    assert.equal(await readFile(file, 'utf8'), bytes);
  }
});

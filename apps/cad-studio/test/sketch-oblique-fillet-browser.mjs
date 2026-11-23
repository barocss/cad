import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-unavailable');
const turn = Math.atan2(3, 4);
const sharp = [[0, 0], [30, 0], [50, 15], [50, 45], [0, 45]];
const shapeAt = radius => {
  const setback = radius / 3;
  return { kind: 'polygon', closed: true, points: [sharp[0], [30 - setback, 0], [30 + .8 * setback, .6 * setback], ...sharp.slice(2)],
    bulges: [0, Math.tan(turn / 4), 0, 0, 0, 0], hv: { h: [0, 4], v: [3, 5] }, radii: { 1: radius },
    tangents: [1, 2], ids: ['e1', 'e6', 'e2', 'e3', 'e4', 'e5'], rules: [
      { kind: 'fix', point: 0, at: sharp[0] }, { kind: 'fix', point: 3, at: sharp[2] },
      { kind: 'angle', a: 0, b: 2, value: turn * 180 / Math.PI },
    ] };
};
const midpoint = radius => [30 - radius / 3 + radius * Math.sin(turn / 2), radius * (1 - Math.cos(turn / 2))];
const sharpArea = Math.abs(sharp.reduce((area, [x, y], i) => {
  const [px, py] = sharp[(i + 1) % sharp.length];
  return area + x * py - y * px;
}, 0)) / 2;

const pins = [
  'packages/barocss-cad-model/src/sketch/filletEdit.ts', 'packages/barocss-cad-model/src/sketch/rules.ts',
  'packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
  'apps/cad-studio/src/sketch/cornerDraft.ts', 'apps/cad-studio/src/ui/SketchCornerTools.tsx',
  'apps/cad-studio/src/viewport/SketchCornerSizeHandle.tsx',
];
const f = await createFlow({
  name: 'saved-oblique-sketch-fillet', output: process.argv[2], envFrozen: 'D1756_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Resize a saved angle-constrained oblique Sketch Fillet, rebuild its Extrude and reopen its native file.',
  limits: ['One convex 3:4:5 carrier pair in XY, one radius-locked Fillet, 10 mm extrusion and desktop WebGPU.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (JSON.parse(process.argv[3])) {
  const profile = profileOf([input]);
  assert.ok('node' in profile, JSON.stringify(profile));
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const { outputs: [body] } = partSnapshot(input), { brep } = body;
  assert.ok(checkBrep(brep, { strict: true }).valid && brep.shells.every(shell => shell.closed));
  console.log(JSON.stringify({ volume: massPropertiesOf(body).volume, digest: digestOf(brep),
    faces: brep.faces.map(face => [face.name, faceGeometry(face)]) }));
}
`,
});

const near = (actual, expected, tolerance = 5e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));
const button = (label, scope = f.sketchPanel()) => scope.getByRole('button', { name: label, exact: true });
const editButton = () => button('Edit Fillet');
const editor = () => f.sketchPanel().getByRole('group', { name: 'Edit Fillet', exact: true });
const field = () => editor().getByLabel('Radius', { exact: true });
const apply = () => button('Apply', editor());
const preview = () => f.page.locator('.sk-corner-preview');
const handle = () => f.page.getByRole('button', { name: 'Fillet radius handle', exact: true });

async function pickFillet(radius) {
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(shapeAt(radius).points);
  await f.worldClick(midpoint(radius));
  await f.page.locator('.vp-overlay .sk-pick-edge.on[data-sketch-entity="edge:1"]').waitFor();
}

async function assertGeometry(label, doc, radius, original) {
  const native = await f.inspect(label, doc, false);
  near(native.volume, 10 * (sharpArea - radius ** 2 * (1 / 3 - turn / 2)), 1e-4);
  const faces = new Map(native.faces);
  const geometry = tag => faces.get(`n1.side[${tag}]`);
  const arc = geometry('e6');
  assert.equal(arc.kind, 'cylinder');
  near(arc.r, radius);
  near(arc.c[0], 30 - radius / 3);
  near(arc.c[1], radius);
  const outline = doc.nodes[0].outline;
  const expected = shapeAt(radius);
  for (const key of ['radii', 'tangents', 'rules', 'hv']) assert.deepEqual(outline[key], expected[key]);
  assert.equal(outline.points.length, expected.points.length);
  outline.points.forEach((point, i) => point.forEach((value, axis) => near(value, expected.points[i][axis])));
  if (original) {
    assert.deepEqual(native.faces.map(([name]) => name), original.faces.map(([name]) => name));
    const originalFaces = new Map(original.faces);
    for (const tag of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      const before = originalFaces.get(`n1.side[${tag}]`), after = geometry(tag);
      assert.equal(after.kind, 'plane');
      after.n.forEach((value, axis) => near(value, before.n[axis]));
      near(after.n.reduce((sum, value, i) => sum + value * (after.o[i] - before.o[i]), 0), 0);
    }
  }
  f.report.observations.push({ label, radius, volume: native.volume, digest: native.digest, points: outline.points });
  return native;
}

async function approveByAgent(source, typed, typedNative) {
  const file = join(f.output, 'oblique-fillet-proposal.bcad');
  const bytes = JSON.stringify(source);
  await writeFile(file, bytes);
  f.phase = 'Propose the typed R9 edit by its saved Fillet side ID';
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'oblique-fillet', async call => {
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.deepEqual(fields.sketchFillets, [{ fillet: 'e6', radius: 6 }]);
    const args = { action: 'edit', index: 0, expectedRevision: fields.revision,
      sketchRound: { sketch: fields.id, fillet: 'e6', radius: 9 } };
    const propose = (edit, refused) => call('proposals', {
      action: 'propose', title: 'Set the saved oblique Fillet to R9', ops: [{ tool: 'features', args: edit }],
    }, refused);
    assert.match((await propose({ ...args, expectedRevision: '0'.repeat(16) }, true)).error, /part changed/i);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const staged = await propose(args);
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [source.nodes, source.outputs]);
  await f.freshOpen(file, pending, '08-agent-pending');
  await button('Chat', f.page).first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('09-agent-approved')).doc;
  assert.deepEqual([approved.nodes, approved.outputs], [typed.nodes, typed.outputs]);
  assert.deepEqual(await f.inspect('r9-agent-native', approved, false), typedNative);
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
  const source = await f.inspect('seed-oblique-fillet', shapeAt(6), true);
  const input = join(f.output, 'oblique-fillet.bcad');
  await writeFile(input, JSON.stringify(source));
  await f.freshOpen(input, source, '01-source-open');
  const original = await assertGeometry('r6-native', source, 6);
  f.phase = 'Select the stored angle-constrained radius';
  await pickFillet(6);
  if (baseline) {
    assert.equal(await editButton().count(), 0);
    assert.equal(await handle().count(), 0);
    await button('Dimension the selection').click();
    near(Number(await f.page.locator('input.dim-edit').inputValue()), 6);
    await f.same(source);
    await f.snapshot('02-carrier-preserving-edit-unavailable');
    return;
  }

  await editButton().click();
  near(Number(await field().inputValue()), 6);
  await field().fill('100');
  await editor().getByRole('alert').waitFor();
  assert.ok(await apply().isDisabled());
  await f.same(source);
  await f.snapshot('02-oversize-refusal');
  await field().fill('9');
  await preview().waitFor();
  await f.same(source);
  await f.snapshot('03-typed-r9-preview');
  await apply().click();
  const typed = (await f.finishSketch('04-r9-applied')).doc;
  assert.deepEqual(typed.nodes[0].sideTags, source.nodes[0].sideTags);
  assert.deepEqual(typed.nodes[1], source.nodes[1]);
  const typedNative = await assertGeometry('r9-native', typed, 9, original);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(typed);
  const saved = await f.save('oblique-fillet-r9');
  const reopened = (await f.freshOpen(saved.file, typed, '05-r9-fresh-open')).doc;
  const reopenedNative = await assertGeometry('r9-reopened-native', reopened, 9, original);
  assert.deepEqual(reopenedNative, typedNative);

  f.phase = 'Drag the reopened radius handle along the oblique arc bisector';
  await pickFillet(9);
  let [start, target] = await Promise.all([f.screenOf(midpoint(9)), f.screenOf(midpoint(15))]);
  for (let i = 0; i < 6 && Math.hypot(target[0] - start[0], target[1] - start[1]) < 16; i++) {
    await f.page.mouse.move(...start);
    await f.page.mouse.wheel(0, -420);
    await f.page.waitForTimeout(250);
    [start, target] = await Promise.all([f.screenOf(midpoint(9)), f.screenOf(midpoint(15))]);
  }
  await editButton().click();
  await handle().waitFor();
  const box = await handle().boundingBox();
  const center = [box.x + box.width / 2, box.y + box.height / 2];
  near(Math.hypot(center[0] - start[0], center[1] - start[1]), 0, .75);
  await f.page.mouse.move(...center);
  await f.page.mouse.down();
  await f.page.mouse.move(center[0] + target[0] - start[0], center[1] + target[1] - start[1], { steps: 10 });
  await f.page.mouse.up();
  const dragged = Number(await field().inputValue());
  near(dragged, 15, .4);
  await preview().waitFor();
  const pointerOutline = await preview().getAttribute('points');
  await f.same(typed);
  await f.snapshot('06-reopened-pointer-preview');
  await button('Cancel', editor()).click();
  await editButton().click();
  await field().fill(String(dragged));
  await preview().waitFor();
  assert.equal(await preview().getAttribute('points'), pointerOutline);
  await apply().click();
  const editedAgain = (await f.finishSketch('07-pointer-equivalent-applied')).doc;
  assert.deepEqual(editedAgain.nodes[0].sideTags, typed.nodes[0].sideTags);
  await assertGeometry('pointer-equivalent-native', editedAgain, dragged, original);
  await approveByAgent(source, typed, typedNative);
});

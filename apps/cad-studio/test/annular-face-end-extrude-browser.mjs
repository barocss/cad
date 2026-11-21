import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/annular-face-end-extrude-browser.mjs',
  'apps/cad-studio/src/app/extrudeEndFace.ts',
  'packages/barocss-cad-model/src/app/extrudeEndFacePick.ts',
  'packages/barocss-cad-model/src/engine/faceEndExtrude.ts',
];
const f = await createFlow({
  name: 'annular-face-end-extrude', output: process.argv[2], envFrozen: 'D1609_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Select the original lower annular face in Studio. Refuse a footprint over the bore and retain the exact accepted target through History and Open.',
  limits: ['One upright tube with a 12 mm outer radius and a centred 4 mm through bore, and one horizontal rectangular profile.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ brep, key }) => ({
  key, check: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
  vertices: brep.vertices.map(vertex => vertex.point),
  faces: brep.faces.map(face => ({ name: face.name, loops: face.loops.length, geometry: faceGeometry(face) })),
}))));
`,
});
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const field = (scope, name) => scope.getByLabel(name, { exact: true });
const originalZ = 20, nextZ = 28, height = 6, targetName = 'n1.bottom';
const acceptedSketch = { id: 'n3', kind: 'sketch', profile: 'rectangle', min: [6, -2], max: [9, 2] };
const refusedSketch = { ...acceptedSketch, min: [-5, -1], max: [5, 1] };
const model = sketch => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 12 },
    { id: 'n1', kind: 'extrude', sketch: 0, from: originalZ, height },
    { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, center: [0, 0], radius: 4 },
    sketch,
  ],
  outputs: { b2: { node: 2, side: 'solid' } }, nextId: 4,
});
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const status = text => f.hud().locator('.status').filter({ hasText: new RegExp('^' + text + '$') }).waitFor();
async function open(label, doc) {
  const path = join(f.output, label + '.bcad');
  await writeFile(path, JSON.stringify(doc));
  await f.openFile(path, 4);
  await f.same(doc);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}
async function pickCap(view, point) {
  await button(f.page, 'View cube directions').click();
  await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  await f.page.waitForFunction(name => {
    const face = document.querySelectorAll('.view-cube .vc-label');
    return face.length === 1 && face[0].textContent === name;
  }, view.toUpperCase());
  const pixel = await f.page.evaluate(p => {
    const xy = window.__studioScreenOf(p);
    return xy && document.elementFromPoint(...xy)?.closest('.vp-canvas') ? xy : null;
  }, point);
  assert.ok(pixel, 'cap pick reaches the actual viewport');
  await f.page.mouse.click(...pixel);
}
async function begin() {
  const history = f.page.getByRole('group', { name: 'History', exact: true });
  await button(history, 'Sketch · rectangle').click();
  await f.editor().waitFor();
  await f.closeEditor();
  await f.page.waitForFunction(() => window.__studioSelection?.selection?.sketches?.includes(3));
  await f.openExtrudeHud();
  await field(f.hud(), 'Depth').selectOption('to-face');
  await status('pick face');
}
async function inspect(label, doc, z) {
  assert.deepEqual(doc.nodes.at(-1), { id: 'n4', kind: 'face-end-extrude', sketch: 3,
    target: { body: { node: 2, side: 'solid' }, feature: 'n2', face: targetName } });
  assert.deepEqual(doc.outputs, { b2: { node: 2, side: 'solid' }, b4: { node: 4, side: 'solid' } });
  const native = await f.inspect(label, doc);
  assert.deepEqual(native.map(body => body.key), ['b2', 'b4']);
  assert.ok(native.every(body => body.check.valid));
  const [tube, post] = native;
  const cap = tube.faces.filter(face => face.name === targetName);
  assert.equal(cap.length, 1);
  assert.equal(cap[0].loops, 2);
  assert.equal(cap[0].geometry.kind, 'plane');
  near(cap[0].geometry.o[2], z);
  assert.equal(cap[0].geometry.n[2], -1);
  const walls = tube.faces.filter(face => face.geometry.kind === 'cylinder').map(face => face.geometry);
  assert.equal(walls.length, 4);
  for (const wall of walls) {
    near(wall.c[0], 0);
    near(wall.c[1], 0);
    near(wall.r, wall.out === 1 ? 12 : 4);
  }
  near(tube.mass.volume, Math.PI * (144 - 16) * height);
  near(post.mass.volume, 12 * z);
  const top = post.vertices.filter(point => Math.abs(point[2] - z) < 1e-8).map(point => point.slice(0, 2));
  assert.equal(top.length, 4);
  for (const x of [6, 9]) for (const y of [-2, 2]) assert.equal(top.filter(p => p[0] === x && p[1] === y).length, 1);
  const bodies = (await f.bodies()).bodies;
  assert.deepEqual(bodies.map(body => body.key), ['b2', 'b4']);
  near(bodies[0].volume, Math.PI * (144 - 16) * height);
  near(bodies[1].volume, 12 * z);
  f.report.observations.push({ label, level: z, target: targetName, tubeVolume: tube.mass.volume, postVolume: post.mass.volume });
  return native;
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const refused = model(refusedSketch), source = model(acceptedSketch);
  f.phase = 'refuse a rectangle spanning the bore although its corners clear it';
  assert.ok([-5, 5].every(x => [-1, 1].every(y => Math.hypot(x, y) > 4)));
  await open('rectangle-crosses-bore', refused);
  await begin();
  await pickCap('Bottom', [0, 8, originalZ]);
  await status('refused');
  assert.equal(await button(f.hud(), 'Apply').isDisabled(), true);
  assert.match(await f.hud().locator('.hud-error').textContent(), /projected profile|bore/i);
  await f.same(refused);
  await f.snapshot('01-bore-overlap-refused');
  await button(f.hud(), 'Cancel').click();
  await f.hud().waitFor({ state: 'hidden' });

  f.phase = 'pick the exact lower annulus and create a separate rectangular solid';
  await open('rectangle-clears-bore', source);
  await begin();
  await pickCap('Bottom', [0, 8, originalZ]);
  await status('preview');
  await f.hud().getByText(targetName, { exact: true }).waitFor();
  await f.same(source);
  await f.snapshot('02-annular-face-preview');
  await button(f.hud(), 'Apply').click();
  await f.changed(source);
  const authored = await f.doc();
  await inspect('authored-native-annulus', authored, originalZ);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(authored);

  f.phase = 'move the target start and retain the same cap through Save and Open';
  await f.openFeatureEditor(1, 'annular target start');
  await field(f.editor(), 'Start Z').fill(String(nextZ));
  await button(f.editor(), 'Apply').click();
  await f.changed(authored);
  const moved = await f.doc();
  assert.deepEqual(moved.nodes[1], { ...authored.nodes[1], from: nextZ });
  assert.deepEqual(moved.nodes.slice(2), authored.nodes.slice(2));
  const after = await inspect('moved-native-annulus', moved, nextZ);
  await button(f.page.locator('.views'), 'Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('03-associative-height');
  const saved = await f.save('post-to-annular-face');
  await f.freshOpen(saved.file, moved, '04-reopened-annular-post');
  assert.deepEqual(await inspect('reopened-native-annulus', moved, nextZ), after);
});

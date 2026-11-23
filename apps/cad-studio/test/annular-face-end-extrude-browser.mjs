import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const polygonSource = process.argv.includes('--polygon');
const circleSource = process.argv.includes('--circle');
const exchange = process.argv.includes('--step');
assert.ok(!exchange || circleSource, 'The STEP oracle requires the circular profile.');
assert.ok(!polygonSource || !circleSource, 'Choose only one source profile.');
const profile = circleSource ? 'circle' : polygonSource ? 'polygon' : 'rectangle';
const pins = [
  'apps/cad-studio/test/annular-face-end-extrude-browser.mjs',
  'apps/cad-studio/src/app/extrudeEndFace.ts',
  'packages/barocss-cad-model/src/app/extrudeEndFacePick.ts',
  'packages/barocss-cad-model/src/engine/faceEndExtrude.ts',
];
if (exchange) pins.push(
  'apps/cad-studio/test/annular-face-step-oracle.py',
  'apps/cad-studio/test/smooth-turn-step-oracle.py',
  'apps/cad-studio/test/part21-prism-check.py',
  'apps/cad-studio/src/files/useModelExports.ts',
  'apps/cad-studio/src/files/StepExportPanel.tsx',
  'apps/cad-studio/src/files/importedFile.ts',
  'packages/barocss-cad/src/io/step.ts',
);
const f = await createFlow({
  name: 'annular-face-end-extrude', output: process.argv[2], envFrozen: exchange ? 'D1866_SOURCE_FROZEN' : circleSource ? 'D1861_SOURCE_FROZEN' : polygonSource ? 'D1621_SOURCE_FROZEN' : 'D1609_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: exchange ? 'Export two current annulus and post states from Studio, read the STEP bytes independently, and reopen the native and exchanged models.'
    : 'Select the original lower annular face in Studio. Refuse a footprint over the bore and retain the exact accepted target through History and Open.',
  limits: [`One upright tube with a 12 mm outer radius and a centred 4 mm through bore, and one horizontal ${profile} profile.`],
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
const acceptedPoints = [[0, 7], [7, 0], [8, 8]], refusedPoints = [[0, 5], [5, 0], [8, 8]];
const acceptedSketch = circleSource ? { id: 'n3', kind: 'sketch', profile, center: [6, 6], radius: 3 }
  : polygonSource
  ? { id: 'n3', kind: 'sketch', profile, points: acceptedPoints }
  : { id: 'n3', kind: 'sketch', profile, min: [6, -2], max: [9, 2] };
const refusedSketch = circleSource ? { ...acceptedSketch, center: [5.5, 0], radius: 2 }
  : polygonSource ? { ...acceptedSketch, points: refusedPoints }
  : { ...acceptedSketch, min: [-5, -1], max: [5, 1] };
// The triangle has base direction (7, -7) and the third point is (8, 1)
// from its first vertex. The determinant gives 31.5 square millimetres.
const sourceArea = circleSource ? 9 * Math.PI : polygonSource ? 31.5 : 12;
const footprint = polygonSource ? acceptedPoints : [[6, -2], [6, 2], [9, -2], [9, 2]];
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
  await button(history, `Sketch · ${profile}`).click();
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
  near(post.mass.volume, sourceArea * z);
  if (polygonSource) [5, 5, z / 2].forEach((expected, axis) => near(post.mass.centroid[axis], expected));
  if (circleSource) {
    [6, 6, z / 2].forEach((expected, axis) => near(post.mass.centroid[axis], expected));
    const cylinders = post.faces.map(face => face.geometry).filter(face => face.kind === 'cylinder');
    assert.equal(cylinders.length, 2);
    for (const wall of cylinders) {
      near(wall.c[0], 6);
      near(wall.c[1], 6);
      near(wall.r, 3);
      near(Math.abs(wall.a[2]), 1);
    }
    const end = post.faces.find(face => face.name === 'n4.top').geometry;
    assert.equal(end.kind, 'plane');
    near(end.o[2], z);
    assert.equal(end.n[2], 1);
  } else {
    const top = post.vertices.filter(point => Math.abs(point[2] - z) < 1e-8).map(point => point.slice(0, 2));
    assert.equal(top.length, footprint.length);
    for (const [x, y] of footprint) assert.equal(top.filter(p => p[0] === x && p[1] === y).length, 1);
  }
  const bodies = (await f.bodies()).bodies;
  assert.deepEqual(bodies.map(body => body.key), ['b2', 'b4']);
  near(bodies[0].volume, Math.PI * (144 - 16) * height);
  near(bodies[1].volume, sourceArea * z);
  f.report.observations.push({ label, level: z, target: targetName, tubeVolume: tube.mass.volume, postVolume: post.mass.volume });
  return native;
}

function captureLocalStep() {
  const blobs = new Map(), create = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
  window.__annularStepBlobs = [];
  URL.createObjectURL = function (blob) {
    const url = create.call(URL, blob);
    if (blob instanceof Blob && blob.type === 'model/step') blobs.set(url, blob);
    return url;
  };
  HTMLAnchorElement.prototype.click = function () {
    const blob = blobs.get(this.href);
    if (!blob || !/\.step$/.test(this.download)) return click.call(this);
    blobs.delete(this.href);
    void blob.text().then(text => window.__annularStepBlobs.push(text));
  };
}

async function exportStep(doc, z) {
  f.phase = `Export the two current solids at Z${z}`;
  await button(f.page.locator('.views'), 'Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const exportAction = button(f.page, 'Export STEP');
  if (await exportAction.count()) await exportAction.click();
  else {
    await button(f.page, 'More tools').click();
    await f.page.getByRole('menuitem', { name: 'Export STEP', exact: true }).click();
  }
  const panel = f.page.getByRole('region', { name: 'STEP export', exact: true });
  assert.match(await panel.getByLabel('STEP included bodies', { exact: true }).innerText(), /2 output bodies: 2 root bodies/);
  assert.match(await panel.getByLabel('STEP loss report', { exact: true }).innerText(), /Native feature history is not included/);
  await f.snapshot(`05-step-export-z${z}`);
  const count = await f.page.evaluate(() => window.__annularStepBlobs.length);
  await button(panel, 'Export').click();
  await f.page.waitForFunction(before => window.__annularStepBlobs.length === before + 1, count);
  const bytes = await f.page.evaluate(() => window.__annularStepBlobs.at(-1));
  const file = join(f.output, `annulus-and-post-${z}.step`);
  await writeFile(file, bytes);
  const oracle = spawnSync('python3', ['-I', join(import.meta.dirname, 'annular-face-step-oracle.py'), file, String(z)], { encoding: 'utf8' });
  assert.equal(oracle.status, 0, oracle.stderr);
  const read = JSON.parse(oracle.stdout);
  assert.equal(read.status, 'PASS');
  assert.deepEqual(read.negativeControls, ['wrong-active-unit', 'incorrect-end-station', 'inner-loop-as-outer', 'displaced-axial-seam']);
  f.report.observations.push({ label: `independent STEP Z${z}`, ...read });
  await f.same(doc);
  return { file, read };
}

async function reopenStep({ file, read }, z) {
  await f.newPage();
  f.phase = `Open the actual STEP file at Z${z}`;
  await f.openFile(file, 1);
  const doc = await f.doc();
  assert.equal(doc.nodes[0].kind, 'import');
  assert.equal(doc.nodes[0].solids, 2);
  assert.equal(doc.units, 'mm');
  assert.equal(Object.keys(doc.outputs).length, 2);
  const observed = (await f.bodies()).bodies.map(body => body.volume).sort((a, b) => a - b);
  const expected = read.solids.map(body => body.volumeMM3).sort((a, b) => a - b);
  assert.equal(observed.length, 2);
  observed.forEach((volume, i) => near(volume, expected[i], 1e-5));
  await f.waitToast(/2 solids, in millimetres/);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot(`06-step-open-z${z}`);
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    if (exchange) await context.addInitScript(captureLocalStep);
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
  f.phase = 'refuse a footprint spanning the bore although its vertices clear it';
  if (circleSource) {
    assert.ok(Math.hypot(6, 6) + 3 < 12 && Math.hypot(6, 6) - 3 > 4);
    assert.ok(Math.hypot(9, 9) > 12);
  } else if (polygonSource) {
    assert.ok(refusedPoints.every(point => Math.hypot(...point) > 4 && Math.hypot(...point) < 12));
    const edgeDistanceSquared = ([[ax, ay], [bx, by]]) =>
      (ax * by - ay * bx) ** 2 / ((bx - ax) ** 2 + (by - ay) ** 2);
    assert.equal(edgeDistanceSquared(refusedPoints), 12.5);
    assert.equal(edgeDistanceSquared(acceptedPoints), 24.5);
  } else assert.ok([-5, 5].every(x => [-1, 1].every(y => Math.hypot(x, y) > 4)));
  await open(`${profile}-crosses-bore`, refused);
  await begin();
  await pickCap('Bottom', [0, 8, originalZ]);
  await status('refused');
  assert.equal(await button(f.hud(), 'Apply').isDisabled(), true);
  assert.match(await f.hud().locator('.hud-error').textContent(), /projected profile|bore/i);
  await f.same(refused);
  await f.snapshot('01-bore-overlap-refused');
  await button(f.hud(), 'Cancel').click();
  await f.hud().waitFor({ state: 'hidden' });

  if (circleSource) {
    f.phase = 'refuse the circular profile crossing the outer rim';
    const outside = model({ ...acceptedSketch, center: [9.5, 0] });
    await open('circle-crosses-outer-trim', outside);
    await begin();
    await pickCap('Bottom', [0, 8, originalZ]);
    await status('refused');
    assert.equal(await button(f.hud(), 'Apply').isDisabled(), true);
    assert.match(await f.hud().locator('.hud-error').textContent(), /projected profile|outer/i);
    await f.same(outside);
    await f.snapshot('01b-annular-outer-trim-refused');
    await button(f.hud(), 'Cancel').click();
    await f.hud().waitFor({ state: 'hidden' });
  }

  f.phase = 'pick the exact lower annulus and create a separate solid';
  await open(`${profile}-clears-bore`, source);
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
  const stepBefore = exchange ? await exportStep(authored, originalZ) : undefined;

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
  const stepAfter = exchange ? await exportStep(moved, nextZ) : undefined;
  const saved = await f.save('post-to-annular-face');
  await f.freshOpen(saved.file, moved, '04-reopened-annular-post');
  assert.deepEqual(await inspect('reopened-native-annulus', moved, nextZ), after);
  if (stepBefore && stepAfter) {
    await f.openFeatureEditor(1, 'reopened annular target start');
    await field(f.editor(), 'Start Z').fill(String(originalZ));
    await button(f.editor(), 'Apply').click();
    await f.same(authored);
    await inspect('reopened-target-edited-back', authored, originalZ);
    await f.snapshot('04b-reopened-target-edited-back');
    await reopenStep(stepBefore, originalZ);
    await reopenStep(stepAfter, nextZ);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const lower = process.argv.includes('--lower'), tube = process.argv.includes('--tube');
assert.ok(!tube || !lower);
const cap = lower ? 'n1.bottom' : 'n1.top';
const sign = lower ? -1 : 1, originalHeight = tube ? 16 : 10;
const level = lower ? 0 : originalHeight;
const centre = tube ? [14, 9] : [11, 9], bore = tube ? 4 : 3;
const area = tube ? Math.PI * (12 ** 2 - bore ** 2) : 40 * 30 - Math.PI * bore ** 2;
const pick = tube ? [22, 9] : [24, 20];
const input = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : undefined;
const inputBytes = input && await readFile(input);
const source = inputBytes ? JSON.parse(inputBytes) : {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    tube ? { id: 'n0', kind: 'sketch', profile: 'circle', center: centre, radius: 12 }
      : { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: originalHeight },
    { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, center: centre, radius: bore },
  ],
  outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
};
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/test/offset-bored-cap-browser.mjs',
  'packages/barocss-cad-model/src/app/nativeOffsetFace.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/offsetFaceEdit.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'offset-bored-cap', envFrozen: tube ? 'D1610_SOURCE_FROZEN' : 'BORE_CAP_OFFSET_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Drag one native cap surrounding a straight circular through hole, edit its distance, and reopen it.',
  limits: [tube ? 'One 24 mm OD × 8 mm ID × 16 mm upright coaxial tube with its original top annulus.'
    : 'One 40 × 30 × 10 mm straight plate, one off-centre 6 mm Z bore, one selected top or bottom cap.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, faceGeometry } from '@barocss/cad';
import { partBreps, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), solid = partBreps(doc);
const [{ brep }] = solid;
const evaluated = evaluateDoc(doc, 0);
const faces = brep.faces.map(face => {
  const { id, name, sense, loops, surface } = face;
  return { id, name, sense, loops, geometry: faceGeometry(face), poles: surface.kind === 'surface' ? surface.controlPoints.flat() : [] };
});
const incidence = { faces: faces.map(({ id, name, sense, loops }) => [id, name, sense, loops]),
  vertices: brep.vertices.map(({ id }) => id), edges: brep.edges.map(({ id, name, vertices }) => [id, name, vertices]),
  coedges: brep.coedges.map(({ id, edge, loop, twin, sense, pcurve }) => [id, edge, loop, twin, sense, pcurve]), loops: brep.loops,
  shells: brep.shells, bodies: brep.bodies };
console.log(JSON.stringify({ count: solid.length, check: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
  vertices: brep.vertices, faces, incidence, mesh: evaluated.ok && evaluated.bodies[0].mesh.faces.map(({ name, index }) => [name, index]) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const offset = panel => panel.getByLabel('Offset', { exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, JSON.stringify({ actual, expected }));
const move = (point, distance) => [point[0], point[1], point[2] === level ? level + sign * distance : point[2]];
async function measure(label, doc, d, before) {
  const z = level + sign * d;
  const height = originalHeight + d;
  const centroidXY = tube ? centre : [(1200 * 20 - 9 * Math.PI * 11) / area, (1200 * 15 - 9 * Math.PI * 9) / area];
  const centroid = [...centroidXY, (originalHeight + sign * d) / 2];
  const native = await f.inspect(label, doc);
  assert.equal(native.count, 1);
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  const topology = tube ? { faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 }
    : { faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 };
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, ...topology });
  near(native.mass.volume, area * height, 1e-7);
  native.mass.centroid.forEach((value, i) => near(value, centroid[i]));
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 1);
  near(worker[0].volume, area * height, 1e-7);
  worker[0].centroid.forEach((value, i) => near(value, centroid[i]));
  const cylinders = native.faces.filter(face => face.geometry.kind === 'cylinder');
  assert.deepEqual(cylinders.map(face => face.geometry.out).sort(), tube ? [-1, -1, 1, 1] : [-1, -1]);
  for (const { geometry } of cylinders) {
    near(geometry.r, geometry.out < 0 ? bore : 12);
    near(geometry.c[0], centre[0]); near(geometry.c[1], centre[1]);
    near(Math.abs(geometry.a[2]), 1);
  }
  const moved = native.faces.find(face => face.name === cap);
  assert.equal(moved.loops.length, 2);
  assert.ok(moved.poles.every(point => point[2] === z));
  if (before) {
    assert.deepEqual(native.incidence, before.incidence);
    assert.deepEqual(native.vertices.map(({ id, point }) => [id, point]), before.vertices.map(({ id, point }) => [id, move(point, d)]));
    for (let i = 0; i < native.faces.length; i++) assert.deepEqual(native.faces[i].poles, before.faces[i].poles.map(point => move(point, d)));
  }
  f.report.observations.push({ label, cap, d, z, expectedVolume: area * height, nativeVolume: native.mass.volume,
    studioVolume: worker[0].volume, centroid, maximumEdgeSurfaceGap: native.check.maximumEdgeSurfaceGap });
  return native;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Open the solid and pick the original cap';
  await f.newPage();
  await f.page.setViewportSize({ width: lower ? 1024 : 1440, height: 900 });
  const [file] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await file.setFiles(input ?? { name: tube ? 'coaxial-tube.bcad' : 'bored-plate.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  const original = await measure('source-shape', source, 0);
  if (input) await f.snapshot('mcp-bored-plate-opened');
  let bottomTurnStarted;
  if (lower) {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name: 'Bottom', exact: true }).click();
    bottomTurnStarted = await f.page.evaluate(() => performance.now());
  } else await button('Top', f.page.getByRole('group', { name: 'Views', exact: true })).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (lower) await f.page.waitForFunction(() => window.__studioCamera().pitch < -1.3);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [...pick, level]);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(index => window.__studioSelection.selection.faces.length === 1 &&
    window.__studioSelection.selection.faces[0].face === index, original.mesh.find(([name]) => name === cap)[1]);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await status(panel, 'preview');
  assert.equal(await panel.getByLabel('Mode', { exact: true }).count(), 0);
  assert.match(await panel.innerText(), lower ? /Bottom end.*Outward −Z/s : /Top end.*Outward \+Z/s);

  f.phase = 'Drag the native normal handle and apply the outward move';
  if (bottomTurnStarted !== undefined) {
    // The older cube turn must not reclaim the camera after the Offset face launch.
    await f.page.waitForFunction(start => performance.now() - start >= 300, bottomTurnStarted);
  }
  const translation = await f.page.evaluate(({ pick, level, sign }) => {
    const a = window.__studioScreenOf([...pick, level]), b = window.__studioScreenOf([...pick, level + sign]);
    return [b[0] - a[0], b[1] - a[1]];
  }, { pick, level, sign });
  assert.ok(Math.hypot(...translation) > 8, translation);
  const launchCamera = await f.page.evaluate(() => window.__studioCamera());
  assert.ok(launchCamera.pitch > 0, JSON.stringify(launchCamera));
  const handle = await f.page.locator('g.gizmo-handle[data-handle="d"] polygon').evaluate(polygon => {
    const svg = polygon.closest('svg').getBoundingClientRect(), points = [...polygon.points];
    return [svg.x + points.reduce((sum, p) => sum + p.x, 0) / points.length,
      svg.y + points.reduce((sum, p) => sum + p.y, 0) / points.length];
  });
  await f.page.mouse.move(...handle);
  await f.page.mouse.down();
  await f.page.mouse.move(...handle.map((value, i) => value + translation[i]), { steps: 6 });
  await f.page.mouse.up();
  assert.equal(await offset(panel).inputValue(), '3');
  if (tube) {
    await status(panel, 'preview');
    await f.same(source);
    await f.snapshot('annular-cap-dragged-preview');
  }
  f.report.observations.push({ label: 'offset-handle', cap, pitch: launchCamera.pitch,
    pixelsPerMM: Math.hypot(...translation), startDistance: 2, endDistance: 3 });
  await offset(panel).fill('2');
  await status(panel, 'preview');
  await f.same(source);
  await button('Apply', panel).click();
  await f.changed(source);
  const outward = await f.doc(), node = outward.nodes[3];
  assert.deepEqual(outward.nodes.slice(0, 3), source.nodes);
  assert.equal(node.kind, 'offset-face');
  assert.deepEqual(node.faces, [cap]);
  assert.deepEqual(node.parent, { node: 2, side: 'solid' });
  assert.equal(node.distance, 2);
  assert.ok(node.sigs[cap]);
  await measure('outward-shape', outward, 2, original);
  await f.snapshot('bored-cap-outward');

  f.phase = 'Reject collapsed thickness and apply the inward History edit';
  await f.openFeatureEditor(3, 'bored cap');
  await button('Edit offset', f.editor()).click();
  const edit = hud('Edit Offset face');
  assert.equal(await edit.getByLabel('Mode', { exact: true }).count(), 0);
  assert.equal(await offset(edit).inputValue(), '2');
  await offset(edit).fill(String(-originalHeight));
  await status(edit, 'refused');
  assert.ok(await button('Apply', edit).isDisabled());
  await f.same(outward);
  if (tube) {
    const error = edit.locator('.hud-error');
    const detail = error.locator('details:not([open]) > summary');
    if (await detail.count()) await detail.click();
    assert.match(await error.innerText(), /opposite cap/i);
  }
  await f.snapshot('bored-cap-collapse-refused');
  await offset(edit).fill('-2');
  await status(edit, 'preview');
  await button('Apply', edit).click();
  await f.changed(outward);
  const inward = await f.doc();
  assert.deepEqual(inward.nodes[3], { ...node, distance: -2 });
  await measure('inward-shape', inward, -2, original);
  await f.undo(); await f.same(outward); await f.redo(); await f.same(inward);
  const saved = await f.save(tube ? 'annular-cap-offset' : 'bored-cap-offset');
  await f.freshOpen(saved.file, inward, 'bored-cap-reopened');
  await measure('reopened-shape', inward, -2, original);
  await f.openFeatureEditor(3, 'reopened bored cap');
  await button('Edit offset', f.editor()).click();
  assert.equal(await offset(hud('Edit Offset face')).inputValue(), '-2');
  await button('Cancel', hud('Edit Offset face')).click();
  await f.same(inward);
  if (input) assert.deepEqual(await readFile(input), inputBytes, 'Studio preserves the original MCP file');
});

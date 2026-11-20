import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { capCase, draftedCapOracle, draftedWallVolume, polygonWallCase, polygonWallOracle, REPLACE_FACE_VARIANTS } from './replace-face-cap-fixture.mjs';

const [output, inputFile, agentFile, variant = 'height'] = process.argv.slice(2);
assert.ok(output && inputFile && agentFile && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
assert.ok(REPLACE_FACE_VARIANTS.includes(variant));
const polygonWall = polygonWallCase(variant);
const draftedWall = variant === 'drafted-wall', diagonal = variant === 'diagonal' || draftedWall || !!polygonWall;
const cap = capCase(variant);
const stock = cap?.stock ?? polygonWall?.stock;
const sourceFace = cap?.face ?? 'n1.side1';
const firstFace = diagonal || cap ? 'n3.bottom' : 'n3.side1', nextFace = diagonal || cap ? 'n3.top' : 'n3.side3';
const position = cap?.height ?? polygonWall?.distance ?? ((y, z) => 37 + (diagonal ? y / 10 : 0) + z / 2);
const movedPosition = cap?.movedHeight ?? polygonWall?.movedDistance ?? ((y, z) => position(y, z) + 2);
const retargetedPosition = cap?.retargetedHeight ?? polygonWall?.retargetedDistance ??
  (diagonal ? (y, z) => movedPosition(y, z) - 3 * Math.sqrt(126) / 10 : (_y, z) => 30 + 4 * z / 10);
// Centre of the 8 × 8 mm reference face in the authored plane.
const diagonalPick = [48 + 4 * (1 / Math.sqrt(101) - 50 / Math.sqrt(126 * 101)),
  60 + 4 * (10 / Math.sqrt(101) + 5 / Math.sqrt(126 * 101)), 10 - 404 / Math.sqrt(126 * 101)];
const oppositePick = diagonalPick.map((value, axis) => value + 3 * [-10, 1, 5][axis] / Math.sqrt(126) + (axis === 0 ? 2 : 0));
const originalBytes = await readFile(inputFile), source = JSON.parse(originalBytes);
const agentDoc = JSON.parse(await readFile(agentFile));
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/commandReferencePicking.ts', 'apps/cad-studio/src/files/documentFile.ts',
  'apps/cad-studio/test/replace-face-cap-fixture.mjs',
  'packages/barocss-cad-model/src/app/replaceFaceCommand.ts', 'packages/barocss-cad-model/src/engine/offsetPlane.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad/src/features/drafted-cap-offset.ts', 'packages/barocss-cad/src/features/prism-wall-offset.ts',
  'packages/barocss-cad/src/part/part-expect.ts',
];
const f = await createFlow({
  name: 'replace-face', envFrozen: 'REPLACE_FACE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Replace an exact planar extrusion face with a tilted support in desktop Studio.',
  limits: [polygonWall ? `One convex ${stock.points.length}-sided prism and two tilted reference faces for its oblique wall.` :
    cap?.stock ? `One convex ${stock.points.length}-sided prism and two tilted reference faces for its cap.` :
    cap ? `One 40 × 30 × 10 mm extrusion and two tilted reference faces for its ${variant} cap.` : draftedWall
    ? 'One 1:10 drafted rectangular extrusion and a separate tilted prism.'
    : diagonal
    ? 'One 40 × 30 × 10 mm box and two faces of a disconnected prism tilted along Y and Z.'
    : 'One 40 × 30 × 10 mm box, one disconnected prismatic donor, two planes tilted along Z.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
  supports: Object.fromEntries(brep.faces.map(face => {
    const g = faceGeometry(face);
    return [face.name, g.kind === 'plane' ? [g.n, g.n.reduce((sum, value, i) => sum + value * g.o[i], 0)] : [g.kind]];
  })),
}))));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (scope, state) => scope.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const shape = (items, key) => items.find(item => item.key === key);
const incidence = ({ vertices, edges, coedges, loops, faces, shells, bodies }) => [
  vertices.map(v => v.id), edges.map(e => [e.id, e.name, e.vertices, e.curve.id]),
  coedges.map(c => [c.id, c.edge, c.loop, c.twin, c.prev, c.next, c.pcurve?.id]), loops,
  faces.map(face => [face.id, face.name, face.shell, face.loops, face.surface.id]), shells, bodies,
];

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}
async function view(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.waitForFunction(label => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === label;
  }, name.toUpperCase());
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function point(world) {
  const pixel = await f.page.evaluate(p => {
    const screen = window.__studioScreenOf(p);
    return screen && document.elementFromPoint(...screen)?.matches('canvas.vp-canvas') ? screen : null;
  }, world);
  assert.ok(pixel, JSON.stringify(world));
  await f.page.mouse.click(...pixel);
}

async function measure(label, doc, original, positionAt, donor) {
  const native = await f.inspect(label, doc), box = shape(native, 'b5'), reference = shape(native, 'b4');
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 2);
  assert.ok(box.report.valid, box.report.issues.join('\n'));
  assert.ok(reference.report.valid, reference.report.issues.join('\n'));
  assert.ok(box.report.maximumEdgeSurfaceGap < 1e-9);
  assert.ok(box.report.maximumPcurveGap < 1e-9);
  const sides = stock?.points.length ?? 4;
  assert.deepEqual(box.report.counts, { bodies: 1, shells: 1, faces: sides + 2, loops: sides + 2,
    coedges: sides * 6, edges: sides * 3, vertices: sides * 2 });
  assert.deepEqual(incidence(box.brep), incidence(original.brep));
  if (donor) assert.deepEqual(reference.brep, donor.brep);
  for (const [name, [n, offset]] of Object.entries(original.supports)) {
    if (name === sourceFace) continue;
    const [now, support] = box.supports[name];
    n.forEach((value, axis) => near(now[axis], value));
    near(support, offset);
  }
  const tapered = cap?.drafted ? draftedCapOracle(cap, positionAt) : undefined;
  const wallMeasure = polygonWall ? polygonWallOracle(positionAt, polygonWall.section) : undefined;
  for (const vertex of original.brep.vertices) {
    const [x, y, z] = vertex.point, next = box.brep.vertices.find(v => v.id === vertex.id);
    const movedWall = draftedWall ? x > 20 : x === 40;
    let expected = cap ? [x, y, z === cap.station ? positionAt(x, y) : z] : [movedWall ? positionAt(y, z) : x, y, z];
    if (tapered && z === cap.station) {
      const index = y < 15 ? (x < 20 ? 0 : 1) : (x < 20 ? 3 : 2);
      expected = tapered.moving[index];
    }
    if (polygonWall) {
      const index = stock.points.findIndex(([u, v]) => x === u && y === v);
      expected = [...polygonWall.section(positionAt(0, z))[index], z];
    }
    expected.forEach((value, axis) => near(next.point[axis], value));
  }
  // For straight stock, the mean affine thickness is its value at the footprint centroid.
  const volume = wallMeasure?.volume ?? (draftedWall ? draftedWallVolume(positionAt) :
    tapered?.volume ?? (cap?.stock ? stock.area * Math.abs(positionAt(...stock.center) - cap.opposite) :
      cap ? 40 * 30 * Math.abs(positionAt(20, 15) - cap.opposite) : 30 * 10 * positionAt(15, 5)));
  near(box.mass.volume, volume);
  const workerVolume = shape(worker, 'b5').volume;
  near(workerVolume, volume);
  near(reference.mass.volume, diagonal || cap ? 192 : 950);
  if ((diagonal || cap) && positionAt === position) {
    const centroid = wallMeasure?.centroid ?? (draftedWall ? [29251159 / 1408600, 1068659 / 70430, 35390 / 7043] :
      tapered?.centroid ?? cap?.centroid ?? [10103 / 492, 1245 / 82, 1255 / 246]);
    centroid.forEach((value, axis) => near(box.mass.centroid[axis], value));
  }
  const corners = cap?.stock ? stock.points : cap ? [[0, 0], [40, 0], [0, 30], [40, 30]] :
    [[0, 0], [30, 0], [draftedWall ? 1 : 0, 10], [draftedWall ? 29 : 30, 10]];
  const coordinates = polygonWall ? [0, 10].flatMap(z => polygonWall.section(positionAt(0, z)).slice(1, 3).map(point => [...point, z])) :
    tapered?.moving.map(point => point[2]) ?? corners.map(([u, v]) => positionAt(u, v));
  f.report.observations.push({ label, axis: polygonWall ? 'xy' : cap ? 'z' : 'x', coordinates, volume, nativeVolume: box.mass.volume, workerVolume,
    maximumEdgeSurfaceGap: box.report.maximumEdgeSurfaceGap });
  return reference;
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
  f.phase = 'Open the exact MCP source and pick the stock face';
  await f.newPage();
  await open(inputFile);
  await f.same(source);
  const native = await f.inspect('source', source), original = shape(native, 'b1'), donor = shape(native, 'b4');
  near(original.mass.volume, stock ? stock.area * 10 : cap?.drafted || draftedWall ? 11300 + 40 / 3 : 12000);
  await view(cap?.name ?? 'Right');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 4 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await point(polygonWall ? polygonWall.wallPick : cap?.stock ? [...stock.center, cap.station] :
    cap ? [20, 15, cap.station] : [draftedWall ? 39.5 : 40, 15, 5]);
  await f.page.getByText(new RegExp('Properties and face colour: .*' + sourceFace.replace('.', '\\.'))).waitFor();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Replace face');
  const dialog = hud('Replace face');
  await dialog.getByText('Pick a tilted face on another solid.', { exact: true }).waitFor();
  assert.ok(await button('Apply', dialog).isDisabled());

  if (!diagonal && !cap) {
    f.phase = 'Refuse a horizontal plane';
    await view('Top');
    await point([37, 65, 10]);
    await status(dialog, 'refused');
    assert.match(await dialog.locator('.hud-error').innerText(), /smaller angle to the selected face/i);
    assert.ok(await button('Apply', dialog).isDisabled());
    await f.same(source);
    await f.snapshot('replace-horizontal-refused');
    await view('Right');
  }
  f.phase = 'Accept the tilted donor';
  if (cap) await view(cap.oppositeName);
  await point(cap?.referencePick ?? polygonWall?.referencePick ?? (diagonal ? diagonalPick : [39.5, 65, 5]));
  await status(dialog, 'preview');
  await dialog.getByText(firstFace, { exact: false }).waitFor();
  await f.snapshot('replace-tilted-preview');
  await button('Apply', dialog).click();
  await f.changed(source);
  const first = await f.doc(), bound = first.nodes[5];
  assert.deepEqual(first, agentDoc);
  assert.equal(bound.kind, 'replace-face');
  await measure('applied', first, original, position, donor);

  f.phase = 'Move the donor and retarget the saved replacement';
  await f.openFeatureEditor(4, 'reference position');
  await f.editor().getByLabel(cap ? 'ΔZ' : 'ΔX', { exact: true }).fill(String(cap?.moved ?? 2));
  await f.applyEditor(first, 'reference-moved');
  const moved = await f.doc();
  assert.deepEqual(moved.nodes[5], bound);
  const movedDonor = await measure('donor-moved', moved, original, movedPosition);
  await f.openFeatureEditor(5, 'reference-bound Replace face');
  await button('Edit Replace face', f.editor()).click();
  const history = hud('Edit Replace face');
  await history.getByText(firstFace, { exact: false }).waitFor();
  await view(cap?.name ?? 'Left');
  await point(cap?.otherPick ?? polygonWall?.otherPick ?? (diagonal ? oppositePick : [32, 65, 5]));
  await status(history, 'preview');
  await history.getByText(nextFace, { exact: false }).waitFor();
  await button('Apply', history).click();
  await f.changed(moved);
  const retargeted = await f.doc();
  assert.equal(retargeted.nodes[5].id, bound.id);
  assert.equal(retargeted.nodes[5].target.face, nextFace);
  await measure('retargeted', retargeted, original, retargetedPosition, movedDonor);
  await f.undo(); await f.same(moved);
  await f.redo(); await f.same(retargeted);
  const saved = await f.save('retargeted-wall');
  await f.freshOpen(saved.file, retargeted, 'replacement-reopened');
  await measure('reopened', retargeted, original, retargetedPosition, movedDonor);
  await f.freshOpen(agentFile, agentDoc, 'replacement-mcp-opened');
  await measure('agent-file', agentDoc, original, position, donor);

  f.phase = 'Refuse a saved replacement which collapses at the opposite face';
  const stale = structuredClone(first);
  stale.nodes[4].offset[cap ? 2 : 0] = polygonWall?.collapse ?? cap?.collapse ?? -37;
  await open({ name: 'collapsed-wall.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
  await f.waitToast(polygonWall ? /collapse or cross a wall of the polygon section.*Your part is unchanged/i :
    /reach or cross the opposite (?:wall|cap).*Your part is unchanged/i);
  await f.same(agentDoc);
  await f.snapshot('replacement-collapse-refused');
  assert.deepEqual(await readFile(inputFile), originalBytes);
});

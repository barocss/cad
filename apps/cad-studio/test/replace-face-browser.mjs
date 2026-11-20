import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const [output, inputFile, agentFile] = process.argv.slice(2);
assert.ok(output && inputFile && agentFile && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const originalBytes = await readFile(inputFile), source = JSON.parse(originalBytes);
const agentDoc = JSON.parse(await readFile(agentFile));
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/commandReferencePicking.ts', 'apps/cad-studio/src/files/documentFile.ts',
  'packages/barocss-cad-model/src/app/replaceFaceCommand.ts', 'packages/barocss-cad-model/src/engine/offsetPlane.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad/src/features/drafted-cap-offset.ts',
];
const f = await createFlow({
  name: 'replace-face', envFrozen: 'REPLACE_FACE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Replace a cardinal box wall with a tilted exact support in desktop Studio.',
  limits: ['One 40 × 30 × 10 mm box, one disconnected prismatic donor, two planes tilted along Z.'],
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

async function measure(label, doc, original, bottomX, topX, donor) {
  const native = await f.inspect(label, doc), box = shape(native, 'b5'), reference = shape(native, 'b4');
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 2);
  assert.ok(box.report.valid, box.report.issues.join('\n'));
  assert.ok(reference.report.valid, reference.report.issues.join('\n'));
  assert.deepEqual(box.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.deepEqual(incidence(box.brep), incidence(original.brep));
  if (donor) assert.deepEqual(reference.brep, donor.brep);
  for (const [name, [n, offset]] of Object.entries(original.supports)) {
    if (name === 'n1.side1') continue;
    const [now, support] = box.supports[name];
    n.forEach((value, axis) => near(now[axis], value));
    near(support, offset);
  }
  for (const vertex of original.brep.vertices) {
    const [x, y, z] = vertex.point, next = box.brep.vertices.find(v => v.id === vertex.id);
    const expected = [x === 40 ? z === 0 ? bottomX : topX : x, y, z];
    expected.forEach((value, axis) => near(next.point[axis], value));
  }
  const volume = 30 * 10 * (bottomX + topX) / 2;
  near(box.mass.volume, volume);
  const workerVolume = shape(worker, 'b5').volume;
  near(workerVolume, volume);
  near(reference.mass.volume, 950);
  f.report.observations.push({ label, bottomX, topX, volume, nativeVolume: box.mass.volume, workerVolume,
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
  f.phase = 'Open the exact MCP source and pick its X-max wall';
  await f.newPage();
  await open(inputFile);
  await f.same(source);
  const native = await f.inspect('source', source), original = shape(native, 'b1'), donor = shape(native, 'b4');
  near(original.mass.volume, 12000);
  await view('Right');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 4 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await point([40, 15, 5]);
  await f.page.getByText(/Properties and face colour: .*n1\.side1/).waitFor();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Replace face');
  const dialog = hud('Replace face');
  await dialog.getByText('Pick a face on another solid tilted along the height.', { exact: true }).waitFor();
  assert.ok(await button('Apply', dialog).isDisabled());

  f.phase = 'Refuse a horizontal plane and accept the tilted XZ donor';
  await view('Top');
  await point([37, 65, 10]);
  await status(dialog, 'refused');
  assert.match(await dialog.locator('.hud-error').innerText(), /tilts only along the height/i);
  assert.ok(await button('Apply', dialog).isDisabled());
  await f.same(source);
  await f.snapshot('replace-horizontal-refused');
  await view('Right');
  await point([39.5, 65, 5]);
  await status(dialog, 'preview');
  await dialog.getByText(/n3\.side1/).waitFor();
  await f.snapshot('replace-tilted-preview');
  await button('Apply', dialog).click();
  await f.changed(source);
  const first = await f.doc(), bound = first.nodes[5];
  assert.deepEqual(first, agentDoc);
  assert.equal(bound.kind, 'replace-face');
  await measure('applied', first, original, 37, 42, donor);

  f.phase = 'Move the donor and retarget the saved replacement';
  await f.openFeatureEditor(4, 'reference position');
  await f.editor().getByLabel('ΔX', { exact: true }).fill('2');
  await f.applyEditor(first, 'reference-moved');
  const moved = await f.doc();
  assert.deepEqual(moved.nodes[5], bound);
  const movedDonor = await measure('donor-moved', moved, original, 39, 44);
  await f.openFeatureEditor(5, 'reference-bound Replace face');
  await button('Edit Replace face', f.editor()).click();
  const history = hud('Edit Replace face');
  await history.getByText(/n3\.side1/).waitFor();
  await view('Left');
  await point([32, 65, 5]);
  await status(history, 'preview');
  await history.getByText(/n3\.side3/).waitFor();
  await button('Apply', history).click();
  await f.changed(moved);
  const retargeted = await f.doc();
  assert.equal(retargeted.nodes[5].id, bound.id);
  assert.equal(retargeted.nodes[5].target.face, 'n3.side3');
  await measure('retargeted', retargeted, original, 30, 34, movedDonor);
  await f.undo(); await f.same(moved);
  await f.redo(); await f.same(retargeted);
  const saved = await f.save('retargeted-wall');
  await f.freshOpen(saved.file, retargeted, 'replacement-reopened');
  await measure('reopened', retargeted, original, 30, 34, movedDonor);
  await f.freshOpen(agentFile, agentDoc, 'replacement-mcp-opened');
  await measure('agent-file', agentDoc, original, 37, 42, donor);

  f.phase = 'Refuse a saved replacement which collapses at just one end';
  const stale = structuredClone(first);
  stale.nodes[4].offset[0] = -37;
  await open({ name: 'collapsed-wall.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
  await f.waitToast(/reach or cross the opposite wall.*Your part is unchanged/i);
  await f.same(agentDoc);
  await f.snapshot('replacement-collapse-refused');
  assert.deepEqual(await readFile(inputFile), originalBytes);
});

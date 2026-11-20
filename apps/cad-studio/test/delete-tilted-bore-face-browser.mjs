import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input, side] = process.argv.slice(2), app = resolve(import.meta.dirname, '..');
assert.ok(output && input && ['upper', 'lower'].includes(side) &&
  isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
const bytes = await readFile(input), source = JSON.parse(bytes), edit = source.nodes.length;
const selectedFace = 'n2.side0', originalBody = 'b6', donor = 'b5', editedBody = 'b7';
const originalVolume = 15600 - 98.1 * Math.PI, finalVolume = 15600;
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/files/documentFile.ts', 'apps/cad-studio/src/state/commandApply.ts',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts', 'packages/barocss-cad/src/brep/cylindrical-bore.ts',
];
const f = await createFlow({
  name: 'delete-tilted-bore-face', envFrozen: 'DELETE_TILTED_BORE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Heal a through bore after a tilted cap replacement and retain both the exact cap plane and its reference.',
  limits: ['One rectangular plate with a single 6 mm bore and an exact planar replacement on either end.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
}))));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (value, wanted) => assert.ok(Math.abs(value - wanted) < 1e-6, `${value} != ${wanted}`);
const body = (items, key) => items.find(item => item.key === key);

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

async function measure(label, doc, before) {
  const native = await f.inspect(label, doc), model = (await f.bodies()).bodies;
  const key = before ? editedBody : originalBody, expected = before ? finalVolume : originalVolume;
  assert.equal(native.length, 2);
  assert.equal(model.length, 2);
  const plate = body(native, key);
  assert.ok(plate.report.valid, plate.report.issues.join('\n'));
  near(plate.mass.volume, expected);
  near(body(model, key).volume, expected);
  assert.equal(plate.report.topology[0].genus, before ? 0 : 1);
  assert.ok(plate.report.maximumEdgeSurfaceGap < 1e-9 && plate.report.maximumPcurveGap < 1e-9);
  if (before) {
    assert.deepEqual(body(native, donor).brep, body(before, donor).brep);
    assert.deepEqual(plate.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    const original = body(before, originalBody).brep;
    const walls = original.faces.filter(face => face.name.startsWith(selectedFace + '#'));
    assert.equal(walls.length, 2);
    assert.deepEqual(plate.brep.faces.map(face => face.id), original.faces.filter(face => !walls.includes(face)).map(face => face.id));
    for (const face of plate.brep.faces) {
      const fixed = original.faces.find(candidate => candidate.id === face.id);
      assert.deepEqual(face, { ...fixed, loops: [fixed.loops[0]] });
    }
    for (const kind of ['loops', 'coedges', 'edges', 'vertices']) {
      for (const item of plate.brep[kind]) assert.deepEqual(item, original[kind].find(candidate => candidate.id === item.id));
    }
    const centroid = [820 / 39, 210 / 13, side === 'upper' ? 20 / 3 : 10 / 3];
    plate.mass.centroid.forEach((value, i) => near(value, centroid[i]));
  }
  f.report.observations.push({ label, expected, nativeVolume: plate.mass.volume, workerVolume: body(model, key).volume,
    centroid: plate.mass.centroid, maximumEdgeSurfaceGap: plate.report.maximumEdgeSurfaceGap, maximumPcurveGap: plate.report.maximumPcurveGap });
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
  f.phase = 'Heal the exact tilted stock through stdio MCP';
  const file = join(output, 'mcp-healed.bcad');
  await copyFile(input, file);
  const agent = await withMcpSession({ app, output, clientName: 'cad-tilted-bore-heal', autonomy: 3 }, file, 'heal-tilted', async call => {
    const faces = [selectedFace], pin = await call('query', { action: 'render', highlight: faces });
    const command = { action: 'command', command: 'delete-face', faces, expectedRevision: pin.revision };
    await call('features', command);
    const accepted = await readFile(file), summary = await call('query', { action: 'summary' });
    near(body(summary.bodies, editedBody).volume, finalVolume);
    near(body(summary.bodies, donor).volume, 192);
    const stale = await call('features', command, true);
    assert.equal(stale.code, 'COMMAND_STALE');
    assert.deepEqual(await readFile(file), accepted);
    f.report.observations.push({ revision: pin.revision, stale: stale.code });
    return JSON.parse(accepted);
  });

  await f.freshOpen(input, source, 'tilted-plate-opened');
  const original = await measure('source', source);
  f.phase = 'Select the native cylindrical wall and apply Delete face';
  const filter = button('Selection filter');
  await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const label = f.page.getByLabel('Face property and colour target');
  const heights = side === 'upper' ? [10.3, 9.7, 10.6, 10.8, 9.25, 8.5] : [9.25, 8.5, 9.6, 9.9, 8];
  for (const z of heights) {
    const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [11, 9, z]);
    assert.ok(pixel?.length === 2);
    await f.page.mouse.click(...pixel);
    await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    if (await label.count() && (await label.innerText()).includes(selectedFace)) break;
  }
  assert.ok((await label.innerText()).includes(selectedFace));
  await f.command('Delete face');
  const dialog = f.page.getByRole('dialog', { name: 'Delete face', exact: true });
  const apply = button('Apply', dialog);
  await apply.waitFor();
  await f.snapshot('tilted-heal-preview');
  await apply.click();
  await f.changed(source);
  const healed = await f.doc(), node = healed.nodes[edit];
  assert.deepEqual(healed, agent);
  assert.equal(node.kind, 'delete-face');
  assert.deepEqual(node.parent, { node: edit - 1, side: 'solid' });
  assert.ok(node.faces[0].startsWith(selectedFace + '#'));
  assert.deepEqual(healed.nodes.slice(0, edit), source.nodes);
  await measure('healed', healed, original);
  await f.undo(); await f.same(source);
  await f.redo(); await f.same(healed);
  const saved = await f.save('healed-tilted-plate');
  await f.freshOpen(saved.file, healed, 'healed-tilted-reopened');
  await measure('reopened', healed, original);
  await f.freshOpen(file, agent, 'healed-mcp-reopened');
  f.phase = 'Refuse a moved native wall signature on Open';
  const stale = structuredClone(healed);
  stale.nodes[edit].sigs[node.faces[0]].r = 30;
  await open({ name: 'stale-tilted-heal.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
  await f.waitToast(/part is unchanged/i);
  await f.same(healed);
  await f.snapshot('stale-signature-refused');
  assert.deepEqual(await readFile(input), bytes);
});

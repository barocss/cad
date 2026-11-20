import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';
import { boredCapOracle, capCase } from './replace-face-cap-fixture.mjs';

const [output, input, side, selection = 'single', mode] = process.argv.slice(2), app = resolve(import.meta.dirname, '..');
assert.ok(output && input && ['upper', 'lower'].includes(side) &&
  isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
assert.ok(['single', 'first', 'second'].includes(selection));
assert.ok(mode === undefined || (mode === 'successive' && selection !== 'single'));
const bytes = await readFile(input), source = JSON.parse(bytes), edit = source.nodes.length;
const replacement = source.nodes.at(-1);
assert.equal(replacement.kind, 'replace-face');
const cap = capCase((selection === 'single' ? 'bored-' : 'two-bore-') + side), removedIndex = selection === 'second' ? 1 : 0;
const order = mode === 'successive' ? [removedIndex, 1 - removedIndex] : [removedIndex];
const steps = order.map((index, position) => {
  const remaining = cap.bores.filter((_, i) => !order.slice(0, position + 1).includes(i));
  return {
    face: 'n' + (index + 2) + '.side0', bore: cap.bores[index], remaining,
    before: 'b' + (edit + position - 1), after: 'b' + (edit + position),
    expected: boredCapOracle({ ...cap, bores: remaining }, cap.height),
  };
});
const originalBody = 'b' + (edit - 1), donor = 'b' + replacement.target.body.node;
const originalVolume = boredCapOracle(cap, cap.height).volume;
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/files/documentFile.ts', 'apps/cad-studio/src/state/commandApply.ts',
  'apps/cad-studio/test/replace-face-cap-fixture.mjs',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts', 'packages/barocss-cad/src/brep/cylindrical-bore.ts',
];
const f = await createFlow({
  name: 'delete-tilted-bore-face', envFrozen: 'DELETE_TILTED_BORE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Heal a through bore after a tilted cap replacement and retain both the exact cap plane and its reference.',
  limits: [`One rectangular plate with ${cap.bores.length} through bore(s) and an exact planar replacement on either end.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, createCylindricalBoreCheck, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const walls = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
  return { key, brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
    diameter: createCylindricalBoreCheck(brep)(walls) };
})));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (value, wanted) => assert.ok(Math.abs(value - wanted) < 1e-6, `${value} != ${wanted}`);
const body = (items, key) => items.find(item => item.key === key);

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

async function measure(label, doc, before, step) {
  const native = await f.inspect(label, doc), model = (await f.bodies()).bodies;
  const key = step?.after ?? originalBody, expected = step?.expected.volume ?? originalVolume;
  assert.equal(native.length, 2);
  assert.equal(model.length, 2);
  const plate = body(native, key);
  assert.ok(plate.report.valid, plate.report.issues.join('\n'));
  near(plate.mass.volume, expected);
  near(body(model, key).volume, expected);
  assert.equal(plate.report.topology[0].genus, step?.remaining.length ?? cap.bores.length);
  assert.ok(plate.report.maximumEdgeSurfaceGap < 1e-9 && plate.report.maximumPcurveGap < 1e-9);
  if (before) {
    assert.deepEqual(body(native, donor).brep, body(before, donor).brep);
    assert.deepEqual(plate.report.counts, step.remaining.length ?
      { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 } :
      { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    if (step.remaining.length) near(plate.diameter, 2 * step.remaining[0].radius);
    const original = body(before, step.before).brep;
    const walls = original.faces.filter(face => face.name.startsWith(step.face + '#'));
    assert.equal(walls.length, 2);
    assert.deepEqual(plate.brep.faces.map(face => face.id), original.faces.filter(face => !walls.includes(face)).map(face => face.id));
    const keptLoops = new Set(plate.brep.loops.map(loop => loop.id));
    for (const face of plate.brep.faces) {
      const fixed = original.faces.find(candidate => candidate.id === face.id);
      assert.deepEqual(face, { ...fixed, loops: fixed.loops.filter(id => keptLoops.has(id)) });
    }
    for (const kind of ['loops', 'coedges', 'edges', 'vertices']) {
      for (const item of plate.brep[kind]) assert.deepEqual(item, original[kind].find(candidate => candidate.id === item.id));
    }
    plate.mass.centroid.forEach((value, i) => near(value, step.expected.centroid[i]));
  }
  f.report.observations.push({ label, expected, nativeVolume: plate.mass.volume, workerVolume: body(model, key).volume,
    centroid: plate.mass.centroid, diameter: plate.diameter, maximumEdgeSurfaceGap: plate.report.maximumEdgeSurfaceGap,
    maximumPcurveGap: plate.report.maximumPcurveGap });
  return native;
}

async function healInStudio(step, previous, preview) {
  f.phase = 'Select ' + step.face + ' and apply Delete face';
  const filter = button('Selection filter');
  if (!(await filter.innerText()).includes('Faces')) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const label = f.page.getByLabel('Face property and colour target');
  const station = side === 'upper' ? cap.height(...step.bore.center) : 10;
  const heights = [0.6, 1.2, 0.3, 0.1, 1.65, 2.4].map(depth => station - depth);
  for (const z of heights) {
    const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [...step.bore.center, z]);
    assert.ok(pixel?.length === 2);
    await f.page.mouse.click(...pixel);
    await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    if (await label.count() && (await label.innerText()).includes(step.face)) break;
  }
  assert.ok((await label.innerText()).includes(step.face));
  await f.command('Delete face');
  const dialog = f.page.getByRole('dialog', { name: 'Delete face', exact: true });
  const apply = button('Apply', dialog);
  await apply.waitFor();
  await f.snapshot(preview);
  await apply.click();
  await f.changed(previous);
  return f.doc();
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
    const documents = [];
    for (const step of steps) {
      const faces = [step.face], pin = await call('query', { action: 'render', highlight: faces });
      const command = { action: 'command', command: 'delete-face', faces, expectedRevision: pin.revision };
      await call('features', command);
      const accepted = await readFile(file), summary = await call('query', { action: 'summary' });
      assert.ok(Math.abs(body(summary.bodies, step.after).volume - step.expected.volume) <= 5e-4);
      near(body(summary.bodies, donor).volume, 192);
      const stale = await call('features', command, true);
      assert.equal(stale.code, 'COMMAND_STALE');
      assert.deepEqual(await readFile(file), accepted);
      f.report.observations.push({ face: step.face, revision: pin.revision, stale: stale.code });
      documents.push(JSON.parse(accepted));
    }
    return documents;
  });

  await f.freshOpen(input, source, 'tilted-plate-opened');
  const documents = [source], native = [await measure('source', source)];
  for (const [index, step] of steps.entries()) {
    const previous = documents[index];
    const healed = await healInStudio(step, previous, index === 0 ? 'tilted-heal-preview' : 'tilted-second-heal-preview');
    const node = healed.nodes[edit + index];
    assert.deepEqual(healed, agent[index]);
    assert.equal(node.kind, 'delete-face');
    assert.deepEqual(node.parent, { node: edit + index - 1, side: 'solid' });
    assert.ok(node.faces[0].startsWith(step.face + '#'));
    assert.deepEqual(healed.nodes.slice(0, edit + index), previous.nodes);
    native.push(await measure(index === 0 ? 'healed' : 'healed-second', healed, native[index], step));
    documents.push(healed);
  }
  for (let i = documents.length - 2; i >= 0; i--) {
    await f.undo();
    await f.same(documents[i]);
    if (i === 1) await f.snapshot('tilted-undo-second-heal');
  }
  for (const document of documents.slice(1)) {
    await f.redo();
    await f.same(document);
  }
  const healed = documents.at(-1), node = healed.nodes.at(-1);
  const saved = await f.save('healed-tilted-plate');
  await f.freshOpen(saved.file, healed, 'healed-tilted-reopened');
  await measure('reopened', healed, native.at(-2), steps.at(-1));
  await f.freshOpen(file, agent.at(-1), 'healed-mcp-reopened');
  f.phase = 'Refuse a moved native wall signature on Open';
  const stale = structuredClone(healed);
  stale.nodes.at(-1).sigs[node.faces[0]].r = 30;
  await open({ name: 'stale-tilted-heal.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
  await f.waitToast(/part is unchanged/i);
  await f.same(healed);
  await f.snapshot('stale-signature-refused');
  assert.deepEqual(await readFile(input), bytes);
});

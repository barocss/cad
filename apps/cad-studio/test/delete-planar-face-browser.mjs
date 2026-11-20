import assert from 'node:assert/strict';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input, kind] = process.argv.slice(2), app = resolve(import.meta.dirname, '..');
assert.ok(output && input && isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
assert.ok(['boss', 'chamfer', 'chamfer-top', 'chamfer-bottom', 'double-sw', 'double-ne'].includes(kind));
const sourceBytes = await readFile(input), source = JSON.parse(sourceBytes);
const boss = kind === 'boss', double = kind === 'double-sw' || kind === 'double-ne', north = kind === 'double-ne';
const picked = north ? 1 : 0, bevelNames = ['n2.face#1', 'n2.face#2'];
const selectedFace = boss ? 'n3.top' : double ? bevelNames[picked] : 'n2.face';
const peer = double ? bevelNames[1 - picked] : undefined, unrelated = boss ? 'n1.top' : north ? 'n1.side2' : 'n1.side0';
const horizontal = kind === 'chamfer-top' || kind === 'chamfer-bottom', upper = kind === 'chamfer-top';
const view = boss ? 'Top' : north ? 'Back' : 'Front', stockVolume = 12000, healedVolume = double ? 11980 : stockVolume;
const sourceVolume = boss ? stockVolume + 54 * Math.PI : double ? 11960 : horizontal ? 11920 : 11980;
const bevelPick = north ? [39, 29, 5] : horizontal ? [20, 1, upper ? 9 : 1] : [1, 1, 5];
const reason = boss ? /cylindrical boss top/i : /box chamfer/i;
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/SelectionInspector.tsx',
  'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/test/delete-planar-face-browser.mjs',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad-model/src/chat/names.ts', 'packages/barocss-cad-model/src/chat/views.ts',
  'packages/barocss-cad-model/src/chat/toolKit.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts', 'packages/barocss-cad/src/features/heal-prismatic-chamfer.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'delete-planar-face', envFrozen: 'DELETE_PLANAR_FACE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: `Heal the stock by deleting the original planar face of the ${kind}.`,
  limits: [boss ? 'One cylindrical boss fully within the top of a straight rectangular plate.'
    : double ? 'Two separate full-height chamfers at opposite corners of one rectangular box.' : 'One constant full-span box chamfer.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), [{ brep }] = partBreps(doc);
const supports = Object.fromEntries(brep.faces.map(face => {
  const plane = faceGeometry(face);
  return [face.name, plane.kind === 'plane' ? [plane.n, plane.n.reduce((sum, n, k) => sum + n * plane.o[k], 0)] : plane];
}));
console.log(JSON.stringify({ brep, supports, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (value, wanted) => assert.ok(Math.abs(value - wanted) < 1e-7, `${value} != ${wanted}`);

async function inspect(label, doc, expected, before) {
  const native = await f.inspect(label, doc), worker = (await f.bodies()).bodies;
  assert.equal(native.report.valid, true, native.report.issues.join(', '));
  assert.equal(native.report.topology[0].genus, 0);
  assert.ok(native.report.maximumPcurveGap < 1e-9 && native.report.maximumEdgeSurfaceGap < 1e-9);
  assert.equal(worker.length, 1);
  near(worker[0].volume, expected);
  near(native.mass.volume, expected);
  if (before) {
    assert.deepEqual(native.report.counts, double ? { bodies: 1, shells: 1, faces: 7, loops: 7, coedges: 30, edges: 15, vertices: 10 }
      : { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    const cutCentre = north ? [2 / 3, 2 / 3, 5] : [40 - 2 / 3, 30 - 2 / 3, 5];
    const centroid = double ? [20, 15, 5].map((value, k) => (value * stockVolume - 20 * cutCentre[k]) / healedVolume) : [20, 15, 5];
    native.mass.centroid.forEach((value, k) => near(value, centroid[k]));
    const names = ['n1.bottom', 'n1.side0', 'n1.side1', 'n1.side2', 'n1.side3', 'n1.top'];
    if (peer) names.push(peer);
    assert.deepEqual(native.brep.faces.map(face => face.name).sort(), names);
    if (boss) assertBossSurvivors(native.brep, before.brep);
    else assertChamferSurvivors(native, before);
  }
  f.report.observations.push({ label, volume: native.mass.volume, workerVolume: worker[0].volume, counts: native.report.counts });
  return native;
}

function assertBossSurvivors(healed, before) {
  const retainedLoops = new Set(healed.loops.map(loop => loop.id));
  for (const face of healed.faces) {
    const original = before.faces.find(item => item.id === face.id);
    assert.deepEqual(face, { ...original, loops: original.loops.filter(id => retainedLoops.has(id)) });
  }
  for (const key of ['coedges', 'edges', 'loops', 'vertices']) {
    for (const item of healed[key]) assert.deepEqual(item, before[key].find(candidate => candidate.id === item.id));
  }
}

function assertChamferSurvivors(healed, before) {
  for (const face of healed.brep.faces) {
    const original = before.brep.faces.find(item => item.name === face.name);
    assert.equal(face.id, original.id);
    const [normal, station] = healed.supports[face.name], [oldNormal, oldStation] = before.supports[face.name];
    normal.forEach((value, k) => near(value, oldNormal[k]));
    near(station, oldStation);
  }
  const edge = healed.brep.edges.find(item => item.name === source.nodes.at(-1).edges[picked]);
  assert.ok(edge);
  const axis = horizontal ? 0 : 2, z = upper ? 10 : 0;
  const ends = horizontal ? [[0, 0, z], [40, 0, z]] : north ? [[40, 30, 0], [40, 30, 10]] : [[0, 0, 0], [0, 0, 10]];
  assert.equal(edge.curve.controlPoints.length, 2);
  edge.curve.controlPoints.toSorted((a, b) => a[axis] - b[axis]).forEach((point, i) =>
    point.forEach((value, k) => near(value, ends[i][k])));
  if (peer) assert.deepEqual(healed.brep.faces.find(face => face.name === peer), before.brep.faces.find(face => face.name === peer));
}

async function pickFace(point, name) {
  const pixel = await f.page.evaluate(position => window.__studioScreenOf(position), point);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel);
  const target = f.page.getByLabel('Face property and colour target');
  await target.waitFor();
  assert.ok((await target.innerText()).includes(name));
  await f.page.evaluate(() => document.activeElement?.blur());
}

async function healAgent() {
  const file = join(output, `mcp-healed-${kind}.bcad`);
  await copyFile(input, file);
  return withMcpSession({ app, output, clientName: 'delete-planar-face', autonomy: 3 }, file, kind + '-heal', async call => {
    const faces = [selectedFace], pin = await call('query', { action: 'render', highlight: faces });
    const edit = { action: 'command', command: 'delete-face', faces, expectedRevision: pin.revision };
    if (double) {
      assert.ok(bevelNames.every(name => Object.values(pin.legend).includes(name)));
      const seen = await call('query', { action: 'summary', body: 'b2' });
      assert.deepEqual(seen.bodies[0].faces.filter(face => face.name === 'n2.face').map(face => face.native_name).sort(), bevelNames);
      const ambiguous = await call('features', { ...edit, faces: ['n2.face'] }, true);
      assert.match(JSON.stringify(ambiguous), /could not resolve a unique target/i);
      assert.deepEqual(await readFile(file), sourceBytes);
    }
    const failure = await call('features', { ...edit, faces: [unrelated] }, true);
    assert.match(JSON.stringify(failure), reason);
    assert.deepEqual(await readFile(file), sourceBytes);
    await call('features', edit);
    const bytes = await readFile(file), summary = await call('query', { action: 'summary' });
    assert.equal(summary.bodies.length, 1);
    assert.equal(summary.bodies[0].volume, healedVolume);
    assert.equal((await call('features', edit, true)).code, 'COMMAND_STALE');
    assert.deepEqual(await readFile(file), bytes);
    return { file, doc: JSON.parse(bytes) };
  });
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
  f.phase = 'Require the original planar face by name through stdio MCP';
  const agent = await healAgent();
  await f.freshOpen(input, source, kind + '-source');
  const original = await inspect('source', source, sourceVolume);

  f.phase = 'Refuse an unrelated stock plane';
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  await f.page.waitForFunction(expected => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === expected;
  }, view.toUpperCase());
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  if (!(await filter.innerText()).includes('Faces')) await filter.click();
  await pickFace(boss ? [30, 21, 10] : [20, north ? 30 : 0, 5], unrelated);
  await f.page.keyboard.press('Space');
  await f.page.locator('.palette input').fill('Delete face');
  const entry = f.page.locator('.palette .pl-item[data-value="delete-face"]');
  await entry.waitFor();
  assert.match(await entry.getAttribute('class'), /off/);
  assert.match(await entry.innerText(), reason);
  await f.page.keyboard.press('Enter');
  await f.same(source);
  await f.snapshot('delete-stock-plane-refused');
  await f.page.keyboard.press('Escape');
  await f.page.locator('.palette').waitFor({ state: 'hidden' });

  f.phase = 'Apply one Delete face to the original planar face';
  await pickFace(boss ? [11, 9, 16] : bevelPick, selectedFace);
  if (double) await f.snapshot(kind + '-selected');
  await f.command('Delete face');
  const panel = f.page.getByRole('dialog', { name: 'Delete face', exact: true }), apply = button('Apply', panel);
  await apply.waitFor();
  await f.same(source);
  await apply.click();
  await f.changed(source);
  const healed = await f.doc(), edit = healed.nodes.at(-1);
  assert.deepEqual(healed, agent.doc);
  assert.equal(edit.kind, 'delete-face');
  assert.deepEqual(edit.faces, [selectedFace]);
  assert.deepEqual(edit.parent, { node: source.nodes.length - 1, side: 'solid' });
  assert.equal(edit.sigs[selectedFace].k, 'plane');
  const result = await inspect('healed', healed, healedVolume, original);
  await f.undo(); await f.same(source);
  await f.redo(); await f.same(healed);
  const saved = await f.save('healed-' + kind);
  await f.freshOpen(saved.file, healed, kind + '-healed-reopened');
  assert.deepEqual((await inspect('reopened', healed, healedVolume, original)).brep, result.brep);
  await f.freshOpen(agent.file, agent.doc, kind + '-healed-mcp-reopened');
  assert.deepEqual((await inspect('mcp-file', agent.doc, healedVolume, original)).brep, result.brep);
  assert.deepEqual(await readFile(input), sourceBytes);

  f.phase = 'Refuse a saved planar signature that points in the wrong direction';
  const wrong = structuredClone(healed), wrongFile = join(output, 'wrong-planar-signature.bcad');
  wrong.nodes.at(-1).sigs[selectedFace].d = [0, 0, -1];
  await writeFile(wrongFile, JSON.stringify(wrong));
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(wrongFile);
  await f.waitToast(/part is unchanged/i);
  await f.same(healed);
  await f.snapshot(kind + '-signature-file-refused');
});

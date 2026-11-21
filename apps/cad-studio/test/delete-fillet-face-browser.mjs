import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const output = process.argv[2];
assert.ok(output && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const convex = process.argv[3] === '--convex';
const unionFile = convex ? undefined : process.argv[3];
const input = convex ? process.argv[4] : unionFile;
assert.ok(!convex || input);
const sourceBytes = input && await readFile(input);
const source = sourceBytes ? JSON.parse(sourceBytes) : {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [3, 0], [3, 27], [40, 27], [40, 30], [0, 30]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 },
    { id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side1|n1.side2'], radius: 2 },
  ],
  outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
};
const selectedName = unionFile ? 'n5.face' : 'n2.face';
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/files/documentFile.ts', 'apps/cad-studio/test/delete-fillet-face-browser.mjs',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad/src/features/heal-prismatic-fillet.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
if (unionFile) pins.push('packages/barocss-cad/src/features/heal-analytic-l-fillet.ts');
if (convex) pins.push('packages/barocss-cad/src/features/heal-prismatic-chamfer.ts');
const f = await createFlow({
  name: 'delete-fillet-face', envFrozen: 'DELETE_FILLET_FACE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: `Heal the picked ${convex ? 'outside fillet of a rectangular box' : 'inside fillet of a straight L-section'}, then save and reopen the sharp solid.`,
  limits: [convex ? 'One R2 outside fillet spanning the height of a 40 × 30 × 10 mm rectangular box.'
    : unionFile ? 'One R2 inside fillet on the union of a 40 × 20 × 3 mm foot and 3 × 20 × 30 mm upright.'
    : 'One constant R2 internal fillet spanning a 20 mm axis-aligned extrusion of the 40 × 30 mm L-section.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const solids = partBreps(doc), brep = solids[0].brep;
console.log(JSON.stringify({ solids: solids.length, report: checkBrep(brep, { strict: true }),
  mass: brepMassProperties(brep, 1), faces: brep.faces.map(({ id, name }) => ({ id, name })),
  edges: brep.edges.map(({ id, name }) => ({ id, name })) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const sharpVolume = convex ? 12000 : (40 * 3 + 30 * 3 - 3 * 3) * 20;
const filletVolume = sharpVolume + (convex ? -10 : 20) * (4 - Math.PI);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

async function measure(label, doc, original) {
  const native = await f.inspect(label, doc), worker = (await f.bodies()).bodies;
  assert.equal(native.solids, 1);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(worker.length, 1);
  const expected = original ? sharpVolume : filletVolume;
  near(native.mass.volume, expected);
  near(worker[0].volume, expected);
  if (original) {
    const survivingFaces = original.faces.filter(face => face.name !== selectedName);
    assert.deepEqual(native.report.counts, convex ? { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 }
      : { bodies: 1, shells: 1, faces: 8, loops: 8,
      coedges: unionFile ? 40 : 36, edges: unionFile ? 20 : 18, vertices: unionFile ? 14 : 12 });
    assert.deepEqual(native.faces.map(face => face.name).sort(), survivingFaces.map(face => face.name).sort());
    if (convex) {
      for (const face of survivingFaces) assert.deepEqual(native.faces.find(candidate => candidate.id === face.id), face);
      assert.ok(native.edges.some(edge => edge.name === source.nodes.at(-1).edges[0]));
      assert.equal(native.report.topology[0].genus, 0);
      assert.ok(native.report.maximumPcurveGap < 1e-9 && native.report.maximumEdgeSurfaceGap < 1e-9);
      native.mass.centroid.forEach((value, i) => near(value, [20, 15, 5][i]));
    }
    if (unionFile) {
      for (const face of survivingFaces) assert.deepEqual(native.faces.find(candidate => candidate.id === face.id), face);
      const retained = original.edges.filter(edge => native.edges.some(candidate => candidate.id === edge.id));
      assert.equal(retained.length, 19);
      for (const edge of retained) assert.deepEqual(native.edges.find(candidate => candidate.id === edge.id), edge);
      const centroid = [(2400 * 20 + (1800 - 180) * 1.5) / 4020, 10, ((2400 - 180) * 1.5 + 1800 * 15) / 4020];
      native.mass.centroid.forEach((value, i) => near(value, centroid[i]));
    }
  }
  f.report.observations.push({ label, expected, nativeVolume: native.mass.volume, studioVolume: worker[0].volume,
    counts: native.report.counts, maximumEdgeSurfaceGap: native.report.maximumEdgeSurfaceGap });
  return native;
}

async function healAgent() {
  const file = join(output, 'agent-sharp-box.bcad');
  await copyFile(input, file);
  return withMcpSession({ app: f.app, output, clientName: 'delete-box-fillet', autonomy: 3 }, file, 'box-fillet', async call => {
    const pin = await call('query', { action: 'render', highlight: [selectedName] });
    assert.ok(Object.values(pin.legend).includes(selectedName));
    const edit = { action: 'command', command: 'delete-face', faces: [selectedName], expectedRevision: pin.revision };
    await call('features', { ...edit, faces: ['n1.top'] }, true);
    assert.deepEqual(await readFile(file), sourceBytes);
    await call('features', edit);
    const bytes = await readFile(file), summary = await call('query', { action: 'summary' });
    assert.equal(summary.bodies[0].volume, sharpVolume);
    assert.equal((await call('features', edit, true)).code, 'COMMAND_STALE');
    assert.deepEqual(await readFile(file), bytes);
    return file;
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
  f.phase = 'Open and measure the R2 fillet';
  const agentFile = convex ? await healAgent() : process.argv[4];
  await f.newPage();
  const [file] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await file.setFiles(input || { name: 'l-section-r2.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  const original = await measure('rounded', source);
  await f.snapshot('fillet-original');

  f.phase = 'Select the native fillet and apply its heal';
  if (convex) {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name: 'Front', exact: true }).click();
    await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'FRONT');
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  }
  const filter = button('Selection filter');
  if (!(await filter.innerText()).includes('Faces')) await filter.click();
  const point = convex ? [2 - Math.SQRT2, 2 - Math.SQRT2, 5]
    : unionFile ? [5 - Math.SQRT2, 10, 5 - Math.SQRT2] : [5 - Math.SQRT2, 25 + Math.SQRT2, 10];
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  if (input) {
    const selected = f.page.getByLabel('Face property and colour target');
    await selected.waitFor();
    assert.ok((await selected.innerText()).includes(selectedName));
  }
  await f.snapshot('fillet-selected');
  await f.command('Delete face');
  const apply = button('Apply', f.page.getByRole('dialog', { name: 'Delete face', exact: true }));
  await apply.waitFor({ timeout: 10000 });
  await apply.click();
  await f.changed(source);
  const healed = await f.doc();
  assert.deepEqual(healed.nodes.slice(0, -1), source.nodes);
  assert.equal(healed.nodes.at(-1).kind, 'delete-face');
  assert.deepEqual(healed.nodes.at(-1).faces, [selectedName]);
  await measure('sharp', healed, original);
  await f.snapshot('fillet-healed');
  await f.undo(); await f.same(source);
  await f.redo(); await f.same(healed);
  const saved = await f.save(convex ? 'box-sharp' : 'l-section-sharp');
  await f.freshOpen(saved.file, healed, 'fillet-healed-reopened');
  await measure('reopened', healed, original);
  if (input) {
    if (agentFile) {
      const agentDoc = JSON.parse(await readFile(agentFile));
      assert.deepEqual(agentDoc, healed);
      await f.freshOpen(agentFile, agentDoc, 'fillet-agent-healed-opened');
      await measure('agent-file-opened', agentDoc, original);
    }
    f.phase = 'Refuse a stale fillet reference without changing the healed document';
    const stale = structuredClone(healed);
    stale.nodes.at(-1).sigs[selectedName].r *= 10;
    const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
    await chooser.setFiles({ name: 'stale-fillet-reference.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
    await f.waitToast(/REFERENCE_MOVED.*Your part is unchanged/);
    await f.same(healed);
    await f.snapshot('fillet-stale-reference-refused');
    assert.deepEqual(await readFile(input), sourceBytes);
  }
});

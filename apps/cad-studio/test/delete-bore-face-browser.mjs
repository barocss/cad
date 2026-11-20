import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, variant = 'single'] = process.argv.slice(2);
assert.ok(output && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
assert.ok(['single', 'first', 'second'].includes(variant));
const twoBores = variant !== 'single';
const removed = variant === 'second' ? { name: 'n3.side0', x: 27, y: 20 } : { name: 'n2.side0', x: 11, y: 9 };
const retainedRadius = variant === 'first' ? 2 : variant === 'second' ? 3 : 0;
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, center: [11, 9], radius: 3, face: 'n1.top' },
  ],
  outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
};
if (twoBores) {
  source.nodes.push({ id: 'n3', kind: 'hole', parent: { node: 2, side: 'solid' }, center: [27, 20], radius: 2, face: 'n1.top' });
  source.outputs = { b3: { node: 3, side: 'solid' } };
  source.nextId = 4;
}
const initialCount = source.nodes.length, finalBody = 'b' + initialCount;
const initialVolume = 12000 - (twoBores ? 130 : 90) * Math.PI;
const finalVolume = 12000 - 10 * Math.PI * retainedRadius ** 2;
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/files/documentFile.ts', 'apps/cad-studio/src/state/commandApply.ts',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts',
];
const f = await createFlow({
  name: 'delete-bore-face', envFrozen: 'DELETE_BORE_FACE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Heal a rectangular plate from its selected bore wall, preserving authored history and the surviving native face IDs.',
  limits: [`One 40 × 30 × 10 mm rectangular solid with ${twoBores ? 'two Ø6 and Ø4' : 'one Ø6'} straight through bore(s).`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, createCylindricalBoreCheck, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const solids = partBreps(doc), brep = solids[0].brep;
const cylinders = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
console.log(JSON.stringify({
  solids: solids.length, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
  faces: brep.faces.map(({ id, name, loops }) => ({ id, name, loops })), vertices: brep.vertices,
  edges: brep.edges.map(({ id, name, vertices }) => ({ id, name, vertices })),
  loops: brep.loops, retainedDiameter: createCylindricalBoreCheck(brep)(cylinders),
}));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });

async function openDoc(doc, name) {
  const [file] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await file.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

async function measure(label, doc, before) {
  const result = await f.inspect(label, doc), worker = (await f.bodies()).bodies;
  assert.equal(result.solids, 1);
  assert.ok(result.report.valid, result.report.issues.join('\n'));
  assert.equal(worker.length, 1);
  const expected = before ? finalVolume : initialVolume;
  near(result.mass.volume, expected);
  near(worker[0].volume, expected);
  assert.equal(result.report.topology[0].genus, Number(twoBores) + Number(!before));
  if (before) {
    assert.deepEqual(result.report.counts, twoBores ? { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 } :
      { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    const removedWalls = before.faces.filter(face => face.name.startsWith(removed.name + '#'));
    assert.equal(removedWalls.length, 2);
    assert.deepEqual(result.faces.map(face => face.id),
      before.faces.filter(face => !removedWalls.includes(face)).map(face => face.id));
    const retainedLoops = new Set(result.loops.map(loop => loop.id));
    if (twoBores) near(result.retainedDiameter, 2 * retainedRadius);
    else result.mass.centroid.forEach((x, i) => near(x, [20, 15, 5][i]));
    for (const face of result.faces) {
      const original = before.faces.find(candidate => candidate.id === face.id);
      assert.deepEqual(face, { ...original, loops: original.loops.filter(id => retainedLoops.has(id)) });
    }
    for (const loop of result.loops) assert.deepEqual(loop, before.loops.find(candidate => candidate.id === loop.id));
    for (const edge of result.edges) assert.deepEqual(edge, before.edges.find(candidate => candidate.id === edge.id));
    for (const vertex of result.vertices) assert.deepEqual(vertex, before.vertices.find(candidate => candidate.id === vertex.id));
  }
  f.report.observations.push({ label, expected, nativeVolume: result.mass.volume, studioVolume: worker[0].volume,
    counts: result.report.counts, maximumEdgeSurfaceGap: result.report.maximumEdgeSurfaceGap, retainedDiameter: result.retainedDiameter });
  return result;
}

async function healWithMcp() {
  const file = join(output, 'mcp-healed.bcad'), bytes = Buffer.from(JSON.stringify(source));
  await writeFile(file, bytes);
  return withMcpSession({ app: resolve(import.meta.dirname, '..'), output, clientName: 'cad-two-bore-heal', autonomy: 3 },
    file, 'delete-two-bore-face', async call => {
      const faces = [removed.name], pin = await call('query', { action: 'render', highlight: faces });
      const edit = { action: 'command', command: 'delete-face', faces, expectedRevision: pin.revision };
      await call('features', edit);
      const accepted = await readFile(file), doc = JSON.parse(accepted);
      assert.deepEqual(doc.nodes.slice(0, initialCount), source.nodes);
      const summary = await call('query', { action: 'summary' });
      assert.ok(Math.abs(summary.bodies.find(body => body.key === finalBody).volume - finalVolume) < 5e-4);
      const refused = await call('features', edit, true);
      assert.equal(refused.code, 'COMMAND_STALE');
      assert.deepEqual(await readFile(file), accepted);
      f.report.observations.push({ mcpRevision: pin.revision, removedFace: removed.name, stale: refused.code });
      return { doc, file };
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
  f.phase = 'Heal the exact bore through stdio MCP';
  const agent = twoBores ? await healWithMcp() : undefined;
  f.phase = 'Open the plate with its through bore';
  await f.newPage();
  await openDoc(source, 'plate-with-bore.bcad');
  await f.same(source);
  const original = await measure('before-heal', source);
  await f.snapshot('original-bore');

  f.phase = 'Pick the cylindrical wall and preview Delete face';
  const pickFilter = button('Selection filter');
  await pickFilter.click();
  assert.match(await pickFilter.innerText(), /Faces/);
  const label = f.page.getByLabel('Face property and colour target');
  for (const z of [8, 9.25, 8.5, 9.6, 9.9]) {
    const bore = await f.page.evaluate(point => window.__studioScreenOf(point), [removed.x, removed.y, z]);
    assert.ok(bore?.length === 2);
    await f.page.mouse.click(...bore);
    await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    if (await label.count() && (await label.innerText()).includes(removed.name)) break;
  }
  assert.ok((await label.innerText()).includes(removed.name));
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await f.command('Delete face');
  const dialog = f.page.getByRole('dialog', { name: 'Delete face', exact: true });
  const apply = button('Apply', dialog);
  await apply.waitFor();
  await apply.click();
  await f.changed(source);
  const healed = await f.doc(), node = healed.nodes[initialCount];
  if (agent) assert.deepEqual(healed, agent.doc);
  assert.equal(node.kind, 'delete-face');
  assert.deepEqual(node.parent, { node: initialCount - 1, side: 'solid' });
  assert.ok(node.faces[0].startsWith(removed.name + '#'));
  assert.equal(node.sigs[node.faces[0]].k, 'curved');
  assert.deepEqual(healed.nodes.slice(0, initialCount), source.nodes);
  await measure('after-heal', healed, original);
  await f.snapshot('healed');

  await f.undo(); await f.same(source);
  await f.redo(); await f.same(healed);
  const saved = await f.save('healed-plate');
  await f.freshOpen(saved.file, healed, 'healed-reopened');
  await measure('reopened-heal', healed, original);
  if (agent) await f.freshOpen(agent.file, agent.doc, 'mcp-healed-reopened');

  f.phase = 'Refuse a stale native bore recipe before adopting the file';
  const stale = structuredClone(healed), recipe = stale.nodes[initialCount];
  recipe.sigs[recipe.faces[0]].r = 30;
  await openDoc(stale, 'stale-bore-reference.bcad');
  await f.page.locator('.toast').filter({ hasText: /part is unchanged/i }).waitFor();
  await f.same(healed);
  await f.snapshot('stale-file-refused');
});

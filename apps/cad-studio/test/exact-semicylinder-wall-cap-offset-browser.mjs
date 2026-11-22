import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const outer = 'n0.normal', inner = 'n0.reverse', cap = 'n0.v-max';
const capFirst = process.argv.includes('--cap-first');
const order = capFirst ? [cap, outer] : [outer, cap];
const wall = { id: 'WALL-3', source: 'Keep at least 3 mm of radial wall.', hard: true,
  check: { query: { fn: 'radial_wall', a: outer, b: inner }, op: '>=', value: 3, tol: 0.01, unit: 'mm' } };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 1, parameters: {},
  nodes: [{
    id: 'n0', kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', thickness: 2, side: 'reverse',
    surface: {
      degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]].map(([x, y]) => [[x, y, 0], [x, y, 12]]),
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
    },
  }],
  outputs: { b0: { node: 0, side: 'solid' } },
  requirements: [wall],
};
const pins = [
  'apps/cad-studio/test/exact-semicylinder-wall-cap-offset-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  ...['app/nativeOffsetFace', 'app/profileCommands', 'app/offsetFaceEdit', 'chat/thickenWall', 'engine/doc', 'engine/exactThickenEdit']
    .map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  ...['brep/thicken-cylinder', 'features/exact-cylinder-cap-offset', 'part/part-model']
    .map(name => 'packages/barocss-cad/src/' + name + '.ts'),
];
const f = await createFlow({
  name: 'exact-semicylinder-wall-cap-offset', envFrozen: 'D1660_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Edit the original outer wall and upper cap in successive native features and verify reopened geometry.',
  limits: ['One upright Exact two-quarter semicylinder. Desktop WebGPU and local stdio MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const model = evaluateDoc(doc, 0);
const { vertices, edges, coedges, loops, faces, shells, bodies } = brep;
const owners = [vertices.map(v => v.id), edges.map(({ curve, ...edge }) => [edge, curve.id]),
  coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]), loops, faces.map(({ surface, ...face }) => [face, surface.id]), shells, bodies];
console.log(JSON.stringify({ meshFaces: model.ok && model.bodies[0].mesh.faces.map(({ name, index }) => [name, index]),
  owners, geometry: Object.fromEntries(faces.map(face => [face.name, faceGeometry(face)])),
  mass: brepMassProperties(brep, 1), report: checkBrep(brep, { strict: true }), digest: digestOf(brep),
  vertices: Object.fromEntries(vertices.map(vertex => [vertex.id, vertex.point])) }));
`,
});
const button = (name, within = f.page) => within.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (panel, label) => panel.locator('.status').filter({ hasText: new RegExp('^' + label + '$') }).waitFor();
const distance = panel => panel.getByLabel('Offset', { exact: true });
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 3 }, file, label, run);
const wallPass = () => f.page.getByRole('listitem', { name: `Requirement ${wall.id}`, exact: true })
  .and(f.page.locator('.req.pass')).waitFor();

async function check(label, doc, outside, height, original) {
  const item = await f.inspect(label, doc), { report, geometry, mass } = item;
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  if (original) {
    assert.deepEqual(item.owners, original.owners);
    for (const [id, [x, y, z]] of Object.entries(original.vertices)) {
      const moved = Math.abs(Math.hypot(x - 20, y - 20) - 10) < 1e-8;
      const factor = moved ? outside / 10 : 1, actual = item.vertices[id];
      [20 + (x - 20) * factor, 20 + (y - 20) * factor, z === 0 ? 0 : height].forEach((value, axis) => near(actual[axis], value));
    }
  }
  for (const [name, radius, out] of [[outer, outside, 1], [inner, 8, -1]]) {
    const support = geometry[name];
    assert.deepEqual([support.kind, support.a, support.out], ['cylinder', [0, 0, 1], out]);
    near(support.c[0], 20);
    near(support.c[1], 20);
    near(support.r, radius);
  }
  assert.deepEqual([geometry['n0.v-min'].o[2], geometry[cap].o[2]], [0, height]);
  const areaFactor = outside ** 2 - 64, expectedVolume = height / 2 * Math.PI * areaFactor;
  const expectedCentroid = [20, 20 + 4 * (outside ** 3 - 512) / (3 * Math.PI * areaFactor), height / 2];
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, expectedVolume);
  near(mass.volume, expectedVolume);
  expectedCentroid.forEach((value, axis) => { near(bodies[0].centroid[axis], value); near(mass.centroid[axis], value); });
  f.report.observations.push({ label, outside, inside: 8, height, volume: mass.volume, digest: item.digest,
    gap: report.maximumPcurveGap });
  return item;
}

async function start(face, current, outside, height, second) {
  const isCap = face === cap, view = isCap ? 'Top' : 'Back';
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  await f.page.waitForFunction(label => {
    const marks = document.querySelectorAll('.view-cube .vc-label');
    return marks.length === 1 && marks[0].textContent === label;
  }, view.toUpperCase());
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const point = await f.page.evaluate(world => window.__studioScreenOf(world),
    [20, 20 + (isCap ? (outside + 8) / 2 : outside), isCap ? height : height / 2]);
  assert.ok(point && await f.page.evaluate(pixel => document.elementFromPoint(...pixel)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(index => window.__studioSelection.selection.faces.length === 1 &&
    window.__studioSelection.selection.faces[0].face === index, current.meshFaces.find(([name]) => name === face)[1]);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await status(panel, 'preview');
  assert.equal(await panel.getByLabel('Mode', { exact: true }).count(), Number(isCap && !second));
  return panel;
}

async function apply(panel, value, prior) {
  await distance(panel).fill(String(value));
  await status(panel, 'preview');
  await button('Apply', panel).click();
  await f.changed(prior);
  return f.doc();
}

async function editHistory(index) {
  await f.openFeatureEditor(index, index === 1 ? 'first Offset' : 'second Offset');
  await button('Edit offset', f.editor()).click();
  return hud('Edit Offset face');
}

await f.run(async () => {
  const openContext = f.browser.newContext.bind(f.browser), origin = new URL(f.server.resolvedUrls.local[0]).origin;
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const agentFile = join(f.output, 'mixed-agent.bcad');
  await writeFile(agentFile, JSON.stringify(seed));
  const agent = await mcp(agentFile, 'mixed-agent', async call => {
    for (const face of order) {
      const pin = await call('query', { action: 'summary' });
      await call('features', { action: 'command', command: 'offset-face', faces: [face],
        values: { d: face === cap ? 3 : 2 }, expectedRevision: pin.revision });
    }
    return JSON.parse(await readFile(agentFile, 'utf8'));
  });
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'exact-semicylinder.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const source = await check('01-original', seed, 10, 12);
  f.phase = 'Apply the first signed Offset';
  const first = await apply(await start(order[0], source, 10, 12, false), capFirst ? 3 : 2, seed);
  const firstRadius = capFirst ? 10 : 12, firstHeight = capFirst ? 15 : 12;
  const firstNative = await check('02-first', first, firstRadius, firstHeight, source);
  await f.snapshot('02-first-offset');

  f.phase = 'Apply the second signed Offset on the evaluated solid';
  const both = await apply(await start(order[1], firstNative, firstRadius, firstHeight, true), capFirst ? 2 : 3, first);
  assert.deepEqual(both, agent);
  assert.deepEqual(both.nodes.slice(0, 2), first.nodes);
  assert.deepEqual([both.nodes[2].kind, both.nodes[2].parent, both.nodes[2].faces, both.nodes[2].target],
    ['offset-face', { node: 1, side: 'solid' }, [order[1]], undefined]);
  await check('03-combined', both, 12, 15, source);
  await wallPass();
  await f.snapshot('03-wall-and-cap');

  f.phase = 'Refuse contact of the upper cap with the original lower cap';
  const capEditor = await editHistory(capFirst ? 1 : 2), undoBefore = await button('Undo').getAttribute('data-tip');
  assert.equal(await capEditor.getByLabel('Mode', { exact: true }).count(), 0);
  await distance(capEditor).fill('-12');
  await status(capEditor, 'refused');
  const error = capEditor.locator('.hud-error'), details = error.locator('details:not([open]) > summary');
  if (await details.count()) await details.click();
  assert.match(await error.innerText(), /opposite cap/i);
  assert.ok(await button('Apply', capEditor).isDisabled());
  await f.same(both);
  assert.equal(await button('Undo').getAttribute('data-tip'), undoBefore);
  await f.snapshot('04-cap-contact-refused');

  f.phase = 'Edit the first Offset and retain the second recipe';
  if (!capFirst) await button('Cancel', capEditor).click();
  const edit = capFirst ? capEditor : await editHistory(1);
  const firstEdit = capFirst ? -3 : 1;
  const edited = await apply(edit, firstEdit, both);
  assert.deepEqual(edited.nodes[1], { ...both.nodes[1], distance: firstEdit });
  assert.deepEqual(edited.nodes[2], both.nodes[2]);
  const finalRadius = capFirst ? 12 : 11, finalHeight = capFirst ? 9 : 15;
  const expected = await check('05-upstream-edit', edited, finalRadius, finalHeight, source);
  await f.undo();
  await f.same(both);
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(both);
  await f.redo();
  await f.same(edited);

  const saved = await f.save('wall-and-cap');
  await f.freshOpen(saved.file, edited, '06-native-open');
  assert.equal((await check('06-opened', await f.doc(), finalRadius, finalHeight, source)).digest, expected.digest);
  await wallPass();
  await f.snapshot('07-opened-wall-check');
  const bytes = await readFile(saved.file);
  await mcp(saved.file, 'mixed-evidence', async call => {
    const proof = await call('requirements', { action: 'evidence' });
    const row = JSON.parse(proof.files[0].text).evidence.find(row => row.requirement?.id === wall.id);
    assert.deepEqual([row.result.verdict, row.result.value.entities, row.freshness.state], ['pass', [outer, inner], 'current']);
    near(row.result.number, finalRadius - 8, 1e-10);
    f.report.observations.push({ wall: row.result.number, revision: proof.revision });
  });
  assert.deepEqual(await readFile(saved.file), bytes);
});

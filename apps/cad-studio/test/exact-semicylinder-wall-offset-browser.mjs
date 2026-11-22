import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const outer = 'n0.normal', inner = 'n0.reverse', height = 12;
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 1, parameters: {},
  nodes: [{
    id: 'n0', kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', thickness: 2, side: 'reverse',
    surface: {
      degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, height]]),
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
    },
  }],
  outputs: { b0: { node: 0, side: 'solid' } },
};
const pins = [
  'apps/cad-studio/test/exact-semicylinder-wall-offset-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  ...['app/nativeOffsetFace', 'app/offsetFaceEdit', 'app/profileCommands', 'chat/thickenWall', 'engine/doc', 'engine/exactThickenEdit']
    .map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  ...['brep/thicken-cylinder', 'features/exact-cylinder-cap-offset', 'part/part-model']
    .map(name => 'packages/barocss-cad/src/' + name + '.ts'),
];
const f = await createFlow({
  name: 'exact-semicylinder-wall-offset', envFrozen: 'D1656_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Offset the original outer wall by signed distance through Studio and the local Agent.',
  limits: ['One two-quarter upright Exact cylinder Thicken. Desktop WebGPU and local stdio MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const result = evaluateDoc(doc, 0);
const meshFaces = result.ok && result.bodies[0].mesh.faces.map(({name, index}) => [name, index]);
const { vertices, edges, coedges, loops, faces, shells, bodies } = brep;
const owners = [vertices.map(v => v.id), edges.map(({curve, ...edge}) => [edge, curve.id]),
  coedges.map(({pcurve, ...use}) => [use, pcurve?.id]), loops,
  faces.map(({surface, ...face}) => [face, surface.id]), shells, bodies];
const inner = faces.find(face => face.name === 'n0.reverse');
const innerUses = coedges.filter(use => inner.loops.includes(use.loop));
const innerEdges = edges.filter(edge => innerUses.some(use => use.edge === edge.id));
const innerVertices = vertices.filter(vertex => innerEdges.some(edge => edge.vertices.includes(vertex.id)));
console.log(JSON.stringify({ meshFaces, owners, fixed: [inner, innerUses, innerEdges, innerVertices],
  geometry: Object.fromEntries(faces.map(face => [face.name, faceGeometry(face)])),
  mass: brepMassProperties(brep, 1), report: checkBrep(brep, { strict: true }), digest: digestOf(brep) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const offset = panel => panel.getByLabel('Offset', { exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const near = (got, want, tolerance = 1e-8) => assert.ok(Math.abs(got - want) < tolerance, `${got} != ${want}`);
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 3 }, file, label, run);

async function check(label, doc, radius, original) {
  const result = await f.inspect(label, doc), { report, geometry, mass } = result;
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  for (const [name, r, sense] of [[outer, radius, 1], [inner, 8, -1]]) {
    const support = geometry[name];
    assert.deepEqual([support.kind, support.a, support.out], ['cylinder', [0, 0, 1], sense]);
    near(support.c[0], 20);
    near(support.c[1], 20);
    near(support.r, r);
  }
  assert.deepEqual([geometry['n0.v-min'].o[2], geometry['n0.v-max'].o[2]], [0, height]);
  if (original) {
    assert.deepEqual(result.owners, original.owners);
    assert.deepEqual(result.fixed, original.fixed);
    for (const name of ['n0.u-min', 'n0.u-max']) {
      const before = original.geometry[name], after = geometry[name];
      assert.equal(after.kind, 'plane');
      before.n.forEach((v, i) => near(after.n[i], v));
      near(after.o.reduce((sum, v, i) => sum + (v - before.o[i]) * before.n[i], 0), 0);
    }
  }
  const volume = 6 * Math.PI * (radius ** 2 - 64);
  const centroid = [20, 20 + 4 * (radius ** 3 - 512) / (3 * Math.PI * (radius ** 2 - 64)), height / 2];
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  near(mass.volume, volume);
  centroid.forEach((value, axis) => {
    near(mass.centroid[axis], value);
    near(bodies[0].centroid[axis], value);
  });
  f.report.observations.push({ label, radius, volume, actualVolume: mass.volume, digest: result.digest, pcurveGap: report.maximumPcurveGap });
  return result;
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

  const agentFile = join(f.output, 'outer-wall-agent.bcad');
  await writeFile(agentFile, JSON.stringify(seed));
  const agentDoc = await mcp(agentFile, 'outer-wall-agent', async call => {
    const pin = await call('query', { action: 'summary' });
    await call('features', { action: 'command', command: 'offset-face', faces: [outer], values: { d: 2 }, expectedRevision: pin.revision });
    return JSON.parse(await readFile(agentFile, 'utf8'));
  });
  await f.newPage();
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles({ name: 'exact-semicylinder.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const original = await check('01-source', seed, 10);

  f.phase = 'Pick the original outer cylindrical wall';
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Back', exact: true }).click();
  await f.page.waitForFunction(() => {
    const marks = document.querySelectorAll('.view-cube .vc-label');
    return marks.length === 1 && marks[0].textContent === 'BACK';
  });
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const pick = await f.page.evaluate(() => window.__studioScreenOf([20, 30, 6]));
  assert.ok(pick && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pick));
  await f.page.mouse.click(...pick);
  await f.page.waitForFunction(index => window.__studioSelection.selection.faces.length === 1 &&
    window.__studioSelection.selection.faces[0].face === index, original.meshFaces.find(([name]) => name === outer)[1]);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await status(panel, 'preview');
  await panel.getByText('Cylindrical wall · Radial', { exact: true }).waitFor();
  assert.equal(await panel.getByLabel('Mode', { exact: true }).count(), 0);

  f.phase = 'Drag along the radial normal and apply the signed distance';
  const delta = await f.page.evaluate(() => {
    const a = window.__studioScreenOf([20, 30, 6]), b = window.__studioScreenOf([20, 31, 6]);
    return b.map((value, i) => value - a[i]);
  });
  assert.ok(Math.hypot(...delta) > 6, delta);
  const handle = await f.page.locator('g.gizmo-handle[data-handle="d"] polygon').evaluate(polygon => {
    const svg = polygon.closest('svg').getBoundingClientRect(), points = [...polygon.points];
    return [svg.x + points.reduce((sum, p) => sum + p.x, 0) / points.length,
      svg.y + points.reduce((sum, p) => sum + p.y, 0) / points.length];
  });
  await f.page.mouse.move(...handle);
  await f.page.mouse.down();
  await f.page.mouse.move(...handle.map((value, i) => value + delta[i]), { steps: 6 });
  await f.page.mouse.up();
  assert.equal(await offset(panel).inputValue(), '3');
  await f.same(seed);
  await f.snapshot('02-dragged-preview');
  await offset(panel).fill('2');
  await status(panel, 'preview');
  await button('Apply', panel).click();
  await f.changed(seed);
  const expanded = await f.doc(), savedNode = expanded.nodes[1];
  assert.deepEqual(expanded, agentDoc);
  assert.deepEqual(expanded.nodes[0], seed.nodes[0]);
  assert.deepEqual([savedNode.kind, savedNode.parent, savedNode.faces, savedNode.distance, savedNode.target],
    ['offset-face', { node: 0, side: 'solid' }, [outer], 2, undefined]);
  await check('03-expanded', expanded, 12, original);
  await f.snapshot('03-expanded-wall');

  f.phase = 'Refuse contact and edit to a negative distance in History';
  await f.openFeatureEditor(1, 'outer wall Offset');
  await button('Edit offset', f.editor()).click();
  const edit = hud('Edit Offset face');
  assert.equal(await edit.getByLabel('Mode', { exact: true }).count(), 0);
  await offset(edit).fill('-2');
  await status(edit, 'refused');
  const error = edit.locator('.hud-error'), details = error.locator('details:not([open]) > summary');
  if (await details.count()) await details.click();
  assert.match(await error.innerText(), /inner (?:skin|wall)/i);
  assert.ok(await button('Apply', edit).isDisabled());
  await f.same(expanded);
  await f.snapshot('04-inner-contact-refused');
  await offset(edit).fill('-1');
  await status(edit, 'preview');
  await button('Apply', edit).click();
  await f.changed(expanded);
  const reduced = await f.doc(), expected = await check('05-reduced', reduced, 9, original);
  assert.deepEqual(reduced.nodes[1], { ...savedNode, distance: -1 });
  await f.undo();
  await f.same(expanded);
  await f.redo();
  await f.same(reduced);
  const saved = await f.save('exact-semicylinder-wall-offset');
  await f.freshOpen(saved.file, reduced, '06-native-open');
  assert.equal((await check('06-opened', await f.doc(), 9, original)).digest, expected.digest);
  await f.openFeatureEditor(1, 'reopened outer wall Offset');
  await button('Edit offset', f.editor()).click();
  assert.equal(await offset(hud('Edit Offset face')).inputValue(), '-1');
  await f.snapshot('07-reopened-outer-wall');
  await button('Cancel', hud('Edit Offset face')).click();
  await f.same(reduced);
});

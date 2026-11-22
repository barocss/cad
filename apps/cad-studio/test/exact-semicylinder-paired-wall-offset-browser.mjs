import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const outer = 'n0.normal', inner = 'n0.reverse', height = 12;
const wall = { id: 'WALL-2', source: 'Keep at least 2 mm of radial wall.', hard: true,
  check: { query: { fn: 'radial_wall', a: outer, b: inner }, op: '>=', value: 2, tol: 0.01, unit: 'mm' } };
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
  requirements: [wall],
};
const pins = [
  'apps/cad-studio/test/exact-semicylinder-paired-wall-offset-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  ...['app/nativeOffsetFace', 'app/profileCommands', 'app/offsetFaceEdit', 'chat/thickenWall', 'engine/doc', 'engine/exactThickenEdit']
    .map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  ...['brep/thicken-cylinder', 'features/exact-cylinder-cap-offset', 'part/part-model']
    .map(name => 'packages/barocss-cad/src/' + name + '.ts'),
];
const f = await createFlow({
  name: 'exact-semicylinder-paired-wall-offset', envFrozen: 'D1658_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Edit opposite walls in successive native History features, verify dependent refusal and reopen the pair.',
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
  coedges.map(({pcurve, ...use}) => [use, pcurve?.id]), loops, faces.map(({surface, ...face}) => [face, surface.id]), shells, bodies];
const outside = faces.find(face => face.name === 'n0.normal');
const outerUses = coedges.filter(use => outside.loops.includes(use.loop));
const outerEdges = edges.filter(edge => outerUses.some(use => use.edge === edge.id));
const outerVertices = vertices.filter(vertex => outerEdges.some(edge => edge.vertices.includes(vertex.id)));
console.log(JSON.stringify({ meshFaces, owners, outer: [outside, outerUses, outerEdges, outerVertices],
  geometry: Object.fromEntries(faces.map(face => [face.name, faceGeometry(face)])),
  mass: brepMassProperties(brep, 1), report: checkBrep(brep, { strict: true }), digest: digestOf(brep) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const distance = panel => panel.getByLabel('Offset', { exact: true });
const near = (got, want, tolerance = 1e-8) => assert.ok(Math.abs(got - want) < tolerance, `${got} != ${want}`);
const wallPass = () => f.page.getByRole('listitem', { name: `Requirement ${wall.id}`, exact: true })
  .and(f.page.locator('.req.pass')).waitFor();
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 3 }, file, label, run);

async function check(label, doc, outside, inside, original) {
  const result = await f.inspect(label, doc), { geometry, report, mass } = result;
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  for (const [name, radius, out] of [[outer, outside, 1], [inner, inside, -1]]) {
    const support = geometry[name];
    assert.deepEqual([support.kind, support.a, support.out], ['cylinder', [0, 0, 1], out]);
    near(support.c[0], 20);
    near(support.c[1], 20);
    near(support.r, radius);
  }
  assert.deepEqual([geometry['n0.v-min'].o[2], geometry['n0.v-max'].o[2]], [0, height]);
  if (original) assert.deepEqual(result.owners, original.owners);
  const areaFactor = outside ** 2 - inside ** 2, volume = 6 * Math.PI * areaFactor;
  const centroid = [20, 20 + 4 * (outside ** 3 - inside ** 3) / (3 * Math.PI * areaFactor), height / 2];
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  near(mass.volume, volume);
  centroid.forEach((value, i) => { near(mass.centroid[i], value); near(bodies[0].centroid[i], value); });
  f.report.observations.push({ label, outside, inside, nativeVolume: mass.volume, digest: result.digest,
    pcurveGap: report.maximumPcurveGap });
  return result;
}

async function startWall(face, y, view, meshFaces) {
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
  const point = await f.page.evaluate(y => window.__studioScreenOf([20, y, 6]), y);
  assert.ok(point && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(index => window.__studioSelection.selection.faces.length === 1 &&
    window.__studioSelection.selection.faces[0].face === index, meshFaces.find(([name]) => name === face)[1]);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await status(panel, 'preview');
  assert.equal(await panel.getByLabel('Mode', { exact: true }).count(), 0);
  return panel;
}

async function apply(panel, value, prior) {
  await distance(panel).fill(String(value));
  await status(panel, 'preview');
  await button('Apply', panel).click();
  await f.changed(prior);
  return f.doc();
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
  const agentFile = join(f.output, 'paired-agent.bcad');
  await writeFile(agentFile, JSON.stringify(seed));
  const agentDoc = await mcp(agentFile, 'paired-agent', async call => {
    for (const [face, d] of [[outer, 2], [inner, -1]]) {
      const expectedRevision = await currentPartRevision(call);
      await call('features', { action: 'command', command: 'offset-face', faces: [face], values: { d }, expectedRevision });
    }
    return JSON.parse(await readFile(agentFile, 'utf8'));
  });
  await f.newPage();
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles({ name: 'exact-semicylinder.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const source = await check('01-original', seed, 10, 8);

  f.phase = 'Apply the outer wall Offset then select the original inner wall';
  const first = await apply(await startWall(outer, 30, 'Back', source.meshFaces), 2, seed);
  const firstNative = await check('02-first', first, 12, 8, source);
  await f.snapshot('02-first-outer-offset');
  const both = await apply(await startWall(inner, 28, 'Front', firstNative.meshFaces), -1, first);
  assert.deepEqual(both, agentDoc);
  assert.deepEqual(both.nodes.slice(0, 2), first.nodes);
  const second = both.nodes[2];
  assert.deepEqual([second.kind, second.parent, second.faces, second.distance], ['offset-face', { node: 1, side: 'solid' }, [inner], -1]);
  const bothNative = await check('03-pair', both, 12, 9, source);
  assert.deepEqual(bothNative.outer, firstNative.outer);
  await wallPass();
  await f.snapshot('03-both-walls');

  f.phase = 'Refuse an upstream edit that collapses the downstream wall';
  await f.openFeatureEditor(1, 'first wall Offset');
  await button('Edit offset', f.editor()).click();
  const edit = hud('Edit Offset face'), undoBefore = await button('Undo').getAttribute('data-tip');
  await distance(edit).fill('-1');
  await status(edit, 'refused');
  const error = edit.locator('.hud-error'), details = error.locator('details:not([open]) > summary');
  if (await details.count()) await details.click();
  assert.match(await error.innerText(), /retained outer wall/i);
  assert.ok(await button('Apply', edit).isDisabled());
  await f.same(both);
  assert.equal(await button('Undo').getAttribute('data-tip'), undoBefore);
  await f.snapshot('04-dependent-contact-refused');
  const edited = await apply(edit, 1, both);
  assert.deepEqual(edited.nodes[1], { ...both.nodes[1], distance: 1 });
  assert.deepEqual(edited.nodes[2], second);
  const expected = await check('05-first-edited', edited, 11, 9, source);
  await f.undo();
  await f.same(both);
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(both);
  await f.redo();
  await f.same(edited);

  const saved = await f.save('paired-semicylinder-wall-offsets');
  await f.freshOpen(saved.file, edited, '06-native-open');
  assert.equal((await check('06-opened', await f.doc(), 11, 9, source)).digest, expected.digest);
  await wallPass();
  await f.snapshot('07-opened-wall-check');
  const fileBytes = await readFile(saved.file);
  await mcp(saved.file, 'paired-evidence', async call => {
    const evidence = await call('requirements', { action: 'evidence' });
    const row = JSON.parse(evidence.files[0].text).evidence.find(row => row.requirement?.id === wall.id);
    assert.deepEqual([row.result.verdict, row.result.value.entities, row.freshness.state], ['pass', [outer, inner], 'current']);
    near(row.result.number, 2, 1e-10);
    f.report.observations.push({ wall: row.result.number, revision: evidence.revision });
  });
  assert.deepEqual(await readFile(saved.file), fileBytes);
});

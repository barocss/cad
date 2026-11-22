import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const cap = 'n0.v-max', reference = 'n2.bottom';
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]], n = Math.sqrt(17);
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
  nodes: [
    { id: 'n0', kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', thickness: 2, side: 'reverse',
      surface: {
        degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
        controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, 12]]),
        weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
      } },
    { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8],
      plane: { origin: [44, 22, 20], normal: [-1 / n, 0, 4 / n], xAxis: [4 / n, 0, 1 / n] } },
    { id: 'n2', kind: 'extrude', sketch: 1, height: 3 },
    { id: 'n3', kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] },
  ],
  outputs: { b0: { node: 0, side: 'solid' }, b3: { node: 3, side: 'solid' } },
};
const pins = [
  'apps/cad-studio/test/exact-semicylinder-cap-replacement-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  ...['app/replaceFaceCommand', 'chat/part/features', 'engine/doc', 'engine/offsetPlane']
    .map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  ...['features/exact-cylinder-cap-offset', 'features/bored-cap-offset', 'part/part-model']
    .map(name => 'packages/barocss-cad/src/' + name + '.ts'),
];
const f = await createFlow({
  name: 'exact-semicylinder-cap-replacement', envFrozen: 'D1653_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Replace the original upper cap with an inclined exact plane, move the reference and reopen the same native solid.',
  limits: ['One original upright two-quarter semicylinder and one tilted reference box. Desktop WebGPU and local stdio MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const cap = brep.faces.find(face => face.name === 'n0.v-max');
  const ids = new Set(brep.coedges.filter(use => cap?.loops.includes(use.loop)).map(use => use.edge));
  const rims = brep.edges.filter(edge => ids.has(edge.id) && edge.curve.degree === 2).map(({ curve }) => {
    const [lo, hi] = curveDomain(curve);
    return Array.from({ length: 17 }, (_, i) => evaluateCurve(curve, lo + (hi - lo) * i / 16));
  });
  return { key, brep, rims, report: checkBrep(brep, { strict: true }),
    geometry: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face)])),
    mass: brepMassProperties(brep, 1), digest: digestOf(brep) };
})));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (got, want, tolerance = 1e-7) => assert.ok(Math.abs(got - want) < tolerance, `${got} != ${want}`);
const incidence = ({ vertices, edges, coedges, loops, faces, shells, bodies }) => [
  vertices.map(v => v.id), edges.map(e => [e.id, e.name, e.vertices, e.curve.id]),
  coedges.map(c => [c.id, c.edge, c.loop, c.twin, c.prev, c.next, c.pcurve?.id]), loops,
  faces.map(face => [face.id, face.name, face.shell, face.loops, face.surface.id]), shells, bodies,
];

async function view(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.waitForFunction(label => {
    const marks = document.querySelectorAll('.view-cube .vc-label');
    return marks.length === 1 && marks[0].textContent === label;
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

async function measure(label, doc, original, height) {
  const rows = await f.inspect(label, doc), solid = rows.find(row => row.key === 'b4'), target = rows.find(row => row.key === 'b3');
  assert.ok(solid.report.valid && target.report.valid);
  assert.deepEqual(incidence(solid.brep), incidence(original.brep));
  assert.ok(solid.report.maximumEdgeSurfaceGap < 1e-8 && solid.report.maximumPcurveGap < 1e-8);
  for (const name of ['n0.v-min', 'n0.u-min', 'n0.u-max']) {
    const before = original.geometry[name], after = solid.geometry[name];
    assert.equal(after.kind, 'plane');
    before.n.forEach((value, axis) => near(after.n[axis], value));
    near(after.o.reduce((sum, value, axis) => sum + (value - before.o[axis]) * before.n[axis], 0), 0);
  }
  for (const [name, radius] of [['n0.normal', 10], ['n0.reverse', 8]]) {
    const support = solid.geometry[name];
    assert.equal(support.kind, 'cylinder');
    assert.deepEqual(support.a, [0, 0, 1]);
    near(support.r, radius);
    near(support.c[0], 20);
    near(support.c[1], 20);
  }
  for (const plane of [solid.geometry[cap], target.geometry[reference]]) {
    assert.equal(plane.kind, 'plane');
    near(plane.n[0] / plane.n[2], -1 / 4);
    near(plane.n[1], 0);
    near(plane.o[2] - (plane.o[0] - 20) / 4, height);
  }
  assert.equal(solid.rims.length, 2);
  const sampledRadii = solid.rims.map(rim => {
    const radius = Math.hypot(rim[0][0] - 20, rim[0][1] - 20);
    for (const [x, y, z] of rim) {
      near(Math.hypot(x - 20, y - 20), radius);
      near(z, height + (x - 20) / 4);
    }
    return radius;
  }).sort((a, b) => a - b);
  near(sampledRadii[0], 8);
  near(sampledRadii[1], 10);
  // A half-annulus has area 18π and second X moment 738π about its circle centre.
  const expectedVolume = 18 * Math.PI * height;
  const expectedCentroid = [20 + 41 / (4 * height), 20 + 488 / (27 * Math.PI), height / 2 + 41 / (32 * height)];
  const { bodies } = await f.bodies();
  assert.deepEqual(bodies.map(body => body.key).sort(), ['b3', 'b4']);
  const worker = bodies.find(body => body.key === 'b4');
  near(solid.mass.volume, expectedVolume);
  near(worker.volume, expectedVolume);
  expectedCentroid.forEach((value, axis) => {
    near(solid.mass.centroid[axis], value);
    near(worker.centroid[axis], value);
  });
  f.report.observations.push({ label, height, volume: solid.mass.volume, centroid: solid.mass.centroid,
    gap: solid.report.maximumEdgeSurfaceGap, pcurveGap: solid.report.maximumPcurveGap, digest: solid.digest });
  return { solid: solid.digest, target: target.digest };
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const agentFile = join(f.output, 'replace-agent.bcad');
  await writeFile(agentFile, JSON.stringify(seed));
  const authoredByAgent = await withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 3 },
    agentFile, 'replace-agent', async call => {
      const pin = await call('query', { action: 'summary' });
      await call('features', { action: 'command', command: 'replace-face', faces: [cap, reference], expectedRevision: pin.revision });
      return JSON.parse(await readFile(agentFile, 'utf8'));
    });
  const source = await f.inspect('source', seed);
  await f.newPage();
  await f.openFile(join(f.output, 'source-doc.bcad'), seed.nodes.length);
  await f.same(seed);
  await view('Top');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await frame();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await point([20, 29, 12]);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Replace face');
  const panel = hud('Replace face');
  await panel.getByText('Pick a tilted face on another solid.', { exact: true }).waitFor();

  f.phase = 'Reject a perpendicular reference plane';
  await view('Front');
  await point([44 + 14.5 / n, 22, 20 + 10 / n]);
  await status(panel, 'refused');
  assert.match(await panel.locator('.hud-error').innerText(), /perpendicular/i);
  assert.ok(await button('Apply', panel).isDisabled());
  await f.same(seed);
  await f.snapshot('01-perpendicular-refused');

  f.phase = 'Replace the upper cap with the inclined reference';
  await view('Bottom');
  await f.page.waitForFunction(() => window.__studioCamera().pitch < -1.3);
  await point([44 + 16 / n, 26, 20 + 4 / n]);
  await status(panel, 'preview');
  await panel.getByText(reference).waitFor();
  await button('Apply', panel).click();
  await f.changed(seed);
  const accepted = await f.doc(), node = accepted.nodes[4];
  assert.deepEqual(accepted, authoredByAgent);
  assert.deepEqual(accepted.nodes.slice(0, 4), seed.nodes);
  assert.deepEqual([node.kind, node.faces, node.target.feature, node.target.face], ['replace-face', [cap], 'n3', reference]);
  const original = source.find(row => row.key === 'b0');
  const first = await measure('02-applied', accepted, original, 14);
  assert.equal(first.target, source.find(row => row.key === 'b3').digest);
  await button('Iso').click();
  await frame();
  await f.snapshot('02-inclined-cap');

  f.phase = 'Refuse collapse and move the inclined reference';
  await f.openFeatureEditor(3, 'reference position');
  const z = f.editor().getByLabel('ΔZ', { exact: true });
  const undoBefore = await button('Undo').getAttribute('data-tip');
  await z.fill('-11.5');
  await button('Apply', f.editor()).click();
  const failure = f.editor().locator('.hud-error'), details = failure.locator('details:not([open]) > summary');
  await failure.waitFor();
  if (await details.count()) await details.click();
  assert.match(await failure.innerText(), /opposite cap/i);
  await f.same(accepted);
  assert.equal(await button('Undo').getAttribute('data-tip'), undoBefore);
  await f.snapshot('03-collapse-refused');
  await z.fill('-3');
  await f.applyEditor(accepted, '04-moved-reference');
  const moved = await f.doc(), expected = await measure('04-moved', moved, original, 11);
  assert.deepEqual(moved.nodes[4], node);
  await f.undo();
  await f.same(accepted);
  await f.redo();
  await f.same(moved);
  const saved = await f.save('inclined-exact-semicylinder');
  await f.freshOpen(saved.file, moved, '05-reopened');
  assert.deepEqual(await measure('05-reopened', await f.doc(), original, 11), expected);
  await f.openFeatureEditor(4, 'reopened cap replacement');
  await button('Edit Replace face', f.editor()).click();
  const history = hud('Edit Replace face');
  await history.getByText(reference, { exact: false }).waitFor();
  await f.snapshot('06-reopened-binding');
  await button('Cancel', history).click();
  await f.same(moved);
});

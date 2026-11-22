import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const outer = 'n0.normal', inner = 'n0.reverse', cap = 'n0.v-max', reference = 'n2.bottom', n = Math.sqrt(5);
const replaceFirst = process.argv.includes('--replace-first');
const requirement = { id: 'WALL-4', source: 'Keep at least 4 mm of radial wall.', hard: true,
  check: { query: { fn: 'radial_wall', a: outer, b: inner }, op: '>=', value: 4, tol: 0.01, unit: 'mm' } };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 4, parameters: {},
  nodes: [
    { id: 'n0', kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', thickness: 2, side: 'reverse',
      surface: {
        degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
        controlPoints: [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]].map(([x, y]) => [[x, y, 0], [x, y, 12]]),
        weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
      } },
    { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8],
      plane: { origin: [44, 20, 13], normal: [0, 1 / n, 2 / n], xAxis: [1, 0, 0] } },
    { id: 'n2', kind: 'extrude', sketch: 1, height: 3 },
    { id: 'n3', kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] },
  ],
  outputs: { b0: { node: 0, side: 'solid' }, b3: { node: 3, side: 'solid' } },
  requirements: [requirement],
};
const pins = [
  'apps/cad-studio/test/exact-semicylinder-wall-cap-replacement-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  ...['app/nativeOffsetFace', 'app/offsetFaceEdit', 'app/profileCommands', 'app/replaceFaceCommand', 'chat/thickenWall', 'engine/doc',
    'engine/evaluate', 'engine/exactThickenEdit', 'engine/offsetPlane'].map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  ...['features/exact-cylinder-cap-offset', 'part/part-model'].map(name => 'packages/barocss-cad/src/' + name + '.ts'),
];
const f = await createFlow({
  name: 'exact-semicylinder-wall-cap-replacement', envFrozen: 'D1661_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Combine a signed wall Offset and a linked inclined upper-cap replacement, then edit and reopen the link.',
  limits: ['One upright two-quarter Exact semicylinder and one planar donor. Desktop WebGPU and local stdio MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key, brep}) => {
  const { vertices, edges, coedges, loops, faces, shells, bodies } = brep;
  const cap = faces.find(face => face.name === 'n0.v-max');
  const rims = new Set(coedges.filter(use => cap?.loops.includes(use.loop)).map(use => use.edge));
  const arcs = edges.filter(edge => rims.has(edge.id) && edge.curve.degree === 2).map(({curve}) => {
    const [lo, hi] = curveDomain(curve);
    return Array.from({ length: 17 }, (_, i) => evaluateCurve(curve, lo + (hi - lo) * i / 16));
  });
  const incidence = [vertices.map(v => v.id), edges.map(e => [e.id, e.vertices, e.curve.id]),
    coedges.map(({pcurve, ...use}) => [use, pcurve?.id]), loops,
    faces.map(({surface, ...face}) => [face, surface.id]), shells, bodies];
  return { key, arcs, incidence, geometry: Object.fromEntries(faces.map(face => [face.name, faceGeometry(face)])),
    mass: brepMassProperties(brep, 1), report: checkBrep(brep, { strict: true }), digest: digestOf(brep) };
})));
`,
});
const button = (name, within = f.page) => within.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (panel, text) => panel.locator('.status').filter({ hasText: new RegExp('^' + text + '$') }).waitFor();
const near = (got, want, tolerance = 1e-7) => assert.ok(Math.abs(got - want) < tolerance, `${got} != ${want}`);
const wallPass = () => f.page.getByRole('listitem', { name: `Requirement ${requirement.id}`, exact: true })
  .and(f.page.locator('.req.pass')).waitFor();
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 3 }, file, label, run);
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();

async function view(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: name, exact: true }).click();
  await f.page.waitForFunction(label => {
    const marks = document.querySelectorAll('.view-cube .vc-label');
    return marks.length === 1 && marks[0].textContent === label;
  }, name.toUpperCase());
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function pick(world) {
  const pixel = await f.page.evaluate(p => {
    const screen = window.__studioScreenOf(p);
    return screen && document.elementFromPoint(...screen)?.matches('canvas.vp-canvas') ? screen : null;
  }, world);
  assert.ok(pixel, JSON.stringify(world));
  await f.page.mouse.click(...pixel);
}

async function measure(label, doc, stock, donor, radius, height, slope) {
  const rows = await f.inspect(label, doc), target = rows.find(row => row.key === 'b3'), solid = rows.find(row => row.key !== 'b3');
  assert.ok(solid.report.valid && target.report.valid);
  assert.deepEqual(solid.incidence, stock.incidence);
  assert.ok(solid.report.maximumEdgeSurfaceGap < 1e-8 && solid.report.maximumPcurveGap < 1e-8);
  if (donor) assert.equal(target.digest, donor.digest);
  const top = solid.geometry[cap], bottom = solid.geometry['n0.v-min'];
  near(bottom.o[2], 0);
  near(top.n[1] / top.n[2], slope);
  near(top.o[2] + slope * (top.o[1] - 20), height);
  for (const [name, r] of [[outer, radius], [inner, 8]]) {
    const support = solid.geometry[name];
    assert.deepEqual([support.kind, support.a], ['cylinder', [0, 0, 1]]);
    near(support.r, r);
  }
  const arcs = solid.arcs.map(rim => {
    const r = Math.hypot(rim[0][0] - 20, rim[0][1] - 20);
    for (const [x, y, z] of rim) { near(Math.hypot(x - 20, y - 20), r); near(z, height - slope * (y - 20)); }
    return r;
  }).sort((a, b) => a - b);
  assert.equal(arcs.length, 2);
  near(arcs[0], 8);
  near(arcs[1], radius);
  const levels = solid.arcs.flat().map(point => point[2]);
  const min = Math.min(...levels), max = Math.max(...levels);
  near(min, height - slope * radius);
  near(max, height);
  const a = Math.PI / 2 * (radius ** 2 - 64), m = 2 / 3 * (radius ** 3 - 512), q = Math.PI / 8 * (radius ** 4 - 4096);
  const volume = height * a - slope * m;
  const centroid = [20, 20 + (height * m - slope * q) / volume,
    (height ** 2 * a - 2 * height * slope * m + slope ** 2 * q) / (2 * volume)];
  const worker = (await f.bodies()).bodies.find(body => body.key === solid.key);
  near(solid.mass.volume, volume);
  near(worker.volume, volume);
  centroid.forEach((value, axis) => { near(solid.mass.centroid[axis], value); near(worker.centroid[axis], value); });
  f.report.observations.push({ label, radius, height, min, max, volume: solid.mass.volume, digest: solid.digest,
    pcurveGap: solid.report.maximumPcurveGap });
  return { solid: solid.digest, donor: target.digest };
}

async function applyWall(prior, tilted) {
  await view('Back');
  await pick([20, 30, tilted ? 4 : 6]);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await status(panel, 'preview');
  await panel.getByLabel('Offset', { exact: true }).fill('2');
  await status(panel, 'preview');
  await button('Apply', panel).click();
  await f.changed(prior);
  return f.doc();
}

async function applyReplace(prior, radius) {
  await view('Top');
  await pick([20, 20 + (radius + 8) / 2, 12]);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Replace face');
  const panel = hud('Replace face');
  await panel.getByText('Pick a tilted face on another solid.', { exact: true }).waitFor();
  await view('Bottom');
  await pick([48, 20 + 8 / n, 13 - 4 / n]);
  await status(panel, 'preview');
  await panel.getByText(reference).waitFor();
  await button('Apply', panel).click();
  await f.changed(prior);
  return f.doc();
}

async function refusal(panel, prior, undoBefore) {
  const error = panel.locator('.hud-error'), details = error.locator('details:not([open]) > summary');
  await error.waitFor();
  if (await details.count()) await details.click();
  assert.match(await error.innerText(), /opposite cap/i);
  await f.same(prior);
  assert.equal(await button('Undo').getAttribute('data-tip'), undoBefore);
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
    for (const command of replaceFirst ? ['replace-face', 'offset-face'] : ['offset-face', 'replace-face']) {
      const pin = await call('query', { action: 'summary' });
      const args = command === 'replace-face' ? { faces: [cap, reference] } : { faces: [outer], values: { d: 2 } };
      await call('features', { action: 'command', command, ...args, expectedRevision: pin.revision });
    }
    return JSON.parse(await readFile(agentFile, 'utf8'));
  });
  const source = await f.inspect('01-source', seed);
  const stock = source.find(row => row.key === 'b0'), donor = source.find(row => row.key === 'b3');
  await f.newPage();
  await f.openFile(join(f.output, '01-source-doc.bcad'), seed.nodes.length);
  await f.same(seed);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await frame();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  f.phase = 'Apply the first edit';
  const first = replaceFirst ? await applyReplace(seed, 10) : await applyWall(seed, false);
  await measure('02-first', first, stock, donor, replaceFirst ? 10 : 12, replaceFirst ? 13 : 12, replaceFirst ? .5 : 0);
  f.phase = 'Apply the second edit';
  const both = replaceFirst ? await applyWall(first, true) : await applyReplace(first, 12);
  assert.deepEqual(both, agentDoc);
  assert.deepEqual(both.nodes.slice(0, 5), first.nodes);
  assert.deepEqual(both.nodes[5].parent, { node: 4, side: 'solid' });
  await measure('03-combined', both, stock, donor, 12, 13, .5);
  await wallPass();
  await button('Iso').click();
  await frame();
  await f.snapshot('03-wall-and-inclined-cap');

  f.phase = 'Refuse radial growth that brings the inclined rim into contact';
  await f.openFeatureEditor(replaceFirst ? 5 : 4, 'signed wall Offset');
  await button('Edit offset', f.editor()).click();
  const radial = hud('Edit Offset face'), undoBefore = await button('Undo').getAttribute('data-tip');
  await radial.getByLabel('Offset', { exact: true }).fill('16');
  await status(radial, 'refused');
  assert.ok(await button('Apply', radial).isDisabled());
  await refusal(radial, both, undoBefore);
  await f.snapshot('04-radial-growth-refused');
  await button('Cancel', radial).click();

  f.phase = 'Refuse contact caused by reference movement and accept a valid move';
  await f.openFeatureEditor(3, 'inclined reference position');
  const z = f.editor().getByLabel('ΔZ', { exact: true });
  await z.fill('-7');
  await button('Apply', f.editor()).click();
  await refusal(f.editor(), both, undoBefore);
  await f.snapshot('05-reference-contact-refused');
  await z.fill('-2');
  await f.applyEditor(both, '06-reference-moved');
  const moved = await f.doc(), expected = await measure('06-moved', moved, stock, undefined, 12, 11, .5);
  assert.deepEqual(moved.nodes.slice(4), both.nodes.slice(4));
  await wallPass();
  await f.undo();
  await f.same(both);
  await f.redo();
  await f.same(moved);

  const saved = await f.save('wall-and-inclined-cap');
  await f.freshOpen(saved.file, moved, '07-reopened');
  assert.deepEqual(await measure('07-reopened', await f.doc(), stock, undefined, 12, 11, .5), expected);
  await wallPass();
  const bytes = await readFile(saved.file);
  await mcp(saved.file, 'current-wall-evidence', async call => {
    const proof = await call('requirements', { action: 'evidence' });
    const row = JSON.parse(proof.files[0].text).evidence.find(row => row.requirement?.id === requirement.id);
    assert.deepEqual([row.result.verdict, row.result.value.entities, row.freshness.state], ['pass', [outer, inner], 'current']);
    near(row.result.number, 4, 1e-10);
    f.report.observations.push({ wall: row.result.number, revision: proof.revision });
  });
  assert.deepEqual(await readFile(saved.file), bytes);
  await f.snapshot('08-current-wall-after-open');
  await f.openFeatureEditor(replaceFirst ? 4 : 5, 'reopened linked cap');
  await button('Edit Replace face', f.editor()).click();
  const editor = hud('Edit Replace face');
  await editor.getByText(reference, { exact: false }).waitFor();
  await f.snapshot('09-reopened-binding');
  await button('Cancel', editor).click();
  await f.same(moved);
});

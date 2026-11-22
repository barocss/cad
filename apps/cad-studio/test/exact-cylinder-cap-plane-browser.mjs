import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const cap = 'n0.v-max', reference = 'n2.top';
const skins = ['n0.normal', 'n0.reverse'];
const wall = { id: 'RADIAL-2', source: 'Keep the radial wall at 2 ± 0.01 mm.', hard: true,
  check: { query: { fn: 'radial_wall', a: skins[0], b: skins[1] }, op: '==', value: 2, tol: 0.01, unit: 'mm' } };
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
  nodes: [
    { id: 'n0', kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', thickness: 2, side: 'reverse',
      surface: {
        degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
        controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, 12]]),
        weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
      } },
    { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [44, 22], max: [56, 33] },
    { id: 'n2', kind: 'extrude', sketch: 1, from: 10, height: 4 },
    { id: 'n3', kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] },
  ],
  outputs: { b0: { node: 0, side: 'solid' }, b3: { node: 3, side: 'solid' } },
  requirements: [wall],
};
const pins = [
  'apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  ...['app/nativeOffsetFace', 'app/offsetFaceEdit', 'app/profileCommands', 'engine/doc', 'engine/offsetPlane', 'engine/upperThickenCapOffset']
    .map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  'packages/barocss-cad/src/features/exact-cylinder-cap-offset.ts',
];
const f = await createFlow({
  name: 'exact-cylinder-cap-plane', envFrozen: 'D1649_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Bind the original upper cap of an Exact semicylinder to a parallel native face. Move and reopen the reference.',
  limits: ['One upright two-quarter semicylinder and one translated reference box. Desktop WebGPU and local stdio MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, brep, valid: checkBrep(brep, { strict: true }).valid,
  geometry: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face)])),
  volume: brepMassProperties(brep, 1).volume, digest: digestOf(brep),
}))));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const requirement = () => f.page.getByRole('listitem', { name: `Requirement ${wall.id}`, exact: true });
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (got, want, tolerance = 1e-8) => assert.ok(Math.abs(got - want) < tolerance, `${got} != ${want}`);

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

async function check(label, doc, original, height) {
  const rows = await f.inspect(label, doc);
  const { bodies } = await f.bodies();
  assert.deepEqual(bodies.map(body => body.key).sort(), ['b3', 'b4']);
  const solid = rows.find(row => row.key === 'b4'), target = rows.find(row => row.key === 'b3');
  assert.ok(solid.valid && target.valid);
  assert.deepEqual([solid.geometry[cap].o[2], target.geometry[reference].o[2]], [height, height]);
  near(solid.geometry[skins[0]].r, 10);
  near(solid.geometry[skins[1]].r, 8);
  const volume = 18 * Math.PI * height;
  near(solid.volume, volume);
  near(bodies.find(body => body.key === 'b4').volume, volume);
  const upper = ([x, y, z]) => [x, y, z === 12 ? height : z];
  const expected = {
    ...original,
    vertices: original.vertices.map(vertex => ({ ...vertex, point: upper(vertex.point) })),
    edges: original.edges.map(edge => ({ ...edge, curve: { ...edge.curve, controlPoints: edge.curve.controlPoints.map(upper) } })),
    faces: original.faces.map(face => ({ ...face, surface: { ...face.surface,
      controlPoints: face.surface.controlPoints.map(row => row.map(upper)),
    } })),
  };
  assert.deepEqual(solid.brep, expected);
  f.report.observations.push({ label, height, volume, actualVolume: solid.volume, digest: solid.digest });
  return { digest: solid.digest, referenceDigest: target.digest };
}

await f.run(async () => {
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'cap-and-reference.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const before = await f.inspect('source-native', seed);
  const original = before.find(row => row.key === 'b0').brep;
  const referenceBefore = before.find(row => row.key === 'b3').digest;
  await view('Top');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await frame();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await point([20, 29, 12]);
  await f.command('Offset face');
  const panel = hud('Offset face');
  await panel.getByLabel('Mode', { exact: true }).selectOption('to-plane');
  await panel.getByText('Pick a parallel face on another solid', { exact: true }).waitFor();

  f.phase = 'Refuse a perpendicular plane and bind the parallel reference';
  await view('Front');
  await point([50, 22, 12]);
  await status(panel, 'refused');
  assert.match(await panel.locator('.hud-error').innerText(), /parallel/i);
  assert.ok(await button('Apply', panel).isDisabled());
  await f.same(seed);
  await f.snapshot('01-perpendicular-refused');
  await view('Top');
  await point([50, 27, 14]);
  await status(panel, 'preview');
  await panel.getByText(reference).waitFor();
  await f.same(seed);
  await button('Apply', panel).click();
  await f.changed(seed);
  const bound = await f.doc(), node = bound.nodes[4];
  assert.deepEqual(bound.nodes.slice(0, 4), seed.nodes);
  assert.deepEqual([node.kind, node.faces, node.parent, node.distance], ['offset-face', [cap], { node: 0, side: 'solid' }, undefined]);
  assert.deepEqual([node.target.body, node.target.feature, node.target.face], [{ node: 3, side: 'solid' }, 'n3', reference]);
  await requirement().and(f.page.locator('.req.pass')).waitFor();
  const first = await check('02-bound-native', bound, original, 14);
  assert.equal(first.referenceDigest, referenceBefore);
  await button('Iso').click();
  await frame();
  await f.snapshot('02-reference-bound');

  await f.openFeatureEditor(3, 'reference position');
  const z = f.editor().getByLabel('ΔZ', { exact: true });
  const undoBefore = await button('Undo').getAttribute('data-tip');
  f.phase = 'Refuse a reference move that collapses the semicylinder';
  await z.fill('-14');
  await button('Apply', f.editor()).click();
  const failure = f.editor().locator('.hud-error');
  await failure.waitFor();
  const details = failure.locator('details:not([open]) > summary');
  if (await details.count()) await details.click();
  assert.match(await failure.innerText(), /opposite cap/i);
  await f.same(bound);
  assert.equal(await button('Undo').getAttribute('data-tip'), undoBefore);
  await f.snapshot('03-reference-motion-refused');

  await z.fill('-5');
  await f.applyEditor(bound, '04-reference-moved');
  const moved = await f.doc();
  assert.deepEqual(moved.nodes[3], { ...bound.nodes[3], offset: [0, 0, -5] });
  assert.deepEqual(moved.nodes[4], node);
  const second = await check('04-moved-native', moved, original, 9);
  await requirement().and(f.page.locator('.req.pass')).waitFor();
  await f.undo();
  await f.same(bound);
  await f.redo();
  await f.same(moved);
  const saved = await f.save('semicylinder-to-plane');
  await f.freshOpen(saved.file, moved, '05-fresh-open');
  assert.deepEqual(await check('05-reopened-native', await f.doc(), original, 9), second);
  await requirement().and(f.page.locator('.req.pass')).waitFor();
  await f.openFeatureEditor(4, 'reopened plane Offset');
  await button('Edit offset', f.editor()).click();
  const edit = hud('Edit Offset face');
  assert.equal(await edit.getByLabel('Mode', { exact: true }).inputValue(), 'to-plane');
  await edit.getByText(reference).waitFor();
  await f.snapshot('06-reopened-reference');
  await button('Cancel', edit).click();
  await f.same(moved);

  const bytes = await readFile(saved.file);
  const wallProof = await withMcpSession({ app: f.app, output: f.output, clientName: 'cap-to-plane' }, saved.file, 'wall-evidence', async call => {
    const result = await call('requirements', { action: 'evidence' });
    const row = JSON.parse(result.files[0].text).evidence.find(row => row.requirement?.id === wall.id);
    assert.deepEqual([row.result.run, row.result.verdict, row.result.value.entities, row.freshness.state],
      [result.revision, 'pass', skins, 'current']);
    near(row.result.number, 2);
    return { revision: result.revision, measured: row.result.number, names: row.result.value.entities };
  });
  assert.deepEqual(await readFile(saved.file), bytes);
  f.report.observations.push({ wallProof });
});

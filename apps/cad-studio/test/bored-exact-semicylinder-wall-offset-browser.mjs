import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const [output, input] = process.argv.slice(2);
const sourceBytes = await readFile(input), source = JSON.parse(sourceBytes);
const outer = 'n0.normal', inner = 'n0.reverse', cap = 'n0.v-max', donor = 'b3';
assert.equal(source.nodes.at(-1).kind, 'difference');
const pins = [
  'apps/cad-studio/test/mcp-browser-session.mjs',
  ...['app/nativeOffsetFace', 'app/profileCommands', 'app/offsetFaceEdit', 'engine/doc']
    .map(file => 'packages/barocss-cad-model/src/' + file + '.ts'),
  ...['features/exact-cylinder-cap-offset', 'features/heal-exact-cylinder-bore', 'part/part-model', 'part/part-exact-cylinder-bore']
    .map(file => 'packages/barocss-cad/src/' + file + '.ts'),
];
const f = await createFlow({
  name: 'bored-exact-semicylinder-wall-offset', output, envFrozen: 'D1666_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Offset the original outer wall while retaining the radial through bore and linked inclined cap.',
  limits: ['One upright Exact semicylinder after the paired edits and one central radial through bore. Desktop WebGPU and local stdio MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key, brep}) => {
  const { faces, loops, coedges, edges } = brep;
  const skin = faces.find(face => face.name === 'n0.reverse');
  const innerEdges = new Set(coedges.filter(use => skin?.loops.includes(use.loop)).map(use => use.edge));
  const openingLoops = Object.fromEntries(faces.filter(face => ['n0.normal', 'n0.reverse'].includes(face.name)).map(face => [
    face.name, loops.filter(loop => face.loops.includes(loop.id)).map(loop => loop.kind).sort(),
  ]));
  return { key, digest: digestOf(brep), report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
    geometry: Object.fromEntries(faces.map(face => [face.name, faceGeometry(face)])),
    faceIds: faces.map(face => [face.id, face.name, face.loops]), edgeIds: edges.map(edge => [edge.id, edge.name, edge.vertices]),
    innerEdges: edges.filter(edge => innerEdges.has(edge.id)), innerSupport: skin?.surface, openingLoops };
})));
`,
});
const button = (name, within = f.page) => within.getByRole('button', { name, exact: true });
const status = (panel, text) => panel.locator('.status').filter({ hasText: new RegExp('^' + text + '$') }).waitFor();
const offset = panel => panel.getByLabel('Offset', { exact: true });
const near = (got, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(got - expected) <= tolerance, `${got} != ${expected} within ${tolerance}`);
const faceLabel = () => f.page.getByLabel('Face property and colour target');

function boredVolume(outside, height) {
  const intervals = 512, radius = 1.5, step = Math.PI / (2 * intervals);
  let sum = 0;
  for (let i = 0; i <= intervals; i++) {
    const theta = i * step, x = radius * Math.sin(theta);
    const length = Math.sqrt(outside ** 2 - x ** 2) - Math.sqrt(8 ** 2 - x ** 2);
    const weight = i === 0 || i === intervals ? 1 : i % 2 ? 4 : 2;
    sum += weight * 4 * (radius * Math.cos(theta)) ** 2 * length;
  }
  return Math.PI / 2 * (outside ** 2 - 8 ** 2) * height - (outside ** 3 - 8 ** 3) / 3 - sum * step / 3;
}

async function measure(label, doc, key, outside, height, previous) {
  const rows = await f.inspect(label, doc), body = rows.find(row => row.key === key);
  assert.equal(rows.length, 2);
  const donorPart = rows.find(row => row.key === donor);
  assert.ok(donorPart?.report.valid && body?.report.valid);
  assert.equal(body.report.topology[0].genus, 1);
  assert.deepEqual(body.report.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 60, edges: 30, vertices: 24 });
  assert.deepEqual(body.openingLoops, { [outer]: ['inner', 'outer'], [inner]: ['inner', 'outer'] });
  for (const suffix of ['#1', '#2']) {
    const bore = body.geometry['n7.side0' + suffix];
    assert.deepEqual([bore.kind, bore.a, bore.out], ['cylinder', [0, 1, 0], -1]);
    near(bore.r, 1.5);
    near(bore.c[0], 20);
    near(bore.c[2], 3);
  }
  near(body.geometry[outer].r, outside);
  near(body.geometry[inner].r, 8);
  const top = body.geometry[cap];
  near(top.n[1] / top.n[2], .5);
  near(top.o[2] + .5 * (top.o[1] - 20), height);
  near(body.geometry['n0.v-min'].o[2], 0);
  const expected = boredVolume(outside, height), studio = (await f.bodies()).bodies.find(row => row.key === key);
  near(body.mass.volume, expected);
  near(studio.volume, expected);
  if (previous) {
    assert.deepEqual(body.faceIds, previous.body.faceIds);
    assert.deepEqual(body.edgeIds, previous.body.edgeIds);
    assert.deepEqual(body.innerEdges, previous.body.innerEdges);
    assert.deepEqual(body.innerSupport, previous.body.innerSupport);
    assert.equal(donorPart.digest, previous.donor.digest);
  }
  f.report.observations.push({ label, outside, inner: 8, nativeVolume: body.mass.volume, workerVolume: studio.volume, expected,
    digest: body.digest, pcurveGap: body.report.maximumPcurveGap });
  return { body, donor: donorPart };
}

async function startOffset() {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Back', exact: true }).click();
  await f.page.locator('.vc-label').getByText('BACK', { exact: true }).waitFor();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await f.worldClick([20, 32, 6]);
  await faceLabel().filter({ hasText: outer }).waitFor();
  await f.command('Offset face');
  const panel = f.page.getByRole('dialog', { name: 'Offset face', exact: true });
  await status(panel, 'preview');
  assert.equal(await panel.getByLabel('Mode').count(), 0);
  assert.equal(await offset(panel).inputValue(), '1');
  return panel;
}

async function dragThroughZero(panel) {
  const polygon = f.page.locator('g.gizmo-handle[data-handle="d"] polygon');
  await polygon.waitFor();
  const movement = await f.page.evaluate(() => {
    const a = window.__studioScreenOf([20, 32, .75]), b = window.__studioScreenOf([20, 30, .75]);
    return b.map((value, i) => value - a[i]);
  });
  assert.ok(Math.hypot(...movement) > 6);
  const tip = await polygon.evaluate(element => {
    const points = [...element.points], transform = element.getScreenCTM();
    const point = new DOMPoint(points.reduce((n, p) => n + p.x, 0) / points.length,
      points.reduce((n, p) => n + p.y, 0) / points.length).matrixTransform(transform);
    return [point.x, point.y];
  });
  await f.page.mouse.move(...tip);
  await f.page.mouse.down();
  await f.page.mouse.move(tip[0] + movement[0], tip[1] + movement[1], { steps: 6 });
  await f.page.mouse.up();
  assert.equal(await offset(panel).inputValue(), '-1');
  await status(panel, 'preview');
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
  await f.freshOpen(input, source, '01-drilled-source');
  const original = await measure('01-original', source, 'b8', 12, 13);

  f.phase = 'Pick the outer wall and drag the signed handle through zero';
  const panel = await startOffset();
  await dragThroughZero(panel);
  await f.same(source);
  await f.snapshot('02-inward-handle-preview');
  await button('Apply', panel).click();
  await f.changed(source);
  const narrowed = await f.doc(), editIndex = narrowed.nodes.length - 1, edit = narrowed.nodes[editIndex];
  assert.deepEqual(narrowed.nodes.slice(0, editIndex), source.nodes);
  assert.deepEqual([edit.kind, edit.parent, edit.faces, edit.distance], ['offset-face', { node: 8, side: 'solid' }, [outer], -1]);
  const key = 'b' + editIndex;
  await measure('03-inward', narrowed, key, 11, 13, original);
  await f.snapshot('03-original-bore-at-r11');

  const agentFile = join(output, 'bored-wall-agent.bcad');
  await writeFile(agentFile, sourceBytes);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 3 }, agentFile, 'signed-wall-agent', async call => {
    const expectedRevision = await currentPartRevision(call), before = await readFile(agentFile);
    const command = { action: 'command', command: 'offset-face', faces: [outer], values: { d: -1 }, expectedRevision };
    const blind = await call('features', { ...command, values: { d: 3 } }, true);
    assert.match(JSON.stringify(blind), /through bore|cutter|opening/i);
    assert.deepEqual(await readFile(agentFile), before);
    await call('features', command);
    const accepted = await readFile(agentFile);
    assert.deepEqual(JSON.parse(accepted), narrowed);
    const stale = await call('features', command, true);
    assert.equal(stale.code, 'COMMAND_STALE');
    assert.deepEqual(await readFile(agentFile), accepted);
    f.report.observations.push({ expectedRevision, stale: stale.code });
  });

  f.phase = 'Refuse a blind result and edit the saved Offset outward';
  await f.openFeatureEditor(editIndex, 'outer radial Offset');
  await button('Edit offset', f.editor()).click();
  const history = f.page.getByRole('dialog', { name: 'Edit Offset face', exact: true });
  const undoBefore = await button('Undo').getAttribute('data-tip');
  await offset(history).fill('3');
  await status(history, 'refused');
  const error = history.locator('.hud-error'), details = error.locator('details:not([open]) > summary');
  if (await details.count()) await details.click();
  assert.match(await error.innerText(), /through bore|cutter|opening/i);
  assert.ok(await button('Apply', history).isDisabled());
  await f.same(narrowed);
  assert.equal(await button('Undo').getAttribute('data-tip'), undoBefore);
  await f.snapshot('04-blind-result-refused');
  await offset(history).fill('1');
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(narrowed);
  const expanded = await f.doc();
  assert.deepEqual(expanded.nodes, [...narrowed.nodes.slice(0, editIndex), { ...edit, distance: 1 }]);
  await measure('05-outward', expanded, key, 13, 13, original);
  await f.snapshot('05-original-bore-at-r13');
  await f.undo();
  await f.same(narrowed);
  await f.redo();
  await f.same(expanded);

  f.phase = 'Move the inclined donor without replacing the bore or latest Offset';
  await f.openFeatureEditor(3, 'inclined reference position');
  await f.editor().getByLabel('ΔZ', { exact: true }).fill('-1');
  await f.applyEditor(expanded, '06-donor-moved');
  const moved = await f.doc();
  assert.deepEqual(moved.nodes.slice(4), expanded.nodes.slice(4));
  const bound = await measure('06-moved', moved, key, 13, 12);
  const saved = await f.save('bored-wall-with-linked-cap');
  await f.freshOpen(saved.file, moved, '07-reopened');
  const reopened = await measure('07-opened', await f.doc(), key, 13, 12);
  assert.equal(reopened.body.digest, bound.body.digest);
  assert.equal(reopened.donor.digest, bound.donor.digest);
  assert.deepEqual(await readFile(input), sourceBytes);
});

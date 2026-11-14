import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/SweepHistoryInputs.tsx',
  'apps/cad-studio/scripts/cad-mcp.mjs',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad/src/features/revolve.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'exact-arc-bore-sweep', output: process.argv[2], envFrozen: 'D1300_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep a mixed section with one bore along a circular rail, resize the bore, and reopen it in Studio.',
  limits: ['Desktop Chrome WebGPU and local L1 MCP dry-run. One quarter arc and one offset circular bore.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep } = output;
const { valid, counts, topology } = checkOutput(output);
const { volume, centroid, method } = massPropertiesOf(output);
const faces = brep.faces.map(face => ({
  name: face.name,
  degrees: [face.surface.degreeU, face.surface.degreeV],
  loops: face.loops.map(id => brep.loops.find(loop => loop.id === id).kind),
  poles: face.name.includes('bore') ? [] : face.surface.controlPoints,
}));
console.log(JSON.stringify({ valid, counts, genus: topology[0].genus, family: brep.source.family, volume, centroid, method, faces }));
`,
});
const path = { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[33,-7,4],[33,13,4],[13,13,4]], weights: [1,Math.SQRT1_2,1] };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { boreEdgeX: 9 }, nextId: 1,
  nodes: [{
    id: 'n0', kind: 'sketch', profile: 'loop',
    segments: [
      { kind: 'line', start: [2,3] },
      { kind: 'arc', start: [12,3], center: [12,8], direction: 'ccw' },
      { kind: 'line', start: [12,13] },
      { kind: 'line', start: [2,13] },
    ],
    holes: [[{ kind: 'arc', start: [{ parameter: 'boreEdgeX' }, 7], center: [8,7], direction: 'cw' }]],
    sideTags: { outer: ['base', 'round', 'roof', 'back'], holes: [['bore']] },
  }],
  direct: {
    sources: { arc: `@model bend { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points: ${JSON.stringify(path.controlPoints)}; weights: ${JSON.stringify(path.weights)}; } }` },
    objects: [{ id: 'arc', name: 'Quarter rail', source: 'arc', geometry: 'rail' }],
  },
  outputs: {},
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance,
  JSON.stringify({ actual, expected, tolerance }));
const halfDisk = 12.5 * Math.PI;
const area = 100 + halfDisk;
const cx = (700 + 12 * halfDisk + 250 / 3) / area;
const outerXX = 10 * (12 ** 3 - 2 ** 3) / 3 + 144 * halfDisk + 24 * (250 / 3) + Math.PI * 5 ** 4 / 8;
const variance = outerXX / area - cx ** 2;

function exactMass(radius) {
  const holeArea = Math.PI * radius ** 2, holeRho = 20 + 8 - cx;
  const radialMoment = 20 * area - holeRho * holeArea;
  const radialSecond = area * (400 + variance) - holeArea * (holeRho ** 2 + radius ** 2 / 4);
  const d = 2 / Math.PI * radialSecond / radialMoment;
  return { volume: Math.PI / 2 * radialMoment, centre: [13 + d, -7 + d, 4 - holeRho * holeArea / radialMoment] };
}

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

async function chooseSweep() {
  await button('Sketch 1').click();
  await button('Quarter rail').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  return hud().getByLabel('Representation', { exact: true });
}

async function verify(doc, radius, label) {
  const sweep = doc.nodes.at(-1);
  assert.equal(sweep.kind, 'sweep-curve');
  assert.equal(sweep.mode, 'exact');
  assert.equal(sweep.sketch, 0);
  assert.equal(sweep.name, 'Quarter rail');
  assert.deepEqual(sweep.path, path);
  assert.deepEqual(doc.nodes[0], seed.nodes[0]);
  const { volume, centre: expectedCentre } = exactMass(radius);
  const read = await f.inspect(label, doc);
  assert.ok(read.valid && read.genus === 1 && read.family === 'sweep-curve');
  assert.equal(read.method, 'closed-form');
  assert.deepEqual(read.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 });
  const caps = read.faces.filter(face => face.loops.includes('inner'));
  assert.deepEqual(caps.map(face => face.name).sort(), [sweep.id + '.end', sweep.id + '.start']);
  assert.ok(caps.every(face => face.loops.join(',') === 'outer,inner' && face.degrees.join(',') === '1,1'));
  for (const wall of ['base', 'round', 'roof', 'back', 'bore']) {
    assert.ok(read.faces.some(face => face.name.includes('.side[' + wall + ']')));
  }
  const bore = read.faces.filter(face => face.name.includes('.side[bore]'));
  assert.equal(bore.length, 2);
  assert.ok(bore.every(face => face.degrees.join(',') === '2,2' && face.loops.join(',') === 'outer'));
  near(read.volume, volume);
  read.centroid.forEach((coordinate, i) => near(coordinate, expectedCentre[i]));
  const shown = await f.bodies();
  assert.equal(shown.bodies.length, 1);
  near(shown.bodies[0].volume, volume);
  const rendered = await f.page.evaluate(() => window.__studioSection());
  assert.equal(rendered.bodies, 1);
  near(rendered.shownVolume, volume, volume * .02);
  f.report.observations.push({ label, radius, volume: read.volume, centroid: read.centroid, genus: read.genus, counts: read.counts,
    shownVolume: rendered.shownVolume });
  return read.faces.filter(face => face.poles.length && !face.loops.includes('inner'));
}

async function verifyBoreMouth(label) {
  f.phase = label;
  await button('Front').click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const a = window.__studioScreenOf([33,-7,5]), b = window.__studioScreenOf([33,13,5]);
    return Math.hypot(a[0] - b[0], a[1] - b[1]) < .01;
  });
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const x = 33 + 8 - cx;
  const { inside, beside } = await f.page.evaluate(x => ({
    inside: window.__studioSurfacePoint([x,-7,5]), beside: window.__studioSurfacePoint([x+2,-7,5]),
  }), x);
  // The curved tunnel can have a deeper hit. Only the nearby solid probe should see the start cap.
  assert.ok(beside && Math.abs(beside[1] + 7) < 1e-4, JSON.stringify({ inside, beside }));
  assert.ok(!inside || inside[1] > -6, JSON.stringify({ inside, beside }));
  f.report.observations.push({ label, inside, beside });
  await f.snapshot(label);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };

  f.phase = 'discover and dry-run the mixed section through local MCP';
  const file = join(f.output, 'mixed-profile-source.bcad'), contents = JSON.stringify(seed);
  await writeFile(file, contents, { flag: 'wx' });
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-sweep-profile-test' }, file, 'mixed-profile', async call => {
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, /one strictly interior circular hole/);
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.features[0].id, seed.nodes[0].id);
    const [rail] = summary.direct_curves;
    const args = { action: 'command', command: 'sweep-curve', values: {
      sketch: summary.features[0].id, path: rail.id, pathRevision: rail.revision, representation: 'exact',
    } };
    const result = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args }] });
    assert.equal(result.dryRun, true);
    near(result.change.volume, exactMass(1).volume, .001);
    assert.equal(await readFile(file, 'utf8'), contents);
    f.report.observations.push({ label: 'agent-dry-run', volume: result.change.volume });
  });

  f.phase = 'refuse a bore tangent to the outer wall';
  const tangent = { ...seed, parameters: { boreEdgeX: 12 } };
  await f.newPage();
  await open({ name: 'tangent-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tangent)) });
  await f.same(tangent);
  await (await chooseSweep()).selectOption('exact');
  await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
  await hud().getByText(/hole is too close|strictly inside the outer profile/i).first().waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  assert.deepEqual(await f.doc(), tangent);
  await f.snapshot('tangent-bore-refused');

  f.phase = 'open the mixed profile and Direct quarter arc';
  await f.newPage();
  await open(file);
  await f.same(seed);
  const representation = await chooseSweep();
  f.phase = 'apply the exact circular Sweep with its bore';
  await representation.selectOption('exact');
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  assert.deepEqual(await f.doc(), seed);
  await button('Apply', hud()).click();
  await f.changed(seed);
  const accepted = await f.doc();
  const walls = await verify(accepted, 1, 'applied');
  await f.snapshot('applied');

  const edited = (await f.setParameter('boreEdgeX', 9.5, 'bore-resized')).doc;
  assert.deepEqual(edited.nodes, accepted.nodes);
  const editedWalls = await verify(edited, 1.5, 'edited');
  assert.deepEqual(editedWalls, walls, 'The outer walls do not move when the hole changes');

  await f.undo();
  await f.same(accepted);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('mixed-arc-bore-sweep');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  assert.deepEqual(await verify(await f.doc(), 1.5, 'reopened'), walls);
  await verifyBoreMouth('reopened-bore-mouth');
  await f.openFeatureEditor(1, 'reopened Sweep');
  await f.editor().getByText('Exact circular arc', { exact: true }).waitFor();
  await f.editor().getByText('Sketch 1', { exact: true }).waitFor();
  await f.snapshot('reopened-sweep-history');
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-arc-bore-test' }, saved.file, 'reopened-bore', async call => {
    const result = await call('query', { action: 'summary' });
    near(result.facts.volume, exactMass(1.5).volume, .001);
    assert.deepEqual(result.features.at(-1).node, edited.nodes.at(-1));
  });
});

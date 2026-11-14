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
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'exact-straight-profile-sweep', output: process.argv[2], envFrozen: 'D1297_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep an exact line-and-arc section with one bore, edit its named sketch parameter, and reopen its native part in Studio.',
  limits: ['Desktop Chrome WebGPU and local L1 MCP dry-run. One tilted straight path and one interior circle.'],
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
const path = { degree: 1, knots: [0,0,1,1], controlPoints: [[13,-7,4],[13,5,20]], weights: [1,1] };
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
    sources: { line: '@model straight { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[13,-7,4],[13,5,20]]; weights: [1,1]; } }' },
    objects: [{ id: 'straight', name: 'Tilted rail', source: 'line', geometry: 'rail' }],
  },
  outputs: {},
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance,
  JSON.stringify({ actual, expected, tolerance }));
const area = 100 + 12.5 * Math.PI;

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

async function chooseSweep() {
  await button('Sketch 1').click();
  await button('Tilted rail').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  return hud().getByLabel('Representation', { exact: true });
}

async function verify(doc, radius, label) {
  const sweep = doc.nodes.at(-1);
  assert.equal(sweep.kind, 'sweep-curve');
  assert.equal(sweep.mode, 'exact-straight');
  assert.equal(sweep.sketch, 0);
  assert.equal(sweep.name, 'Tilted rail');
  assert.deepEqual(sweep.path, path);
  assert.deepEqual(doc.nodes[0], seed.nodes[0]);
  const holeArea = Math.PI * radius ** 2;
  const centroid = (700 + 12.5 * Math.PI * (12 + 20 / (3 * Math.PI))) / area;
  const areaOffset = [holeArea * (centroid - 8) / (area - holeArea), holeArea / (area - holeArea)];
  const volume = 20 * (area - holeArea);
  const expectedCentre = [13 + areaOffset[0], -1 + .8 * areaOffset[1], 12 - .6 * areaOffset[1]];
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
      sketch: summary.features[0].id, path: rail.id, pathRevision: rail.revision, representation: 'exact-straight',
    } };
    const result = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args }] });
    assert.equal(result.dryRun, true);
    near(result.change.volume, 20 * (area - Math.PI), .001);
    assert.equal(await readFile(file, 'utf8'), contents);
    f.report.observations.push({ label: 'agent-dry-run', volume: result.change.volume });
  });

  f.phase = 'refuse a bore tangent to the outer wall';
  const tangent = { ...seed, parameters: { boreEdgeX: 12 } };
  await f.newPage();
  await open({ name: 'tangent-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tangent)) });
  await f.same(tangent);
  await (await chooseSweep()).selectOption('exact-straight');
  await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
  await hud().getByText(/hole is too close|strictly inside the outer profile/i).first().waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  assert.deepEqual(await f.doc(), tangent);
  await f.snapshot('tangent-bore-refused');

  f.phase = 'open the mixed profile and tilted Direct line';
  await f.newPage();
  await open(file);
  await f.same(seed);
  const representation = await chooseSweep();
  await representation.selectOption('exact');
  await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
  await hud().getByText(/outside the exact Sweep range|circular arc from 30° to 90°/i).first().waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  assert.deepEqual(await f.doc(), seed);
  await f.snapshot('arc-mode-refused');

  f.phase = 'apply the exact straight Sweep';
  await representation.selectOption('exact-straight');
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
  const saved = await f.save('mixed-profile-sweep');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  assert.deepEqual(await verify(await f.doc(), 1.5, 'reopened'), walls);
  await f.openFeatureEditor(1, 'reopened Sweep');
  await f.editor().getByText('Exact straight path', { exact: true }).waitFor();
  await f.editor().getByText('Sketch 1', { exact: true }).waitFor();
  await f.snapshot('reopened-sweep-history');
});

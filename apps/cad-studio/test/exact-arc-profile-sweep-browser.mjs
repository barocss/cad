import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/SweepHistoryInputs.tsx',
  'apps/cad-studio/scripts/cad-mcp.mjs', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/features/revolve.ts'];
const f = await createFlow({
  name: 'exact-arc-profile-sweep', output: process.argv[2], envFrozen: 'D1298_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Propose a mixed section along a circular rail, approve it in Studio, edit it, and reopen the native result.',
  limits: ['Desktop Chrome WebGPU and local stdio L1 MCP. One mixed section, no bore, 90-degree rail.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep } = output;
const { valid, counts, topology, maximumEdgeSurfaceGap } = checkOutput(output);
const { volume, centroid, method } = massPropertiesOf(output);
const faces = brep.faces.map(face => ({ name: face.name, degrees: [face.surface.degreeU, face.surface.degreeV],
  loops: face.loops.map(id => brep.loops.find(loop => loop.id === id).kind) }));
console.log(JSON.stringify({ valid, counts, genus: topology[0].genus, maximumEdgeSurfaceGap, family: brep.source.family,
  volume, centroid, method, faces }));
`,
});
const radius = 20;
const rail = r => ({ degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[13+r,-7,4], [13+r,-7+r,4], [13,-7+r,4]],
  weights: [1,Math.SQRT1_2,1] });
const source = path => `@model arc { version: 0; length-unit: mm; @curve #rail { type: nurbs;
  degree: 2; knots: [0,0,0,1,1,1]; control-points: ${JSON.stringify(path.controlPoints)}; weights: ${JSON.stringify(path.weights)}; } }`;
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { backX: 2 }, nextId: 1,
  nodes: [{
    id: 'n0', kind: 'sketch', profile: 'loop',
    segments: [
      { kind: 'line', start: [{ parameter: 'backX' },3] },
      { kind: 'arc', start: [12,3], center: [12,8], direction: 'ccw' },
      { kind: 'line', start: [12,13] },
      { kind: 'line', start: [{ parameter: 'backX' },13] },
    ],
    sideTags: { outer: ['base','round','roof','back'] },
  }],
  direct: {
    sources: { arc: source(rail(radius)) },
    objects: [{ id: 'arc', name: 'Quarter rail', source: 'arc', geometry: 'rail' }],
  },
  outputs: {},
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance,
  JSON.stringify({ actual, expected, tolerance }));

function measure(back) {
  const rect = 10 * (12 - back), semicircle = Math.PI * 25 / 2, roundFirst = 2 * 5 ** 3 / 3;
  const area = rect + semicircle;
  const sectionX = (rect * (12 + back) / 2 + 12 * semicircle + roundFirst) / area;
  const second = 10 * (12 ** 3 - back ** 3) / 3 + 12 ** 2 * semicircle + 24 * roundFirst + Math.PI * 5 ** 4 / 8;
  const variance = second / area - sectionX ** 2;
  const d = (radius + variance / radius) * 2 / Math.PI;
  return { sectionX, volume: area * radius * Math.PI / 2, centroid: [13 + d, -7 + d, 4] };
}
async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

async function verify(doc, back, label) {
  const sweep = doc.nodes.at(-1);
  assert.equal(sweep.kind, 'sweep-curve');
  assert.equal(sweep.mode, 'exact');
  assert.equal(sweep.sketch, 0);
  assert.equal(sweep.name, 'Quarter rail');
  assert.deepEqual(sweep.path, rail(radius));
  assert.deepEqual(doc.nodes[0], seed.nodes[0]);
  const native = await f.inspect(label, doc);
  assert.ok(native.valid && native.genus === 0 && native.family === 'sweep-curve');
  assert.ok(native.maximumEdgeSurfaceGap < 1e-7);
  assert.equal(native.method, 'closed-form');
  assert.deepEqual(native.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  const degrees = { start: [1,1], end: [1,1], 'side[base]': [1,1], 'side[round]': [2,2], 'side[roof]': [1,1], 'side[back]': [2,1] };
  assert.deepEqual(Object.fromEntries(native.faces.map(face => [face.name.slice(sweep.id.length + 1), face.degrees])), degrees);
  assert.ok(native.faces.every(face => face.loops.join(',') === 'outer'));
  const exact = measure(back);
  near(native.volume, exact.volume);
  native.centroid.forEach((value, i) => near(value, exact.centroid[i]));
  const worker = await f.bodies();
  assert.equal(worker.bodies.length, 1);
  near(worker.bodies[0].volume, exact.volume);
  const shown = await f.page.evaluate(() => window.__studioSection());
  assert.equal(shown.bodies, 1);
  near(shown.shownVolume, exact.volume, exact.volume * .02);
  f.report.observations.push({ label, ...native, shownVolume: shown.shownVolume });
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

  f.phase = 'refuse a section that touches the bend axis';
  const tangent = { ...seed, direct: { ...seed.direct, sources: { arc: source(rail(measure(2).sectionX - 2)) } } };
  await f.newPage();
  await open({ name: 'axis-touch.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tangent)) });
  await f.same(tangent);
  await button('Sketch 1').click();
  await button('Quarter rail').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
  await hud().getByText(/bend axis/i).first().waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  assert.deepEqual(await f.doc(), tangent);
  await f.snapshot('axis-clearance-refused');

  f.phase = 'discover, dry-run, and propose the native arc Sweep with local MCP';
  const file = join(f.output, 'mixed-arc-proposal.bcad'), initial = JSON.stringify(seed);
  const title = 'Sweep the mixed profile around the quarter rail';
  await writeFile(file, initial, { flag: 'wx' });
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-arc-profile-test' }, file, 'mixed-arc-propose', async call => {
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, /outline without holes that clears the bend axis/);
    const summary = await call('query', { action: 'summary' });
    const [path] = summary.direct_curves, [sketch] = summary.features;
    assert.equal(sketch.id, 'n0');
    assert.equal(path.id, 'arc');
    const args = { action: 'command', command: 'sweep-curve', values: {
      sketch: sketch.id, path: path.id, pathRevision: path.revision, representation: 'exact',
    } };
    const ops = [{ tool: 'features', args }];
    const dry = await call('features', { action: 'batch', dryRun: true, ops });
    assert.equal(dry.dryRun, true);
    near(dry.change.volume, measure(2).volume, .001);
    assert.equal(await readFile(file, 'utf8'), initial);
    const made = await call('proposals', { action: 'propose', title, ops });
    assert.deepEqual([made.proposal, made.applied], ['P1', false]);
    f.report.observations.push({ label: 'agent-dry-run', volume: dry.change.volume });
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, seed.nodes);

  f.phase = 'approve the agent proposal in Studio';
  await f.newPage();
  await open(file);
  await f.same(pending);
  await button('Chat').first().click();
  await card().getByText(title).waitFor();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.page.waitForFunction(() => window.__studioSection().shownKeys.includes('b1'));
  assert.deepEqual((await f.bodies()).bodies, []);
  assert.deepEqual(await f.doc(), pending);
  await f.snapshot('pending-arc-preview');
  await button('Accept', card()).click();
  await f.page.waitForFunction(() => window.__studioDoc.proposals?.[0]?.status === 'accepted');
  await f.ready();
  const accepted = await f.doc();
  assert.equal(accepted.history.at(-1).by.agent, 'user');
  await verify(accepted, 2, 'approved');

  const edited = (await f.setParameter('backX', 3, 'back-wall-edited')).doc;
  assert.deepEqual(edited.nodes, accepted.nodes);
  await verify(edited, 3, 'edited');
  await f.undo();
  await f.same(accepted);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('mixed-arc-sweep');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  await verify(await f.doc(), 3, 'reopened');
  await f.openFeatureEditor(1, 'reopened Sweep');
  await f.editor().getByText('Exact circular arc', { exact: true }).waitFor();
  await f.editor().getByText('Sketch 1', { exact: true }).waitFor();
  await f.snapshot('reopened-sweep-history');
  assert.deepEqual(await readFile(file), pendingBytes);
});

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = ['apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/server/cadDoc.ts',
  'packages/barocss-cad-model/src/chat/sweepSource.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/part/query.ts', 'packages/barocss-cad-model/src/chat/remap.ts'];
const f = await createFlow({
  name: 'sweep-agent-proposal', envFrozen: 'D1295_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Discover and dry-run native Sweep with local MCP, approve and edit it in Studio, and reopen it.',
  limits: ['Desktop WebGPU, local autonomy L1, a straight and a circular arc Sweep.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const [out] = evaluateCadPart(toPartDocument(JSON.parse(readFileSync(process.argv[2], 'utf8')))).outputs;
const { brep } = out;
console.log(JSON.stringify({ strict: checkBrep(brep, { strict: true }).valid,
  faces: brep.faces.length, family: brep.source.family, volume: massPropertiesOf(out).volume }));
`,
});
const mcp = (path, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-sweep-test' }, path, label, run);
const line = { degree: 1, knots: [0,0,1,1], controlPoints: [[13,-7,4],[25,9,30]], weights: [1,1] };
const arc = { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[20,0,0],[20,0,20],[0,0,20]], weights: [1,.707106781,1] };
const curveSource = path => `@model rail { version: 0; length-unit: mm; @curve #rail { type: nurbs;
  degree: ${path.degree}; knots: [${path.knots}]; control-points: ${JSON.stringify(path.controlPoints)}; weights: [${path.weights}]; } }`;
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 8, parameters: {}, outputs: {},
  nodes: [
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [0,0], max: [3,4] },
    { id: 'n7', kind: 'sketch', profile: 'circle', center: [7,8], radius: 2 },
  ],
  direct: { sources: { line: curveSource(line), arc: curveSource(arc) }, objects: [
    { id: 'n7-line', name: 'Straight rail', source: 'line', geometry: 'rail' },
    { id: 'arc', name: 'Quarter arc', source: 'arc', geometry: 'rail' },
    { id: 'hidden', name: 'Hidden', source: 'line', geometry: 'rail', hidden: true },
  ] },
};
const title = 'Sweep circular profile on the selected straight rail';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const volume = radius => Math.PI * radius ** 2 * Math.sqrt(1076);
const near = (a, b, tol = 1e-7) => Math.abs(a - b) < tol;
async function verify(doc, radius, label) {
  const node = doc.nodes.at(-1);
  assert.equal(node.kind, 'sweep-curve');
  assert.equal(node.mode, 'exact-straight');
  assert.equal(doc.nodes[node.sketch].id, 'n7');
  assert.deepEqual(node.path, line);
  const native = await f.inspect(label, doc);
  assert.ok(native.strict && native.family === 'sweep-curve' && native.faces === 4 && near(native.volume, volume(radius)));
  const [worker] = (await f.bodies()).bodies;
  assert.ok(near(worker.volume, native.volume));
  f.report.observations.push({ label, native, workerVolume: worker.volume });
}
async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
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
  const file = join(f.output, 'sweep-proposal.bcad'), original = Buffer.from(JSON.stringify(seed));
  await writeFile(file, original, { flag: 'wx' });
  f.phase = 'discover and dry-run exact Sweep';
  await mcp(file, 'discover-and-propose', async call => {
    const read = await call('query', { action: 'summary' });
    assert.deepEqual(read.features.map(item => item.id), ['n2', 'n7']);
    assert.deepEqual(read.direct_curves.map(({ id }) => id), ['n7-line', 'arc']);
    const desc = await call('describe', { command: 'sweep-curve' });
    assert.match(desc.values.pathRevision, /query.summary/);
    assert.match(desc.values.representation, /exact-straight.*exact/);
    const [straight, arc] = read.direct_curves;
    const command = (curve, representation, sketch = 'n7') => ({
      action: 'command', command: 'sweep-curve', values: { sketch, path: curve.id, pathRevision: curve.revision, representation },
    });
    const operation = args => [{ tool: 'features', args }];
    const batch = (args, error = false) => call('features', { action: 'batch', dryRun: true, ops: operation(args) }, error);
    const lineCommand = command(straight, 'exact-straight');
    assert.match((await call('features', lineCommand, true)).error, /autonomy L1/i);
    assert.match((await batch(command({ ...straight, id: 'hidden' }, 'exact-straight'), true)).error, /visible and unambiguous/);
    assert.match((await batch(command({ ...straight, revision: '0'.repeat(64) }, 'exact-straight'), true)).error, /path geometry changed/);
    assert.match((await batch(command(straight, 'exact-straight', 'n0'), true)).error, /active finished sketch/);
    assert.match((await batch(command(straight, 'faceted'), true)).error, /representation must be exact/);
    assert.match((await batch(command(straight, 'exact'), true)).error, /30° to 90°/);
    const linePreview = await batch(lineCommand);
    const arcPreview = await batch(command(arc, 'exact'));
    assert.ok(linePreview.dryRun && near(linePreview.change.volume, volume(2), .001));
    assert.ok(arcPreview.dryRun && near(arcPreview.change.volume, 40 * Math.PI ** 2, .001));
    assert.deepEqual(await readFile(file), original);
    const made = await call('proposals', { action: 'propose', title, ops: operation(lineCommand) });
    assert.deepEqual([made.proposal, made.applied], ['P1', false]);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts proposals in the studio/i);
    f.report.observations.push({ label: 'dry-run', straight: linePreview.change.volume, arc: arcPreview.change.volume });
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, seed.nodes);

  f.phase = 'refuse rebase when the same Direct ID has different geometry';
  const changed = structuredClone(pending);
  changed.direct.sources.line = curveSource({ ...line, controlPoints: [line.controlPoints[0], [25,9,31]] });
  await f.newPage();
  await open({ name: 'changed-sweep-source.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
  await f.same(changed);
  await button('Chat').first().click();
  const rebase = () => button('Rebase & preview', card());
  await rebase().click();
  await f.waitToast(/could not be rebased.*Sweep path geometry changed/is);
  assert.equal(await button('Accept', card()).count(), 0);
  await f.same(changed);
  assert.deepEqual((await f.bodies()).bodies, []);
  await f.snapshot('changed-source-rebase-refused');

  f.phase = 'approve the original Sweep after reordering the source sketch';
  const reordered = { ...pending, nodes: [...pending.nodes].reverse() };
  await f.newPage();
  await open({ name: 'reordered-sweep-source.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(reordered)) });
  await f.same(reordered);
  await button('Chat').first().click();
  await card().getByText(title).waitFor();
  await rebase().click();
  await button('Hide', card()).waitFor();
  await f.page.waitForFunction(() => window.__studioSection().shownKeys.includes('b8'));
  assert.deepEqual((await f.bodies()).bodies, []);
  const rebased = await f.doc();
  assert.deepEqual(rebased.nodes, reordered.nodes);
  assert.deepEqual(rebased.proposals[0].orders, [['n7', 'n2']]);
  await f.snapshot('pending-sweep-preview');
  await button('Accept', card()).click();
  await f.page.waitForFunction(() => window.__studioDoc.proposals?.[0]?.status === 'accepted');
  await f.ready();
  const accepted = await f.doc();
  assert.equal(accepted.history.at(-1).by.agent, 'user');
  await verify(accepted, 2, 'accepted-straight-sweep');
  await f.openFeatureEditor(2, 'approved Sweep diameter');
  await f.editor().getByLabel('Diameter', { exact: true }).fill('6');
  const edited = (await f.applyEditor(accepted, 'edited-sweep')).doc;
  await verify(edited, 3, 'edited-straight-sweep');
  const saved = await f.save('approved-exact-sweep');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  await verify(await f.doc(), 3, 'reopened-straight-sweep');
  await f.snapshot('reopened-sweep');
  await mcp(saved.file, 'readback', async call => {
    const read = await call('query', { action: 'summary' });
    assert.deepEqual(read.features.at(-1).node, edited.nodes.at(-1));
    assert.ok(near(read.facts.volume, volume(3), .001));
  });
  assert.deepEqual(await readFile(file), pendingBytes);
});

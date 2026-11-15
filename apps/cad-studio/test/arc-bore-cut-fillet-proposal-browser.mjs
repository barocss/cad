import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = ['apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'packages/barocss-cad-model/src/chat/part/nativeContinuity.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts'];
const f = await createFlow({
  name: 'arc-bore-cut-fillet-proposal', output: process.argv[2], envFrozen: 'D1306_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Discover and propose the original bore rim fillet through local MCP. Preview, approve, edit and reopen in Studio.',
  limits: ['Local stdio MCP at autonomy L1, desktop WebGPU, original mouth on the D1305 radial cut.'],
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = evaluateCadPart(toPartDocument(doc)).outputs;
const report = checkOutput(output), { volume } = massPropertiesOf(output);
const nativeSHA = createHash('sha256').update(JSON.stringify(output.brep)).digest('hex');
console.log(JSON.stringify({ valid: report.valid, gap: report.maximumEdgeSurfaceGap, genus: report.topology[0].genus, counts: report.counts, volume, nativeSHA }));
`,
});
const path = { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[33,-7,4],[33,13,4],[13,13,4]], weights: [1,Math.SQRT1_2,1] };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { boreEdgeX: 9 }, nextId: 5,
  nodes: [{
    id: 'n0', kind: 'sketch', profile: 'loop',
    segments: [
      { kind: 'line', start: [2,3] },
      { kind: 'arc', start: [12,3], center: [12,8], direction: 'ccw' },
      { kind: 'line', start: [12,13] },
      { kind: 'line', start: [2,13] },
    ],
    holes: [[{ kind: 'arc', start: [{ parameter: 'boreEdgeX' },7], center: [8,7], direction: 'cw' }]],
    sideTags: { outer: ['base', 'round', 'roof', 'back'], holes: [['bore']] },
  }, { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Quarter rail', path, mode: 'exact' }, {
    id: 'n2', kind: 'sketch', profile: 'rectangle', min: [-10,-5], max: [10,35],
    plane: { origin: [13,-7,4], normal: [Math.SQRT1_2,-Math.SQRT1_2,0], xAxis: [0,0,-1] },
  }, { id: 'n3', kind: 'extrude', sketch: 2, height: 50 }, {
    kind: 'intersect', left: { node: 1, side: 'solid' }, right: { node: 3, side: 'solid' }, id: 'n4',
  }],
  direct: {
    sources: { arc: `@model bend { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points: ${JSON.stringify(path.controlPoints)}; weights: ${JSON.stringify(path.weights)}; } }` },
    objects: [{ id: 'arc', name: 'Quarter rail', source: 'arc', geometry: 'rail' }],
  },
  outputs: { b4: { node: 4, side: 'solid' } },
};
const names = ['n1.side[bore]#1|n1.start', 'n1.side[bore]#2|n1.start'];
const halfDisk = 12.5 * Math.PI;
const cx = (700 + 12 * halfDisk + 250 / 3) / (100 + halfDisk);
const boreMajor = 28 - cx;
const slicedVolume = (20 * (100 + halfDisk) - Math.PI * boreMajor) * Math.PI / 4;
// Independent local envelope volumes from the D1302 offset-plane/torus integration.
const removedByRadius = new Map([[.2, .056376910923], [.25, .089047173384]]);
const volumeAt = radius => slicedVolume - removedByRadius.get(radius);
const title = 'Round the original curved bore mouth';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-curved-bore-fillet-proposal' }, file, label, run);
async function verify(doc, radius, label) {
  const feature = doc.nodes[5];
  assert.equal(feature.kind, 'fillet');
  assert.deepEqual([...feature.edges].sort(), names);
  assert.deepEqual(feature.parent, { node: 4, side: 'solid' });
  assert.equal(feature.radius, radius);
  const native = await f.inspect(label, doc);
  assert.ok(native.valid && native.genus === 1 && native.gap < 1e-7 && native.counts.bodies === 1);
  near(native.volume, volumeAt(radius));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, native.volume);
  f.report.observations.push({ label, radius, ...native });
  return native;
}
async function shownVolume(key) {
  await f.page.waitForFunction(key => {
    const keys = window.__studioSection?.()?.shownKeys;
    return keys?.length === 1 && keys[0] === key;
  }, key);
  return (await f.page.evaluate(() => window.__studioSection())).shownVolume;
}
async function open(file, doc) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
  await f.same(doc);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const make = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async args => {
    const context = await make({ ...args, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  f.phase = 'discover the original bore mouth and propose through local MCP';
  const file = join(f.output, 'pending-curved-bore.bcad'), original = Buffer.from(JSON.stringify(seed));
  await writeFile(file, original, { flag: 'wx' });
  await mcp(file, 'pending', async call => {
    const before = await call('query', { action: 'summary' });
    assert.equal(before.feature_count, 5);
    near(before.facts.volume, slicedVolume, .001);
    assert.deepEqual(before.bodies.map(body => body.key), ['b4']);
    const joints = await call('query', { action: 'native_joints', body: 'b4' });
    assert.match(joints.revision, /^[a-f0-9]{64}$/);
    const rims = joints.edges.filter(edge => edge.faces.includes('n1.start') && edge.faces.some(face => /^n1\.side\[bore\]/.test(face)));
    assert.deepEqual(rims.map(edge => edge.name).sort(), names);
    for (const edge of rims) {
      const read = await call('query', { action: 'edge_curvature', body: 'b4', edgeId: edge.id, expectedRevision: joints.revision });
      assert.equal(read.edgeId, edge.id);
      near(read.minimum, 1, 1e-5);
      near(read.maximum, 1, 1e-5);
    }
    assert.match((await call('describe', { command: 'fillet' })).values.radius, /fillet radius/i);
    const args = radius => ({ action: 'command', command: 'fillet', edges: rims.map(edge => edge.name), values: { radius } });
    const propose = radius => ({ action: 'propose', title, ops: [{ tool: 'features', args: args(radius) }] });
    assert.match((await call('features', args(.2), true)).error, /autonomy L1/i);
    const oversized = await call('proposals', propose(10), true);
    assert.match(oversized.error, /runs off its faces/);
    assert.deepEqual(await readFile(file), original);
    const proposed = await call('proposals', propose(.2));
    assert.deepEqual([proposed.proposal, proposed.applied, proposed.change.volume], ['P1', false, -.056]);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts proposals in the studio/i);
    assert.deepEqual(await call('query', { action: 'summary' }), before);
    f.report.observations.push({ label: 'mcp-proposal', rims, revision: joints.revision, delta: proposed.change.volume, refused: oversized.error });
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, seed.nodes);
  assert.deepEqual(pending.outputs, seed.outputs);
  assert.deepEqual(pending.proposals.map(p => [p.id, p.status]), [['P1', 'open']]);
  await f.newPage();
  await open(file, pending);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();

  f.phase = 'preview, show before, and hide while retaining the part';
  const base = await shownVolume('b4');
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  const candidate = await shownVolume('b5');
  assert.notEqual(candidate, base);
  await f.same(pending);
  await f.snapshot('candidate-visible');
  await button('Show before', card()).click();
  assert.equal(await shownVolume('b4'), base);
  await button('Hide', card()).click();
  assert.equal(await shownVolume('b4'), base);
  await f.same(pending);
  assert.deepEqual(await readFile(file), pendingBytes);

  f.phase = 'approve the native fillet from the Studio proposal';
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  assert.equal(await shownVolume('b5'), candidate);
  await button('Accept', card()).click();
  await f.page.waitForFunction(() => window.__studioDoc?.proposals?.[0]?.status === 'accepted');
  await f.ready();
  const accepted = await f.doc(), approval = accepted.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent, approval.proposed_by.agent, accepted.proposals[0].decided.by],
    ['accept', 'P1', 'user', 'chat', 'user']);
  assert.deepEqual(accepted.nodes.slice(0, 5), seed.nodes);
  await verify(accepted, .2, 'approved');
  await f.snapshot('approved');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  await f.openFeatureEditor(5, 'edit the approved fillet');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.25');
  const edited = (await f.applyEditor(accepted, 'edited')).doc;
  assert.equal(edited.proposals[0].status, 'accepted');
  const native = await verify(edited, .25, 'edited');
  const saved = await f.save('approved-curved-bore-fillet');
  await f.newPage();
  await open(saved.file, edited);
  const reopened = await verify(await f.doc(), .25, 'reopened');
  assert.equal(reopened.nativeSHA, native.nativeSHA);
  await f.snapshot('reopened');
  const savedBytes = await readFile(saved.file);
  await mcp(saved.file, 'reopened', async call => {
    const read = await call('query', { action: 'summary' });
    const decisions = await call('proposals', { action: 'list', all: true });
    near(read.facts.volume, volumeAt(.25), .001);
    assert.deepEqual(read.features.at(-1).node, edited.nodes[5]);
    assert.deepEqual(decisions.proposals.map(p => [p.id, p.status]), [['P1', 'accepted']]);
    f.report.observations.push({ label: 'mcp-reopened', volume: read.facts.volume, savedSHA: sha256(savedBytes) });
  });
  assert.deepEqual(await readFile(saved.file), savedBytes);
  assert.deepEqual(await readFile(file), pendingBytes);
  f.report.observations.push({ label: 'display-preview', base, candidate });
});

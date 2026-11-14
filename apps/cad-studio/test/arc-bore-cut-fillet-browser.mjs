import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = ['apps/cad-studio/src/state/useCommandPreview.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts'];
const f = await createFlow({
  name: 'arc-bore-cut-fillet', output: process.argv[2], envFrozen: 'D1305_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Round the original start rim of a radially clipped circular Sweep and verify both surviving cap trims.',
  limits: ['Desktop WebGPU. One 45-degree radial cut, original start rim and constant fillet radii 0.2 and 0.25 mm.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkOutput, curveDomain, evaluateCadPart, evaluateCurve, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [out] = evaluateCadPart(toPartDocument(doc)).outputs;
const check = checkOutput(out);
const { volume } = massPropertiesOf(out);
const { brep } = out;
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const coedges = new Map(brep.coedges.map(use => [use.id, use]));
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const faces = new Map(brep.faces.map(face => [face.id, face.name]));
const caps = brep.faces.filter(face => ['n1.start','n3.bottom'].includes(face.name)).map(face => ({
  name: face.name,
  loops: face.loops.map(id => ({ kind: loops.get(id).kind, edges: loops.get(id).coedges.map(id => {
    const use = coedges.get(id), twin = coedges.get(use.twin), edge = edges.get(use.edge), [lo,hi] = curveDomain(edge.curve);
    return { name: edge.name, degree: edge.curve.degree, adjacent: faces.get(loops.get(twin.loop).face),
      paired: twin.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
      samples: Array.from({ length: 17 }, (_, i) => evaluateCurve(edge.curve, lo + (hi-lo)*i/16)) };
  }) })),
}));
console.log(JSON.stringify({ valid: check.valid, genus: check.topology[0].genus, gap: check.maximumEdgeSurfaceGap,
  counts: check.counts, volume, caps, fillet: out.fillet ?? [] }));
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
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance,
  JSON.stringify({ actual, expected, tolerance }));

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

function checkCap(cap, radius) {
  const cut = cap.name === 'n3.bottom', angle = cut ? Math.PI / 4 : 0;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  assert.deepEqual(cap.loops.map(loop => loop.kind), ['outer', 'inner']);
  const [outer, inner] = cap.loops;
  assert.deepEqual(outer.edges.map(edge => edge.degree).sort(), cut ? [1,1,1,2,2] : [1,1,1,2]);
  if (cut) assert.deepEqual(inner.edges.map(edge => edge.degree), [2,2]);
  else assert.ok(inner.edges.length > 2 && inner.edges.every(edge => edge.degree === 3));
  let residual = 0;
  for (const loop of cap.loops) for (const edge of loop.edges) {
    assert.ok(edge.paired);
    if (loop.kind === 'inner') assert.match(edge.adjacent, cut ? /^n1\.side\[bore\]/ : /^n5\.face/);
    else assert.match(edge.adjacent, /^n1\.side\[(base|round|roof|back)\]/);
    for (const [x,y,z] of edge.samples) {
      const radial = cos * (x - 13) + sin * (y + 7), plane = -sin * (x - 13) + cos * (y + 7);
      near(plane, 0);
      let error;
      if (loop.kind === 'inner') {
        const carrier = cut ? radial : Math.hypot(radial, radius);
        error = Math.hypot(carrier - boreMajor, z - 5) - (cut ? 1 : 1 + radius);
      } else {
        const s = radial - 20 + cx, t = 12 - z;
        if (edge.adjacent.includes('[round]')) error = Math.hypot(s - 12, t - 8) - 5;
        else if (edge.adjacent.includes('[back]')) error = s - 2;
        else error = t - (edge.adjacent.includes('[base]') ? 3 : 13);
      }
      near(error, 0);
      residual = Math.max(residual, Math.abs(error), Math.abs(plane));
    }
  }
  return { name: cap.name, outer: outer.edges.length, inner: inner.edges.length, residual };
}

async function verify(doc, radius, label, originalCut) {
  assert.deepEqual(doc.nodes.slice(0, 5), seed.nodes);
  const feature = doc.nodes[5];
  assert.equal(feature.kind, 'fillet');
  assert.equal(feature.radius, radius);
  assert.deepEqual(feature.parent, { node: 4, side: 'solid' });
  assert.deepEqual([...feature.edges].sort(), names);
  const read = await f.inspect(label, doc);
  assert.ok(read.valid && read.genus === 1 && read.counts.bodies === 1 && read.counts.shells === 1);
  assert.ok(read.gap <= 1e-7);
  assert.deepEqual(read.caps.map(cap => cap.name).sort(), ['n1.start', 'n3.bottom']);
  const caps = read.caps.map(cap => checkCap(cap, radius));
  const edgeData = cap => cap.loops.flatMap(loop => loop.edges).map(({ name, degree, samples }) => ({ name, degree, samples })).sort((a,b) => a.name.localeCompare(b.name));
  assert.deepEqual(edgeData(read.caps.find(cap => cap.name === 'n3.bottom')), edgeData(originalCut));
  assert.equal(read.fillet.length, 1);
  const [fit] = read.fillet;
  assert.deepEqual([...fit.edges].sort(), names);
  assert.ok(fit.patches > 1 && fit.stations > 2);
  assert.ok(fit.contact <= 1e-7 && fit.section <= 1e-7 && fit.ball <= 1e-7 && fit.normal <= 1e-4);
  const volume = volumeAt(radius);
  near(read.volume, volume);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  f.report.observations.push({ label, radius, expectedVolume: volume, volume: read.volume, counts: read.counts, gap: read.gap, fit, caps });
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
  await f.newPage();
  await open({ name: 'radially-clipped-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const cut = await f.inspect('unfilleted-cut', seed);
  assert.ok(cut.valid && cut.genus === 1);
  near(cut.volume, slicedVolume);
  const originalCut = cut.caps.find(cap => cap.name === 'n3.bottom');
  assert.ok(originalCut);
  f.phase = 'pick the start rim on the Studio canvas';
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const x = 33 + 8 - cx;
  const point = await f.screenOf([x + Math.SQRT1_2, -7, 5 + Math.SQRT1_2]);
  assert.ok(point && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);

  f.phase = 'preview and apply the rolling-ball fillet';
  await f.command('Fillet');
  const hud = f.page.getByRole('dialog', { name: 'Fillet', exact: true });
  const radius = hud.getByLabel('Radius', { exact: true });
  await radius.fill('10');
  await hud.locator('.status').filter({ hasText: /^refused$/ }).waitFor({ timeout: 60000 });
  assert.equal(await button('Apply', hud).isDisabled(), true);
  await f.same(seed);
  await f.snapshot('oversize-refused');
  await radius.fill('0.2');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor({ timeout: 60000 });
  const picked = hud.getByRole('group', { name: 'Fillet scope' }).locator('.field').filter({ hasText: 'Picked native edges' }).locator('span[title]');
  assert.deepEqual((await picked.getAttribute('title')).split('\n').sort(), names);
  await f.same(seed);
  await f.snapshot('curved-mouth-preview');
  await button('Apply', hud).click();
  await f.changed(seed);
  const applied = (await f.snapshot('curved-mouth-applied')).doc;
  await verify(applied, .2, 'fillet-0.2', originalCut);
  await f.openFeatureEditor(5, 'edit the curved bore fillet');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.25');
  const edited = (await f.applyEditor(applied, 'curved-mouth-edited')).doc;
  await verify(edited, .25, 'fillet-0.25', originalCut);
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);

  const saved = await f.save('curved-bore-fillet');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  await verify(await f.doc(), .25, 'reopened', originalCut);
  await f.snapshot('curved-mouth-reopened');
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-curved-bore-fillet-test' }, saved.file, 'reopened-fillet', async call => {
    const result = await call('query', { action: 'summary' });
    near(result.facts.volume, volumeAt(.25), .001);
    assert.deepEqual(result.features.at(-1).node, edited.nodes.at(-1));
    f.report.observations.push({ label: 'reopened-agent-readback', volume: result.facts.volume });
  });
});

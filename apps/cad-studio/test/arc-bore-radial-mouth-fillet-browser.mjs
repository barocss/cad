import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = ['apps/cad-studio/src/state/useCommandPreview.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts'];
const both = process.argv.includes('--both');
const f = await createFlow({
  name: 'arc-bore-radial-mouth-fillet', output: process.argv[2], envFrozen: both ? 'D1308_SOURCE_FROZEN' : 'D1307_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: both ? 'Round both bore mouths in separate editable features.' : 'Round the new cut rim and preserve the original cap.',
  limits: ['Desktop WebGPU. One radially clipped circular Sweep with a 2 mm bore and constant fillet radii 0.20 and 0.25 mm.'],
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
const names = ['n1.side[bore]#1|n3.bottom', 'n1.side[bore]#2|n3.bottom'];
const startNames = names.map(name => name.replace('n3.bottom', 'n1.start'));
const halfDisk = 12.5 * Math.PI;
const cx = (700 + 12 * halfDisk + 250 / 3) / (100 + halfDisk);
const boreMajor = 28 - cx;
const slicedVolume = (20 * (100 + halfDisk) - Math.PI * boreMajor) * Math.PI / 4;
// Reflection through the angular bisector preserves volume and maps the D1302 contact law to the cut side.
const removedByRadius = new Map([[.2, .056376910923], [.25, .089047173384]]);
const volumeAt = radius => slicedVolume - removedByRadius.get(radius);
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance,
  JSON.stringify({ actual, expected, tolerance }));

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

function checkCap(cap, radius, blend) {
  const cut = cap.name === 'n3.bottom', angle = cut ? Math.PI / 4 : 0;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  assert.deepEqual(cap.loops.map(loop => loop.kind), ['outer', 'inner']);
  const [outer, inner] = cap.loops;
  assert.deepEqual(outer.edges.map(edge => edge.degree).sort(), cut ? [1,1,1,2,2] : [1,1,1,2]);
  if (radius) assert.ok(inner.edges.length > 2 && inner.edges.every(edge => edge.degree === 3));
  else assert.deepEqual(inner.edges.map(edge => edge.degree), [2,2]);
  let residual = 0;
  for (const loop of cap.loops) for (const edge of loop.edges) {
    assert.ok(edge.paired);
    if (loop.kind === 'inner') {
      if (blend) assert.ok(edge.adjacent.startsWith(`${blend}.face`), edge.adjacent);
      else assert.match(edge.adjacent, /^n1\.side\[bore\]/);
    }
    else assert.match(edge.adjacent, /^n1\.side\[(base|round|roof|back)\]/);
    for (const [x,y,z] of edge.samples) {
      const radial = cos * (x - 13) + sin * (y + 7), plane = -sin * (x - 13) + cos * (y + 7);
      near(plane, 0);
      let error;
      if (loop.kind === 'inner') {
        const carrier = Math.hypot(radial, radius);
        error = Math.hypot(carrier - boreMajor, z - 5) - (1 + radius);
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

const capByName = (read, name) => read.caps.find(cap => cap.name === name);
const edgeData = cap => cap.loops.flatMap(loop => loop.edges).map(({ name, degree, samples }) => ({ name, degree, samples })).sort((a,b) => a.name.localeCompare(b.name));

function checkRetainedTrim(before, after) {
  const [oldOuter, oldInner] = capByName(before, 'n1.start').loops;
  const [newOuter, newInner] = capByName(after, 'n1.start').loops;
  assert.deepEqual(edgeData({ loops: [newOuter] }), edgeData({ loops: [oldOuter] }));
  // A second Boolean can reorder fitted patch suffixes. Match each trim by its sampled curve.
  const curves = loop => loop.edges.map(({ degree, samples }) => JSON.stringify([degree, samples])).sort();
  assert.deepEqual(curves(newInner), curves(oldInner));
}

async function verify(doc, radius, label, originalStart) {
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
  const caps = read.caps.map(cap => cap.name === 'n3.bottom' ? checkCap(cap, radius, feature.id) : checkCap(cap, 0));
  assert.deepEqual(edgeData(read.caps.find(cap => cap.name === 'n1.start')), edgeData(originalStart));
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

async function applyRim(previous, atCut, amount, refuseOversize = false) {
  f.phase = atCut ? 'pick the 45-degree cut rim' : 'pick the original start rim';
  if (atCut) {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name: 'Back left', exact: true }).click();
  } else await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  const alongView = atCut ? [12,-6,4] : [13,-6,4];
  await f.page.waitForFunction(p => {
    const a = window.__studioScreenOf([13,-7,4]), b = window.__studioScreenOf(p);
    return Math.hypot(a[0] - b[0], a[1] - b[1]) < .01;
  }, alongView);
  const radial = boreMajor + Math.SQRT1_2, along = radial * Math.SQRT1_2;
  const point = await f.screenOf(atCut ? [13 + along, -7 + along, 5 + Math.SQRT1_2] : [13 + radial, -7, 5 + Math.SQRT1_2]);
  assert.ok(point && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);

  f.phase = atCut ? 'preview the cut-rim fillet' : 'preview the original-rim fillet';
  await f.command('Fillet');
  const hud = f.page.getByRole('dialog', { name: 'Fillet', exact: true });
  const radius = hud.getByLabel('Radius', { exact: true });
  if (refuseOversize) {
    await radius.fill('10');
    await hud.locator('.status').filter({ hasText: /^refused$/ }).waitFor({ timeout: 60000 });
    assert.equal(await button('Apply', hud).isDisabled(), true);
    await f.same(previous);
    await f.snapshot('oversize-refused');
  }
  await radius.fill(String(amount));
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor({ timeout: 60000 });
  const picked = hud.getByRole('group', { name: 'Fillet scope' }).locator('.field').filter({ hasText: 'Picked native edges' }).locator('span[title]');
  assert.deepEqual((await picked.getAttribute('title')).split('\n').sort(), atCut ? names : startNames);
  await f.same(previous);
  await f.snapshot(atCut ? 'curved-mouth-preview' : 'original-mouth-preview');
  await button('Apply', hud).click();
  await f.changed(previous);
  return (await f.snapshot(atCut ? 'curved-mouth-applied' : 'original-mouth-applied')).doc;
}

async function verifyPair(doc, startRadius, cutRadius, label) {
  assert.deepEqual(doc.nodes.slice(0, 5), seed.nodes);
  const [start, cut] = doc.nodes.slice(5);
  assert.equal(doc.nodes.length, 7);
  for (const [node, parent, radius, rim] of [[start, 4, startRadius, startNames], [cut, 5, cutRadius, names]]) {
    assert.equal(node.kind, 'fillet');
    assert.equal(node.radius, radius);
    assert.deepEqual(node.parent, { node: parent, side: 'solid' });
    assert.deepEqual([...node.edges].sort(), rim);
  }
  const read = await f.inspect(label, doc);
  assert.ok(read.valid && read.genus === 1 && read.counts.bodies === 1 && read.counts.shells === 1);
  assert.ok(read.gap <= 1e-7);
  const capInfo = [checkCap(capByName(read, 'n1.start'), startRadius, start.id), checkCap(capByName(read, 'n3.bottom'), cutRadius, cut.id)];
  const volume = slicedVolume - removedByRadius.get(startRadius) - removedByRadius.get(cutRadius);
  near(read.volume, volume);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  f.report.observations.push({ label, startRadius, cutRadius, expectedVolume: volume, volume: read.volume, counts: read.counts, gap: read.gap, caps: capInfo });
  return read;
}

async function verifyBoth(cut) {
  const first = await applyRim(seed, false, .2);
  const nativeFirst = await f.inspect('first-native-fillet', first);
  assert.ok(nativeFirst.valid && nativeFirst.genus === 1);
  near(nativeFirst.volume, volumeAt(.2));
  assert.deepEqual(edgeData(capByName(nativeFirst, 'n3.bottom')), edgeData(capByName(cut, 'n3.bottom')));
  const pair = await applyRim(first, true, .25, true);
  const nativePair = await verifyPair(pair, .2, .25, 'sequential');
  checkRetainedTrim(nativeFirst, nativePair);
  await f.openFeatureEditor(5, 'edit the first fillet with the second downstream');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.25');
  const edited = (await f.applyEditor(pair, 'edited-first')).doc;
  assert.deepEqual(edited.nodes[6], pair.nodes[6]);
  const native = await verifyPair(edited, .25, .25, 'edited');
  const firstAlone = await f.inspect('edited-first-without-second', { ...first, nodes: edited.nodes.slice(0, 6) });
  checkRetainedTrim(firstAlone, native);
  await f.undo();
  await f.same(pair);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('two-bore-mouth-fillets');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  assert.deepEqual(await verifyPair(await f.doc(), .25, .25, 'reopened'), native);
  await f.snapshot('both-mouths-reopened');
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-sweep-two-fillets-test' }, saved.file, 'reopened-fillets', async call => {
    const result = await call('query', { action: 'summary' });
    near(result.facts.volume, native.volume, .001);
    assert.deepEqual(result.features.slice(-2).map(row => row.node), edited.nodes.slice(-2));
    f.report.observations.push({ label: 'reopened-agent-readback', volume: result.facts.volume });
  });
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
  if (both) return verifyBoth(cut);
  const originalStart = capByName(cut, 'n1.start');
  assert.ok(originalStart);
  const applied = await applyRim(seed, true, .2, true);
  await verify(applied, .2, 'fillet-0.2', originalStart);
  await f.openFeatureEditor(5, 'edit the curved bore fillet');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.25');
  const edited = (await f.applyEditor(applied, 'curved-mouth-edited')).doc;
  await verify(edited, .25, 'fillet-0.25', originalStart);
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);

  const saved = await f.save('radial-cut-mouth-fillet');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  await verify(await f.doc(), .25, 'reopened', originalStart);
  await f.snapshot('curved-mouth-reopened');
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-curved-bore-fillet-test' }, saved.file, 'reopened-fillet', async call => {
    const result = await call('query', { action: 'summary' });
    near(result.facts.volume, volumeAt(.25), .001);
    assert.deepEqual(result.features.at(-1).node, edited.nodes.at(-1));
    f.report.observations.push({ label: 'reopened-agent-readback', volume: result.facts.volume });
  });
});

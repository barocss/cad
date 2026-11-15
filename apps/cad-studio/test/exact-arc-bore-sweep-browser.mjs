import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const wide = process.argv.includes('--120');
const authored = process.argv.includes('--make-curves');
const turn = authored ? Math.atan2(24, -7) : wide ? 2 * Math.PI / 3 : Math.PI / 2;
const railRadius = authored ? 25 : 20;
const railName = wide ? '120-degree rail' : 'Quarter rail';
const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/SweepHistoryInputs.tsx',
  'apps/cad-studio/scripts/cad-mcp.mjs',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/engine/curveSource.ts',
  'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad/src/features/revolve.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'exact-arc-bore-sweep', output: process.argv[2],
  envFrozen: authored ? 'D1310_SOURCE_FROZEN' : wide ? 'D1309_SOURCE_FROZEN' : 'D1300_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep a mixed section with one bore along a circular rail, resize the bore, and reopen it in Studio.',
  limits: ['Desktop Chrome WebGPU and local L1 MCP dry-run. One circular arc and one offset circular bore.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkOutput, curveDomain, evaluateCadPart, evaluateCurve, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep } = output;
const { valid, counts, topology, maximumEdgeSurfaceGap: gap } = checkOutput(output);
const { volume, centroid, method } = massPropertiesOf(output);
const faces = brep.faces.map(face => ({
  name: face.name,
  degrees: [face.surface.degreeU, face.surface.degreeV],
  loops: face.loops.map(id => brep.loops.find(loop => loop.id === id).kind),
  knotsU: face.surface.knotsU,
  poles: face.name.includes('bore') ? [] : face.surface.controlPoints,
}));
const useOf = new Map(brep.coedges.map(use => [use.id, use]));
const edgeOf = new Map(brep.edges.map(edge => [edge.id, edge]));
const caps = brep.faces.filter(face => /\\.(?:start|end)$/.test(face.name)).map(face => {
  const loop = brep.loops.find(loop => loop.face === face.id && loop.kind === 'inner');
  return { name: face.name, edges: loop.coedges.map(id => {
    const use = useOf.get(id), twin = useOf.get(use.twin), edge = edgeOf.get(use.edge);
    const [lo,hi] = curveDomain(edge.curve);
    return { degree: edge.curve.degree, paired: twin?.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
      samples: Array.from({ length: 17 }, (_, i) => evaluateCurve(edge.curve, lo + (hi-lo)*i/16)) };
  }) };
});
console.log(JSON.stringify({ valid, counts, genus: topology[0].genus, family: brep.source.family, volume, centroid, method, faces, caps, gap }));
`,
});
const pathAt = angle => ({ degree: 2, knots: [0,0,0,1,1,1],
  controlPoints: [[33,-7,4],[33,-7 + 20 * Math.tan(angle / 2),4],[13 + 20 * Math.cos(angle),-7 + 20 * Math.sin(angle),4]],
  weights: [1,Math.cos(angle / 2),1] });
const path = wide ? pathAt(turn) : { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[33,-7,4],[33,13,4],[13,13,4]], weights: [1,Math.SQRT1_2,1] };
const directCurve = path => `@model bend { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points: ${JSON.stringify(path.controlPoints)}; weights: ${JSON.stringify(path.weights)}; } }`;
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
    sources: authored ? {} : { arc: directCurve(path) },
    objects: authored ? [] : [{ id: 'arc', name: railName, source: 'arc', geometry: 'rail' }],
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
const bendZ = authored ? 0 : 4;

const nominal = { r: railRadius, x: 13, y: -7, start: 0, end: turn };

function exactMass(radius, circle = nominal) {
  const { r, x, y, start, end } = circle;
  const holeArea = Math.PI * radius ** 2, holeRho = r + 8 - cx;
  const radialMoment = r * area - holeRho * holeArea;
  const radialSecond = area * (r ** 2 + variance) - holeArea * (holeRho ** 2 + radius ** 2 / 4);
  const delta = end - start, d = radialSecond / (delta * radialMoment);
  return { volume: delta * radialMoment, centre: [x + d * (Math.sin(end) - Math.sin(start)), y + d * (Math.cos(start) - Math.cos(end)), bendZ - holeRho * holeArea / radialMoment] };
}

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

async function chooseSweep(name) {
  await button('Sketch 1').click();
  await button(name).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  return hud().getByLabel('Representation', { exact: true });
}

async function verify(doc, radius, label, rail = { name: railName, path }) {
  const sweep = doc.nodes.at(-1);
  assert.equal(sweep.kind, 'sweep-curve');
  assert.equal(sweep.mode, 'exact');
  assert.equal(sweep.sketch, 0);
  assert.equal(sweep.name, rail.name);
  assert.deepEqual(sweep.path, rail.path);
  assert.deepEqual(doc.nodes[0], seed.nodes[0]);
  const circle = rail.circle ?? nominal;
  const { volume, centre: expectedCentre } = exactMass(radius, circle);
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
  for (const wall of read.faces.filter(face => face.degrees[0] === 2)) {
    assert.deepEqual(wall.knotsU, wide || authored ? [0,0,0,.5,.5,1,1,1] : [0,0,0,1,1,1]);
  }
  let capResidual = 0;
  for (const cap of read.caps) {
    const angle = cap.name.endsWith('.start') ? circle.start : circle.end;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    assert.deepEqual(cap.edges.map(edge => edge.degree), [2,2]);
    for (const edge of cap.edges) {
      assert.ok(edge.paired);
      for (const [x,y,z] of edge.samples) {
        const dx = x - circle.x, dy = y - circle.y;
        const radial = cos * dx + sin * dy, plane = -sin * dx + cos * dy;
        capResidual = Math.max(capResidual, Math.abs(plane), Math.abs(Math.hypot(radial - (circle.r + 8 - cx), z - bendZ - 1) - radius));
      }
    }
  }
  assert.ok(capResidual < 1e-7 && read.gap < 1e-7);
  near(read.volume, volume);
  read.centroid.forEach((coordinate, i) => near(coordinate, expectedCentre[i]));
  const shown = await f.bodies();
  assert.equal(shown.bodies.length, 1);
  near(shown.bodies[0].volume, read.volume);
  const rendered = await f.page.evaluate(() => window.__studioSection());
  assert.equal(rendered.bodies, 1);
  near(rendered.shownVolume, volume, volume * .02);
  f.report.observations.push({ label, radius, volume: read.volume, centroid: read.centroid, genus: read.genus, counts: read.counts,
    shownVolume: rendered.shownVolume, gap: read.gap, capResidual });
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
  const x = 13 + railRadius + 8 - cx;
  const { inside, beside } = await f.page.evaluate(([x,z]) => ({
    inside: window.__studioSurfacePoint([x,-7,z]), beside: window.__studioSurfacePoint([x+2,-7,z]),
  }), [x, bendZ + 1]);
  // The curved tunnel can have a deeper hit. Only the nearby solid probe should see the start cap.
  assert.ok(beside && Math.abs(beside[1] + 7) < 1e-4, JSON.stringify({ inside, beside }));
  assert.ok(!inside || inside[1] > -6, JSON.stringify({ inside, beside }));
  f.report.observations.push({ label, inside, beside });
  await f.snapshot(label);
}

function circleFromEndpoints(start, join, end) {
  const [ax,ay] = start, [bx,by] = join.map((value, i) => value - start[i]), [cx,cy] = end.map((value, i) => value - start[i]);
  const b = bx * bx + by * by, c = cx * cx + cy * cy, twice = 2 * (bx * cy - by * cx);
  const x = ax + (b * cy - c * by) / twice, y = ay + (c * bx - b * cx) / twice;
  return { x, y, r: Math.hypot(ax - x, ay - y), start: Math.atan2(ay - y, ax - x), end: Math.atan2(end[1] - y, end[0] - x) };
}

async function makeRail() {
  f.phase = 'draw and convert a circular arc in Studio';
  await f.newPage();
  await open({ name: 'profile-for-authored-rail.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch', f.page.locator('.mode')).click();
  await f.sketchPanel().waitFor();
  await f.tool('Arc', 'a');
  const start = [38,-7], end = [6,17], through = [33,8];
  await f.frame([start, end, through]);
  for (const point of [start, end, through]) await f.worldClick(point);
  await button('Make curves', f.sketchPanel()).click();
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await f.page.waitForFunction(() => window.__studioDoc.direct?.objects.length === 1);
  const made = (await f.snapshot('made-circular-rail')).doc;
  assert.deepEqual(made.nodes, seed.nodes);
  const [rail] = made.direct.objects;
  const source = made.direct.sources[rail.source], list = property => JSON.parse(source.match(new RegExp(`${property}\\s*:\\s*(.+?);`))[1]);
  const authoredPath = { degree: 2, knots: list('knots'), controlPoints: list('control-points'), weights: list('weights') };
  assert.deepEqual(authoredPath.knots, [0,0,0,1,1,2,2,2]);
  assert.deepEqual(authoredPath.controlPoints[0], [...start, 0]);
  assert.deepEqual(authoredPath.controlPoints.at(-1), [...end, 0]);
  assert.equal(authoredPath.weights.length, 5);
  assert.deepEqual(authoredPath.weights.filter((_, i) => i % 2 === 0), [1,1,1]);
  const circle = circleFromEndpoints(...[0,2,4].map(i => authoredPath.controlPoints[i]));
  near(circle.r, railRadius, 1e-5);
  near(circle.end - circle.start, turn, 1e-5);
  authoredPath.weights.filter((_, i) => i % 2 === 1).forEach(weight => near(weight, Math.cos((circle.end - circle.start) / 4), 1e-9));
  f.report.observations.push({ label: 'authored-circle', ...circle, path: authoredPath });
  return { made, rail: { name: rail.name, path: authoredPath, circle } };
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

  const { made, rail } = authored ? await makeRail() : { made: seed, rail: { name: railName, path } };
  f.phase = 'discover and dry-run the mixed section through local MCP';
  const file = join(f.output, 'mixed-profile-source.bcad'), contents = JSON.stringify(made);
  await writeFile(file, contents, { flag: 'wx' });
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-sweep-profile-test' }, file, 'mixed-profile', async call => {
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, /one strictly interior circular hole/);
    if (wide) assert.match(description.values.representation, /30°–120°/);
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.features[0].id, seed.nodes[0].id);
    const [rail] = summary.direct_curves;
    const args = { action: 'command', command: 'sweep-curve', values: {
      sketch: summary.features[0].id, path: rail.id, pathRevision: rail.revision, representation: 'exact',
    } };
    const result = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args }] });
    assert.equal(result.dryRun, true);
    near(result.change.volume, exactMass(1, rail.circle).volume, .001);
    assert.equal(await readFile(file, 'utf8'), contents);
    f.report.observations.push({ label: 'agent-dry-run', volume: result.change.volume });
  });

  f.phase = 'refuse a bore tangent to the outer wall';
  const tangent = { ...made, parameters: { boreEdgeX: 12 } };
  await f.newPage();
  await open({ name: 'tangent-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tangent)) });
  await f.same(tangent);
  await (await chooseSweep(rail.name)).selectOption('exact');
  await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
  await hud().getByText(/hole is too close|strictly inside the outer profile/i).first().waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  assert.deepEqual(await f.doc(), tangent);
  await f.snapshot('tangent-bore-refused');

  if (wide) {
    f.phase = 'refuse a circular arc over 120 degrees';
    const outside = { ...seed, direct: { ...seed.direct, sources: { arc: directCurve(pathAt(121 * Math.PI / 180)) } } };
    await f.newPage();
    await open({ name: 'over-120-degree-arc.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(outside)) });
    await f.same(outside);
    await (await chooseSweep(rail.name)).selectOption('exact');
    await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    await hud().getByText(/30° to 120°/).first().waitFor();
    assert.equal(await button('Apply', hud()).isDisabled(), true);
    await f.same(outside);
    await f.snapshot('over-angle-refused');
  }

  f.phase = 'open the mixed profile and saved Direct arc';
  await f.newPage();
  await open(file);
  await f.same(made);
  const representation = await chooseSweep(rail.name);
  f.phase = 'apply the exact circular Sweep with its bore';
  await representation.selectOption('exact');
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  assert.deepEqual(await f.doc(), made);
  await button('Apply', hud()).click();
  await f.changed(made);
  const accepted = await f.doc();
  assert.deepEqual(accepted.direct, made.direct);
  const walls = await verify(accepted, 1, 'applied', rail);
  await f.snapshot('applied');

  const edited = (await f.setParameter('boreEdgeX', 9.5, 'bore-resized')).doc;
  assert.deepEqual(edited.nodes, accepted.nodes);
  const editedWalls = await verify(edited, 1.5, 'edited', rail);
  assert.deepEqual(editedWalls, walls, 'The outer walls do not move when the hole changes');

  await f.undo();
  await f.same(accepted);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('mixed-arc-bore-sweep');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  assert.deepEqual(await verify(await f.doc(), 1.5, 'reopened', rail), walls);
  await verifyBoreMouth('reopened-bore-mouth');
  await f.openFeatureEditor(1, 'reopened Sweep');
  await f.editor().getByText('Exact circular arc', { exact: true }).waitFor();
  await f.editor().getByText('Sketch 1', { exact: true }).waitFor();
  await f.snapshot('reopened-sweep-history');
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-arc-bore-test' }, saved.file, 'reopened-bore', async call => {
    const result = await call('query', { action: 'summary' });
    near(result.facts.volume, exactMass(1.5, rail.circle).volume, .001);
    assert.deepEqual(result.features.at(-1).node, edited.nodes.at(-1));
  });
});

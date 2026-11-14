import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = ['packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/app/editFields.ts'];
const f = await createFlow({
  name: 'arc-bore-intersect', output: process.argv[2], envFrozen: 'D1301_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Intersect a native circular Sweep with a bore and verify both native cap trims.',
  limits: ['Desktop WebGPU. One radial plane through the rotation axis and bore radii 1 and 1.5 mm.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkOutput, curveDomain, evaluateCadPart, evaluateCurve, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [out] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep } = out, edges = new Map(brep.edges.map(e => [e.id,e])), uses = new Map(brep.coedges.map(c => [c.id,c]));
const loops = new Map(brep.loops.map(l => [l.id,l]));
const faces = new Map(brep.faces.map(f => [f.id,f.name]));
const report = checkOutput(out), mass = massPropertiesOf(out);
const caps = brep.faces.filter(face => face.name === 'n1.start' || face.name === 'n3.bottom').map(face => ({
  name: face.name, loops: face.loops.map(id => {
    const loop = loops.get(id);
    return { kind: loop.kind, edges: loop.coedges.map(id => {
      const use = uses.get(id), twin = uses.get(use.twin), edge = edges.get(use.edge), [a,b] = curveDomain(edge.curve);
      return { degree: edge.curve.degree, adjacent: twin && faces.get(loops.get(twin.loop).face),
        paired: twin?.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
        samples: Array.from({ length: 65 }, (_, i) => evaluateCurve(edge.curve, a + (b-a)*i/64)) };
    }) };
  }),
}));
console.log(JSON.stringify({ valid: report.valid, gap: report.maximumEdgeSurfaceGap, counts: report.counts, genus: report.topology[0].genus,
  family: brep.source.family, volume: mass.volume, centroid: mass.centroid, caps }));
`,
});
const path = { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[33,-7,4],[33,13,4],[13,13,4]], weights: [1,Math.SQRT1_2,1] };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { boreEdgeX: 9 }, nextId: 4,
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
  }, {
    id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Quarter rail', path, mode: 'exact',
  }, {
    id: 'n2', kind: 'sketch', profile: 'rectangle', min: [-10,-5], max: [10,35],
    plane: { origin: [13,-7,4], normal: [Math.SQRT1_2,-Math.SQRT1_2,0], xAxis: [0,0,-1] },
  }, { id: 'n3', kind: 'extrude', sketch: 2, height: 50 }],
  direct: {
    sources: { arc: `@model bend { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points: ${JSON.stringify(path.controlPoints)}; weights: ${JSON.stringify(path.weights)}; } }` },
    objects: [{ id: 'arc', name: 'Quarter rail', source: 'arc', geometry: 'rail' }],
  },
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
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
  const theta = Math.PI / 4, d = radialSecond / radialMoment;
  return { volume: theta * radialMoment, centre: [13 + d * Math.sin(theta) / theta, -7 + d * (1 - Math.cos(theta)) / theta, 4 - holeRho * holeArea / radialMoment] };
}

async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}

function checkCap(cap, radius) {
  const cut = cap.name === 'n3.bottom', theta = cut ? Math.PI / 4 : 0;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  assert.deepEqual(cap.loops.map(loop => loop.kind), ['outer', 'inner']);
  const [outer, inner] = cap.loops;
  assert.deepEqual(outer.edges.map(edge => edge.degree).sort(), cut ? [1,1,1,2,2] : [1,1,1,2]);
  assert.deepEqual(inner.edges.map(edge => edge.degree), [2,2]);
  const owners = new Set();
  let maxResidual = 0;
  for (const loop of cap.loops) for (const edge of loop.edges) {
    assert.ok(edge.paired);
    const wall = /^n1\.side\[(base|round|roof|back|bore)\](?:#[0-9]+)?$/.exec(edge.adjacent)?.[1];
    assert.ok(wall);
    assert.equal(wall === 'bore', loop.kind === 'inner');
    owners.add(wall);
    for (const [x,y,z] of edge.samples) {
      const s = cos * (x - 13) + sin * (y + 7) - 20 + cx, t = 12 - z;
      const plane = -sin * (x - 13) + cos * (y + 7);
      near(plane, 0);
      let error;
      if (wall === 'bore') error = Math.hypot(s - 8, t - 7) - radius;
      else if (wall === 'round') {
        assert.ok(s >= 12 - 1e-7);
        error = Math.hypot(s - 12, t - 8) - 5;
      } else if (wall === 'back') {
        assert.ok(t >= 3 - 1e-7 && t <= 13 + 1e-7);
        error = s - 2;
      } else {
        assert.ok(s >= 2 - 1e-7 && s <= 12 + 1e-7);
        error = t - (wall === 'base' ? 3 : 13);
      }
      near(error, 0);
      maxResidual = Math.max(maxResidual, Math.abs(plane), Math.abs(error));
    }
  }
  assert.deepEqual([...owners].sort(), ['back','base','bore','roof','round']);
  return { cap: cap.name, outer: outer.edges.length, inner: inner.edges.length, maxResidual };
}

async function verify(doc, radius, label) {
  assert.deepEqual(doc.nodes.slice(0, 4), seed.nodes);
  const feature = doc.nodes[4];
  assert.equal(feature.kind, 'intersect');
  assert.deepEqual(feature.left, { node: 1, side: 'solid' });
  assert.deepEqual(feature.right, { node: 3, side: 'solid' });
  const read = await f.inspect(label, doc);
  assert.ok(read.valid && read.family === 'analytic-boolean' && read.genus === 1);
  assert.deepEqual(read.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 38, edges: 19, vertices: 13 });
  assert.ok(read.gap <= 1e-7);
  assert.deepEqual(read.caps.map(cap => cap.name).sort(), ['n1.start','n3.bottom']);
  const caps = read.caps.map(cap => checkCap(cap, radius));
  const expected = exactMass(radius);
  near(read.volume, expected.volume);
  read.centroid.forEach((value, i) => near(value, expected.centre[i]));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, expected.volume);
  f.report.observations.push({ label, radius, volume: read.volume, expected: expected.volume,
    centroid: read.centroid, gap: read.gap, counts: read.counts, caps });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const makeContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async args => {
    const context = await makeContext({ ...args, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'arc-bore-and-box.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Sweep along Quarter rail', browser).click();
  await button('Extrude 50', browser).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  f.phase = 'intersect the curved bore with its radial box';
  await f.command('Intersect');
  await f.changed(seed);
  const cut = (await f.snapshot('cut-applied')).doc;
  await verify(cut, 1, 'cut');

  const edited = (await f.setParameter('boreEdgeX', 9.5, 'edit-upstream-bore')).doc;
  assert.deepEqual(edited.nodes, cut.nodes);
  await verify(edited, 1.5, 'edited');
  await f.undo();
  await f.same(cut);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('arc-bore-intersection');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  await verify(await f.doc(), 1.5, 'reopened');
  await f.snapshot('reopened');
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-radial-bore-cut-test' }, saved.file, 'reopened-cut', async call => {
    const result = await call('query', { action: 'summary' });
    near(result.facts.volume, exactMass(1.5).volume, .001);
    assert.deepEqual(result.features.at(-1).node, edited.nodes.at(-1));
    f.report.observations.push({ label: 'reopened-agent-readback', volume: result.facts.volume });
  });
});

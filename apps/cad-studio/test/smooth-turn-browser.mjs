import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const tilted = process.argv.includes('--tilted');
const sourceWidth = process.argv.includes('--source-width');
const editWidth = process.argv.includes('--edit-width');
assert.ok([tilted, sourceWidth, editWidth].filter(Boolean).length <= 1);
const pins = [
  'apps/cad-studio/test/smooth-turn-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/app/ruledTurnCommand.ts',
  'packages/barocss-cad-model/src/app/smoothLoftTurn.ts',
  'apps/cad-studio/src/app/featureNumberInput.ts',
  'packages/barocss-cad/src/features/loft.ts', 'packages/barocss-cad/src/features/loft-rectangular-turn.ts',
];
const f = await createFlow({
  name: 'smooth-turn-comparison',
  output: process.argv[2],
  envFrozen: 'SMOOTH_TURN_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: editWidth ? 'Edit all sections of a saved Smooth Turn about its original centre.' :
    sourceWidth ? 'Verify how saved Ruled and Smooth Turn sections retain their authored width after a source sketch edit.' :
    tilted ? 'Verify the continuous native Smooth Turn on a tilted source plane.' :
    'Compare the existing ruled turn with a smooth native turn made from the same rectangle.',
  limits: ['Desktop Studio, equal-section 12 × 8 mm rectangles, sampled smooth C2 approximation.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, evaluateCurveD1, faceGeometry } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ brep, key }) => {
  const rails = brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(edge => edge.curve);
  const parameters = Array.from({ length: 361 }, (_, index) => index / 360);
  return { key, digest: digestOf(brep), volume: brepMassProperties(brep, 1).volume,
    count: brep.bodies.length, closed: brep.shells.length === 1 && brep.shells[0].closed,
    kind: brep.bodies[0].kind, valid: checkBrep(brep, { strict: true }).valid,
    faces: brep.faces.length, edges: brep.edges.length, vertices: brep.vertices.map(vertex => vertex.point),
    ids: [brep.vertices, brep.edges, brep.coedges, brep.loops, brep.faces, brep.shells, brep.bodies]
      .map(items => items.map(item => item.id)),
    planes: brep.faces.map(faceGeometry).filter(g => g.kind === 'plane'),
    rails: rails.map(rail => ({ knots: rail.knots, degree: rail.degree, poles: rail.controlPoints.length,
      samples: parameters.map(parameter => evaluateCurveD1(rail, parameter)) })),
  };
})));
`,
});

const min = [1, 2], max = [13, 10], centre = [47, -11], z0 = 3;
const widthParameters = ['RuledXEnd', 'SmoothXEnd'];
const corners = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const frameOrigin = tilted ? [15, -30, 20] : [0, 0, 0];
const frameAxes = tilted ? [[.6, .8, 0], [-.48, .36, .8], [.64, -.48, .6]] :
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const [frameU, , frameN] = frameAxes;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const worldPoint = coordinates => frameOrigin.map((origin, k) =>
  origin + coordinates.reduce((delta, value, i) => delta + value * frameAxes[i][k], 0));
const localPoint = point => frameAxes.map(axis => dot(axis, point.map((value, i) => value - frameOrigin[i])));
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm',
  parameters: sourceWidth ? Object.fromEntries(widthParameters.map(name => [name, max[0]])) : {}, outputs: {}, nextId: 2,
  nodes: [11, 40].map((x, index) => ({
    id: `n${index}`, kind: 'sketch', profile: 'rectangle', min,
    max: sourceWidth ? [{ parameter: widthParameters[index] }, max[1]] : max,
    plane: { origin: worldPoint([x, -17, z0]), normal: frameN, xAxis: frameU },
  })),
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });

async function create(previous, sketch, command, height, angle) {
  await button(sketch).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command(command);
  const hud = f.page.getByRole('dialog', { name: command, exact: true });
  await hud.getByLabel('Height', { exact: true }).fill(String(height));
  await hud.getByLabel('Turn angle', { exact: true }).fill(String(angle));
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(previous);
  await button('Apply', hud).click();
  await f.changed(previous);
  return f.doc();
}

async function frame() {
  await button(tilted ? 'Front' : 'Iso').click();
  if (tilted && await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (!tilted && !sourceWidth && !editWidth) return;
  const ao = button('AO');
  if (await ao.getAttribute('aria-pressed') === 'true') await ao.click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await ao.getAttribute('aria-pressed'), 'false');
}

async function inspect(doc, label, degrees, height) {
  const features = doc.nodes.filter(node => node.kind === 'loft');
  assert.deepEqual(features[0].from, [0]);
  assert.deepEqual(features[1].from, [1]);
  assert.equal(features[1].smooth, true);
  assert.equal(features[1].guide, undefined);
  assert.equal(features[1].sections.length, Math.ceil(Math.abs(degrees) / 30) + 1);
  const results = await f.inspect(label, doc);
  assert.equal(results.length, 2);
  const [ruled, smooth] = results;
  const { bodies } = await f.bodies();
  assert.deepEqual(bodies.map(body => body.key), results.map(result => result.key));
  for (const [index, result] of results.entries()) {
    assert.deepEqual([result.count, result.valid, result.closed, result.kind], [1, true, true, 'solid']);
    assert.ok(Math.abs(bodies[index].volume - result.volume) < 1e-6);
  }
  assert.deepEqual([ruled.faces, ruled.edges], [18, 36]);
  assert.ok(Math.abs(ruled.volume - 2560) < 1e-7);
  assert.deepEqual([smooth.faces, smooth.edges, smooth.rails.length], [6, 12, 4]);
  assert.ok(Math.abs(smooth.volume - height * 96) < 0.7);
  assert.equal(smooth.planes.length, 2);
  const capStations = smooth.planes.map(plane => {
    assert.ok(Math.abs(Math.abs(dot(plane.n, frameN)) - 1) < 1e-10);
    return localPoint(plane.o)[2];
  }).sort((a, b) => a - b);
  assert.ok(Math.abs(capStations[0] - z0) < 1e-8);
  assert.ok(Math.abs(capStations[1] - z0 - height) < 1e-8);
  let maxDeviation = 0;
  for (const [index, rail] of smooth.rails.entries()) {
    const [x, y] = corners[index];
    assert.equal(rail.degree, 3);
    assert.equal(rail.poles, features[1].sections.length);
    const interior = rail.knots.slice(4, -4);
    assert.ok(interior.every((knot, index) => index === 0 || knot > interior[index - 1]));
    for (const [sample, { point, derivative }] of rail.samples.entries()) {
      const [px, py, pz] = localPoint(point);
      const [dx, dy, dz] = frameAxes.map(axis => dot(axis, derivative));
      const t = sample / (rail.samples.length - 1), angle = degrees * Math.PI / 180 * t;
      const c = Math.cos(angle), s = Math.sin(angle), a = px - centre[0], b = py - centre[1];
      assert.ok((a * dy - b * dx) * Math.sign(degrees) > 0);
      assert.ok(Math.abs(pz - (z0 + t * height)) < 1e-8 && Math.abs(dz - height) < 1e-7);
      maxDeviation = Math.max(maxDeviation, Math.hypot(a - (c * x - s * y), b - (s * x + c * y)));
    }
  }
  assert.ok(maxDeviation < 0.016, JSON.stringify({ degrees, maxDeviation }));
  f.report.observations.push({ label, degrees, height, maxDeviation, capStations, axis: frameN, volume: smooth.volume, digest: smooth.digest });
  return smooth;
}

async function verifySourceWidth(positive) {
  const before = await f.inspect('source-width-before-native', positive);
  const [ruled, smooth] = before;
  const rail = (body, t) => body.rails.map(edge => edge.samples[t].point);
  const pairs = points => points.flatMap((a, i) => points.slice(i + 1).map(b => Math.hypot(...a.map((x, k) => x - b[k])))).sort((a, b) => a - b);
  const stations = [z0, z0 + 20, z0 + 40];
  const expected = [8, 8, 12, 12, Math.hypot(8, 12), Math.hypot(8, 12)];
  const widths = stations.map((z, i) => {
    const ruledPoints = ruled.vertices.filter(point => Math.abs(point[2] - z) < 1e-8);
    const smoothPoints = rail(smooth, i * 180);
    assert.equal(ruledPoints.length, 4);
    assert.equal(smoothPoints.length, 4);
    for (const [result, tolerance] of [[pairs(ruledPoints), 1e-8], [pairs(smoothPoints), 0.032]]) {
      assert.equal(result.length, expected.length);
      assert.ok(result.every((value, j) => Math.abs(value - expected[j]) < tolerance), JSON.stringify({ z, result, tolerance }));
    }
    return { z, ruled: pairs(ruledPoints)[2], smooth: pairs(smoothPoints)[2] };
  });
  let edited = positive;
  for (const [index, width] of [[0, 14], [1, 16]]) {
    const parameter = widthParameters[index];
    edited = (await f.setParameter(parameter, min[0] + width, 'source-width-' + width)).doc;
    const sketch = edited.nodes[index];
    assert.equal(edited.parameters[sketch.max[0].parameter] - sketch.min[0], width);
    assert.deepEqual(edited.nodes, positive.nodes);
    assert.deepEqual(await f.inspect('source-width-' + width + '-native', edited), before);
    const bodies = (await f.bodies()).bodies;
    assert.deepEqual(bodies.map(body => body.key), before.map(body => body.key));
    assert.ok(bodies.every((body, i) => Math.abs(body.volume - before[i].volume) < 1e-7));
  }
  await f.undo();
  assert.deepEqual((await f.doc()).parameters, { RuledXEnd: 15, SmoothXEnd: 13 });
  await f.redo();
  await f.same(edited);
  const saved = await f.save('turn-source-widths-edited');
  await f.freshOpen(saved.file, edited, 'source-widths-reopened');
  assert.deepEqual(await f.inspect('source-widths-reopened-native', edited), before);
  await frame();
  const panel = await f.openParameters();
  assert.equal(Number(await panel.getByLabel('Value of RuledXEnd').inputValue()), 15);
  assert.equal(Number(await panel.getByLabel('Value of SmoothXEnd').inputValue()), 17);
  await f.snapshot('source-widths-reopened-framed');
  f.report.observations.push({ label: 'native section widths retained after both root sketch edits', widths });
}

async function verifyHistoryWidth(original) {
  const index = original.nodes.length - 1;
  const loft = original.nodes[index];
  const before = await f.inspect('before-history-width-native', original);
  const saved = await f.save('original-smooth-turn-width-12');
  await f.freshOpen(saved.file, original, 'history-width-original-opened');
  await frame();
  await f.openFeatureEditor(index, 'saved Smooth Turn width');
  const editor = f.editor(), width = editor.getByLabel('Turn width', { exact: true });
  const apply = button('Apply', editor);
  assert.equal(Number(await width.inputValue()), 12);
  assert.equal(await editor.getByLabel('Turn width parameter').count(), 0);
  await f.snapshot('history-width-before');
  f.phase = 'refuse widths outside the saved Smooth Turn range';
  for (const value of ['0', '0.0000001', '10001']) {
    await width.fill(value);
    assert.equal(await width.getAttribute('aria-invalid'), 'true');
    assert.ok(await apply.isDisabled());
    await f.same(original);
  }
  await width.fill('16');
  const next = (await f.applyEditor(original, 'history-width-applied')).doc;
  assert.deepEqual(next.outputs, original.outputs);
  assert.deepEqual(next.nodes.map(node => node.id), original.nodes.map(node => node.id));
  assert.deepEqual(next.nodes[index], loft);

  const accepted = await f.inspect('history-width-native', next);
  assert.deepEqual(accepted[0], before[0]);
  const [prior, changed] = [before[1], accepted[1]];
  assert.deepEqual([changed.key, changed.count, changed.closed, changed.kind, changed.valid, changed.faces, changed.edges],
    [prior.key, 1, true, 'solid', true, 6, 12]);
  assert.deepEqual(changed.ids, prior.ids);
  assert.notEqual(changed.digest, prior.digest);
  const volume = prior.volume * (16 / 12);
  assert.ok(Math.abs(changed.volume - volume) < 1e-7);
  const body = (await f.bodies()).bodies.find(body => body.key === changed.key);
  assert.ok(body && Math.abs(body.volume - volume) < 1e-7);
  for (const [station, section] of loft.sections.entries()) {
    const fraction = station / (loft.sections.length - 1), radians = 2 * Math.PI * fraction;
    const [c, s] = [Math.cos(radians), Math.sin(radians)];
    for (const [corner, [x, y]] of [[-8, -4], [8, -4], [8, 4], [-8, 4]].entries()) {
      const expected = [centre[0] + x * c - y * s, centre[1] + x * s + y * c, z0 + section.z];
      const rail = changed.rails[corner];
      const point = rail.samples[station * 30].point;
      assert.ok(Math.hypot(...point.map((value, k) => value - expected[k])) < 1e-8);
      assert.equal(rail.poles, loft.sections.length);
      assert.equal(rail.degree, 3);
      assert.deepEqual(rail.knots, prior.rails[corner].knots);
    }
  }
  f.report.observations.push({ label: 'same native turn with wider sections', before: prior.volume, after: changed.volume,
    volumeRatio: changed.volume / prior.volume, oldDigest: prior.digest, newDigest: changed.digest, sections: loft.sections.length });
  await f.undo();
  await f.same(original);
  await f.redo();
  await f.same(next);
  const file = await f.save('smooth-turn-width-16');
  await f.freshOpen(file.file, next, 'history-width-reopened');
  assert.deepEqual(await f.inspect('history-width-reopened-native', next), accepted);
  await frame();
  await f.openFeatureEditor(index, 'widened Smooth Turn after native Open');
  for (const [label, value] of [['Turn width', 16], ['Turn angle', 360], ['Total height', 40]])
    assert.equal(Number(await f.editor().getByLabel(label, { exact: true }).inputValue()), value);
  await f.snapshot('history-width-reopened-framed');
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'ruled-and-smooth-turn.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);

  f.phase = 'create the same-size ruled and smooth 360-degree turns';
  const ruled = await create(source, 'Sketch 1', 'Ruled Turn', 40, 360);
  const positive = await create(ruled, 'Sketch 2', 'Smooth Turn', 40, 360);
  const initial = await inspect(positive, 'positive-smooth-native', 360, 40);
  await frame();
  await f.snapshot('ruled-vs-smooth-360');
  if (editWidth) {
    await verifyHistoryWidth(positive);
    return;
  }
  if (sourceWidth) {
    await verifySourceWidth(positive);
    return;
  }
  await f.undo();
  await f.same(ruled);

  f.phase = 'verify that smooth turn keeps the negative direction';
  const negative = await create(ruled, 'Sketch 2', 'Smooth Turn', 40, -360);
  const reversed = await inspect(negative, 'negative-smooth-native', -360, 40);
  assert.notEqual(reversed.digest, initial.digest);
  await frame();
  await f.snapshot('smooth-negative-360');
  await f.undo();
  await f.same(ruled);

  f.phase = 'verify the six-face result at +450 degrees and reopen its native file';
  const long = await create(ruled, 'Sketch 2', 'Smooth Turn', 50, 450);
  const accepted = await inspect(long, 'long-smooth-native', 450, 50);
  await f.undo();
  await f.same(ruled);
  await f.redo();
  await f.same(long);
  const saved = await f.save('ruled-and-smooth-turn');
  await f.freshOpen(saved.file, long, 'smooth-450-reopened');
  assert.equal((await inspect(long, 'reopened-smooth-native', 450, 50)).digest, accepted.digest);
  await frame();
  await f.snapshot('smooth-450-reopened-framed');
});

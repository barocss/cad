import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/smooth-turn-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/app/ruledTurnCommand.ts',
  'packages/barocss-cad/src/features/loft.ts', 'packages/barocss-cad/src/features/loft-rectangular-turn.ts',
];
const f = await createFlow({
  name: 'smooth-turn-comparison',
  output: process.argv[2],
  envFrozen: 'SMOOTH_TURN_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Compare the existing ruled turn with a smooth native turn made from the same rectangle.',
  limits: ['Desktop Studio, equal-section 12 × 8 mm rectangles, sampled smooth C2 approximation.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, evaluateCurveD1 } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ brep, key }) => {
  const rails = brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(edge => edge.curve);
  const parameters = Array.from({ length: 361 }, (_, index) => index / 360);
  return { key, digest: digestOf(brep), volume: brepMassProperties(brep, 1).volume,
    count: brep.bodies.length, closed: brep.shells.length === 1 && brep.shells[0].closed,
    kind: brep.bodies[0].kind, valid: checkBrep(brep, { strict: true }).valid,
    faces: brep.faces.length, edges: brep.edges.length,
    rails: rails.map(rail => ({ knots: rail.knots, degree: rail.degree, poles: rail.controlPoints.length,
      samples: parameters.map(parameter => evaluateCurveD1(rail, parameter)) })),
  };
})));
`,
});

const min = [1, 2], max = [13, 10], centre = [47, -11], z0 = 3;
const corners = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 2,
  nodes: [11, 40].map((x, index) => ({
    id: `n${index}`, kind: 'sketch', profile: 'rectangle', min, max,
    plane: { origin: [x, -17, z0], normal: [0, 0, 1], xAxis: [1, 0, 0] },
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
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
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
  let maxDeviation = 0;
  for (const [index, rail] of smooth.rails.entries()) {
    const [x, y] = corners[index];
    assert.equal(rail.degree, 3);
    assert.equal(rail.poles, features[1].sections.length);
    const interior = rail.knots.slice(4, -4);
    assert.ok(interior.every((knot, index) => index === 0 || knot > interior[index - 1]));
    for (const [sample, { point: [px, py, pz], derivative: [dx, dy, dz] }] of rail.samples.entries()) {
      const t = sample / (rail.samples.length - 1), angle = degrees * Math.PI / 180 * t;
      const c = Math.cos(angle), s = Math.sin(angle), a = px - centre[0], b = py - centre[1];
      assert.ok((a * dy - b * dx) * Math.sign(degrees) > 0);
      assert.ok(Math.abs(pz - (z0 + t * height)) < 1e-8 && Math.abs(dz - height) < 1e-7);
      maxDeviation = Math.max(maxDeviation, Math.hypot(a - (c * x - s * y), b - (s * x + c * y)));
    }
  }
  assert.ok(maxDeviation < 0.016, JSON.stringify({ degrees, maxDeviation }));
  f.report.observations.push({ label, degrees, height, maxDeviation, volume: smooth.volume, digest: smooth.digest });
  return smooth;
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

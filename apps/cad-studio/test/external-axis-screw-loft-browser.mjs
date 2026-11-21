import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const triangular = process.argv.includes('--triangle');
const profile = triangular ? 'triangular' : 'rectangular';
const degrees = triangular ? 360 : 180;
const height = 40, spans = degrees / 30, samples = spans * 10;
const corners = triangular ? [[-7, -4], [2, -3], [-4, 1]] : [[14, -4], [26, -4], [26, 4], [14, 4]];
const frame = { origin: triangular ? [21, -19.4, 24.8] : [11, -17, 23], normal: [0, .6, .8], xAxis: [1, 0, 0] };
const [x, y, z] = frame.origin;
const ontoPlane = (u, v, h) => [x + u, y + .8 * v + .6 * h, z - .6 * v + .8 * h];

const frozen = [
  'apps/cad-studio/test/external-axis-screw-loft-browser.mjs',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/profiles.ts',
  'packages/barocss-cad/src/part/part-profile-solid.ts',
  'packages/barocss-cad/src/features/loft.ts',
  'packages/barocss-cad/src/features/loft-rectangular-turn.ts',
];
const f = await createFlow({
  name: 'external-axis-screw-loft',
  output: process.argv[2],
  envFrozen: 'SCREW_LOFT_FROZEN',
  qualification: 'Create both windings of a compact external-axis ' + profile + ' Screw with Studio Smooth Loft.',
  limits: ['Desktop Chrome. Synthetic source sketches in one tilted frame.'],
  initialFiles: frozen,
  requiredFrozen: frozen,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, evaluateCurveD1 } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, digest: digestOf(brep), counts: checkBrep(brep, { strict: true }).counts,
  closed: brep.shells.length === 1 && brep.shells[0].closed,
  valid: checkBrep(brep, { strict: true }).valid, volume: brepMassProperties(brep, 1).volume,
  rails: brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(({ curve }) => ({
    degree: curve.degree, poles: curve.controlPoints.length, knots: curve.knots,
    steps: Array.from({ length: ${samples + 1} }, (_, i) => evaluateCurveD1(curve, i / ${samples})),
  })),
}))));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const spin = ([x, y], angle, t) => {
  const a = angle * Math.PI / 180 * t, c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
};
function source(angle) {
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: spans + 1,
    nodes: Array.from({ length: spans + 1 }, (_, i) => {
      const t = i / spans;
      return {
        id: 'n' + i, kind: 'sketch', profile: 'polygon', points: corners.map(p => spin(p, angle, t)),
        plane: { ...frame, origin: ontoPlane(0, 0, height * t) },
      };
    }),
  };
}

async function build(angle) {
  f.phase = 'create external-axis Screw at ' + angle;
  await f.newPage();
  const doc = source(angle);
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'screw-sections.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
  for (let i = 0; i < doc.nodes.length; i++) await button('Sketch ' + (i + 1)).click(i ? { modifiers: ['Shift'] } : {});
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  const hud = f.page.getByRole('dialog', { name: 'Loft', exact: true });
  await hud.getByLabel('Smooth (through the middle sections)', { exact: true }).selectOption('yes');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(doc);
  await button('Apply', hud).click();
  await f.changed(doc);
  const accepted = await f.doc();
  assert.deepEqual(accepted.nodes.slice(0, spans + 1), doc.nodes);
  const loft = accepted.nodes.at(-1);
  assert.deepEqual([loft.kind, loft.smooth, loft.sections.length], ['loft', true, spans + 1]);
  return accepted;
}

async function inspect(doc, angle, label) {
  const [part, ...others] = await f.inspect(label, doc);
  const { bodies } = await f.bodies();
  assert.equal(others.length, 0);
  assert.deepEqual([part.valid, part.closed, part.counts.bodies, part.counts.faces, part.counts.edges, part.counts.vertices],
    [true, true, 1, corners.length + 2, 3 * corners.length, 2 * corners.length]);
  assert.deepEqual(bodies.map(body => body.key), [part.key]);
  const expectedVolume = triangular ? 840.1080446694306 : 840.4060323005599 * 96 / 21;
  assert.ok(Math.abs(part.volume - expectedVolume) < 1e-7);
  assert.ok(Math.abs(bodies[0].volume - part.volume) < 1e-7);
  assert.equal(part.rails.length, corners.length);
  let maxStationError = 0, minimumWinding = Infinity;
  for (const [corner, rail] of part.rails.entries()) {
    assert.deepEqual([rail.degree, rail.poles, rail.knots], [3, spans + 1, part.rails[0].knots]);
    assert.equal(new Set(rail.knots.slice(4, -4)).size, spans - 3);
    for (const [i, { point: p, derivative: d }] of rail.steps.entries()) {
      const t = i / samples;
      assert.ok(Math.abs(.6 * d[1] + .8 * d[2] - height) < 1e-8);
      const v = .8 * (p[1] - y) - .6 * (p[2] - z), dv = .8 * d[1] - .6 * d[2];
      const winding = Math.sign(angle) * ((p[0] - x) * dv - v * d[0]);
      minimumWinding = Math.min(minimumWinding, winding);
      assert.ok(winding > 0);
      if (i % 10 === 0) {
        const expected = ontoPlane(...spin(corners[corner], angle, t), height * t);
        const error = Math.hypot(...p.map((value, k) => value - expected[k]));
        maxStationError = Math.max(maxStationError, error);
        assert.ok(error < 1e-8);
      }
    }
  }
  f.report.observations.push({
    label, angle, digest: part.digest, counts: part.counts, volume: part.volume,
    rails: part.rails.length, maxStationError, minimumWinding,
  });
  return part;
}

async function frameView(label) {
  await button('Iso').click();
  const ao = button('AO');
  if (await ao.getAttribute('aria-pressed') === 'true') await ao.click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await f.snapshot(label);
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
  const positive = await build(degrees);
  const right = await inspect(positive, degrees, 'external-axis-positive-native');
  await frameView('external-axis-positive-' + degrees);

  const negative = await build(-degrees);
  const left = await inspect(negative, -degrees, 'external-axis-negative-native');
  assert.notEqual(left.digest, right.digest);
  await frameView('external-axis-negative-' + degrees);
  const saved = await f.save('external-axis-' + profile + '-screw');
  await f.freshOpen(saved.file, negative, 'external-axis-fresh-open');
  assert.deepEqual(await inspect(negative, -degrees, 'external-axis-reopened-native'), left);
  await frameView('external-axis-reopened-' + degrees);
});

import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const frozen = [
  'apps/cad-studio/test/smooth-triangular-turn-browser.mjs',
  'packages/barocss-cad-model/src/app/ruledTurnCommand.ts',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/app/smoothLoftTurn.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/loftDisplay.ts',
  'packages/barocss-cad/src/features/loft.ts',
  'packages/barocss-cad/src/features/loft-rectangular-turn.ts',
];
const f = await createFlow({
  name: 'smooth-triangular-turn',
  output: process.argv[2],
  envFrozen: 'TRIANGULAR_TURN_FROZEN',
  initialFiles: frozen,
  requiredFrozen: frozen,
  qualification: 'Create, edit and reopen one continuous Smooth Turn from a straight triangular sketch.',
  limits: ['Desktop Studio, one tilted scalene triangle, continuous cubic interpolation between rigid stations.'],
  inspectorSource: String.raw`
import { readFileSync } from 'node:fs';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
import { brepMassProperties, checkBrep, evaluateCurveD1 } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const bodies = partBreps(doc);
const viewed = evaluateDoc(doc, 1, 8, true).bodies;
console.log(JSON.stringify(bodies.map(({ key, brep }, i) => {
  const { volume, centroid } = brepMassProperties(brep, 1);
  const rails = brep.edges.filter(edge => /^c[0-2]$/.test(edge.id)).map(edge => {
    const rail = edge.curve;
    return { id: edge.id, degree: rail.degree, poles: rail.controlPoints.length, knots: rail.knots,
      samples: Array.from({ length: 61 }, (_, j) => evaluateCurveD1(rail, j / 60)) };
  });
  const mesh = viewed[i].mesh;
  return { key, digest: digestOf(brep), volume, centroid, rails, valid: checkBrep(brep, { strict: true }).valid,
    kind: brep.bodies[0].kind, shells: brep.shells.map(shell => shell.closed),
    topology: [brep.faces.length, brep.edges.length, brep.vertices.length],
    ids: [brep.vertices, brep.edges, brep.coedges, brep.loops, brep.faces, brep.shells, brep.bodies].map(items => items.map(item => item.id)),
    triangles: [mesh.indices.length / 3, mesh.loftDetail.indices.length / 3] };
})));
`,
});

const points = [[3, -7], [12, -6], [6, -2]];
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 1,
  nodes: [{
    id: 'n0', kind: 'sketch', profile: 'polygon', points, outline: { points, bulges: [0, 0, 0] },
    plane: { origin: [11, -17, 23], normal: [0, 0.6, 0.8], xAxis: [1, 0, 0] },
  }],
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b, tol = 1e-8) =>
  assert.ok(Math.hypot(...a.map((value, i) => value - b[i])) < tol, JSON.stringify({ a, b }));

async function create(angle) {
  f.phase = 'create triangular Smooth Turn ' + angle;
  await button('Sketch 1').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Smooth Turn');
  const hud = f.page.getByRole('dialog', { name: 'Smooth Turn', exact: true });
  await hud.getByLabel('Height', { exact: true }).fill('40');
  await hud.getByLabel('Turn angle', { exact: true }).fill(String(angle));
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(source);
  await button('Apply', hud).click();
  await f.changed(source);
  return f.doc();
}

async function inspect(doc, angle, label, height = 40) {
  assert.deepEqual(doc.nodes[0], source.nodes[0]);
  const last = Math.abs(angle) / 30;
  const loft = doc.nodes.at(-1);
  assert.deepEqual([loft.kind, loft.smooth, loft.from, loft.sections.length], ['loft', true, [0], last + 1]);
  const results = await f.inspect(label, doc);
  const { bodies } = await f.bodies();
  assert.deepEqual(bodies.map(body => body.key), results.map(result => result.key));
  assert.equal(bodies.length, 1);
  const result = results[0];
  assert.deepEqual([result.valid, result.kind, result.shells, result.topology], [true, 'solid', [true], [5, 9, 6]]);
  const expectedVolume = Math.abs(angle) === 450 ? 840.0490227248927 : 840.4060323005599;
  const expected = expectedVolume * height / 40;
  near([result.volume, bodies[0].volume], [expected, expected], 1e-7);
  near(result.centroid, [18, -21 + .3 * height, 26 + .4 * height]);
  const detail = { baseTriangles: result.triangles[0], triangles: result.triangles[1], kind: 'smooth-turn' };
  assert.ok(detail.triangles > detail.baseTriangles);
  await f.page.locator('.viewport[data-renderer="webgpu"]').waitFor();
  await f.page.waitForFunction(expected => {
    const actual = window.__studioLoftDisplay?.(0);
    return actual?.kind === expected.kind && actual.triangles === expected.triangles && actual.baseTriangles === expected.baseTriangles;
  }, detail);
  f.report.observations.push({ label, backend: 'webgpu', detail });
  assert.deepEqual(result.rails.map(rail => rail.id), ['c0', 'c1', 'c2']);
  for (const [corner, rail] of result.rails.entries()) {
    assert.deepEqual([rail.degree, rail.poles, rail.knots], [3, last + 1, result.rails[0].knots]);
    assert.ok(rail.knots.slice(4, -4).every((knot, i, knots) => i === 0 || knot > knots[i - 1]));
    const [x, y] = [points[corner][0] - 7, points[corner][1] + 5];
    for (const [i, { point: p, derivative: d }] of rail.samples.entries()) {
      const t = i / 60;
      near([.6 * d[1] + .8 * d[2]], [height]);
      const v = .8 * (p[1] + 21) - .6 * (p[2] - 26), dv = .8 * d[1] - .6 * d[2];
      assert.equal(Math.sign((p[0] - 18) * dv - v * d[0]), Math.sign(angle));
      if ((i * last) % 60) continue;
      const rad = angle * Math.PI / 180 * t;
      const u = x * Math.cos(rad) - y * Math.sin(rad), w = x * Math.sin(rad) + y * Math.cos(rad);
      near(p, [18 + u, -21 + .8 * w + .6 * height * t, 26 - .6 * w + .8 * height * t]);
    }
  }
  return result;
}

async function frame(label) {
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
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'tilted-triangular-sketch.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  await f.snapshot('triangular-source');

  const positive = await create(180);
  await inspect(positive, 180, 'triangular-positive-native');
  await frame('triangular-positive-180');
  await f.undo();
  await f.same(source);

  const negative = await create(-450);
  const accepted = await inspect(negative, -450, 'triangular-negative-native');
  await frame('triangular-negative-450');
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(negative);

  await f.openFeatureEditor(negative.nodes.length - 1, 'triangular Smooth Turn total height');
  const editor = f.editor(), height = editor.getByLabel('Total height', { exact: true });
  assert.equal(Number(await height.inputValue()), 40);
  assert.equal(Number(await editor.getByLabel('Turn angle', { exact: true }).inputValue()), -450);
  assert.equal(await editor.getByLabel(/Section .*height|Turn width|^Smooth$/).count(), 0);
  await height.fill('50');
  const taller = (await f.applyEditor(negative, 'triangular-height-applied')).doc;
  assert.deepEqual(taller.nodes.slice(0, -1), negative.nodes.slice(0, -1));
  const stretched = await inspect(taller, -450, 'triangular-stretched-native', 50);
  assert.deepEqual(stretched.ids, accepted.ids);
  assert.notEqual(stretched.digest, accepted.digest);
  await f.undo();
  await f.same(negative);
  await f.redo();
  await f.same(taller);

  await frame('triangular-before-angle-edit');
  await f.openFeatureEditor(taller.nodes.length - 1, 'triangular Smooth Turn signed angle');
  const angleEditor = f.editor(), angle = angleEditor.getByLabel('Turn angle', { exact: true });
  assert.equal(Number(await angle.inputValue()), -450);
  await angle.fill('451');
  assert.equal(await angle.getAttribute('aria-invalid'), 'true');
  assert.ok(await button('Apply', angleEditor).isDisabled());
  await f.same(taller);
  await angle.fill('450');
  const reversed = (await f.applyEditor(taller, 'triangular-angle-applied')).doc;
  assert.deepEqual(reversed.nodes[0], taller.nodes[0]);
  assert.deepEqual(reversed.nodes.at(-1), taller.nodes.at(-1));
  assert.deepEqual(reversed.nodes.map(node => node.id), taller.nodes.map(node => node.id));
  const reoriented = await inspect(reversed, 450, 'triangular-reversed-native', 50);
  assert.deepEqual(reoriented.ids, stretched.ids);
  assert.notEqual(reoriented.digest, stretched.digest);
  await frame('triangular-after-angle-edit');
  await f.undo();
  await f.same(taller);
  await f.redo();
  await f.same(reversed);

  f.phase = 'save and reopen reversed triangular Smooth Turn';
  const saved = await f.save('smooth-triangular-turn');
  await f.freshOpen(saved.file, reversed, 'triangular-fresh-open');
  assert.deepEqual(await inspect(reversed, 450, 'triangular-reopened-native', 50), reoriented);
  await f.openFeatureEditor(reversed.nodes.length - 1, 'reopened triangle angle');
  assert.equal(Number(await f.editor().getByLabel('Turn angle', { exact: true }).inputValue()), 450);
  await f.closeEditor();
  await frame('triangular-reopened-450');
});

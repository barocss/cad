import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'apps/cad-studio/src/state/useCommandPreview.ts', 'apps/cad-studio/src/ui/Hud.tsx',
];
const f = await createFlow({
  name: 'elbow-inlet-fillet', output: process.argv[2], envFrozen: 'D1672_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Trim the inlet of a saved Exact elbow with a box and round the new circular rim in Studio.',
  limits: ['Desktop WebGPU. One R20 mm quarter elbow, x = −5 mm clip and constant exterior Fillet on the new two-half rim.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry, massPropertiesOf, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const levels = [0, .19, .5, .81, 1];
const at = ([lo, hi], t) => lo + (hi - lo) * t;
const samples = face => {
  const { u, v } = surfaceDomain(face.surface);
  return levels.flatMap(s => levels.map(t => evaluateSurface(face.surface, at(u, s), at(v, t))));
};
const caps = brep.faces.flatMap(face => {
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane') return [];
  const boundary = face.loops.flatMap(id => brep.loops.find(loop => loop.id === id).coedges).map(id => {
    const use = brep.coedges.find(use => use.id === id);
    const twin = brep.coedges.find(candidate => candidate.id === use.twin);
    const edge = brep.edges.find(candidate => candidate.id === use.edge);
    return { name: edge.name, degree: edge.curve.degree, reciprocal: twin?.twin === id && twin.edge === edge.id && twin.sense !== use.sense,
      samples: levels.map(t => evaluateCurve(edge.curve, at(curveDomain(edge.curve), t))) };
  });
  return [{ name: face.name, plane, boundary }];
});
const bend = brep.faces.filter(face => face.name?.includes('.bend.')).map(samples);
const rounds = brep.faces.filter(face => /^n5[.]face/.test(face.name)).map(samples);
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), source: brep.source,
  volume: massPropertiesOf(output).volume, quadrature: brepMassProperties(brep, 1).volume,
  caps, bend, rounds, digest: digestOf(brep) }));
`,
});

const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0], [20, 27, 0], [20, 34, 0]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1] };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Elbow rail', path, mode: 'exact' }],
  outputs: { b1: { node: 1, side: 'solid' } } };
const solid = node => ({ node, side: 'solid' });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const dialog = name => f.page.getByRole('dialog', { name, exact: true });
const status = (hud, text) => hud.locator('.status').filter({ hasText: new RegExp(`^${text}$`) });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const views = () => f.page.locator('.views');
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));

async function verify(label, doc, disk, fillet = 0) {
  const proof = await f.inspect(label, doc);
  const removal = Math.PI * ((2 - Math.PI / 2) * (disk - fillet) * fillet ** 2 + fillet ** 3 / 3);
  const volume = Math.PI * disk ** 2 * (19 + 10 * Math.PI) - removal;
  assert.ok(proof.check.valid, proof.check.issues.join('\n'));
  assert.equal(proof.source.family, 'analytic-boolean');
  assert.equal(proof.check.topology[0].genus, 0);
  assert.deepEqual(proof.check.counts, fillet
    ? { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 36, edges: 18, vertices: 10 }
    : { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 28, edges: 14, vertices: 8 });
  assert.equal(proof.caps.length, 2);
  const inlet = proof.caps.find(cap => Math.abs(cap.plane.n[0] + 1) < 1e-7);
  const outlet = proof.caps.find(cap => cap.name === 'n1.end');
  assert.ok(inlet && outlet);
  near(inlet.plane.o[0], -5);
  near(outlet.plane.o[1], 34);
  assert.equal(inlet.boundary.length, 2);
  assert.equal(outlet.boundary.length, 2);
  for (const edge of inlet.boundary) {
    assert.equal(edge.degree, 2);
    assert.ok(edge.reciprocal);
    for (const [x, y, z] of edge.samples) { near(x, -5); near(Math.hypot(y, z), disk - fillet); }
  }
  for (const edge of outlet.boundary) {
    assert.equal(edge.degree, 2);
    assert.ok(edge.reciprocal);
    for (const [x, y, z] of edge.samples) { near(y, 34); near(Math.hypot(x - 20, z), disk); }
  }
  assert.equal(proof.bend.length, 2);
  for (const [x, y, z] of proof.bend.flat()) near(Math.hypot(Math.hypot(x, y - 20) - 20, z), disk);
  assert.equal(proof.rounds.length, fillet ? 2 : 0);
  for (const [x, y, z] of proof.rounds.flat()) {
    assert.ok(x >= -5 - 1e-7 && x <= -5 + fillet + 1e-7);
    near(Math.hypot(x + 5 - fillet, Math.hypot(y, z) - (disk - fillet)), fillet);
  }
  near(proof.volume, volume);
  near(proof.quadrature, volume);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  f.report.observations.push({ label, disk, fillet, removal, expectedVolume: volume, volume: proof.volume,
    quadrature: proof.quadrature, cap: inlet.name, counts: proof.check.counts, digest: proof.digest });
  return proof;
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
  await chooser.setFiles({ name: 'exact-elbow.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);

  f.phase = 'Create the clipping box and intersect the saved elbow';
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Box');
  const box = dialog('Box');
  for (const [field, value] of Object.entries({ 'Width X': 35, 'Depth Y': 50, 'Height Z': 10, 'At X': -5, 'At Y': -5, 'At Z': -5 }))
    await box.getByLabel(field, { exact: true }).fill(String(value));
  await status(box, 'preview').waitFor();
  await button('Apply', box).click();
  await f.changed(seed);
  const boxed = (await f.snapshot('01-clip-box')).doc;
  assert.deepEqual(boxed.nodes.slice(0, 2), seed.nodes);
  assert.deepEqual([boxed.nodes[2].min, boxed.nodes[2].max, boxed.nodes[3].from, boxed.nodes[3].height],
    [[-5, -5], [30, 45], -5, 10]);
  await button('Sweep along Elbow rail', browser()).click();
  await button('Box', browser()).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Intersect');
  await f.changed(boxed);
  const cut = (await f.snapshot('02-inlet-intersection')).doc;
  assert.deepEqual([cut.nodes[4].kind, cut.nodes[4].left, cut.nodes[4].right], ['intersect', solid(1), solid(3)]);
  const clipped = await verify('cut-native', cut, 2);
  const inletEdges = clipped.caps.find(cap => Math.abs(cap.plane.n[0] + 1) < 1e-7).boundary.map(edge => edge.name).sort();

  f.phase = 'Pick the new native rim and refuse an oversized Fillet';
  await button('View cube directions', f.page.getByRole('group', { name: 'View cube', exact: true })).click();
  await f.page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  const pixel = await f.screenOf([-5, Math.SQRT2, Math.SQRT2]);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Fillet');
  const hud = dialog('Fillet'), radius = hud.getByLabel('Radius', { exact: true });
  await radius.fill('2.5');
  await status(hud, 'refused').waitFor();
  assert.ok(await button('Apply', hud).isDisabled());
  await f.same(cut);
  await f.snapshot('03-oversize-refused');

  f.phase = 'Apply a constant Fillet to the full circular inlet';
  await radius.fill('0.5');
  await status(hud, 'preview').waitFor();
  const scope = hud.getByRole('group', { name: 'Fillet scope' });
  const picked = scope.locator('.field').filter({ hasText: 'Picked native edges' }).locator('span[title]');
  assert.deepEqual((await picked.getAttribute('title')).split('\n').sort(), inletEdges);
  await f.same(cut);
  await f.snapshot('04-inlet-fillet-preview');
  await button('Apply', hud).click();
  await f.changed(cut);
  const applied = (await f.snapshot('05-inlet-fillet-applied')).doc;
  const feature = applied.nodes[5];
  assert.deepEqual([feature.kind, feature.parent, feature.radius], ['fillet', solid(4), 0.5]);
  assert.deepEqual([...feature.edges].sort(), inletEdges);
  await verify('fillet-native', applied, 2, 0.5);

  await f.openFeatureEditor(5, 'edit the inlet Fillet');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.75');
  const edited = (await f.applyEditor(applied, '06-fillet-history-edit')).doc;
  assert.deepEqual(edited.nodes[5], { ...feature, radius: 0.75 });
  await verify('fillet-edited-native', edited, 2, 0.75);
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);

  await f.openFeatureEditor(1, 'replay both downstream features at a larger diameter');
  await f.editor().getByLabel('Diameter', { exact: true }).fill('6');
  const upstream = (await f.applyEditor(edited, '07-upstream-diameter-edit')).doc;
  assert.deepEqual(upstream.nodes.slice(1), edited.nodes.slice(1));
  assert.equal(upstream.nodes[0].radius, 3);
  const final = await verify('upstream-edited-native', upstream, 3, 0.75);
  await f.undo();
  await f.same(edited);
  await f.redo();
  await f.same(upstream);
  const saved = await f.save('elbow-inlet-fillet');
  const reopened = (await f.freshOpen(saved.file, upstream, '08-fresh-open')).doc;
  assert.equal((await verify('reopened-native', reopened, 3, 0.75)).digest, final.digest);
  await button('Iso', views()).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.openFeatureEditor(5);
  assert.equal(await f.editor().getByLabel('Radius', { exact: true }).inputValue(), '0.75');
  await f.snapshot('09-reopened-fillet-history');
});

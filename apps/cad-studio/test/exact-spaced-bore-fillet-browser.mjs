import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const observe = process.argv.includes('--observe');
const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[0, 0, 0], [0, 12, 0], [12, 12, 0], [16, 12, 0], [20, 12, 0], [38, 12, 0], [38, 30, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1] };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
    holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'cw' }]],
    sideTags: { outer: ['e0'], holes: [['bore']] } },
  { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Spaced bore', path, mode: 'exact' }],
  outputs: { b1: { node: 1, side: 'solid' } } };
const pins = ['apps/cad-studio/test/exact-spaced-bore-fillet-browser.mjs',
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/blend/edge-finish.ts',
  'packages/barocss-cad-model/src/app/commands.ts', 'apps/cad-studio/src/state/useCommandPreview.ts'];
const f = await createFlow({
  name: 'spaced-sweep-bore-fillet', output: process.argv[2], envFrozen: 'D1724_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Round the original inlet bore of a spaced Exact Sweep with the bounded existing rolling-ball finish.',
  limits: ['One native circular inlet bore. R12/R18 opposite bends, straight span 8 mm, outer R2 and bore R1. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkOutput, curveDomain, evaluateCadPart, evaluateCurve, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [out] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep } = out;
const check = checkOutput(out);
const volume = massPropertiesOf(out).volume;
const facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face.name])));
const usesByEdge = new Map();
for (const use of brep.coedges) {
  const list = usesByEdge.get(use.edge) ?? [];
  list.push(use);
  usesByEdge.set(use.edge, list);
}
const nativeJoins = [12, 20].map(x => brep.edges.filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[0]-x) < 1e-7))
  .map(edge => {
    const [lo, hi] = curveDomain(edge.curve);
    return { id: edge.id, continuity: measureBrepEdgeContinuity(brep, edge.id),
      points: Array.from({length:13}, (_, i) => evaluateCurve(edge.curve, lo + (hi-lo)*i/12)),
      owners: usesByEdge.get(edge.id).map(use => facesByLoop.get(use.loop)).sort(),
      bound: usesByEdge.get(edge.id).every(use => !!use.pcurve) };
  }));
const caps = brep.faces.filter(face => face.name === 'n1.start' || face.name === 'n1.end').map(face => ({
  name: face.name, loops: face.loops.map(id => brep.loops.find(loop => loop.id === id).kind),
}));
const inlet = doc.nodes.length === 2 ? evaluatePart(doc, 1).bodies[0].mesh.edges
  .filter(edge => edge.names.some(name => name.includes('.side[bore]') && name.endsWith('|n1.start')))
  .map(edge => edge.names) : [];
const contacts = brep.edges.flatMap(edge => {
  const uses = usesByEdge.get(edge.id), owners = uses.map(use => facesByLoop.get(use.loop));
  if (!owners.some(name => name?.startsWith('n2.face'))) return [];
  const kind = owners.includes('n1.start') ? 'cap' : owners.some(name => name?.includes('n1.first.side[bore]')) ? 'bore' : null;
  if (!kind) return [];
  const [lo, hi] = curveDomain(edge.curve);
  return [{ kind, owners, reciprocal: uses.length === 2 && uses[0].twin === uses[1].id &&
    uses[1].twin === uses[0].id && uses[0].sense !== uses[1].sense,
    points: Array.from({length:13}, (_, i) => evaluateCurve(edge.curve, lo + (hi-lo)*i/12)) }];
});
console.log(JSON.stringify({ valid: check.valid, genus: check.topology[0].genus, gap: check.maximumEdgeSurfaceGap,
  nativeJoins, volume, caps, inlet, contacts, fillet: out.fillet ?? [], digest: digestOf(brep) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const fillet = () => f.page.getByRole('dialog', { name: 'Fillet', exact: true });
const phase = mode => fillet().locator('.status').filter({ hasText: new RegExp(`^${mode}$`) });
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, JSON.stringify({ a, b, tolerance }));
// Independent divergence integration of the ideal rolling-ball envelope, using major R12 and bore R1.
const volumeByRadius = new Map([[0.2, 519.4739960868355], [0.25, 519.4412724224861]]);

async function verify(label, doc, radius, base) {
  assert.deepEqual(doc.nodes.slice(0, 2), seed.nodes);
  const feature = doc.nodes[2];
  assert.equal(feature.kind, 'fillet');
  assert.equal(feature.radius, radius);
  assert.deepEqual([...feature.edges].sort(), [...base.inlet[0]].sort());
  const native = await f.inspect(label, doc);
  assert.ok(native.valid && native.genus === 1);
  assert.ok(native.gap <= 1e-7);
  assert.deepEqual(native.caps, base.caps);
  assert.deepEqual(native.nativeJoins.map(edges => edges.length), [4, 4]);
  const joinOwners = joints => joints.map(edges => edges.map(edge => edge.owners.map(name => name.replace(/#\d+$/, '')).join('|')).sort());
  assert.deepEqual(joinOwners(native.nativeJoins), joinOwners(base.nativeJoins));
  native.nativeJoins.forEach((joint, index) => {
    for (const edge of joint) {
      assert.ok(edge.bound);
      assert.equal(edge.continuity.status, 'measured');
      near(edge.continuity.maximumAngleDegrees, 0, 1e-6);
      const jointRadius = edge.owners.every(name => name.includes('.side[bore]')) ? 1 : 2;
      for (const [x, y, z] of edge.points) {
        near(x, index === 0 ? 12 : 20);
        near(Math.hypot(y - 12, z), jointRadius);
      }
      const [a, b] = [edge.points[0], edge.points.at(-1)];
      near(Math.hypot(...a.map((value, i) => value - b[i])), 2 * jointRadius);
    }
  });
  assert.equal(native.fillet.length, 1);
  const [fit] = native.fillet;
  assert.deepEqual([...fit.edges].sort(), [...base.inlet[0]].sort());
  assert.ok(fit.patches > 1 && fit.contact <= 1e-7 && fit.section <= 1e-7 && fit.ball <= 1e-7);
  assert.ok(native.contacts.filter(contact => contact.kind === 'cap').length >= 2);
  assert.ok(native.contacts.filter(contact => contact.kind === 'bore').length >= 2);
  for (const contact of native.contacts) {
    assert.ok(contact.reciprocal);
    for (const [x, y, z] of contact.points) {
      const radial = Math.hypot(12 - x, y);
      assert.ok(y >= -1e-7 && y <= radius * 2);
      if (contact.kind === 'cap') {
        near(y, 0);
        near(Math.hypot(Math.hypot(12 - x, radius) - 12, z), 1 + radius);
      } else {
        near(Math.hypot(radial - 12, z), 1);
        near(y * (radial + radius * (radial - 12)) / radial, radius);
      }
    }
  }
  const expected = volumeByRadius.get(radius);
  near(native.volume, expected, 2e-6);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, expected, 2e-6);
  f.report.observations.push({ label, radius, expected, measured: native.volume, gap: native.gap,
    fit, contactCount: native.contacts.length, digest: native.digest });
  return native;
}

async function measureReopenedJoins(native) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await browser.getByRole('button', { name: /^Sweep along Spaced bore/ }).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const select = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const edge of native.nativeJoins.flat()) {
    await select.selectOption(edge.id);
    await button('Measure continuity', panel).click();
    const angle = result.locator('[data-continuity-angle]');
    await angle.waitFor();
    assert.equal(await angle.textContent(), '0°');
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot('07-reopened-downstream-joins');
}

async function inspectOpenCaps() {
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  const mouths = [{ name: 'inlet', view: 'Front', x: 0, y: 0 }, { name: 'outlet', view: 'Back', x: 38, y: 30 }];
  for (const { name, view, x, y } of mouths) {
    await button('View cube directions', cube).click();
    await f.page.getByRole('menuitem', { name: view, exact: true }).click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    await f.page.waitForFunction(([x, y, direction]) => {
      const a = window.__studioScreenOf([x, y, 0]), b = window.__studioScreenOf([x, y + 1, 0]);
      return document.querySelector('.view-cube .vc-label')?.textContent === direction && Math.hypot(a[0] - b[0], a[1] - b[1]) < .01;
    }, [x, y, view.toUpperCase()]);
    const hits = await f.page.evaluate(([x, y]) => ({
      opening: window.__studioSurfacePoint([x, y, 0]), land: window.__studioSurfacePoint([x, y, 1.7]),
    }), [x, y]);
    assert.ok(hits.land, JSON.stringify(hits));
    near(hits.land[1], y, 1e-4);
    assert.ok(!hits.opening || (view === 'Front' ? hits.opening[1] - y : y - hits.opening[1]) > .25, JSON.stringify(hits));
    const label = `08-${name}-remains-open`;
    f.report.observations.push({ label, ...hits });
    await f.snapshot(label);
  }
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
  await chooser.setFiles({ name: 'spaced-sweep-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed); await f.ready();
  const base = await f.inspect('unfilleted-native', seed);
  assert.ok(base.valid);
  assert.equal(base.genus, 1);
  near(base.volume, 3 * Math.PI * (15 * Math.PI + 8));
  assert.equal(base.inlet.length, 1, 'One display rim owns both native arcs');
  assert.equal(base.inlet[0].length, 2);
  assert.deepEqual(base.nativeJoins.map(edges => edges.length), [4, 4]);
  f.phase = 'Pick the original inlet bore rim on the desktop canvas';
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.waitForFunction(() => {
    const a = window.__studioScreenOf([0, 0, 0]), b = window.__studioScreenOf([0, 1, 0]);
    return document.querySelector('.view-cube .vc-label')?.textContent === 'FRONT' && Math.hypot(a[0] - b[0], a[1] - b[1]) < .01;
  });
  const point = await f.page.evaluate(() => window.__studioScreenOf([Math.SQRT1_2, 0, Math.SQRT1_2]));
  assert.ok(await f.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);
  await f.snapshot('01-inlet-rim-selected');
  f.phase = 'Evaluate the original R0.2 inlet Fillet';
  await f.command('Fillet');
  const field = fillet().getByLabel('Radius', { exact: true });
  if (!observe) {
    await field.fill('2');
    await phase('refused').waitFor({ timeout: 60000 });
    assert.ok(await button('Apply', fillet()).isDisabled()); await f.same(seed);
    await f.snapshot('02-oversize-refused');
  }
  await field.fill('0.2');
  await phase('preview|refused').waitFor({ timeout: 60000 });
  const previewed = await phase('preview').count() > 0;
  const picked = fillet().getByRole('group', { name: 'Fillet scope' }).locator('.field')
    .filter({ hasText: 'Picked native edges' }).locator('span[title]');
  assert.deepEqual((await picked.getAttribute('title')).split('\n').sort(), [...base.inlet[0]].sort());
  await f.same(seed);
  f.report.observations.push({ previewed, originalRim: base.inlet[0], hud: await fillet().innerText() });
  await f.snapshot(previewed ? '03-spaced-bore-fillet-preview' : '03-spaced-bore-fillet-refused');
  if (observe) return;
  assert.ok(previewed);
  await button('Apply', fillet()).click(); await f.changed(seed); await f.ready();
  const applied = (await f.snapshot('04-spaced-bore-fillet-applied')).doc;
  await verify('applied-native', applied, 0.2, base);
  await f.openFeatureEditor(2, 'spaced inlet bore Fillet');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.25');
  const edited = (await f.applyEditor(applied, '05-spaced-bore-fillet-edited')).doc;
  const native = await verify('edited-native', edited, 0.25, base);
  await f.undo(); await f.same(applied);
  await f.redo(); await f.same(edited);
  const saved = await f.save('spaced-bore-fillet');
  await f.freshOpen(saved.file, edited, '06-spaced-bore-fillet-reopened');
  const reopened = await verify('reopened-native', await f.doc(), 0.25, base);
  assert.equal(reopened.digest, native.digest);
  await measureReopenedJoins(reopened);
  await inspectOpenCaps();
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, saved.file, 'reopened-spaced-bore-fillet', async call => {
    const summary = await call('query', { action: 'summary' });
    near(summary.facts.volume, volumeByRadius.get(0.25), 0.001);
    assert.deepEqual(summary.features.at(-1).node, edited.nodes.at(-1));
    f.report.observations.push({ label: 'reopened-local-readback', volume: summary.facts.volume });
  });
});

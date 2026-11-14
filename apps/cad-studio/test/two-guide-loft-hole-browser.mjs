import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = resolve(process.argv[2]);
assert.ok(relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const pins = ['apps/cad-studio/test/two-guide-loft-hole-browser.mjs',
  'packages/barocss-cad/src/features/loft-two-guides.ts', 'packages/barocss-cad/src/part/part-model.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts', 'packages/barocss-cad-model/src/app/editFields.ts'];
const f = await createFlow({
  name: 'two-guide-loft-hole', envFrozen: 'D1279_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Drill and edit a through Hole on a two-guide Loft without changing its outer guide seams.',
  limits: ['One +Z rectangular cap, with both quadratic guides in the XZ plane and a coaxial straight bore fully inside every section.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, curveDomain, evaluateCurve, faceGeometry, massPropertiesOf } from '@barocss/cad';
const [out] = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8'))).outputs;
const {brep} = out;
const uses = id => brep.coedges.filter(coedge => coedge.edge === id);
const railNames = ['n2.side0|n2.side3','n2.side0|n2.side1'];
const rails = railNames.map(name => {
  const edge = brep.edges.find(edge => edge.name === name);
  const [a,b] = curveDomain(edge.curve);
  return { uses: uses(edge.id).length, points: [0,.25,.5,.75,1].map(t => evaluateCurve(edge.curve, a+(b-a)*t)) };
});
const caps = brep.faces.filter(face => /^n2\\.(top|bottom)$/.test(face.name)).map(face => {
  const inner = brep.loops.find(loop => loop.face === face.id && loop.kind === 'inner');
  return { name: face.name, rings: inner.coedges.map(id => {
    const edge = brep.edges.find(edge => edge.id === brep.coedges.find(coedge => coedge.id === id).edge);
    const [a,b] = curveDomain(edge.curve);
    return { uses: uses(edge.id).length, points: [0,.25,.5,.75,1].map(t => evaluateCurve(edge.curve, a+(b-a)*t)) };
  }) };
});
const cylinders = brep.faces.filter(face => face.name.startsWith('n3.')).map(faceGeometry);
console.log(JSON.stringify({check:checkBrep(brep,{strict:true}),mass:massPropertiesOf(out),rails,caps,cylinders}));
`,
});
const recipe = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 3, parameters: {}, outputs: { b2: { node: 2, side: 'solid' } },
  nodes: [
    ...[0, 1].map(i => ({ id: 'n' + i, kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6] })),
    { id: 'n2', kind: 'loft', sections: [{ sketch: 0, z: 0 }, { sketch: 1, z: 12 }],
      guides: [[0, 2], [10, 14]].map(([x, middle]) => ({ kind: 'quadratic-bezier', controlPoints: [[x, 0, 0], [middle, 0, 6], [x, 0, 12]] })) },
  ],
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Hole', exact: true });
const near = (x, y, tol = 1e-8) => assert.ok(Math.abs(x - y) <= tol, `${x} versus ${y}`);
async function check(doc, radius, label) {
  assert.deepEqual(doc.nodes[2], recipe.nodes[2]);
  assert.equal(doc.nodes[3].face, 'n2.top');
  assert.deepEqual(doc.nodes[3].center, [5, 3]);
  assert.equal(doc.nodes[3].depth, undefined);
  const out = await f.inspect(label, doc);
  assert.ok(out.check.valid, JSON.stringify(out.check.issues));
  assert.equal(out.check.topology[0].genus, 1);
  assert.deepEqual([out.check.counts.bodies, out.check.counts.faces, out.caps.length, out.cylinders.length], [1, 8, 2, 2]);
  for (const wall of out.cylinders) {
    assert.equal(wall.kind, 'cylinder');
    assert.equal(wall.out, -1);
    near(wall.c[0], 5); near(wall.c[1], 3); near(Math.abs(wall.a[2]), 1); near(wall.r, radius);
  }
  for (const cap of out.caps) {
    assert.equal(cap.rings.length, 2);
    for (const edge of cap.rings) {
      assert.equal(edge.uses, 2);
      for (const [x,y,z] of edge.points) {
        near(z, cap.name.endsWith('.top') ? 12 : 0);
        near(Math.hypot(x-5,y-3), radius);
      }
    }
  }
  for (const [side, rail] of out.rails.entries()) {
    assert.equal(rail.uses, 2);
    for (const [i, [x,y,z]] of rail.points.entries()) {
      const t = i / 4, q = 2 * t * (1 - t);
      near(z, 12 * t); near(y, 0); near(x, side === 0 ? 2 * q : 10 + 4 * q);
    }
  }
  const removed = 12 * Math.PI * radius ** 2, expected = 819.84 - removed;
  const m = (await f.bodies()).bodies;
  assert.equal(m.length, 1);
  near(out.mass.volume, expected); near(m[0].volume, expected);
  const q = (1 / 3 + 0.4 * 2 / 15 + 0.04 * 2 / 35) / (1 + 0.4 / 3 + 0.04 * 2 / 15);
  near(out.mass.centroid[0], ((5 + 3 * q) * 819.84 - 5 * removed) / expected);
  near(out.mass.centroid[1], ((3 + 0.6 * q) * 819.84 - 3 * removed) / expected);
  near(out.mass.centroid[2], 6);
  f.report.observations.push({ label, expected, actual: out.mass.volume, worker: m[0].volume });
  return out;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Open the Loft, pick the upper cap with the pointer, and open Hole';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'loft-before-hole.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(recipe)) });
  await f.same(recipe);
  await button('Top', f.page.getByRole('group', { name: 'Views' })).click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'TOP');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel = await f.page.evaluate(() => window.__studioScreenOf([5, 3, 12]));
  await f.page.mouse.click(...pixel, { button: 'right' });
  await f.page.getByRole('menuitem', { name: /^Hole\b/ }).click({ timeout: 10000 });
  assert.equal(await hud().getByLabel('Type', { exact: true }).inputValue(), 'through');
  await hud().getByLabel('Diameter', { exact: true }).fill('2');
  await hud().getByLabel('Centre X', { exact: true }).fill('5');
  await hud().getByLabel('Centre Y', { exact: true }).fill('3');
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor({ timeout: 15000 });
  await f.same(recipe);
  await button('Apply', hud()).click();
  await f.changed(recipe);
  const made = await f.doc();
  await check(made, 1, 'diameter-2');
  await f.snapshot('diameter-2');

  f.phase = 'Edit the Hole diameter, verify Undo and Redo and reopen';
  await f.openFeatureEditor(3, 'through Hole on the Loft');
  await f.editor().getByLabel('Diameter', { exact: true }).fill('2.5');
  const changed = (await f.applyEditor(made, 'diameter-2-5')).doc;
  const native = await check(changed, 1.25, 'diameter-2-5');
  await f.undo();
  await f.same(made);
  await f.redo();
  await f.same(changed);
  const saved = await f.save('loft-with-through-hole');
  await f.freshOpen(saved.file, changed, 'reopened');
  assert.deepEqual(await check(await f.doc(), 1.25, 'reopened'), native);
});

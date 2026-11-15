import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['packages/barocss-cad-model/src/engine/direct.ts', 'apps/cad-studio/src/ui/DirectPanel.tsx'];
const f = await createFlow({ name: 'direct-sweep-source-ids', output: process.argv[2], envFrozen: 'D1318_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Make curves in two separate public sketches, then sweep same local c1 IDs without a zero Move workaround.',
  limits: ['Two orthogonal lines on XY at desktop1024; unequal-degree rational geometry is unit-only.'],
  inspectorSource: `import {readFileSync} from 'node:fs';
import {analyzeSurface,geometryOf} from '@barocss/cad-model/engine/direct';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), d=doc.direct;
const surface=d.objects.at(-1);
console.log(JSON.stringify({analysis:analyzeSurface(d,surface.id,.5,.5),sources:d.objects.slice(0,2).map(o=>geometryOf(d,o))}));` });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
await f.run(async () => {
  await f.newPage(); await f.page.setViewportSize({ width: 1024, height: 800 }); await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0); await f.ready();
  for (const points of [[[10, 10], [30, 10]], [[45, 10], [45, 30]]]) {
    const before = await f.doc();
    await f.page.getByRole('navigation', { name: 'Tools', exact: true }).getByRole('button', { name: 'Sketch', exact: true }).click();
    await f.sketchPanel().waitFor(); await f.tool('Line', 'l'); await f.frame(points);
    for (const point of points) await f.worldClick(point);
    await button('Select').click();
    await button('Make curves', f.sketchPanel()).click(); await f.changed(before); await f.sketchPanel().waitFor({ state: 'hidden' });
  }
  const made = await f.doc(), [profile, path] = made.direct.objects;
  assert.equal(made.direct.objects.length, 2); assert.equal(profile.geometry, 'c1'); assert.equal(path.geometry, 'c1');
  assert.notEqual(profile.id, path.id); assert.notEqual(profile.source, path.source);
  await f.page.locator('.ol.direct').filter({ hasText: profile.name }).click();
  await f.page.locator('.ol.direct').filter({ hasText: path.name }).click({ modifiers: ['Shift'] });
  await button('Sweep', f.page.getByRole('complementary', { name: 'Direct geometry', exact: true })).click(); await f.changed(made);
  const accepted = await f.doc(); assert.equal(accepted.direct.objects.length, 3);
  assert.deepEqual(accepted.direct.objects.slice(0, 2), made.direct.objects);
  for (const [key, value] of Object.entries(made.direct.sources)) assert.equal(accepted.direct.sources[key], value);
  const verify = async (doc, label) => {
    const result = await f.inspect(label, doc);
    assert.deepEqual(result.sources.map(curve => curve.controlPoints), [[[10,10,0],[20,10,0],[30,10,0]],[[45,10,0],[45,20,0],[45,30,0]]]);
    assert.deepEqual(result.sources.map(curve => [curve.degree, curve.knots, curve.weights]), [[2,[0,0,0,1,1,1],[1,1,1]],[2,[0,0,0,1,1,1],[1,1,1]]]);
    assert.deepEqual(result.analysis.point, [20, 20, 0]); assert.deepEqual(result.analysis.normal, [0, 0, 1]);
  };
  await verify(accepted, 'accepted'); await f.snapshot('swept-separate-c1');
  await f.undo(); await f.same(made); await f.redo(); await f.same(accepted);
  const saved = await f.save('separate-c1-sweep'); await f.freshOpen(saved.file, saved.doc, 'reopened'); await verify(saved.doc, 'reopened');
});

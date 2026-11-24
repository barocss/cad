import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const inlet = 'n1.start';
const source = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
      holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'cw' }]],
      sideTags: { outer: ['e0'], holes: [['bore']] } },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Perpendicular bore', mode: 'exact', path: {
      degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
      controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 23], [12, 30, 28]],
    } },
  ], outputs: { b1: { node: 1, side: 'solid' } } };
const pins = ['packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/app/nativeOffsetFace.ts'];
const f = await createFlow({ name: 'perpendicular-sweep-inlet-offset', output: process.argv[2], envFrozen: 'D1921_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Use signed Offset face on the original annular inlet of the four-span perpendicular Exact Sweep.',
  limits: ['Original inlet of one exact annulus with both straight ends. No replacement, outlet or linked reference plane. Desktop only.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const { outputs: [out] } = partSnapshot(doc);
const drawn = evaluateDoc(doc, 0).bodies[0];
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const sample = edge => {
  const [lo,hi] = curveDomain(edge.curve);
  return [0,.19,.5,.81,1].map(t => evaluateCurve(edge.curve,lo+(hi-lo)*t));
};
const caps = brep.faces.flatMap(face => {
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane') return [];
  return [{ name: face.name, plane, loops: face.loops.map(id => {
    const loop = loops.get(id);
    return { kind: loop.kind, rims: loop.coedges.map(id => {
      const use = uses.get(id), twin = uses.get(use.twin);
      return { reciprocal: twin?.twin === id && twin.edge === use.edge && twin.sense !== use.sense, points: sample(edges.get(use.edge)) };
    }) };
  }) }];
});
const joints = [[0,0],[1,12],[2,18]].flatMap(([axis,level]) => brep.edges
  .filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[axis]-level)<1e-9)).map(edge => ({
    id: edge.id, points: sample(edge), continuity: measureBrepEdgeContinuity(brep,edge.id),
    sides: brep.coedges.filter(use => use.edge === edge.id).map(use => [use.id,digestOf(use.pcurve)]),
  })));
const kept = brep.faces.filter(face => face.name !== 'n1.start' && !face.name?.startsWith('n1.lead.'))
  .map(face => [face.name,digestOf(face.surface)]);
console.log(JSON.stringify({ digest: digestOf(brep), topology: checkBrep(brep,{strict:true}), caps, joints, kept,
  mesh: drawn.mesh.faces.map(face => [face.name,face.index]), mass: massPropertiesOf(out), quadrature: brepMassProperties(brep,1) }));
`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (dialog, label) => dialog.locator('.status').filter({ hasText: new RegExp(`^${label}$`) });
const distance = dialog => dialog.getByLabel('Offset', { exact: true });
const near = (a, b, tol = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tol, JSON.stringify({ a, b, tol }));
const baseLength = 15 * Math.PI + 20;
const baseMoments = [324 * Math.PI + 2583 / 4, 540 * Math.PI + 1440, 486 * Math.PI - 1143 / 4].map(value => value / 3);

async function verify(label, doc, offset, original) {
  const result = await f.inspect(label,doc), { topology, caps, joints, kept, mass, quadrature } = result;
  assert.ok(topology.valid, topology.issues.join('\n'));
  assert.deepEqual(topology.counts, { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 72, edges: 36, vertices: 20 });
  assert.equal(topology.topology[0].genus,1);
  const cap = caps.find(face => face.name === inlet);
  assert.ok(cap && cap.plane.kind === 'plane');
  near(cap.plane.o[0],-10-offset);
  assert.deepEqual(cap.plane.n,[-1,0,0]);
  assert.deepEqual(cap.loops.map(loop => loop.kind),['outer','inner']);
  for (const { kind, rims } of cap.loops) {
    assert.equal(rims.length,2);
    for (const rim of rims) {
      assert.ok(rim.reciprocal);
      for (const [x,y,z] of rim.points) {
        near(x,-10-offset);
        near(Math.hypot(y,z),kind === 'outer' ? 2 : 1);
      }
    }
  }
  assert.deepEqual(caps.find(face => face.name === 'n1.end'),original.caps.find(face => face.name === 'n1.end'));
  assert.deepEqual(kept,original.kept);
  const withoutContinuity = edges => edges.map(({id,points,sides}) => ({id,points,sides}));
  assert.deepEqual(withoutContinuity(joints),withoutContinuity(original.joints));
  assert.equal(joints.length,12);
  for (const edge of joints) {
    assert.equal(edge.continuity.status,'measured');
    near(edge.continuity.maximumAngleDegrees,0,1e-6);
  }
  const length = baseLength + offset, centroid = baseMoments.map((value,i) => (value + (i ? 0 : offset * (-10-offset/2))) / length);
  const [shown] = (await f.bodies()).bodies;
  for (const measured of [mass,quadrature,shown]) {
    near(measured.volume,3*Math.PI*length);
    measured.centroid.forEach((value,i) => near(value,centroid[i]));
  }
  f.report.observations.push({label,offset,capX:cap.plane.o[0],volume:mass.volume,centroid:mass.centroid,
    gap:topology.maximumPcurveGap,digest:result.digest});
  return result;
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: 'annular-sweep-inlet-offset.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) },2);
  await f.same(source);
  const original = await f.inspect('original',source);
  assert.ok(original.topology.valid);
  f.phase = 'pick the original annular inlet land';
  await button('View cube directions',f.page.getByRole('group',{name:'View cube',exact:true})).click();
  await f.page.getByRole('menuitem',{name:'Left',exact:true}).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT');
  const pixel = await f.page.evaluate(() => window.__studioScreenOf([-10,0,1.55]));
  assert.ok(pixel && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'),pixel));
  await f.page.mouse.click(...pixel);
  const capIndex = original.mesh.find(([name]) => name === inlet)?.[1];
  assert.ok(Number.isInteger(capIndex));
  await f.page.waitForFunction(index => window.__studioSelection?.selection.faces[0]?.face === index,capIndex);
  f.phase = 'open the signed Offset face on the selected inlet';
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  if (baseline) {
    await status(panel,'refused').waitFor();
    assert.ok(await button('Apply',panel).isDisabled());
    await f.same(source);
    await f.snapshot('01-original-inlet-offset-refused');
    return;
  }
  await distance(panel).fill('4');
  await status(panel,'preview').waitFor();
  assert.equal(await panel.getByLabel('Mode',{exact:true}).count(),0);
  await f.snapshot('01-outward-preview');
  await button('Apply',panel).click();
  await f.changed(source);
  const outward = (await f.snapshot('02-outward-applied')).doc, operation = outward.nodes[2];
  assert.deepEqual(outward.nodes.slice(0,2),source.nodes);
  assert.deepEqual([operation.kind,operation.parent,operation.faces,operation.distance],
    ['offset-face',{node:1,side:'solid'},[inlet],4]);
  assert.equal(operation.sigs[inlet].k,'plane');
  await verify('outward',outward,4,original);

  f.phase = 'check joint contact and edit the original Offset in History';
  await f.openFeatureEditor(2,'the signed inlet Offset');
  await button('Edit offset',f.editor()).click();
  const editor = hud('Edit Offset face');
  await distance(editor).fill('-10');
  await status(editor,'refused').waitFor();
  assert.ok(await button('Apply',editor).isDisabled());
  await f.same(outward);
  await f.snapshot('03-joint-contact-refused');
  await distance(editor).fill('-4');
  await status(editor,'preview').waitFor();
  await button('Apply',editor).click();
  await f.changed(outward);
  const inward = (await f.snapshot('04-inward-applied')).doc;
  assert.deepEqual(inward.nodes,[...source.nodes,{...operation,distance:-4}]);
  const native = await verify('inward',inward,-4,original);
  await f.undo(); await f.same(outward);
  await f.redo(); await f.same(inward);
  const saved = await f.save('perpendicular-annular-inlet-offset');
  await f.freshOpen(saved.file,inward,'05-native-reopened');
  assert.equal((await verify('reopened',await f.doc(),-4,original)).digest,native.digest);
  await button('Iso',f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await f.snapshot('06-reopened-offset-inlet');
});

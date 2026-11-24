import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const flow = await createFlow({
  name: 'three-section-two-guide-loft', output: process.argv[2], envFrozen: 'THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN',
  initialFiles: ['packages/barocss-cad/src/features/loft-two-guides.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts'],
  qualification: 'Build and reopen a ruled Loft with two exact rails and a separately shaped middle rectangle.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, evaluateCurve } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ key, brep }] = partBreps(doc);
console.log(JSON.stringify({
  key, mass: brepMassProperties(brep, 1), check: checkBrep(brep, { strict: true, pcurveSamples: 13 }),
  faces: brep.faces.map(face => face.name),
  pcurveCount: brep.coedges.filter(use => use.pcurve).length,
  vertices: brep.vertices.map(vertex => vertex.point),
  joints: brep.edges.map(edge => ({
    controls: edge.curve.controlPoints,
    sample: [0, 0.25, 0.5, 0.75, 1].map(t => evaluateCurve(edge.curve, t)),
    uses: brep.coedges.filter(use => use.edge === edge.id).length,
  })),
}));
`,
});
const guide = x => [[x, 0, 0], [x === 0 ? 0 : 18, 0, 10], [x, 0, 20]];
const curve = (name, x) => `@model ${name} {
  version: 0; length-unit: mm;
  @curve #curve { type: nurbs; degree: 2; knots: [0,0,0,1,1,1];
    control-points: ${JSON.stringify(guide(x))}; weights: [1,1,1]; }
}`;
const rectangle = (id, width, depth, z) => ({
  id, kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [width, depth],
  ...(z === 0 ? {} : { plane: { origin: [0, 0, z], normal: [0, 0, 1], xAxis: [1, 0, 0] } }),
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4, outputs: {},
  nodes: [
    rectangle('n0', 10, 6, 0), rectangle('n1', 14, 12, 10),
    rectangle('n2', 10, 6, 20), rectangle('n3', 14, 14, 10),
  ],
  direct: {
    sources: { a: curve('left', 0), b: curve('right', 10) },
    objects: [{ id: 'a', name: 'Rail A', source: 'a', geometry: 'curve' },
      { id: 'b', name: 'Rail B', source: 'b', geometry: 'curve' }],
  },
};
const button = (name, context = flow.page) => context.getByRole('button', { name, exact: true });
const hud = () => flow.page.getByRole('dialog', { name: 'Loft', exact: true });
const waitStatus = status => hud().locator('.status').filter({ hasText: new RegExp('^' + status + '$') }).waitFor();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' vs ' + expected);

async function verify(label, middleDepth, middleSource) {
  const doc = await flow.doc(), node = doc.nodes[7];
  assert.deepEqual(doc.nodes.slice(0, 4), seed.nodes);
  assert.equal(node.kind, 'loft');
  assert.equal(node.id, 'n7');
  assert.deepEqual(node.from, [0, middleSource, 2]);
  assert.deepEqual(node.sections, [{ sketch: 4, z: 0 }, { sketch: 5, z: 10 }, { sketch: 6, z: 20 }]);
  assert.deepEqual(node.guides.map(value => value.controlPoints), [guide(0), guide(10)]);
  const native = await flow.inspect(label, doc), [worker] = (await flow.bodies()).bodies;
  assert.equal(native.key, worker.key);
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 40, edges: 20, vertices: 12 });
  assert.equal(native.check.topology[0].genus, 0);
  assert.equal(native.pcurveCount, 40);
  assert.ok(native.check.maximumPcurveGap < 1e-8);
  const volume = middleDepth === 12 ? 16808 / 7 : 2656;
  near(native.mass.volume, volume);
  near(worker.volume, volume);
  near(native.mass.centroid[2], 10);
  const ring = [[0, 0, 10], [14, 0, 10], [14, middleDepth, 10], [0, middleDepth, 10]];
  assert.deepEqual(native.vertices.filter(point => point[2] === 10).sort(), [...ring].sort());
  const middleEdges = native.joints.filter(joint => joint.controls.every(point => point[2] === 10));
  assert.equal(middleEdges.length, 4);
  for (const edge of middleEdges) {
    const [start, end] = edge.controls;
    assert.equal(edge.uses, 2);
    assert.ok(ring.some((point, i) => [point, ring[(i + 1) % 4]].sort().join('|') === [start, end].sort().join('|')));
  }
  const rails = [];
  for (const [x, c] of [[0, 0], [10, 18]]) {
    const middle = [(x + c) / 2, 0, 10];
    const lower = [[x, 0, 0], [(x + c) / 2, 0, 5], middle];
    const top = [middle, [(x + c) / 2, 0, 15], [x, 0, 20]];
    for (const row of [lower, top]) {
      const rail = native.joints.find(joint => JSON.stringify(joint.controls) === JSON.stringify(row));
      assert.ok(rail, JSON.stringify(row));
      assert.equal(rail.uses, 2);
      rails.push(rail);
    }
  }
  flow.report.observations.push({ label, volume, nativeVolume: native.mass.volume, middleDepth, rails: rails.length });
  return doc;
}

await flow.run(async () => {
  flow.phase = 'Select three separate horizontal sketches';
  await flow.newPage();
  await flow.openFile({ name: 'guided-middle-section.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 4);
  await flow.same(seed);
  for (const [index, name] of ['Sketch 3', 'Sketch 1', 'Sketch 2'].entries())
    await button(name).click(index ? { modifiers: ['Shift'] } : {});
  await flow.page.evaluate(() => document.activeElement?.blur());
  await flow.command('Loft');
  await hud().getByLabel('Guide (copied)', { exact: true }).selectOption('a');
  const secondGuide = hud().getByLabel('Second guide (copied)', { exact: true });
  if (baseline) {
    assert.equal(await secondGuide.count(), 0);
    await flow.same(seed);
    await flow.snapshot('00-prior-second-guide-unavailable');
    return;
  }

  flow.phase = 'Create the exact Loft with two rails and a shared middle section';
  await secondGuide.selectOption('b');
  await waitStatus('preview');
  await flow.same(seed);
  await button('Apply', hud()).click();
  await flow.changed(seed);
  const first = await verify('middle-depth-12', 12, 1);
  await button('Iso').click();
  await flow.page.getByTitle('Frame all (F)', { exact: true }).click();
  await flow.snapshot('01-three-section-loft');
  await flow.openFeatureEditor(7, 'Loft three sections');
  const editor = flow.editor();
  await editor.getByLabel('Guide 2 middle X', { exact: true }).fill('19');
  await button('Apply', editor).click();
  await editor.locator('.hud-error-title').waitFor();
  await flow.same(first);
  await flow.snapshot('02-off-middle-guide-refused');
  await editor.getByLabel('Guide 2 middle X', { exact: true }).fill('18');
  await editor.getByLabel('Section 2 source', { exact: true }).selectOption('n3');
  await button('Apply', editor).click();
  await flow.changed(first);
  const second = await verify('middle-depth-14', 14, 3);
  await flow.snapshot('03-middle-source-edited');
  await flow.undo();
  await flow.same(first);
  await flow.redo();
  await flow.same(second);
  const { file } = await flow.save('three-section-two-guide-loft');
  await flow.freshOpen(file, second, '04-fresh-open');
  await verify('reopened-depth-14', 14, 3);
});

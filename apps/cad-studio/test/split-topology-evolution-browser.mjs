import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts'];
const f = await createFlow({
  name: 'split-topology-evolution', output: process.argv[2], envFrozen: 'SPLIT_TOPOLOGY_EVOLUTION_FROZEN',
  qualification: 'Read native face and edge evolution of a Studio axis Split.',
  limits: ['One original rectangular extrusion with both native Split outputs.'], initialFiles: pins, requiredFrozen: pins,
  extraFrozen: baseline ? [] : ['packages/barocss-cad/src/part/split-topology-evolution.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import * as cad from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const studio = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const snapshot = partSnapshot(studio);
const read = Reflect.get(cad, 'splitTopologyEvolutionOf');
const resolve = Reflect.get(cad, 'resolveSplitTopologySource');
const stock = partSnapshot({ ...studio, nodes: studio.nodes.slice(0, 2), outputs: { b1: { node: 1, side: 'solid' } } }).outputs[0];
function body(output) {
  const { brep, id } = output;
  return { id, bodyId: brep.bodies[0].id, report: cad.checkBrep(brep, { strict: true }), closed: brep.shells.every(shell => shell.closed),
    vertices: brep.vertices.map(v => v.point),
    faces: brep.faces.map(face => ({ id: face.id, name: face.name, support: cad.faceGeometry(face) })),
    edges: brep.edges.map(edge => ({ id: edge.id, name: edge.name, vertices: edge.vertices,
      points: edge.vertices.map(id => brep.vertices.find(v => v.id === id).point) })),
    volume: cad.massPropertiesOf(output).volume };
}
const evolution = read?.(snapshot, 'n2') ?? null;
const sourceBody = body(stock);
const top = sourceBody.faces.find(face => face.name === 'n1.top');
const left = sourceBody.faces.find(({ support }) => support.kind === 'plane' && support.n[0] === -1);
const selections = evolution && {
  top: resolve(evolution, { kind: 'face', id: top.id }),
  topNegative: resolve(evolution, { kind: 'face', id: top.id }, 'negative'),
  leftPositive: resolve(evolution, { kind: 'face', id: left.id }, 'positive'),
  unknown: resolve(evolution, { kind: 'face', id: 'unknown-source' }),
};
console.log(JSON.stringify({ stock: sourceBody, outputs: snapshot.outputs.map(body), evolution, selections }));
`,
});

const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [24, 16] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Split', exact: true });
const cut = () => f.editor().getByRole('spinbutton', { name: 'At', exact: true });

async function prove(label, doc, at) {
  const proof = await f.inspect(label, doc), geometries = [[proof.stock, 0, 24],
    [proof.outputs[0], 0, at], [proof.outputs[1], at, 24]];
  assert.deepEqual(proof.outputs.map(body => body.id), ['n2/0', 'n2/1']);
  const near = (a, b) => Math.abs(a - b) < 1e-8;
  for (const [body, minX, maxX] of geometries) {
    assert.ok(body.closed && body.report.valid);
    assert.deepEqual(body.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    const corners = [minX, maxX].flatMap(x => [0, 16].flatMap(y => [0, 10].map(z => [x, y, z])));
    assert.deepEqual(body.vertices.map(v => v.join(',')).sort(), corners.map(v => v.join(',')).sort());
    assert.ok(near(body.volume, (maxX - minX) * 160));
  }
  assert.ok(near(proof.outputs[0].volume + proof.outputs[1].volume, proof.stock.volume));
  for (const [index, sign] of [1, -1].entries()) {
    const cap = proof.outputs[index].faces.filter(({ support }) => support.kind === 'plane' &&
      near(support.n[0], sign) && near(support.o[0], at));
    assert.equal(cap.length, 1);
  }
  return proof;
}

function proveEvolution({ stock: source, outputs, evolution, selections }, at) {
  assert.deepEqual([evolution.schema, evolution.version, evolution.featureId, evolution.plane, evolution.persistentNamingCertified],
    ['barocss-split-topology-evolution', 0, 'n2', { axis: 'x', at }, false]);
  assert.equal(evolution.parent.outputId, source.id);
  assert.equal(evolution.parent.bodyId, source.bodyId);
  const sourceKey = item => `${item.kind}:${item.id}`;
  const sourceItems = [...source.faces.map(face => ({ ...face, kind: 'face' })), ...source.edges.map(edge => ({ ...edge, kind: 'edge' }))];
  assert.deepEqual(evolution.sources.map(sourceKey).sort(), sourceItems.map(sourceKey).sort());
  const pointsKey = points => points.map(point => point.join(',')).sort().join('|');
  for (const [index, side] of ['negative', 'positive'].entries()) {
    const receipt = evolution.sides[index], body = outputs[index], negative = index === 0;
    assert.equal(receipt.side, side);
    assert.equal(receipt.output.outputId, body.id);
  assert.equal(receipt.output.bodyId, body.bodyId);
    assert.deepEqual(receipt.mappings.map(({ source }) => sourceKey(source)).sort(), sourceItems.map(sourceKey).sort());
    for (const item of sourceItems) {
      const mapping = receipt.mappings.find(({ source }) => sourceKey(source) === sourceKey(item));
      assert.equal(mapping.source.name, item.name);
      let found;
      let relation;
      if (item.kind === 'face') {
        const axial = Math.abs(item.support.n[0]) === 1;
        const onSide = (item.support.n[0] < 0) === negative;
        relation = axial ? (onSide ? 'retained' : 'deleted') : 'modified';
        if (relation !== 'deleted') found = body.faces.find(face => face.name === item.name);
      } else {
        const crosses = item.points[0][0] !== item.points[1][0];
        const onSide = (item.points[0][0] < at) === negative;
        relation = crosses ? 'modified' : (onSide ? 'retained' : 'deleted');
        if (relation !== 'deleted') {
          const clipped = item.points.map(([x, y, z]) => [negative ? Math.min(x, at) : Math.max(x, at), y, z]);
          found = body.edges.find(edge => pointsKey(edge.points) === pointsKey(clipped));
        }
      }
      assert.equal(mapping.relation, relation);
      if (relation === 'deleted') {
        assert.deepEqual(mapping.images, []);
      } else {
        assert.ok(found, `Missing native image for ${item.id} on ${side}`);
        assert.equal(mapping.images.length, 1);
        const image = mapping.images[0];
        assert.deepEqual([image.kind, image.id, image.name, image.side, image.outputId, image.bodyId],
          [item.kind, found.id, found.name, side, body.id, receipt.output.bodyId]);
      }
    }
    const cap = body.faces.find(({ support }) => support.o[0] === at && support.n[0] === (negative ? 1 : -1));
    const capEdges = body.edges.filter(edge => edge.points.every(point => point[0] === at));
    assert.equal(capEdges.length, 4);
    const generated = [`face:${cap.id}`, ...capEdges.map(edge => `edge:${edge.id}`)];
    assert.deepEqual(receipt.generated.map(sourceKey).sort(), generated.sort());
    assert.ok(receipt.generated.every(ref => ref.outputId === body.id && ref.side === side && ref.bodyId === receipt.output.bodyId));
  }
  assert.deepEqual([selections.top.status, selections.topNegative.status, selections.leftPositive.status, selections.unknown.status],
    ['ambiguous', 'unique', 'deleted', 'unmatched']);
  assert.deepEqual(selections.top.images.map(image => image.side).sort(), ['negative', 'positive']);
  assert.equal(selections.topNegative.image.side, 'negative');
  f.report.observations.push({ at, volume: outputs.map(body => body.volume), sources: evolution.sources.length,
    generated: evolution.sides.map(side => side.generated.length), resolutions: Object.fromEntries(Object.entries(selections).map(([key, value]) => [key, value.status])) });
}

await f.run(async () => {
  const file = join(f.output, 'split-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  await f.freshOpen(file, stock, 'original-stock');
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let attempt = 0; attempt < 4 && !(await filter.innerText()).includes('Bodies'); attempt++) await filter.click();
  assert.match(await filter.innerText(), /Bodies/);
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [12, 8, 10]);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.bodies.length === 1);
  await clickModelCommand(f.page, 'Modify', 'Split');
  await hud().getByLabel('At', { exact: true }).fill('9');
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await f.snapshot('studio-split-preview');
  await button('Apply', hud()).click();
  await f.changed(stock);
  const split = await f.doc();
  const proof = await prove('native-split', split, 9);
  if (baseline) {
    assert.equal(proof.evolution, null);
    await f.snapshot('baseline-split-result');
    return;
  }
  proveEvolution(proof, 9);

  await f.openFeatureEditor(2, 'Split plane');
  assert.equal(await cut().inputValue(), '9');
  await cut().fill('12');
  await f.applyEditor(split, 'updated-split-plane');
  const revised = await f.doc();
  const updated = await prove('updated-native-split', revised, 12);
  proveEvolution(updated, 12);
  await f.undo();
  await f.same(split);
  await f.redo();
  await f.same(revised);

  await f.openFeatureEditor(2, 'tangent Split refusal');
  await cut().fill('24');
  await button('Apply', f.editor()).click();
  await f.editor().locator('.hud-error').waitFor();
  await f.same(revised);
  await f.snapshot('studio-refused-non-crossing-split');
  await f.closeEditor();

  const saved = await f.save('split-topology-evolution');
  await f.freshOpen(saved.file, saved.doc, 'reopened-split');
  const reopened = await prove('reopened-native-split', saved.doc, 12);
  assert.deepEqual(reopened.evolution, updated.evolution);
  proveEvolution(reopened, 12);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.openFeatureEditor(2, 'reopened Split History');
  assert.equal(await cut().inputValue(), '12');
  await f.snapshot('reopened-split-history');
});

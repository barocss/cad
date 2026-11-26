import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBrep, type Brep } from '../../../packages/barocss-cad/src/brep/brep-core';
import { lookOf } from '@barocss/cad-model/app/bodies';
import { variantNamed, variantOf } from '@barocss/cad-model/assembly/variability';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { buildSensorEnclosure, readSensorSource, sensorDocumentAt, sensorSource } from '../src/sensorEnclosure';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const span = (solid: Brep, axis: number) => {
  const p = solid.vertices.map(v => v.point[axis]);
  return [Math.min(...p), Math.max(...p)];
};

function inspect(doc: StudioDoc, boardWidth: number) {
  const solids = partBreps(doc);
  assert.equal(solids.length, 7);
  for (const { brep } of solids) {
    const report = checkBrep(brep, { strict: true });
    assert.ok(report.valid, report.issues.join('; '));
    assert.equal(brep.bodies.length, 1);
    assert.equal(brep.bodies[0].kind, 'solid');
    assert.equal(brep.shells.length, 1);
    assert.ok(brep.shells[0].closed);
  }
  const evaluated = evaluateDoc(doc, 0);
  if (!evaluated.ok) assert.fail(evaluated.error.title);
  const evaluatedByKey = new Map(evaluated.bodies.map(b => [b.key, b]));
  const named = new Map(solids.map(({ key, brep }) => [lookOf(doc, evaluatedByKey.get(key)!).name, brep]));
  const shell = named.get('Case body')!, lid = named.get('Lid')!, pcb = named.get('Sensor board')!;
  const width = boardWidth + 8;
  for (const body of [shell, lid]) {
    assert.deepEqual(span(body, 0), [0, width]);
    assert.deepEqual(span(body, 1), [0, 42]);
  }
  assert.deepEqual(span(shell, 2), [0, 18]);
  assert.deepEqual(span(lid, 2), [18, 21]);
  assert.deepEqual(span(pcb, 0), [4, boardWidth + 4]);
  assert.deepEqual(span(pcb, 1), [5, 37]);

  // Four cut-wall edges join the inner and outer front faces: verifies a passage, not just a surface outline.
  const points = new Map(shell.vertices.map(v => [v.id, v.point]));
  const passage = shell.edges.flatMap(({ vertices }) => {
    const [a, b] = vertices.map(id => points.get(id)!);
    if (Math.min(a[1], b[1]) !== 0 || Math.max(a[1], b[1]) !== 2 || a[0] !== b[0] || a[2] !== b[2]) return [];
    return [[a[0], a[2]].join(',')];
  });
  assert.deepEqual([...new Set(passage)].sort(), ['20,12', '20,6', '30,12', '30,6']);
  const key = solids.find(s => s.brep === shell)!.key;
  near(evaluated.bodies.find(b => b.key === key)!.volume!, width * 42 * 18 - (width - 4) * 38 * 16 - 10 * 6 * 2);

  const seenCaps: string[] = [];
  for (const [side, x] of [['Left', 10], ['Right', boardWidth - 2]] as const) {
    for (const [position, y] of [['front', 11], ['rear', 31]] as const) {
      const support = named.get(`${side} ${position} support`)!;
      assert.deepEqual(span(support, 0), [x - 3, x + 3]);
      assert.ok(support.vertices.every(v => v.point[1] === y));
      assert.deepEqual(span(support, 2), [2, 8]);
      seenCaps.push([x - 1.25, y, 8].join(','), [x - 1.25, y, 9.6].join(','));
    }
  }
  // The four independent bore loops are present on both caps and co-located with the four supports.
  const pcbVertices = new Map(pcb.vertices.map(v => [v.id, v.point]));
  const pcbEdges = new Map(pcb.edges.map(e => [e.id, e]));
  const coedges = new Map(pcb.coedges.map(c => [c.id, c]));
  const capLoops = pcb.loops.filter(l => l.kind === 'inner').map(l => {
    const endpoints = l.coedges.flatMap(id => pcbEdges.get(coedges.get(id)!.edge)!.vertices.map(v => pcbVertices.get(v)!));
    return [Math.min(...endpoints.map(p => p[0])), endpoints[0][1], endpoints[0][2]].join(',');
  });
  assert.deepEqual(capLoops.sort(), seenCaps.sort());
}

test('sensor enclosure yields seven qualified native solids with fixed left supports and an unchanged through port', () => {
  const master = buildSensorEnclosure();
  inspect(master, 56);
  for (const width of [60.5, 64]) {
    const variant = variantOf(master, { boardWidth: width }).doc;
    assert.deepEqual(variant.outputs, master.outputs);
    assert.equal(variant.nodes, master.nodes);
    inspect(variant, width);
  }
  assert.strictEqual(variantOf(master, { boardWidth: 56 }).doc, master);
  for (const width of [55.99, 64.01, Infinity, NaN, '64']) assert.throws(() => variantOf(master, { boardWidth: width }));
});

test('an editable BCAD file retains the shared input and rebuilds the named 64 mm variant after reopening', async () => {
  const master = buildSensorEnclosure();
  const read = await readStudioFile(encodeStudioFile(master));
  if ('error' in read) assert.fail(read.error);
  assert.deepEqual(read.doc.variability, master.variability);
  assert.deepEqual(read.doc.nodes, master.nodes);
  inspect(read.doc, 56);
  inspect(variantNamed(read.doc, '64 mm board').doc, 64);
});

test('applied 64 mm reopens as a coherent native master with a live 56 mm variant', async () => {
  const applied = sensorDocumentAt(64);
  const read = await readStudioFile(encodeStudioFile(applied));
  if ('error' in read) assert.fail(read.error);
  assert.equal(read.doc.variability?.inputs[0].default, 64);
  inspect(variantOf(read.doc).doc, 64);
  inspect(variantNamed(read.doc, '56 mm board').doc, 56);
  for (const width of [56, 60.5, 64]) assert.equal(readSensorSource(sensorSource(width)), width);
  for (const source of [sensorSource(65), sensorSource(64) + 'garbage', 'sensor-enclosure boardWidth=64']) assert.equal(readSensorSource(source), null);
});

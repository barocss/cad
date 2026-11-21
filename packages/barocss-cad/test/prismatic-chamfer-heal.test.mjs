import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, faceGeometry } from '../dist/index.js';
import { healAdjacentPrismaticChamferIfAdmitted, healHorizontalChamferIfAdmitted, healOppositePrismaticChamferIfAdmitted, healPrismaticChamferIfAdmitted } from '../dist/features/heal-prismatic-chamfer.js';

const doc = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const evaluate = features => evaluateCadPart(doc(features)).outputs[0].brep;
const stock = [
  { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
  { id: 'b', kind: 'extrude', sketch: 's', height: 10 },
];
const sharp = evaluate(stock);
const corners = ['b.side0|b.side3', 'b.side0|b.side1', 'b.side1|b.side2', 'b.side2|b.side3'];
const bevel = (edges, distance = 2) => ({ id: 'chamfer', kind: 'chamfer', target: 'b', edges, distance });
const faceName = 'chamfer.face';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

function assertHealedBox(healed, source, edge, deleted = faceName) {
  const report = checkBrep(healed, { strict: true });
  assert.ok(report.valid, report.issues.join(', '));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
  const mass = brepMassProperties(healed, 1);
  near(mass.volume, 12000);
  mass.centroid.forEach((value, i) => near(value, [20, 15, 5][i]));
  assert.deepEqual(healed.faces.map(face => [face.id, face.name]).sort(),
    source.faces.filter(face => face.name !== deleted).map(face => [face.id, face.name]).sort());
  for (const face of healed.faces) {
    const actual = faceGeometry(face), independent = faceGeometry(sharp.faces.find(candidate => candidate.name === face.name));
    assert.equal(actual.kind, 'plane');
    actual.n.forEach((value, k) => near(value, independent.n[k]));
    const support = ({ o, n }) => n.reduce((sum, value, k) => sum + value * o[k], 0);
    near(support(actual), support(independent));
  }
  assert.ok(healed.edges.some(candidate => candidate.name === edge));
}

for (const [index, edge] of corners.entries()) {
  test(`Delete face heals the single full-height bevel at ${edge}`, () => {
    const distance = index + 1, features = [...stock, bevel([edge], distance)];
    const source = evaluate(features), saved = structuredClone(source);
    const before = checkBrep(source, { strict: true });
    assert.ok(before.valid, before.issues.join(', '));
    assert.deepEqual(before.counts, { bodies: 1, shells: 1, faces: 7, loops: 7, coedges: 30, edges: 15, vertices: 10 });
    near(brepMassProperties(source, 1).volume, 12000 - 5 * distance ** 2);
    const healed = healPrismaticChamferIfAdmitted(source, faceName, edge);
    assertHealedBox(healed, source, edge);
    assert.deepEqual(evaluate([...features, { id: 'heal', kind: 'delete-face', target: 'chamfer', face: faceName }]), healed);
    assert.equal(healPrismaticChamferIfAdmitted(source, 'b.top', edge), undefined);
    assert.equal(healPrismaticChamferIfAdmitted(source, faceName, corners[(index + 1) % 4]), undefined);
    assert.deepEqual(source, saved);
  });
}

for (const cap of ['top', 'bottom']) for (const side of [0, 1, 2, 3]) {
  const edge = ['b.' + cap, 'b.side' + side].sort().join('|');
  test(`Delete face heals the single full-width bevel at ${edge}`, () => {
    const features = [...stock, bevel([edge])], source = evaluate(features), saved = structuredClone(source);
    const span = side % 2 === 0 ? 40 : 30;
    near(brepMassProperties(source, 1).volume, 12000 - 2 * span);
    const healed = healHorizontalChamferIfAdmitted(source, faceName, edge);
    assertHealedBox(healed, source, edge);
    assert.ok(healed.coedges.every(use => !use.pcurve));
    assert.equal(healed.edges.filter(item => source.edges.some(original => original.id === item.id && original.name === item.name)).length, 11);
    assert.deepEqual(evaluate([...features, { id: 'heal', kind: 'delete-face', target: 'chamfer', face: faceName }]), healed);
    assert.equal(healHorizontalChamferIfAdmitted(source, 'b.' + cap, edge), undefined);
    assert.equal(healHorizontalChamferIfAdmitted(source, faceName, corners[0]), undefined);
    assert.deepEqual(source, saved);
  });
}

test('the full-height heal refuses plain stock, a cap edge chamfer and two chamfers', () => {
  assert.equal(healPrismaticChamferIfAdmitted(sharp, 'b.top', corners[0]), undefined);
  const top = 'b.side0|b.top';
  assert.equal(healPrismaticChamferIfAdmitted(evaluate([...stock, bevel([top])]), faceName, top), undefined);
  assert.equal(healPrismaticChamferIfAdmitted(evaluate([...stock, bevel([corners[0], corners[2]])]), faceName, corners[0]), undefined);
});

const pairedCorners = [
  [corners[0], corners[2]], [corners[1], corners[3]],
  ...corners.map((edge, i) => [edge, corners[(i + 1) % corners.length]]),
];
for (const pair of pairedCorners) {
  const common = pair[0].split('|').find(wall => pair[1].split('|').includes(wall));
  const heal = common ? healAdjacentPrismaticChamferIfAdmitted : healOppositePrismaticChamferIfAdmitted;
  const otherLayout = common ? healOppositePrismaticChamferIfAdmitted : healAdjacentPrismaticChamferIfAdmitted;
  for (const edges of [pair, [...pair].reverse()]) test(`heal either ${common ? 'neighboring' : 'opposite'} chamfer with authored order ${edges.join(', ')}`, () => {
    const features = [...stock, bevel(edges)], source = evaluate(features), saved = structuredClone(source);
    near(brepMassProperties(source, 1).volume, 11960);
    const targets = source.faces.filter(face => face.name.startsWith(faceName + '#'));
    assert.equal(targets.length, 2);
    for (const selected of targets) {
      const peer = targets.find(face => face !== selected);
      const healed = heal(source, selected.name, edges);
      const report = checkBrep(healed, { strict: true });
      assert.ok(report.valid, report.issues.join(', '));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 7, loops: 7, coedges: 30, edges: 15, vertices: 10 });
      assert.equal(report.topology[0].genus, 0);
      assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
      near(brepMassProperties(healed, 1).volume, 11980);
      assert.deepEqual(healed.faces.map(face => [face.id, face.name]), source.faces.filter(face => face !== selected).map(face => [face.id, face.name]));
      assert.equal(healed.faces.find(face => face.id === peer.id), peer);
      const loop = source.loops.find(item => item.id === peer.loops[0]);
      assert.deepEqual(healed.loops.find(item => item.id === loop.id), loop);
      for (const id of loop.coedges) {
        const use = source.coedges.find(item => item.id === id), edge = source.edges.find(item => item.id === use.edge);
        const twin = source.coedges.find(item => item.id === use.twin), current = healed.coedges.find(item => item.id === use.twin);
        const sharedWall = source.faces.find(face => face.name === common);
        assert.deepEqual(healed.coedges.find(item => item.id === id), use);
        if (sharedWall?.loops.includes(twin.loop)) {
          assert.equal(current.pcurve.id, twin.pcurve.id);
          assert.deepEqual({ ...current, pcurve: twin.pcurve }, twin);
        } else assert.deepEqual(current, twin);
        assert.deepEqual(healed.edges.find(item => item.id === edge.id), edge);
      }
      assert.equal(healed.edges.filter(edge => edges.includes(edge.name)).length, 1);
      const first = { id: 'heal', kind: 'delete-face', target: 'chamfer', face: selected.name };
      assert.deepEqual(evaluate([...features, first]), healed);
      const second = { id: 'heal-peer', kind: 'delete-face', target: first.id, face: peer.name };
      const restored = evaluate([...features, first, second]);
      for (const name of edges) assertHealedBox(restored, healed, name, peer.name);
      assert.deepEqual(restored.faces.map(face => [face.id, face.name]),
        source.faces.filter(face => face !== selected && face !== peer).map(face => [face.id, face.name]));
      assert.throws(() => evaluate([...features, first, { ...second, face: selected.name }]), /missing or ambiguous/);
      assert.throws(() => evaluate([...features, first, { ...second, face: 'b.top' }]), /supports one or two straight through bores/);
    }
    assert.equal(heal(source, faceName, edges), undefined);
    assert.equal(heal(source, targets[0].name, [edges[0], edges[0]]), undefined);
    assert.equal(otherLayout(source, targets[0].name, edges), undefined);
    assert.deepEqual(source, saved);
  });
}

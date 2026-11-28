import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, checkBrep, faceGeometry, massPropertiesOf,
  brepMassProperties, surfaceAreaOf, tessellateBrep } from '../dist/index.js';

const names = [['box.side3', 'box.side1'], ['box.side0', 'box.side2'], ['box.bottom', 'box.top']];
const bounds = [[-7, 33], [11, 41], [-5, 15]], widths = [[3, 5], [2, 4], [6, 7]];
const profile = { id: 'profile', kind: 'sketch', profile: 'rectangle', min: [-7, 11], max: [33, 41] };
const box = { id: 'box', kind: 'extrude', sketch: 'profile', height: 20, from: -5 };
const stock = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [profile, box] };
const doc = shell => ({ ...stock, features: [...stock.features, shell] });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} vs ${expected}`);
const shellAt = (corner) => ({ id: 'wall', kind: 'shell-walls', target: 'box', opening: names[0][corner[0]],
  secondOpening: names[1][corner[1]], thirdOpening: names[2][corner[2]],
  walls: Object.fromEntries(corner.map((open, axis) => [names[axis][1 - open], widths[axis][1 - open]])) });

function checkMesh(brep) {
  const mesh = tessellateBrep(brep), uses = new Map();
  const key = vertex => mesh.positions.subarray(3 * vertex, 3 * vertex + 3).join(',');
  for (let i = 0; i < mesh.indices.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const [a, b] = [key(mesh.indices[i + j]), key(mesh.indices[i + (j + 1) % 3])];
      assert.notEqual(a, b);
      const edge = `${a}>${b}`;
      uses.set(edge, (uses.get(edge) ?? 0) + 1);
    }
  }
  for (const [edge, count] of uses) {
    const [a, b] = edge.split('>');
    assert.equal(count, 1, edge);
    assert.equal(uses.get(`${b}>${a}`), 1, edge);
  }
}

test('each original box corner retains exact three-wall native geometry and an editable round trip', () => {
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) {
    const corner = [x, y, z], shell = shellAt(corner), snapshot = evaluateCadPart(doc(shell));
    const output = snapshot.outputs[0], { brep } = output;
    const report = checkBrep(brep, { strict: true, pcurveSamples: 7 });
    assert.ok(report.valid, JSON.stringify(report.issues));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 11, loops: 11, coedges: 50, edges: 25, vertices: 16 });
    assert.equal(report.topology[0].genus, 0);
    assert.ok(brep.coedges.every(use => use.pcurve));
    assert.ok(brep.loops.every(loop => loop.kind === 'outer'));
    const cavity = bounds.map((range, axis) => range.map((position, side) => position + (side === corner[axis] ? 0 : (side === 0 ? 1 : -1) * widths[axis][side])));
    const removed = cavity.reduce((volume, [low, high]) => volume * (high - low), 1);
    const expectedVolume = 24000 - removed;
    for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
      near(mass.volume, expectedVolume);
      mass.centroid.forEach((value, i) => {
        const originalCentre = (bounds[i][0] + bounds[i][1]) / 2, cavityCentre = (cavity[i][0] + cavity[i][1]) / 2;
        near(value, (24000 * originalCentre - removed * cavityCentre) / expectedVolume);
      });
    }
    near(surfaceAreaOf(output), 5200);
    for (const [axis, [low, high]] of bounds.entries()) {
      const coordinates = brep.vertices.map(vertex => vertex.point[axis]);
      assert.deepEqual([Math.min(...coordinates), Math.max(...coordinates)], [low, high]);
      assert.ok(coordinates.every(value => [low, high, ...cavity[axis]].includes(value)));
      for (const [side, name] of names[axis].entries()) {
        const open = side === corner[axis], outward = side === 1 ? 1 : -1;
        const outer = brep.faces.filter(face => face.name?.replace(/#\d+$/, '') === name);
        const inner = brep.faces.filter(face => face.name === `wall.in.${name}`);
        const edgeCounts = faces => faces.map(face => brep.loops.find(loop => loop.id === face.loops[0]).coedges.length).sort();
        assert.deepEqual(edgeCounts(outer), axis === 2 ? [6] : open ? [4, 5] : [4]);
        assert.deepEqual(edgeCounts(inner), open ? [] : [4]);
        for (const [faces, station, normal] of [[outer, bounds[axis][side], outward], [inner, cavity[axis][side], -outward]]) {
          for (const face of faces) {
            const support = faceGeometry(face);
            assert.equal(support.kind, 'plane');
            assert.equal(support.o[axis], station);
            assert.equal(support.n[axis], normal);
            assert.ok(face.surface.controlPoints.every(row => row.every(point => point[axis] === station)));
          }
        }
      }
    }
    checkMesh(brep);
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
    const openings = [shell.opening, shell.secondOpening, shell.thirdOpening];
    for (const [a, b, c] of [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      const ordered = { ...shell, opening: openings[a], secondOpening: openings[b], thirdOpening: openings[c] };
      assert.deepEqual(reevaluate(snapshot, { document: doc(ordered) }).outputs[0].brep, brep);
    }
  }
});

test('a corner Shell refuses malformed ownership and collapse without changing the accepted result', () => {
  const shell = shellAt([1, 0, 1]), snapshot = evaluateCadPart(doc(shell)), saved = saveCadPart(snapshot);
  for (const [patch, code] of [
    [{ opening: null }, 'INPUT'], [{ secondOpening: undefined }, 'INPUT'], [{ thirdOpening: shell.opening }, 'INPUT'],
    [{ thirdOpening: null }, 'INPUT'], [{ thirdOpening: 'absent' }, 'SELECTION'], [{ thirdOpening: shell.secondOpening }, 'INPUT'],
    [{ thirdOpening: undefined }, 'REFERENCE'], [{ walls: { ...shell.walls, 'box.top': 2 } }, 'REFERENCE'],
    [{ walls: { ...shell.walls, 'box.bottom': 0 } }, 'PARAMETER'], [{ walls: { ...shell.walls, 'box.bottom': NaN } }, 'PARAMETER'],
    [{ walls: { ...shell.walls, 'box.bottom': 20 } }, 'PARAMETER'], [{ walls: { ...shell.walls, 'box.bottom': 19.99995 } }, 'PARAMETER'],
    [{ expect: {} }, 'REFERENCE'],
  ]) assert.throws(() => reevaluate(snapshot, { document: doc({ ...shell, ...patch }) }), error => error.code === code);
  assert.equal(saveCadPart(snapshot), saved);
});


test('each axis accepts a small positive corner cavity and refuses a below-minimum cavity', () => {
  const shell = shellAt([1, 0, 1]);
  const walls = ['box.side3', 'box.side2', 'box.bottom'], size = [40, 30, 20];
  for (const [axis, name] of walls.entries()) {
    const minimum = 0.0001;
    const atWidth = width => doc({ ...shell, walls: { ...shell.walls, [name]: size[axis] - width } });
    const snapshot = evaluateCadPart(atWidth(2 * minimum)), output = snapshot.outputs[0];
    const removed = walls.reduce((volume, role, i) => volume * (i === axis ? 2 * minimum : size[i] - shell.walls[role]), 1);
    near(massPropertiesOf(output).volume, 24000 - removed);
    assert.ok(checkBrep(output.brep, { strict: true }).valid);
    assert.throws(() => reevaluate(snapshot, { document: atWidth(minimum / 2) }), error => error.code === 'PARAMETER');
  }
});


test('opposite openings and a third lateral opening preserve every material section of the three-wall channel', () => {
  const faceNames = names.flat();
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const [through, pair] of names.entries()) {
    for (const third of faceNames.filter(name => !pair.includes(name))) {
      const openings = [...pair, third];
      const walls = Object.fromEntries(faceNames.flatMap((name, index) => openings.includes(name) ? [] : [[name, widths.flat()[index]]]));
      const feature = { id: 'wall', kind: 'shell-walls', target: 'box', opening: pair[0], secondOpening: pair[1], thirdOpening: third, walls };
      const snapshot = evaluateCadPart(doc(feature)), output = snapshot.outputs[0], { brep } = output;
      const report = checkBrep(brep, { strict: true, pcurveSamples: 7 });
      assert.ok(report.valid, JSON.stringify(report.issues));
      const [faces, edges, vertices] = through === 2 ? [10, 24, 16] : [14, 32, 20];
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces, loops: faces, coedges: 2 * edges, edges, vertices });
      assert.equal(report.topology[0].genus, 0);
      assert.ok(brep.loops.every(loop => loop.kind === 'outer'));
      assert.ok(brep.coedges.every(use => use.pcurve));
      const cavity = bounds.map(([min, max], axis) => [min + (walls[names[axis][0]] ?? 0), max - (walls[names[axis][1]] ?? 0)]);
      const size = cavity.map(([min, max]) => max - min);
      const removed = size.reduce((volume, length) => volume * length, 1);
      const expectedVolume = 24000 - removed;
      for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
        near(mass.volume, expectedVolume);
        mass.centroid.forEach((value, axis) =>
          near(value, (24000 * (bounds[axis][0] + bounds[axis][1]) - removed * (cavity[axis][0] + cavity[axis][1])) / (2 * expectedVolume)));
      }
      let area = 5200;
      for (const [axis, [min, max]] of bounds.entries()) {
        const coordinates = brep.vertices.map(vertex => vertex.point[axis]);
        assert.deepEqual([Math.min(...coordinates), Math.max(...coordinates)], [min, max]);
        assert.ok(coordinates.every(value => [min, max, ...cavity[axis]].includes(value)));
        for (const [side, name] of names[axis].entries()) {
          const open = openings.includes(name), outward = side === 1 ? 1 : -1;
          area += (open ? -1 : 1) * size[(axis + 1) % 3] * size[(axis + 2) % 3];
          const outer = brep.faces.filter(face => face.name?.replace(/#\d+$/, '') === name);
          const inner = brep.faces.filter(face => face.name === `wall.in.${name}`);
          assert.ok(outer.length > 0);
          assert.equal(inner.length, open ? 0 : 1);
          for (const [patches, station, normal] of [[outer, bounds[axis][side], outward], [inner, cavity[axis][side], -outward]]) {
            for (const face of patches) {
              const support = faceGeometry(face);
              assert.equal(support.kind, 'plane');
              assert.equal(support.o[axis], station);
              assert.equal(support.n[axis], normal);
              assert.ok(face.surface.controlPoints.every(row => row.every(point => point[axis] === station)));
            }
          }
        }
      }
      near(surfaceAreaOf(output), area);
      checkMesh(brep);
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
      for (const [a, b, c] of orders) {
        const ordered = { ...feature, opening: openings[a], secondOpening: openings[b], thirdOpening: openings[c] };
        assert.deepEqual(reevaluate(snapshot, { document: doc(ordered) }).outputs[0].brep, brep);
      }
      const pairedWallAxis = names.findIndex(group => group.every(name => Object.hasOwn(walls, name)));
      const [lowWall, highWall] = names[pairedWallAxis];
      const span = bounds[pairedWallAxis][1] - bounds[pairedWallAxis][0];
      const collapsed = { ...feature, walls: { ...walls, [highWall]: span - walls[lowWall] } };
      assert.throws(() => reevaluate(snapshot, { document: doc(collapsed) }), error => error.code === 'PARAMETER');
    }
  }
});

function fourOpeningsExcept(kept) {
  const open = names.flat().filter(name => !kept.includes(name));
  const [opening, secondOpening, thirdOpening, fourthOpening] = open;
  const walls = Object.fromEntries(kept.map(name => {
    const axis = names.findIndex(pair => pair.includes(name));
    return [name, widths[axis][names[axis].indexOf(name)]];
  }));
  return { id: 'wall', kind: 'shell-walls', target: 'box', opening, secondOpening, thirdOpening, fourthOpening, walls };
}

function permutations(values) {
  return values.length === 1 ? [values] : values.flatMap((item, index) =>
    permutations(values.filter((_, candidate) => candidate !== index)).map(rest => [item, ...rest]));
}

test('four original openings retain each exact connected two-wall box angle', () => {
  const size = bounds.map(([low, high]) => high - low);
  for (const [axis, first] of names.entries()) for (const [other, second] of names.entries()) {
    if (other <= axis) continue;
    const through = [0, 1, 2].find(coordinate => coordinate !== axis && coordinate !== other);
    for (const a of first) for (const b of second) {
      const feature = fourOpeningsExcept([a, b]);
      const snapshot = evaluateCadPart(doc(feature)), output = snapshot.outputs[0], { brep } = output;
      const report = checkBrep(brep, { strict: true, pcurveSamples: 7 });
      const [faces, edges, vertices] = through === 2 ? [8, 18, 12] : [10, 22, 14];
      assert.ok(report.valid, JSON.stringify(report.issues));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces, loops: faces, coedges: 2 * edges, edges, vertices });
      assert.equal(report.topology[0].genus, 0);
      assert.equal(brep.shells[0].closed, true);
      assert.ok(brep.coedges.every(use => use.pcurve));
      assert.ok(brep.loops.every(loop => loop.kind === 'outer'));

      const t = feature.walls[a], u = feature.walls[b];
      const section = t * size[other] + u * size[axis] - t * u;
      const volume = section * size[through];
      const cavity = bounds.map((pair, i) => pair.map((station, side) =>
        station + (side ? -1 : 1) * (feature.walls[names[i][side]] ?? 0)));
      near(surfaceAreaOf(output), 2 * section + 2 * (size[axis] + size[other]) * size[through]);
      for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
        near(mass.volume, volume);
        mass.centroid.forEach((value, i) => near(value,
          (24000 * (bounds[i][0] + bounds[i][1]) - (24000 - volume) * (cavity[i][0] + cavity[i][1])) / (2 * volume)));
      }
      const byName = name => brep.faces.filter(face => face.name?.replace(/#\d+$/, '') === name);
      const checkPlane = (face, i, boundary, normal) => {
        const support = faceGeometry(face);
        assert.equal(support.kind, 'plane');
        assert.equal(support.n[i], normal);
        assert.equal(support.o[i], boundary);
        assert.ok(face.surface.controlPoints.every(row => row.every(point => point[i] === boundary)));
      };
      for (const [i, pair] of names.entries()) for (const [side, name] of pair.entries()) {
        const kept = Object.hasOwn(feature.walls, name), sign = side ? 1 : -1;
        const outer = byName(name), inner = byName(`wall.in.${name}`);
        assert.equal(outer.length, through !== 2 && i === through ? 2 : 1);
        outer.forEach(face => checkPlane(face, i, bounds[i][side], sign));
        assert.equal(inner.length, kept ? 1 : 0);
        inner.forEach(face => checkPlane(face, i, cavity[i][side], -sign));
      }
      for (const vertex of brep.vertices) vertex.point.forEach((value, i) =>
        assert.ok([...bounds[i], ...cavity[i]].includes(value), `unexpected support coordinate ${value}`));
      checkMesh(brep);
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
      for (const [opening, secondOpening, thirdOpening, fourthOpening] of permutations([
        feature.opening, feature.secondOpening, feature.thirdOpening, feature.fourthOpening,
      ])) {
        const ordered = { ...feature, opening, secondOpening, thirdOpening, fourthOpening };
        assert.deepEqual(reevaluate(snapshot, { document: doc(ordered) }).outputs[0].brep, brep);
      }
    }
  }
});

test('four original openings refuse disconnected pairs, invalid ownership and cavity collapse', () => {
  for (const pair of names) {
    assert.throws(() => evaluateCadPart(doc(fourOpeningsExcept(pair))),
      error => error.code === 'SHELL_DISCONNECTED' && error.details.category === 'CAPABILITY' && /opposite retained walls disconnected/.test(error.message));
  }
  const feature = fourOpeningsExcept([names[0][0], names[1][0]]);
  const snapshot = evaluateCadPart(doc(feature)), saved = saveCadPart(snapshot);
  for (const [patch, code] of [
    [{ fourthOpening: feature.thirdOpening }, 'INPUT'],
    [{ fourthOpening: 'absent' }, 'SELECTION'],
    [{ thirdOpening: undefined }, 'INPUT'],
    [{ fourthOpening: undefined }, 'REFERENCE'],
    [{ walls: { ...feature.walls, 'box.top': 1 } }, 'REFERENCE'],
    [{ walls: { ...feature.walls, 'box.side0': 30 } }, 'PARAMETER'],
  ]) {
    assert.throws(() => reevaluate(snapshot, { document: doc({ ...feature, ...patch }) }), error => error.code === code);
  }
  assert.equal(saveCadPart(snapshot), saved);
});

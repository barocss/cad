import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry,
  prismaticExtrude, prismaticVolume, prismaticContains } from '../dist/index.js';
import { twoOpeningBoxShellWithWalls } from '../dist/part/part-box-shell.js';

const names = [['box.side3', 'box.side1'], ['box.side0', 'box.side2'], ['box.bottom', 'box.top']];
const roles = names.flat(), bounds = [[-7, 33], [11, 41], [-5, 15]], thickness = [[3, 5], [2, 4], [6, 7]];
const sketch = { id: 'profile', kind: 'sketch', profile: 'rectangle', min: [-7, 11], max: [33, 41] };
const extrusion = { id: 'box', kind: 'extrude', sketch: 'profile', from: -5, height: 20 };
const close = (a, b, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-8, `${label}: ${a} vs ${b}`);
const roleOf = name => { const axis = names.findIndex(pair => pair.includes(name)); return { axis, side: names[axis].indexOf(name) }; };
const wallsOf = open => Object.fromEntries(roles.filter(name => !open.includes(name)).map(name => {
  const { axis, side } = roleOf(name); return [name, thickness[axis][side]];
}));
const featureOf = (open, walls = wallsOf(open)) => ({ id: 'wall', kind: 'shell-walls', target: 'box', opening: open[0], secondOpening: open[1], walls });
const document = feature => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [sketch, extrusion, feature] });

function stock() {
  const [[x0, x1], [y0, y1], [z0, z1]] = bounds, corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], tags = ['box.side0', 'box.side1', 'box.side2', 'box.side3'];
  const prism = prismaticExtrude([corners.map((a, i) => ({ kind: 'line', a, b: corners[(i + 1) % 4], tag: tags[i] }))], z0, z1), regions = prism.slabs[0].regions;
  return { ...prism, caps: [{ z: z0, regions, tag: 'box.bottom' }, { z: z1, regions, tag: 'box.top' }] };
}

function prove(open) {
  const feature = featureOf(open), input = document(feature), before = structuredClone(input);
  const prefix = evaluateCadPart({ ...input, features: input.features.slice(0, 2) }), source = prefix.outputs[0].brep;
  const snapshot = evaluateCadPart(input), output = snapshot.outputs[0], brep = output.brep;
  const tube = roleOf(open[0]).axis === roleOf(open[1]).axis;
  const report = checkBrep(brep, { strict: true, pcurveSamples: 7 }); assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: tube ? 10 : 12, loops: 12, coedges: tube ? 48 : 56, edges: tube ? 24 : 28, vertices: tube ? 16 : 18 });
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].genus, tube ? 1 : 0); assert.ok(brep.coedges.every(use => use.pcurve));
  const cavity = bounds.map((pair, axis) => pair.map((v, side) => v + (side === 0 ? 1 : -1) * (feature.walls[names[axis][side]] ?? 0)));
  const removed = cavity.reduce((v, [low, high]) => v * (high - low), 1), volume = 24000 - removed;
  const centroid = bounds.map(([low, high], axis) => (24000 * (low + high) / 2 - removed * (cavity[axis][0] + cavity[axis][1]) / 2) / volume);
  for (const mass of [massPropertiesOf(output, 1), brepMassProperties(brep, 1)]) {
    close(mass.volume, volume, 'box minus cavity volume'); mass.centroid.forEach((value, axis) => close(value, centroid[axis], 'independent centroid'));
  }
  const top = open.includes('box.top') ? 'box.top' : roles.find(name => open.includes(name)), other = open.find(name => name !== top);
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  for (const name of roles) {
    const { axis, side } = roleOf(name), outer = brep.faces.filter(face => face.name?.replace(/#\d+$/, '') === name);
    const inner = brep.faces.filter(face => face.name === `wall.in.${name}`), isOpen = open.includes(name);
    assert.equal(outer.length, !tube && name === other ? 3 : 1, name); assert.equal(inner.length, isOpen ? 0 : 1, name);
    for (const [face, boundary, normal] of [...outer.map(face => [face, bounds[axis][side], side === 0 ? -1 : 1]),
      ...inner.map(face => [face, cavity[axis][side], side === 0 ? 1 : -1])]) {
      const plane = faceGeometry(face); assert.equal(plane.kind, 'plane'); assert.equal(plane.o[axis], boundary); assert.equal(plane.n[axis], normal);
      assert.ok(face.surface.controlPoints.every(row => row.every(point => point[axis] === boundary)));
    }
    if (isOpen) {
      const rims = outer.flatMap(face => face.loops.map(id => loops.get(id))), lengths = rims.map(loop => loop.coedges.length).sort((a, b) => a - b);
      if (tube) { assert.deepEqual(rims.map(loop => loop.kind).sort(), ['inner', 'outer']); assert.deepEqual(lengths, [4, 4]); }
      else { assert.ok(rims.every(loop => loop.kind === 'outer')); assert.deepEqual(lengths, name === top ? [8] : [4, 5, 5]); }
    }
  }
  for (const grid of [bounds, cavity]) for (const x of grid[0]) for (const y of grid[1]) for (const z of grid[2])
    assert.equal(brep.vertices.filter(vertex => vertex.point.every((v, k) => v === [x, y, z][k])).length, 1);
  for (const vertex of brep.vertices) vertex.point.forEach((v, axis) => assert.ok([...bounds[axis], ...cavity[axis]].includes(v)));
  const native = twoOpeningBoxShellWithWalls(stock(), source, open, feature.walls, 'wall', (code, message) => { throw new Error(`${code}: ${message}`); });
  assert.deepEqual(native.brep, brep); close(prismaticVolume(native.solid), volume, 'world slab volume');
  // Sample open cells of the independent world support grid; no point lies on a boundary.
  const cells = bounds.map((pair, axis) => {
    const breaks = [...new Set([...pair, ...cavity[axis]])].sort((a, b) => a - b);
    return [pair[0] - 1, ...breaks.slice(1).map((v, i) => (v + breaks[i]) / 2), pair[1] + 1];
  });
  const inside = (point, ranges) => point.every((v, axis) => ranges[axis][0] < v && v < ranges[axis][1]);
  for (const x of cells[0]) for (const y of cells[1]) for (const z of cells[2]) {
    const point = [x, y, z], expected = inside(point, bounds) && !inside(point, cavity);
    assert.equal(prismaticContains(native.solid, point), expected, `world slab cell ${point}`);
  }
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  assert.deepEqual(reevaluate(prefix, { document: input }).outputs[0].brep, brep);
  assert.deepEqual(input, before);
  return brep;
}

test('all ten remaining cardinal opening pairs and reverse selection order have exact world native and slab geometry', () => {
  let count = 0;
  for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) {
    if (roles[i] === 'box.top' || roles[j] === 'box.top') continue;
    const first = prove([roles[i], roles[j]]), reversed = prove([roles[j], roles[i]]);
    assert.deepEqual(reversed, first, 'selection order must not change native identity or geometry'); count++;
  }
  assert.equal(count, 10);
});

test('new pairs refuse missing ownership, invalid wall values and collapse while retaining the accepted document', () => {
  for (const open of [['box.side3', 'box.side1'], ['box.side3', 'box.side0'], ['box.bottom', 'box.side0']]) {
    const feature = featureOf(open), snapshot = evaluateCadPart(document(feature)), accepted = saveCadPart(snapshot);
    const reject = (candidate, code) => assert.throws(() => reevaluate(snapshot, { document: document(candidate) }), error => error.code === code);
    const name = Object.keys(feature.walls)[0], { [name]: omitted, ...missing } = feature.walls; assert.ok(omitted);
    reject({ ...feature, walls: missing }, 'REFERENCE');
    reject({ ...feature, walls: { ...feature.walls, [open[0]]: 1 } }, 'REFERENCE');
    reject({ ...feature, walls: { ...missing, unknown: 2 } }, 'REFERENCE');
    for (const value of [0, -1, NaN, Infinity]) reject({ ...feature, walls: { ...feature.walls, [name]: value } }, 'PARAMETER');
    const { axis, side } = roleOf(name), collapse = bounds[axis][1] - bounds[axis][0] - (feature.walls[names[axis][1 - side]] ?? 0);
    for (const value of [collapse, collapse + 1, collapse - 0.00005]) reject({ ...feature, walls: { ...feature.walls, [name]: value } }, 'PARAMETER');
    reject({ ...feature, secondOpening: open[0] }, 'INPUT'); reject({ ...feature, secondOpening: 'absent' }, 'SELECTION');
    reject({ ...feature, secondOpening: undefined }, 'REFERENCE');
    assert.equal(saveCadPart(snapshot), accepted);
  }
});

test('the reoriented lateral tube remains a world upright operand for an existing downstream Split', () => {
  const feature = featureOf(['box.side3', 'box.side1'], { 'box.side0': 2, 'box.side2': 4, 'box.bottom': 3, 'box.top': 5 });
  const input = document(feature); input.features.push({ id: 'split', kind: 'split', target: 'wall', axis: 'x', at: 2 });
  const snapshot = evaluateCadPart(input); assert.equal(snapshot.outputs.length, 2);
  // Tube length40, cross-section30*20 - 24*12 = 312. The world split cuts 9/31 mm lengths.
  for (const [i, output] of snapshot.outputs.entries()) {
    const report = checkBrep(output.brep, { strict: true, pcurveSamples: 7 }); assert.ok(report.valid, JSON.stringify(report.issues));
    assert.equal(report.topology[0].genus, 1);
    const expected = 312 * (i === 0 ? 9 : 31);
    for (const mass of [massPropertiesOf(output, 1), brepMassProperties(output.brep, 1)]) {
      close(mass.volume, expected, 'independent downstream slice volume');
      close(mass.centroid[0], i === 0 ? -2.5 : 17.5, 'world split centroid');
      close(mass.centroid[1], 11 + 207 / 13, 'tube section centroid Y');
      close(mass.centroid[2], -5 + 142 / 13, 'tube section centroid Z');
    }
  }
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs.map(output => output.brep), snapshot.outputs.map(output => output.brep));
});

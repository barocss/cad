import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry, CadPartError } from '../dist/index.js';
import { fillCutSnapshot, fillCutPlacements } from '../dist/features/fill-cut-pattern.js';
import { curveCutOffsets } from '../dist/features/curve-cut-pattern.js';
import { quadraticOracle } from './helpers/quadratic-cut-oracle.mjs';

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-7, `${actual} vs ${expected}`);
const document = () => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {
  left: 8, right: 12, bottom: 8, top: 10, newerRight: 14, lastRight: 46, pitch: 16,
}, features: [
  { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
  { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
  { id: 'olderSketch', kind: 'sketch', profile: 'rectangle', min: [{ parameter: 'left' }, { parameter: 'bottom' }], max: [{ parameter: 'right' }, { parameter: 'top' }] },
  { id: 'olderTool', kind: 'extrude', sketch: 'olderSketch', height: 10 },
  { id: 'first', kind: 'difference', target: 'stock', tool: 'olderTool' },
  { id: 'newerSketch', kind: 'sketch', profile: 'rectangle', min: [8, 26], max: [{ parameter: 'newerRight' }, 28] },
  { id: 'newerTool', kind: 'extrude', sketch: 'newerSketch', height: 10 },
  { id: 'second', kind: 'difference', target: 'first', tool: 'newerTool' },
  { id: 'lastSketch', kind: 'sketch', profile: 'rectangle', min: [42, 8], max: [{ parameter: 'lastRight' }, 10] },
  { id: 'lastTool', kind: 'extrude', sketch: 'lastSketch', height: 10 },
  { id: 'third', kind: 'difference', target: 'second', tool: 'lastTool' },
  { id: 'repeat', kind: 'linear-feature-pattern', target: 'third', source: 'first', axis: 'x', spacing: { parameter: 'pitch' }, count: 2 },
] });
const feature = (doc, id) => doc.features.find(item => item.id === id);
const rectangularDocument = () => {
  const doc = document(); doc.parameters.pitchY = 8;
  Object.assign(feature(doc, 'repeat'), { kind: 'rectangular-feature-pattern', axis2: 'y', spacing2: { parameter: 'pitchY' }, count2: 2 });
  return doc;
};
const fillDocument = () => {
  const doc = rectangularDocument(), node = feature(doc, 'repeat');
  delete node.axis; delete node.axis2;
  Object.assign(node, { kind: 'fill-feature-pattern', anchor: [10, 9],
    region: { points: [[8, 7], [48, 7], [48, 11], [12, 11], [12, 29], [8, 29]] } });
  return doc;
};
const fillCells = [[0, 0], [1, 0], [0, 1]];
function selectedFill(doc) {
  const node = feature(doc, 'repeat'), fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  const own = fillCutSnapshot(node.region, node.anchor, fail);
  return fillCutPlacements(own.region, own.anchor, doc.parameters.pitch, node.count, doc.parameters.pitchY, node.count2).map(placement => placement.suffix);
}
function pathDocument(degree = 1, points = [[0, 0, 2], [16, 0, 2], [16, 24, 2]]) {
  const doc = document(), controls = [], knots = [];
  if (degree === 1) controls.push(...points);
  else {
    for (let i = 1; i < points.length; i++) {
      if (i === 1) controls.push(points[0]);
      controls.push(points[i - 1].map((value, axis) => (value + points[i][axis]) / 2), points[i]);
    }
  }
  for (let i = 0; i <= degree; i++) knots.push(0);
  for (let i = 1; i < points.length - 1; i++) for (let j = 0; j < degree; j++) knots.push(i);
  for (let i = 0; i <= degree; i++) knots.push(points.length - 1);
  doc.features[doc.features.length - 1] = { id: 'repeat', kind: 'curve-feature-pattern', target: 'third', source: 'first',
    spacing: { parameter: 'pitch' }, count: 3, path: { degree, knots, controlPoints: controls, weights: controls.map(() => 1) } };
  return doc;
}
function selectedPath(doc) {
  const node = feature(doc, 'repeat'), fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  return curveCutOffsets(node.path, doc.parameters.pitch, node.count, 10000, fail, 'prior-xy-linear');
}

function bounds(brep, loop) {
  const points = loop.coedges.flatMap(id => {
    const use = brep.coedges.find(item => item.id === id);
    return brep.edges.find(edge => edge.id === use.edge).curve.controlPoints;
  });
  return [0, 1].map(axis => Math.min(...points.map(point => point[axis])))
    .concat([0, 1].map(axis => Math.max(...points.map(point => point[axis]))));
}

function verify(snapshot, current = false, { cells, lastBox, offsets, approximate = false } = {}) {
  const doc = snapshot.document, p = doc.parameters, pattern = feature(doc, 'repeat');
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, check = checkBrep(brep, { strict: true });
  assert.ok(check.valid, check.issues.join('\n')); assert.equal(output.id, 'repeat');
  const rectangular = pattern.kind === 'rectangular-feature-pattern', fill = pattern.kind === 'fill-feature-pattern', path = pattern.kind === 'curve-feature-pattern';
  const last = lastBox ?? [42, 8, p.lastRight, 10];
  const holes = [[8, 26, p.newerRight, 28], current ? [p.left, p.bottom, p.right, p.top] : last];
  const prototype = current ? last : [p.left, p.bottom, p.right, p.top];
  if (fill) assert.ok(cells, 'Fill oracle supplies literal selected cells independently of the planner');
  if (path) assert.ok(offsets, 'Path oracle supplies literal offsets independently of the planner');
  const expectedCells = path ? offsets.map((_, k) => [k, 0]) : cells ?? Array.from({ length: rectangular ? pattern.count2 : 1 }, (_, j) =>
    Array.from({ length: pattern.count }, (_, k) => [k, j])).flat();
  for (const [k, j] of expectedCells) {
    const dx = path ? offsets[k][0] : (fill || pattern.axis === 'x' ? k * p.pitch : 0) + (rectangular && pattern.axis2 === 'x' ? j * p.pitchY : 0);
    const dy = path ? offsets[k][1] : (pattern.axis === 'y' ? k * p.pitch : 0) + (fill || rectangular && pattern.axis2 === 'y' ? j * p.pitchY : 0);
    holes.push(prototype.map((value, axis) => value + (axis % 2 ? dy : dx)));
    const suffix = k || j ? rectangular || fill ? `@${k},${j}` : `@${k}` : '';
    for (let side = 0; side < 4; side++) assert.ok(brep.faces.some(face => face.name === `${current ? 'lastTool' : 'olderTool'}.side${side}${suffix}`));
  }
  const n = holes.length;
  assert.equal(check.topology[0].genus, n);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6 + 4 * n, loops: 6 + 6 * n, coedges: 24 + 24 * n, edges: 12 + 12 * n, vertices: 8 + 8 * n });
  for (const z of [0, 10]) {
    const caps = brep.faces.filter(face => { const g = faceGeometry(face); return g.kind === 'plane' && Math.abs(g.n[2]) === 1 && g.o[2] === z; });
    assert.equal(caps.length, 1);
    const inner = caps[0].loops.map(id => brep.loops.find(loop => loop.id === id)).filter(loop => loop.kind === 'inner');
    const actual = inner.map(loop => bounds(brep, loop)).sort(), expected = holes.slice().sort();
    if (approximate) {
      assert.equal(actual.length, expected.length);
      actual.forEach((opening, i) => opening.forEach((value, axis) => near(value, expected[i][axis])));
    } else assert.deepEqual(actual, expected);
  }
  // Independent material moments: subtract each literal rectangular prism from the 60x40x10 stock.
  let volume = 24000, mx = 720000, my = 480000;
  for (const [x0, y0, x1, y1] of holes) {
    const removed = (x1 - x0) * (y1 - y0) * 10;
    volume -= removed; mx -= removed * (x0 + x1) / 2; my -= removed * (y0 + y1) / 2;
  }
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume); near(mass.centroid[0], mx / volume); near(mass.centroid[1], my / volume); near(mass.centroid[2], 5);
  }
  return brep;
}

test('the original cut crosses two newer Differences with exact four-hole material, ownership and fresh reopen', () => {
  const doc = document(), before = structuredClone(doc), snapshot = evaluateCadPart(doc), brep = verify(snapshot);
  near(brepMassProperties(brep, 1).volume, 23640);
  near(brepMassProperties(brep, 1).centroid[0], 712280 / 23640);
  near(brepMassProperties(brep, 1).centroid[1], 474600 / 23640);
  const current = document(); current.features.pop();
  const source = evaluateCadPart(current).outputs[0].brep;
  for (const name of ['olderTool', 'newerTool', 'lastTool']) {
    const original = body => body.faces.filter(face => face.name?.startsWith(`${name}.side`) && !face.name.includes('@'))
      .map(face => ({ name: face.name, geometry: faceGeometry(face) })).sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(original(brep), original(source));
  }
  assert.deepEqual(doc, before); assert.deepEqual(snapshot.document.features, before.features);
  assert.deepEqual(verify(loadCadPart(saveCadPart(snapshot))), brep);
});

test('both XY axes and signed pitches retain the selected source instead of either newer tool', () => {
  for (const [axis, pitch, edits] of [['x', 16, {}], ['x', -16, { left: 24, right: 28 }],
    ['y', 6, {}], ['y', -6, { bottom: 14, top: 16 }]]) {
    const doc = document(); Object.assign(doc.parameters, { pitch, ...edits }); feature(doc, 'repeat').axis = axis;
    const brep = verify(evaluateCadPart(doc));
    assert.ok(!brep.faces.some(face => /^(newerTool|lastTool)\..*@/.test(face.name)));
  }
});

test('each tool and pitch is an independent dependency and failed edits preserve accepted history', () => {
  const accepted = evaluateCadPart(document()), saved = saveCadPart(accepted), names = accepted.outputs[0].brep.faces.map(face => face.name).sort();
  for (const parameters of [{ right: 14 }, { newerRight: 16 }, { lastRight: 48 }, { pitch: 20 }]) {
    const edited = reevaluate(accepted, { parameters }), brep = verify(edited);
    assert.deepEqual(brep.faces.map(face => face.name).sort(), names);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited))), brep);
  }
  const collided = document(); feature(collided, 'repeat').count = 3;
  assert.throws(() => reevaluate(accepted, { document: collided }), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === 'GEOMETRY');
  assert.equal(saveCadPart(accepted), saved); assert.deepEqual(verify(reevaluate(accepted, { parameters: {} })), verify(accepted));
});

test('count one still proves all stages while omitted source repeats only the current last cutter', () => {
  const single = document(); feature(single, 'repeat').count = 1; verify(evaluateCadPart(single));
  const current = document(); delete feature(current, 'repeat').source;
  current.parameters.pitch = -16;
  const brep = evaluateCadPart(current).outputs[0].brep;
  assert.ok(checkBrep(brep, { strict: true }).valid);
  near(brepMassProperties(brep, 1).volume, 23640);
  assert.ok(brep.faces.some(face => face.name === 'lastTool.side0@1'));
  assert.ok(!brep.faces.some(face => face.name?.startsWith('olderTool.side0@')));
});

test('invalid intervening history, unsupported tools, distant sources and collisions refuse before copying', () => {
  const accepted = evaluateCadPart(document()), saved = saveCadPart(accepted);
  const refused = change => {
    const doc = document(); change(doc); const before = structuredClone(doc);
    assert.throws(() => reevaluate(accepted, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat');
    assert.deepEqual(doc, before); assert.equal(saveCadPart(accepted), saved);
  };
  refused(doc => { feature(doc, 'second').suppressed = true; });
  refused(doc => { feature(doc, 'second').target = 'stock'; });
  refused(doc => { doc.features[doc.features.findIndex(item => item.id === 'second')] = { id: 'second', kind: 'translate', target: 'first', offset: [0, 0, 0] }; });
  for (const source of ['stock', 'olderTool', 'first/0', 'third']) refused(doc => { feature(doc, 'repeat').source = source; });
  for (const id of ['olderTool', 'newerTool', 'lastTool']) refused(doc => { feature(doc, id).height = 5; });
  refused(doc => { feature(doc, 'repeat').count = 1; feature(doc, 'newerTool').height = 5; });
  refused(doc => {
    doc.features.splice(doc.features.findIndex(item => item.id === 'second'), 0,
      { id: 'wrappedMiddleTool', kind: 'translate', target: 'newerTool', offset: [0, 0, 0] });
    feature(doc, 'second').tool = 'wrappedMiddleTool';
  });
  refused(doc => {
    doc.features.splice(-1, 0, { id: 'fourth', kind: 'difference', target: 'third', tool: 'lastTool' }); feature(doc, 'repeat').target = 'fourth';
  });
  refused(doc => { Object.assign(feature(doc, 'repeat'), { count: 1, axis: 'z' }); });
  for (const pitch of [2, 4, 32, 50, -16]) refused(doc => { doc.parameters.pitch = pitch; });
  refused(doc => { feature(doc, 'repeat').axis = 'y'; doc.parameters.pitch = 18; });
});

test('Rectangular repeats the same three-cut source with six exact cavities in either XY ordering and signed grids', () => {
  for (const edits of [{}, { axis: 'y', axis2: 'x', pitch: 8, pitchY: 16 },
    { left: 24, right: 28, bottom: 16, top: 18, pitch: -16, pitchY: -8 }]) {
    const doc = rectangularDocument(), { axis, axis2, ...parameters } = edits;
    if (axis) Object.assign(feature(doc, 'repeat'), { axis, axis2 });
    Object.assign(doc.parameters, parameters);
    const before = structuredClone(doc), snapshot = evaluateCadPart(doc), brep = verify(snapshot), mass = brepMassProperties(brep, 1);
    near(mass.volume, 23480); near(mass.centroid[0], 709400 / 23480); near(mass.centroid[1], 471880 / 23480);
    assert.ok(!brep.faces.some(face => /^(newerTool|lastTool)\..*@/.test(face.name)));
    assert.deepEqual(doc, before); assert.deepEqual(snapshot.document.features, before.features);
    assert.deepEqual(verify(loadCadPart(saveCadPart(snapshot))), brep);
  }
});

test('Rectangular keeps single-cell proofs, current-tool legacy and each tool and pitch dependency', () => {
  const accepted = evaluateCadPart(rectangularDocument()), saved = saveCadPart(accepted), names = accepted.outputs[0].brep.faces.map(face => face.name).sort();
  for (const parameters of [{ right: 14 }, { newerRight: 16 }, { lastRight: 48 }, { pitch: 20 }, { pitchY: 10 }]) {
    const edited = reevaluate(accepted, { parameters }), brep = verify(edited);
    assert.deepEqual(brep.faces.map(face => face.name).sort(), names);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited))), brep);
  }
  for (const [count, count2] of [[1, 1], [1, 2], [2, 1]]) {
    const doc = rectangularDocument(); Object.assign(feature(doc, 'repeat'), { count, count2 });
    const brep = verify(evaluateCadPart(doc));
    near(brepMassProperties(brep, 1).volume, count * count2 === 1 ? 23720 : 23640);
  }
  const current = rectangularDocument(); delete feature(current, 'repeat').source; current.parameters.pitch = 6;
  const brep = verify(evaluateCadPart(current), true);
  near(brepMassProperties(brep, 1).volume, 23480);
  assert.ok(!brep.faces.some(face => face.name?.startsWith('olderTool.side0@')));
  // The no-source count-one contract still permits an unused Z direction.
  Object.assign(feature(current, 'repeat'), { axis2: 'z', count: 1, count2: 1 }); verify(evaluateCadPart(current), true);
  assert.equal(saveCadPart(accepted), saved);
});

test('Rectangular refuses either downstream collision and unused Z axes without altering the accepted grid', () => {
  const accepted = evaluateCadPart(rectangularDocument()), saved = saveCadPart(accepted);
  const refused = (change, code) => {
    const doc = rectangularDocument(); change(doc); const before = structuredClone(doc);
    assert.throws(() => reevaluate(accepted, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat'
      && (!code || error.code === code));
    assert.deepEqual(doc, before); assert.equal(saveCadPart(accepted), saved);
  };
  // The first control reaches the last cutter; the second reaches the intervening cutter.
  refused(doc => { doc.parameters.pitch = 32; }, 'GEOMETRY');
  refused(doc => { doc.parameters.pitchY = 18; }, 'GEOMETRY');
  for (const [count, count2] of [[1, 1], [1, 2], [2, 1]]) {
    refused(doc => { Object.assign(feature(doc, 'repeat'), { axis: 'z', count, count2 }); }, 'CAPABILITY');
    refused(doc => { Object.assign(feature(doc, 'repeat'), { axis2: 'z', count, count2 }); }, 'CAPABILITY');
  }
  refused(doc => { feature(doc, 'second').suppressed = true; }, 'REFERENCE');
  refused(doc => { feature(doc, 'second').target = 'stock'; }, 'REFERENCE');
  refused(doc => { feature(doc, 'repeat').source = 'first/0'; }, 'REFERENCE');
  refused(doc => { Object.assign(feature(doc, 'repeat'), { count: 1, count2: 1 }); feature(doc, 'newerTool').height = 5; }, 'CAPABILITY');
  refused(doc => {
    doc.features.splice(-1, 0, { id: 'fourth', kind: 'difference', target: 'third', tool: 'lastTool' }); feature(doc, 'repeat').target = 'fourth';
  }, 'REFERENCE');
  assert.deepEqual(verify(loadCadPart(saved)), verify(accepted));
});

test('Fill uses the captured L mask to copy only the two selected cells across both newer cuts', () => {
  const doc = fillDocument(), before = structuredClone(doc);
  assert.deepEqual(selectedFill(doc), ['@1,0', '@0,1']);
  const snapshot = evaluateCadPart(doc), brep = verify(snapshot, false, { cells: fillCells }), mass = brepMassProperties(brep, 1);
  near(mass.volume, 23560); near(mass.centroid[0], 711480 / 23560); near(mass.centroid[1], 473240 / 23560);
  assert.ok(!brep.faces.some(face => face.name?.endsWith('@1,1')));
  assert.ok(!brep.faces.some(face => /^(newerTool|lastTool)\..*@/.test(face.name)));
  assert.deepEqual(doc, before); assert.deepEqual(snapshot.document.features, before.features);
  assert.deepEqual(verify(loadCadPart(saveCadPart(snapshot)), false, { cells: fillCells }), brep);
});

test('Fill excludes mask holes and unsafe unselected cells while always retaining the three original cavities', () => {
  const hole = fillDocument(); feature(hole, 'repeat').region.holes = [[[25, 8], [27, 8], [27, 10], [25, 10]]];
  assert.deepEqual(selectedFill(hole), ['@0,1']);
  verify(evaluateCadPart(hole), false, { cells: [[0, 0], [0, 1]] });
  const excluded = fillDocument(), lastBox = [24, 16, 28, 18];
  Object.assign(feature(excluded, 'lastSketch'), { min: lastBox.slice(0, 2), max: lastBox.slice(2) });
  // The excluded diagonal copy would exactly overlap this last original cavity.
  assert.deepEqual(selectedFill(excluded), ['@1,0', '@0,1']);
  verify(evaluateCadPart(excluded), false, { cells: fillCells, lastBox });
  const none = fillDocument(); feature(none, 'repeat').region = { points: [[1, 1], [2, 1], [2, 2], [1, 2]] };
  assert.deepEqual(selectedFill(none), []);
  const original = verify(evaluateCadPart(none), false, { cells: [[0, 0]] });
  near(brepMassProperties(original, 1).volume, 23720);
  const current = fillDocument(); delete feature(current, 'repeat').source;
  Object.assign(feature(current, 'repeat'), { count: 1, count2: 1 });
  verify(evaluateCadPart(current), true, { cells: [[0, 0]] });
});

test('Fill refuses selected collisions with either newer cutter and malformed bridges', () => {
  const accepted = evaluateCadPart(fillDocument()), saved = saveCadPart(accepted);
  const refused = (change, code) => {
    const doc = fillDocument(); change(doc); const before = structuredClone(doc);
    assert.throws(() => reevaluate(accepted, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === code);
    assert.deepEqual(doc, before); assert.equal(saveCadPart(accepted), saved);
  };
  // Both probes stay inside an arm of the L mask; they exercise physical admission, not exclusion.
  for (const [parameter, value, selected] of [['pitch', 32, ['@1,0', '@0,1']], ['pitchY', 18, ['@1,0', '@0,1']]]) {
    const probe = fillDocument(); probe.parameters[parameter] = value; assert.deepEqual(selectedFill(probe), selected);
    refused(doc => { doc.parameters[parameter] = value; }, 'GEOMETRY');
  }
  refused(doc => { feature(doc, 'second').suppressed = true; }, 'REFERENCE');
  refused(doc => { feature(doc, 'second').target = 'stock'; }, 'REFERENCE');
  refused(doc => { feature(doc, 'repeat').source = 'first/0'; }, 'REFERENCE');
  refused(doc => { Object.assign(feature(doc, 'repeat'), { count: 1, count2: 1 }); feature(doc, 'newerTool').height = 5; }, 'CAPABILITY');
  refused(doc => {
    doc.features.splice(-1, 0, { id: 'fourth', kind: 'difference', target: 'third', tool: 'lastTool' }); feature(doc, 'repeat').target = 'fourth';
  }, 'REFERENCE');
});

test('Path repeats the original across two newer cuts in both straight encodings with independent turn and pitch oracles', () => {
  const offsets = [[0, 0, 0], [16, 0, 0], [16, 16, 0]], editedOffsets = [[0, 0, 0], [14, 0, 0], [16, 12, 0]];
  for (const degree of [1, 2]) {
    const doc = pathDocument(degree), before = structuredClone(doc);
    assert.deepEqual(selectedPath(doc), offsets);
    const snapshot = evaluateCadPart(doc), brep = verify(snapshot, false, { offsets }), mass = brepMassProperties(brep, 1);
    near(mass.volume, 23560); near(mass.centroid[0], 710200 / 23560); near(mass.centroid[1], 472600 / 23560);
    assert.ok(!brep.faces.some(face => /^(newerTool|lastTool)\..*@/.test(face.name)));
    const editedDoc = structuredClone(doc); editedDoc.parameters.pitch = 14; assert.deepEqual(selectedPath(editedDoc), editedOffsets);
    const edited = reevaluate(snapshot, { parameters: { pitch: 14 } }), changed = verify(edited, false, { offsets: editedOffsets });
    const changedMass = brepMassProperties(changed, 1);
    near(changedMass.centroid[0], 710360 / 23560); near(changedMass.centroid[1], 472920 / 23560);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited)), false, { offsets: editedOffsets }), changed);
    assert.deepEqual(doc, before); assert.deepEqual(snapshot.document.features, before.features);
  }
  // The product fixture also has a complete third span after the turn.
  const three = pathDocument(2, [[0, 0, 2], [34, 0, 2], [34, 18, 2], [0, 18, 2]]);
  three.parameters.pitch = 24;
  verify(evaluateCadPart(three), false, { offsets: [[0, 0, 0], [24, 0, 0], [34, 14, 0]] });
});

test('Path collision probes are valid open paths and independently reach each newer cutter', () => {
  const accepted = evaluateCadPart(pathDocument()), saved = saveCadPart(accepted);
  for (const degree of [1, 2]) for (const [points, pitch, offsets] of [
    [[[0, 0, 2], [32, 0, 2], [32, 24, 2]], 32, [[0, 0, 0], [32, 0, 0]]],
    [[[0, 0, 2], [0, 18, 2], [16, 18, 2]], 18, [[0, 0, 0], [0, 18, 0]]],
  ]) {
    const doc = pathDocument(degree, points); doc.parameters.pitch = pitch; feature(doc, 'repeat').count = 2;
    assert.deepEqual(selectedPath(doc), offsets);
    const before = structuredClone(doc);
    assert.throws(() => reevaluate(accepted, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat'
      && error.code === 'GEOMETRY' && /disjoint from the newer cuts/.test(error.message));
    assert.deepEqual(doc, before); assert.equal(saveCadPart(accepted), saved);
  }
});

function quadraticDocument() {
  const doc = pathDocument(2, [[0, 0, 2], [20, 20, 2]]);
  doc.parameters.pitch = 10;
  feature(doc, 'repeat').path.controlPoints[1] = [20, 0, 2];
  return doc;
}

test('a certified quadratic repeats the first of three cuts with fixed rectangular orientation', () => {
  const doc = quadraticDocument(), before = structuredClone(doc);
  const offsets = [[0, 0, 0], ...quadraticOracle[0].offsets.map(({ offset }) => [...offset, 0])];
  selectedPath(doc).forEach((offset, i) => offset.forEach((value, axis) => near(value, offsets[i][axis])));
  const snapshot = evaluateCadPart(doc), brep = verify(snapshot, false, { offsets, approximate: true });
  near(brepMassProperties(brep, 1).volume, 23560);
  assert.ok(!brep.faces.some(face => /^(newerTool|lastTool)\..*@/.test(face.name)));
  assert.deepEqual(verify(loadCadPart(saveCadPart(snapshot)), false, { offsets, approximate: true }), brep);
  assert.deepEqual(doc, before);
});

test('quadratic earlier-source Path refuses each later collision and retains the accepted result', () => {
  const accepted = evaluateCadPart(quadraticDocument()), saved = saveCadPart(accepted);
  for (const [name, min, max, parameter] of [
    ['newerSketch', [17, 10], [23, 12], 'newerRight'], ['lastSketch', [28, 16], [32, 18], 'lastRight'],
  ]) {
    const doc = quadraticDocument(), sketch = feature(doc, name);
    sketch.min = min; sketch.max = max;
    delete doc.parameters[parameter];
    const intact = structuredClone(doc); intact.features.pop();
    assert.ok(checkBrep(evaluateCadPart(intact).outputs[0].brep, { strict: true }).valid);
    const before = structuredClone(doc);
    assert.throws(() => reevaluate(accepted, { document: doc }), error => error instanceof CadPartError
      && error.feature === 'repeat' && error.code === 'GEOMETRY' && /disjoint from the newer cuts/.test(error.message));
    assert.deepEqual(doc, before); assert.equal(saveCadPart(accepted), saved);
  }
});

test('the prior-source quadratic keeps the existing full path and distance checks', () => {
  const accepted = evaluateCadPart(quadraticDocument()), saved = saveCadPart(accepted);
  for (const [mutate, pattern] of [
    [doc => { feature(doc, 'repeat').path.weights[1] = 2; }, /weights.*1/i],
    [doc => { feature(doc, 'repeat').path.controlPoints[1][2] += 2 * Number.EPSILON; }, /constant authored Z/i],
    [doc => { feature(doc, 'repeat').path.controlPoints[1] = [40, 40, 2]; }, /noncollinear/i],
    [doc => { doc.parameters.pitch = 17; }, /path length/i],
    [doc => { doc.parameters.pitch = 20 + 10 * Math.SQRT2 * Math.asinh(1); feature(doc, 'repeat').count = 2; }, /path length|uncertain|certif/i],
  ]) {
    const doc = quadraticDocument(); mutate(doc);
    const before = structuredClone(doc);
    assert.throws(() => reevaluate(accepted, { document: doc }), error => error instanceof CadPartError
      && error.feature === 'repeat' && pattern.test(error.message));
    assert.deepEqual(doc, before); assert.equal(saveCadPart(accepted), saved);
  }
});

test('Path proves its full authored snapshot and all three original cuts even at count one, while no-source classes stay unchanged', () => {
  const single = pathDocument(); feature(single, 'repeat').count = 1;
  verify(evaluateCadPart(single), false, { offsets: [[0, 0, 0]] });
  const accepted = evaluateCadPart(pathDocument()), saved = saveCadPart(accepted);
  const refused = (doc, code) => {
    const before = structuredClone(doc);
    assert.throws(() => reevaluate(accepted, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === code);
    assert.deepEqual(doc, before); assert.equal(saveCadPart(accepted), saved);
  };
  for (const degree of [1, 2]) {
    const doc = pathDocument(degree); feature(doc, 'repeat').count = 1;
    feature(doc, 'repeat').path.controlPoints.at(-1)[2] = 2 + 2 * Number.EPSILON;
    refused(doc, 'CAPABILITY');
  }
  const curved = pathDocument(2); feature(curved, 'repeat').count = 1;
  feature(curved, 'repeat').path.controlPoints[1][1] = 1e-12; refused(curved, 'CAPABILITY');
  const blind = pathDocument(); feature(blind, 'repeat').count = 1; feature(blind, 'newerTool').height = 5; refused(blind, 'CAPABILITY');
  const stale = pathDocument(); feature(stale, 'second').suppressed = true; refused(stale, 'REFERENCE');
  const farther = pathDocument(); farther.features.splice(-1, 0, { id: 'fourth', kind: 'difference', target: 'third', tool: 'lastTool' });
  feature(farther, 'repeat').target = 'fourth'; refused(farther, 'REFERENCE');
  const closed = pathDocument(); feature(closed, 'repeat').count = 1;
  feature(closed, 'repeat').path.controlPoints.at(-1).splice(0, 3, 0, 0, 2); refused(closed, 'CAPABILITY');
  for (const raw of [
    { degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [[0, 0, 2], [8, 6, 2], [16, 0, 2]], weights: [1, 1, 1] },
    { degree: 1, knots: [0, 0, 1, 2, 2], controlPoints: [[0, 0, 2], [16, 0, 3], [16, 24, 3]], weights: [1, 1, 1] },
  ]) {
    const doc = pathDocument(); delete feature(doc, 'repeat').source;
    Object.assign(feature(doc, 'repeat'), { path: raw, count: 1 });
    verify(evaluateCadPart(doc), true, { offsets: [[0, 0, 0]] });
  }
});

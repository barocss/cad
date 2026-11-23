import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry, CadPartError } from '../dist/index.js';

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

function bounds(brep, loop) {
  const points = loop.coedges.flatMap(id => {
    const use = brep.coedges.find(item => item.id === id);
    return brep.edges.find(edge => edge.id === use.edge).curve.controlPoints;
  });
  return [0, 1].map(axis => Math.min(...points.map(point => point[axis])))
    .concat([0, 1].map(axis => Math.max(...points.map(point => point[axis]))));
}

function verify(snapshot) {
  const doc = snapshot.document, p = doc.parameters, pattern = feature(doc, 'repeat');
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, check = checkBrep(brep, { strict: true });
  assert.ok(check.valid, check.issues.join('\n')); assert.equal(output.id, 'repeat');
  const holes = [[8, 26, p.newerRight, 28], [42, 8, p.lastRight, 10]];
  for (let k = 0; k < pattern.count; k++) {
    const dx = pattern.axis === 'x' ? k * p.pitch : 0, dy = pattern.axis === 'y' ? k * p.pitch : 0;
    holes.push([p.left + dx, p.bottom + dy, p.right + dx, p.top + dy]);
    for (let side = 0; side < 4; side++) assert.ok(brep.faces.some(face => face.name === `olderTool.side${side}${k ? `@${k}` : ''}`));
  }
  const n = holes.length;
  assert.equal(check.topology[0].genus, n);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6 + 4 * n, loops: 6 + 6 * n, coedges: 24 + 24 * n, edges: 12 + 12 * n, vertices: 8 + 8 * n });
  for (const z of [0, 10]) {
    const caps = brep.faces.filter(face => { const g = faceGeometry(face); return g.kind === 'plane' && Math.abs(g.n[2]) === 1 && g.o[2] === z; });
    assert.equal(caps.length, 1);
    const inner = caps[0].loops.map(id => brep.loops.find(loop => loop.id === id)).filter(loop => loop.kind === 'inner');
    assert.deepEqual(inner.map(loop => bounds(brep, loop)).sort(), holes.slice().sort());
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
  // Other pattern families keep their direct-source boundary.
  refused(doc => { Object.assign(feature(doc, 'repeat'), { kind: 'rectangular-feature-pattern', axis2: 'y', spacing2: 8, count2: 1 }); });
});

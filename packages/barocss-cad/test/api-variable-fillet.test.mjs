import test from 'node:test';
import assert from 'node:assert/strict';
import { part, param, BarocssError } from '../dist/api/index.js';
import { CadPartError, checkBrep, evaluateCadPart, evaluateCurve, evaluateSurface, loadCadPart, massPropertiesOf, outputOf, saveCadPart } from '../dist/index.js';

// Fixed before candidate source: work/k04-variable-fillet-51a59/oracle.json.
// MMGS; the removed-volume relative comparison is the existing R10.5 1e-9 contract.
const plate = () => part('variable fillet').parameter('R', 1).parameter('E', 3).box({ w: 40, d: 30, h: 10 });
const picked = body => body.edges().along('x').where(e => e.a[1] === 0 && e.b[1] === 0 && e.a[2] === 10 && e.b[2] === 10);
const refused = (run, code, where = 'facade') => assert.throws(run, e => e instanceof BarocssError && e.code === code && e.where === where);
const removed = (r0, r1) => (1 - Math.PI / 4) * 40 * (r0 * r0 + r0 * r1 + r1 * r1) / 3;
function volume(p, r0, r1) {
  const mass = p.mass({ density: 1 }), want = removed(r0, r1), actual = 12000 - mass.volume;
  assert.ok(Math.abs(actual / want - 1) < 1e-9, `${actual} vs ${want}`);
  assert.ok(Math.abs(mass.mass - mass.volume / 1000) <= 1e-12);
  const feature = p.doc.features.at(-1), out = outputOf(evaluateCadPart(p.doc), feature.id), report = checkBrep(out.brep);
  assert.equal(report.valid, true, JSON.stringify(report.issues)); assert.equal(out.brep.bodies.length, 1);
}

test('public variable fillet: one straight edge stores its a/b radius direction and fixed R10.5 removed volume', () => {
  const source = plate(), before = source.doc, selected = picked(source.select()); assert.equal(selected.count, 1);
  const edge = selected.list()[0]; assert.equal(edge.names.length, 1);
  // Selected and stored endpoint direction is checked separately from the symmetric volume.
  // The actual section/contact radius direction is not certified by these assertions.
  assert.deepEqual(edge.a, [0, 0, 10]); assert.deepEqual(edge.b, [40, 0, 10]);
  const options = { radius: 1, endRadius: 3 }, optionsBefore = structuredClone(options), accepted = source.fillet(picked, options);
  const node = accepted.doc.features.at(-1); assert.equal(node.kind, 'fillet'); assert.equal(node.target, 'extrude1');
  assert.deepEqual(node.edges, edge.names); assert.equal(Object.hasOwn(node, 'radius'), false);
  assert.deepEqual(node.radii, [{ at: [0, 0, 10], radius: 1, atEnd: true }, { at: [40, 0, 10], radius: 3, atEnd: true }]);
  volume(accepted, 1, 3);
  const evaluated = outputOf(evaluateCadPart(accepted.doc), node.id);
  assert.deepEqual(evaluated.filletTargets, edge.names);
  assert.ok(Object.isFrozen(evaluated.filletTargets));
  assert.deepEqual(evaluated.fillet.flatMap(report => report.edges), edge.names);
  const opposite = source.fillet(picked, { radius: 3, endRadius: 1 });
  assert.deepEqual(opposite.doc.features.at(-1).radii, [{ at: [0, 0, 10], radius: 3, atEnd: true }, { at: [40, 0, 10], radius: 1, atEnd: true }]);
  volume(opposite, 3, 1);
  assert.deepEqual(source.doc, before); assert.deepEqual(options, optionsBefore);
  options.endRadius = 4; const copy = accepted.doc; copy.features.at(-1).radii[0].at[0] = 99;
  assert.deepEqual(accepted.doc.features.at(-1), node);
});

test('public variable fillet: end radius binding, parameter edits and codec preserve exact stored endpoint refs', () => {
  const source = plate(), before = source.doc, options = { radius: 1, endRadius: param('E') }, optionsBefore = structuredClone(options);
  const accepted = source.fillet(picked, options), doc = accepted.doc, stored = doc.features.at(-1);
  assert.deepEqual(stored.radii, [{ at: [0, 0, 10], radius: 1, atEnd: true }, { at: [40, 0, 10], radius: { parameter: 'E' }, atEnd: true }]);
  volume(accepted, 1, 3);
  const changed = accepted.withParameters({ E: 4 }); volume(changed, 1, 4);
  assert.deepEqual(changed.doc.features, doc.features); assert.equal(changed.parameters().E, 4);
  // Stored Dim edits bypass initial authoring admission: retain the endpoint binding even at equal/near-equal values.
  for (const endRadius of [1, 1 + 5e-10]) {
    const edited = accepted.withParameters({ E: endRadius });
    assert.equal(edited.parameters().E, endRadius); assert.deepEqual(edited.doc.features, doc.features);
    assert.deepEqual(edited.doc.features.at(-1).radii, [{ at: [0, 0, 10], radius: 1, atEnd: true }, { at: [40, 0, 10], radius: { parameter: 'E' }, atEnd: true }]);
    volume(edited, 1, endRadius);
  }

  const snapshot = evaluateCadPart(doc), text = saveCadPart(snapshot), loaded = loadCadPart(text);
  assert.deepEqual(loaded.document, snapshot.document);
  assert.deepEqual(outputOf(loaded, stored.id).brep, outputOf(snapshot, stored.id).brep);
  const reopened = part('reopened variable fillet', loaded.document); volume(reopened, 1, 3); volume(reopened.withParameters({ E: 4 }), 1, 4);
  const massBefore = accepted.mass({ density: 1 });
  refused(() => accepted.withParameters({ E: 0 }), 'PARAMETER', 'evaluate');
  assert.deepEqual(accepted.doc, doc); assert.deepEqual(accepted.mass({ density: 1 }), massBefore);
  assert.deepEqual(source.doc, before); assert.deepEqual(options, optionsBefore);
});

test('public variable fillet: equal numeric radii retain constant behavior and invalid options or selections refuse atomically', () => {
  const source = plate(), before = source.doc, constant = source.fillet(picked, { radius: 1 });
  const equal = source.fillet(picked, { radius: 1, endRadius: 1 }); assert.deepEqual(equal.doc, constant.doc);
  assert.deepEqual(equal.mass({ density: 1 }), constant.mass({ density: 1 }));
  const boundConstant = source.fillet(picked, { radius: param('R') });
  assert.deepEqual(boundConstant.doc.features.at(-1).radius, { parameter: 'R' });
  for (const endRadius of [0, -1, NaN, Infinity, 0.05, 1 + 5e-10]) {
    const options = { radius: 1, endRadius }, saved = structuredClone(options);
    refused(() => source.fillet(picked, options), 'VALUE'); assert.deepEqual(options, saved);
  }
  refused(() => source.fillet(picked, { radius: 0.05, endRadius: 3 }), 'VALUE');
  refused(() => source.fillet(picked, { radius: param('R'), endRadius: 3 }), 'PARAMETER_UNBINDABLE');
  refused(() => source.withParameters({ E: 1 }).fillet(picked, { radius: 1, endRadius: param('E') }), 'PARAMETER_UNBINDABLE');
  refused(() => source.fillet(b => b.edges().along('x'), { radius: 1, endRadius: 3 }), 'SELECTION_ONE');
  refused(() => source.fillet(b => b.edges().where(() => false), { radius: 1, endRadius: 3 }), 'SELECTION_EMPTY');
  const curved = part('curved selection').cylinder({ r: 8, h: 10 }), curvedBefore = curved.doc;
  refused(() => curved.fillet(b => b.edges().curved().first(), { radius: 1, endRadius: 3 }), 'VALUE'); assert.deepEqual(curved.doc, curvedBefore);
  // Two actual bodies are distinct from several edges on one body. Explicit focus changes only that body.
  const pair = source.box({ w: 40, d: 30, h: 10, x: 60 }), pairBefore = pair.doc; assert.equal(pair.bodies().length, 2);
  refused(() => pair.fillet(picked, { radius: 1, endRadius: 3 }), 'BODY_AMBIGUOUS');
  const focused = pair.body('extrude1').fillet(picked, { radius: 1, endRadius: 3 });
  assert.equal(focused.doc.features.at(-1).target, 'extrude1');
  assert.deepEqual(focused.body('extrude2').mass({ density: 1 }), pair.body('extrude2').mass({ density: 1 }));
  assert.deepEqual(pair.doc, pairBefore); assert.deepEqual(source.doc, before);
});

function fractionalFillet() {
  const source = plate(), doc = source.doc;
  const [{ names }] = picked(source.select()).list();
  return { doc, feature: { id: 'f', kind: 'fillet', target: 'extrude1', edges: names, radii: [
    { at: [0, 0, 10], radius: 1.25, atEnd: true },
    { at: [10, 0, 10], radius: 3, fraction: 0.25 },
    { at: [25, 0, 10], radius: 1, fraction: 0.625 },
    { at: [40, 0, 10], radius: 2.5, atEnd: true },
  ] } };
}

function assertFractionalVolume(output, base, removedVolume) {
  const check = checkBrep(output.brep, { strict: true });
  assert.equal(check.valid, true, JSON.stringify(check.issues));
  assert.equal(check.counts.bodies, 1);
  assert.equal(check.counts.shells, 1);
  const removed = base - massPropertiesOf(output).volume;
  assert.ok(Math.abs(removed / removedVolume - 1) < 1e-9, `${removed} vs ${removedVolume}`);
}

function assertNativeSections(output, samples, height) {
  const surfaces = output.brep.faces.filter(face => face.name?.startsWith('f.face')).map(face => face.surface);
  for (const [x, radius] of samples) {
    let seen = 0;
    for (const surface of surfaces) {
      assert.equal(surface.kind, 'surface');
      const u0 = surface.knotsU[surface.degreeU], u1 = surface.knotsU[surface.controlPoints.length], um = (u0 + u1) / 2;
      const v0 = surface.knotsV[surface.degreeV], v1 = surface.knotsV[surface.controlPoints[0].length];
      const x0 = evaluateSurface(surface, um, v0)[0], x1 = evaluateSurface(surface, um, v1)[0];
      if (x < Math.min(x0, x1) - 1e-9 || x > Math.max(x0, x1) + 1e-9) continue;
      seen++;
      let lo = v0, hi = v1;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if ((evaluateSurface(surface, um, mid)[0] < x) === (x0 < x1)) lo = mid;
        else hi = mid;
      }
      const points = [u0, um, u1].map(u => evaluateSurface(surface, u, (lo + hi) / 2)).sort((a, b) => a[1] - b[1]);
      const diag = radius * (1 - 1 / Math.sqrt(2));
      const expected = [[x, 0, height - radius], [x, diag, height - diag], [x, radius, height]];
      for (const [i, point] of points.entries()) {
        const residual = Math.hypot(...point.map((value, axis) => value - expected[i][axis]));
        assert.ok(residual <= 1e-6, `X=${x} radius=${radius}: ${JSON.stringify(point)} vs ${expected[i]}`);
      }
    }
    assert.ok(seen > 0, `No native fillet section at X=${x}`);
  }
}

test('fractional kernel fillet: two stations give the native peak and trough while retaining the authored direction', () => {
  const { doc, feature } = fractionalFillet();
  const circularArea = 1 - Math.PI / 4;
  const removal = circularArea * 27731 / 168;
  // Independently expanded Hermite cubics have local midspan values 75/32, 2 and 25/16.
  const samples = [[0, 1.25], [5, 75 / 32], [10, 3], [17.5, 2], [25, 1], [32.5, 25 / 16], [40, 2.5]];
  const snapshot = evaluateCadPart({ ...doc, features: [...doc.features, feature] });
  const output = outputOf(snapshot, feature.id);
  assert.deepEqual(output.filletTargets, feature.edges);
  assertFractionalVolume(output, 12000, removal);
  assertNativeSections(output, samples, 10);

  const opposite = structuredClone(feature);
  for (const station of opposite.radii) station.at[0] = 40 - station.at[0];
  const reversed = outputOf(evaluateCadPart({ ...doc, features: [...doc.features, opposite] }), feature.id);
  assertFractionalVolume(reversed, 12000, removal);
  assertNativeSections(reversed, samples.map(([x, radius]) => [40 - x, radius]), 10);

  const loaded = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(loaded.document, snapshot.document);
  assert.deepEqual(outputOf(loaded, feature.id).brep, output.brep);
});

test('fractional kernel fillet: station edits follow a resized edge and the three-record mode remains valid', () => {
  const { doc, feature } = fractionalFillet();
  const updated = structuredClone(feature);
  updated.radii[2].fraction = 0.7;
  updated.radii[2].radius = 1.5;
  const circularArea = 1 - Math.PI / 4;
  const editedRemoval = circularArea * 32939 / 168;
  const edited = outputOf(evaluateCadPart({ ...doc, features: [...doc.features, updated] }), feature.id);
  assertFractionalVolume(edited, 12000, editedRemoval);
  assertNativeSections(edited, [[10, 3], [28, 1.5]], 10);

  const resized = structuredClone(doc);
  const [sketch, extrusion] = resized.features;
  sketch.max[0] = 60;
  extrusion.height = 12;
  resized.features.push(updated);
  const output = outputOf(evaluateCadPart(resized), feature.id);
  assertFractionalVolume(output, 21600, 1.5 * editedRemoval);
  assertNativeSections(output, [[15, 3], [42, 1.5]], 12);

  const previous = { ...feature, radii: [
    { ...feature.radii[0], radius: 1 },
    { ...feature.radii[1], radius: 2 },
    { ...feature.radii[3], radius: 4 },
  ] };
  const legacy = outputOf(evaluateCadPart({ ...doc, features: [...doc.features, previous] }), feature.id);
  assertFractionalVolume(legacy, 12000, circularArea * 8393 / 27);
  assertNativeSections(legacy, [[0, 1], [10, 2], [40, 4]], 10);
});

test('fractional kernel fillet: malformed records and changed edge direction fail without modifying the source', () => {
  const { doc, feature } = fractionalFillet();
  for (const [mutate, code, message] of [
    [f => { f.radii[1].fraction = 0; }, 'INPUT', /strictly between/],
    [f => { f.radii[2].fraction = 1; }, 'INPUT', /strictly between/],
    [f => { f.radii[1].fraction = Infinity; }, 'INPUT', /strictly between/],
    [f => { f.radii[2].fraction = 0.25; }, 'INPUT', /increase/],
    [f => { f.radii[2].fraction = 0.25 + 5e-10; }, 'INPUT', /increase/],
    [f => { [f.radii[1], f.radii[2]] = [f.radii[2], f.radii[1]]; }, 'INPUT', /increase/],
    [f => { delete f.radii[2].fraction; }, 'SELECTION', /each interior/],
    [f => { f.radii.splice(3, 0, { at: [30, 0, 10], radius: 1.75, fraction: 0.75 }); }, 'SELECTION', /one straight edge/],
    [f => { f.radii[3].at = [0, 30, 10]; }, 'SELECTION', /direction changed/],
  ]) {
    const candidate = structuredClone(feature);
    mutate(candidate);
    const input = { ...doc, features: [...doc.features, candidate] }, before = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), error => error instanceof CadPartError && error.code === code && message.test(error.message));
    assert.deepEqual(input, before);
  }

  const step = [...doc.features,
    { id: 'step', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 15] },
    { id: 'upper', kind: 'extrude', sketch: 'step', height: 10, from: 10 },
    { id: 'union', kind: 'union', target: 'extrude1', tool: 'upper' },
  ];
  const body = outputOf(evaluateCadPart({ ...doc, features: step }), 'union').brep;
  const concave = body.edges.find(edge => edge.curve.degree === 1 && edge.curve.controlPoints.every(point => point[1] === 15 && point[2] === 10));
  assert.ok(concave);
  const cutter = { ...feature, target: 'union', edges: [concave.name] };
  assert.throws(() => evaluateCadPart({ ...doc, features: [...step, cutter] }), error => error instanceof CadPartError && error.code === 'SELECTION' && /need a convex edge/.test(error.message));
});

test('fractional kernel fillet: both inclined ends trim the drafted top rim at 8 and 12 degrees', () => {
  const { doc, feature } = fractionalFillet();
  for (const [draft, expectedVolume] of [[8, 11018.889660840565], [12, 10553.214670395955]]) {
    const theta = draft * Math.PI / 180, slope = Math.tan(theta), inset = 10 * slope, span = 40 - 2 * inset;
    const setback = Math.tan((Math.PI / 2 - theta) / 2);
    const [sketch, extrusion] = doc.features;
    const rim = { ...feature, radii: feature.radii.map(({ at, ...control }) => ({ ...control, at: [inset + at[0] / 40 * span, inset, 10] })) };
    const output = outputOf(evaluateCadPart({ ...doc, features: [sketch, { ...extrusion, draft }, rim] }), rim.id);
    const { brep } = output;
    const check = checkBrep(brep, { strict: true });
    assert.equal(check.valid, true, check.issues.join('\n'));
    assert.equal(check.counts.bodies, 1);
    assert.equal(check.counts.shells, 1);
    // The volume reference integrates the circular corner along X and includes the wedges beyond the cap endpoints.
    const volume = massPropertiesOf(output).volume;
    assert.ok(Math.abs(volume - expectedVolume) < 1e-6, `${draft}°: ${volume} vs ${expectedVolume} mm³`);

    for (const [side, planeX, endpoint, endRadius, endRate] of [
      ['side1', z => 40 - slope * z, 40 - inset, 2.5, 1.5 / (0.375 * span)],
      ['side3', z => slope * z, inset, 1.25, 1.75 / (0.25 * span)],
    ]) {
      const trims = brep.edges.filter(edge => edge.name?.startsWith(`${extrusion.id}.${side}|f.face`));
      assert.ok(trims.length > 0, `${draft}° ${side}: missing native end trim`);
      let cap = false, wall = false;
      for (const { curve } of trims) {
        const start = curve.knots[curve.degree], end = curve.knots[curve.controlPoints.length];
        for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
          const [x, y, z] = evaluateCurve(curve, start + (end - start) * fraction);
          const radius = endRadius + endRate * (x - endpoint);
          const radial = Math.hypot(y - inset - radius * setback, z - 10 + radius);
          assert.ok(Math.abs(x - planeX(z)) < 1e-5, `${draft}° ${side}: trim leaves its plane`);
          assert.ok(Math.abs(radial - radius) < 1e-5, `${draft}° ${side}: trim leaves its rolling circle`);
          cap ||= Math.abs(z - 10) < 1e-6 && Math.abs(y - inset - endRadius * setback) < 1e-6;
          wall ||= Math.abs(y - slope * z) < 1e-6 && Math.abs(z - 10 + radius * (1 - Math.sin(theta))) < 1e-6;
        }
      }
      assert.ok(cap && wall, `${draft}° ${side}: trim must meet both support contacts`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, massPropertiesOf, surfaceDomain } from '../dist/index.js';

const stockRadius = 8, height = 10, sweep = Math.PI / 2;
const stock = {
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [
    { id: 's', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, 0] },
      { kind: 'arc', start: [stockRadius, 0], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [0, stockRadius] },
    ] },
    { id: 'e', kind: 'extrude', sketch: 's', height },
  ],
};
const edgeName = 'e.side1|e.top';
const angle = point => Math.atan2(point[1], point[0]);

function evaluate(startRadius, endRadius, reverseRecords = false, liveHeight = height, authoredHeight = height) {
  const radii = [
    { at: [stockRadius, 0, authoredHeight], radius: startRadius, atEnd: true },
    { at: [0, stockRadius, authoredHeight], radius: endRadius, atEnd: true },
  ];
  if (reverseRecords) radii.reverse();
  return evaluateCadPart({ ...stock, features: [
    ...stock.features.map(f => f.kind === 'extrude' ? {...f, height:liveHeight} : f), { id: 'f', kind: 'fillet', target: 'e', edges: [edgeName], radii },
  ] }).outputs[0];
}

function expectedVolume(start, end) {
  // Integrate the removed section with cylindrical Jacobian (R - x), where x is inward
  // from the original cylinder. The square minus the quarter disk has area
  // (1 - pi/4)r² and its first moment about x=0 is (5/6 - pi/4)r³.
  const meanSquare = (start ** 2 + start * end + end ** 2) / 3;
  const meanCube = (start ** 3 + start ** 2 * end + start * end ** 2 + end ** 3) / 4;
  return sweep * (stockRadius ** 2 * height / 2 -
    stockRadius * (1 - Math.PI / 4) * meanSquare + (5 / 6 - Math.PI / 4) * meanCube);
}

function assertSections(blends, start, end) {
  for (let i = 0; i <= 24; i++) {
    const theta = sweep * i / 24, radius = start + (end - start) * i / 24;
    let found = false;
    for (const { surface } of blends) {
      const { u, v } = surfaceDomain(surface);
      const first = angle(evaluateSurface(surface, u[0], v[0]));
      const last = angle(evaluateSurface(surface, u[0], v[1]));
      if (theta < Math.min(first, last) - 1e-8 || theta > Math.max(first, last) + 1e-8) continue;
      found = true;
      let [lo, hi] = v;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        if ((angle(evaluateSurface(surface, u[0], mid)) < theta) === (first < last)) lo = mid;
        else hi = mid;
      }
      const points = [u[0], (u[0] + u[1]) / 2, u[1]]
        .map(p => evaluateSurface(surface, p, (lo + hi) / 2)).sort((a, b) => a[2] - b[2]);
      const diag = radius * (1 - 1 / Math.sqrt(2));
      const expected = [[stockRadius, height - radius], [stockRadius - diag, height - diag], [stockRadius - radius, height]];
      for (const [[x, y, z], [rho, h]] of points.map((p, k) => [p, expected[k]])) {
        const gap = Math.hypot(x - rho * Math.cos(theta), y - rho * Math.sin(theta), z - h);
        assert.ok(gap <= 1e-7, `theta ${theta}: radius ${radius}, section gap ${gap} mm`);
      }
    }
    assert.ok(found, `Missing section at theta ${theta}`);
  }
}

test('variable fillet closes one open circular rim at both radial end faces', () => {
  for (const [start, end, reverseRecords] of [[0.6, 1.2], [0.6, 1.5], [1.5, 0.6, true]]) {
    const output = evaluate(start, end, reverseRecords), { brep } = output;
    const checked = checkBrep(brep, { strict: true });
    assert.ok(checked.valid, checked.issues.join('\n'));
    assert.equal(checked.counts.bodies, 1);
    assert.equal(checked.counts.shells, 1);
    assert.equal(checked.topology[0].genus, 0);
    assert.ok(checked.maximumEdgeSurfaceGap <= 1e-7);
    assert.deepEqual(output.filletTargets, [edgeName]);
    const mass = massPropertiesOf(output);
    assert.equal(mass.method, 'quadrature');
    assert.ok(Math.abs(mass.volume - expectedVolume(start, end)) <= 2e-6, String(mass.volume));

    const blends = brep.faces.filter(face => face.name.startsWith('f.face'));
    assertSections(blends, start, end);
    const blendLoops = new Set(blends.flatMap(face => face.loops));
    for (const [name, radialAxis, radius] of [['e.side0', 0, start], ['e.side2', 1, end]]) {
      const endFace = brep.faces.find(face => face.name === name);
      const uses = brep.coedges.filter(use => endFace.loops.includes(use.loop));
      const trims = uses.filter(use => blendLoops.has(brep.coedges.find(other => other.id === use.twin)?.loop));
      assert.equal(trims.length, 1, `Shared fillet trim on ${name}`);
      const section = brep.edges.find(edge => edge.id === trims[0].edge).curve;
      assert.equal(section.degree, 2);
      const [from, to] = curveDomain(section);
      for (let i = 0; i <= 8; i++) {
        const p = evaluateCurve(section, from + (to - from) * i / 8);
        const distance = Math.hypot(p[radialAxis] - (stockRadius - radius), p[2] - (height - radius));
        assert.ok(Math.abs(p[1 - radialAxis]) <= 1e-7 && Math.abs(distance - radius) <= 1e-7);
      }
    }
  }
});

test('a radius which passes the radial rim stock refuses without partial geometry', () => {
  const before = structuredClone(stock);
  assert.throws(() => evaluate(0.6, 10), error => error.code === 'CONTACT_LEAVES_FACE' && error.details.category === 'PARAMETER');
  assert.deepEqual(stock, before);
});


test('an exact terminal break does not loft a zero-length patch after height edits', () => {
  for (const authoredHeight of [10, 12]) {
    const output = evaluate(1.2, 0.6, false, 12, authoredHeight);
    const checked = checkBrep(output.brep, {strict:true});
    assert.ok(checked.valid, JSON.stringify(checked.issues));
    assert.equal(checked.counts.shells, 1);
    assert.equal(checked.topology[0].genus, 0);
    assert.ok(Math.abs(massPropertiesOf(output).volume - (expectedVolume(1.2, 0.6) + 2 * Math.PI * stockRadius ** 2 / 4)) < 2e-6);
  }
});

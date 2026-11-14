import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, curveDomain, evaluateCadPart, evaluateCurve, massPropertiesOf, reevaluate } from '../dist/index.js';

const pathRadius = 20, boreRadius = 1, boreHeight = 1;
const area = 100 + 12.5 * Math.PI;
const anchor = (700 + 12.5 * Math.PI * (12 + 20 / (3 * Math.PI))) / area;
const boreMajor = pathRadius + 8 - anchor;
const baseVolume = (pathRadius * area - Math.PI * boreRadius ** 2 * boreMajor) * Math.PI / 2;
const origin = [13, -7, 4];
const rim = ['w.side[bore]#1|w.start', 'w.side[bore]#2|w.start'];
const document = radius => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [
    { id: 's', kind: 'sketch', profile: 'loop',
      segments: [
        { kind: 'line', start: [2, 3] },
        { kind: 'arc', start: [12, 3], center: [12, 8], direction: 'ccw' },
        { kind: 'line', start: [12, 13] },
        { kind: 'line', start: [2, 13] },
      ],
      holes: [[{ kind: 'arc', start: [9, 7], center: [8, 7], direction: 'cw' }]],
      sideTags: { outer: ['base', 'round', 'roof', 'back'], holes: [['bore']] } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact',
      path: { degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [[33, -7, 4], [33, 13, 4], [13, 13, 4]],
        weights: [1, Math.SQRT1_2, 1] } },
    { id: 'f', kind: 'fillet', target: 'w', edges: rim, radius },
  ],
});

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, n) => a.map(x => x * n);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));

// A ball centre lies in Y=fillet and on the torus of minor radius bore+fillet. Its
// section swings from the cap contact down toward the original bore contact.
function section(angle, fillet) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const radial = boreMajor + (boreRadius + fillet) * cos;
  const bend = Math.asin(fillet / radial);
  const radialNormal = Math.cos(bend) * cos;
  const across = [-radialNormal, 0, -sin], projected = scale(across, 1 / Math.hypot(...across));
  return {
    centre: [radial * Math.cos(bend), fillet, boreHeight + (boreRadius + fillet) * sin],
    down: [0, -1, 0], projected, span: Math.acos(cos * Math.sin(bend)), bend,
  };
}

// Use the divergence field (0,Y,0) on the removed ring. Its planar cap has
// zero flux. Integrate the old torus strip analytically in the bend direction
// and the ideal rolling-ball envelope numerically across the section.
function removedVolume(fillet) {
  const point = (s, fraction) => {
    const d = fraction * s.span;
    return add(s.centre, scale(add(scale(s.down, Math.cos(d)), scale(s.projected, Math.sin(d))), fillet));
  };
  const n = 128, m = 64, h = 1e-4;
  let oldFlux = 0, newFlux = 0;
  for (let i = 0; i < n; i++) {
    const angle = i * 2 * Math.PI / n, at = section(angle, fillet);
    const radial = boreMajor + boreRadius * Math.cos(angle);
    oldFlux -= boreRadius * Math.cos(angle) * radial ** 2 * (at.bend / 2 - Math.sin(2 * at.bend) / 4);
    const before = section(angle - h, fillet), after = section(angle + h, fillet);
    let simpson = 0;
    for (let j = 0; j <= m; j++) {
      const fraction = j / m, swing = fraction * at.span;
      const dp = scale(sub(point(after, fraction), point(before, fraction)), 1 / (2 * h));
      const ds = scale(add(scale(at.down, -Math.sin(swing)), scale(at.projected, Math.cos(swing))), fillet * at.span);
      const w = j === 0 || j === m ? 1 : j % 2 === 1 ? 4 : 2;
      simpson -= w * point(at, fraction)[1] * Math.cos(swing) * Math.hypot(...cross(dp, ds));
    }
    newFlux += simpson / (3 * m);
  }
  return (oldFlux - newFlux) * 2 * Math.PI / n;
}

function verify(output, fillet) {
  const checked = checkOutput(output), { brep } = output;
  assert.equal(checked.valid, true, checked.issues.join('\n'));
  assert.equal(checked.counts.bodies, 1);
  assert.equal(checked.counts.shells, 1);
  assert.equal(checked.topology[0].genus, 1);
  assert.ok(checked.maximumEdgeSurfaceGap <= 1e-7);
  assert.deepEqual([...output.filletTargets].sort(), rim);
  assert.equal(output.fillet.length, 1);
  const [fit] = output.fillet;
  assert.deepEqual([...fit.edges].sort(), rim);
  assert.ok(fit.patches > 1 && fit.stations > fit.patches);
  assert.ok(fit.contact <= 1e-7 && fit.section <= 1e-7 && fit.ball <= 1e-7 && fit.normal <= 1e-3);
  const measured = massPropertiesOf(output);
  assert.equal(measured.method, 'quadrature');
  near(measured.volume, baseVolume - removedVolume(fillet));

  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const owners = new Map();
  for (const use of brep.coedges) {
    const uses = owners.get(use.edge) ?? [];
    uses.push(faces.get(loops.get(use.loop).face).name);
    owners.set(use.edge, uses);
  }
  const related = brep.edges.map(edge => ({ edge, names: owners.get(edge.id) }))
    .filter(({ names }) => names.some(name => /^f\.face/.test(name)));
  const caps = related.filter(({ names }) => names.includes('w.start'));
  const bores = related.filter(({ names }) => names.some(name => name.includes('.side[bore]')));
  assert.ok(caps.length >= 2 && bores.length >= 2);
  assert.ok(brep.faces.some(face => face.name === 'w.end'));
  assert.ok(brep.edges.every(edge => !rim.includes(edge.name)));
  for (const [edges, type] of [[caps, 'cap'], [bores, 'bore']]) for (const { edge } of edges) {
    const [lo, hi] = curveDomain(edge.curve);
    for (let i = 0; i <= 12; i++) {
      const [x, y, z] = sub(evaluateCurve(edge.curve, lo + (hi - lo) * i / 12), origin);
      const radial = Math.hypot(x, y);
      assert.ok(x > 0 && y >= -1e-7 && y <= 2 * fillet);
      if (type === 'cap') {
        near(y, 0);
        // Project a cap contact back up to the ball centre and use its independent torus carrier.
        near(Math.hypot(Math.hypot(x, fillet) - boreMajor, z - boreHeight), boreRadius + fillet);
      } else {
        near(Math.hypot(radial - boreMajor, z - boreHeight), boreRadius);
        // Shift the torus contact toward the ball centre along the original bore's normal.
        const centreDepth = y * (radial + fillet * (radial - boreMajor) / boreRadius) / radial;
        near(centreDepth, fillet);
      }
    }
  }
}

test('a closed noncoaxial bore rim keeps both halves for a constant native fitted fillet', () => {
  const first = evaluateCadPart(document(0.2));
  verify(first.outputs[0], 0.2);
  const edited = reevaluate(first, { document: document(0.25) });
  verify(edited.outputs[0], 0.25);
});

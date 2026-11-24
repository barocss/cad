import test from 'node:test';
import assert from 'node:assert/strict';
import { brepMassProperties, checkBrep, evaluateCurve, loftSolid } from '../dist/index.js';

const rectangle = (w, d, z) => ({
  profile: [[0, 0], [w, 0], [w, d], [0, d]].map(start => ({ kind: 'line', start })), z,
});
const sections = [rectangle(10, 6, 0), rectangle(14, 12, 10), rectangle(10, 6, 20)];
const guides = [0, 10].map(x => ({ kind: 'quadratic-bezier', controlPoints: [[x, 0, 0], [x === 0 ? 0 : 18, 0, 10], [x, 0, 20]] }));
const build = options => loftSolid({ id: 'loft', name: 'loft', sections, guides, ...options });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('three-section two-guide Loft has one exact middle ring, eight walls and both original rails', () => {
  const { brep, mass } = build();
  const report = checkBrep(brep, { strict: true, pcurveSamples: 13 });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 40, edges: 20, vertices: 12 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(brep.coedges.every(use => use.pcurve));
  close(report.maximumPcurveGap, 0);
  const slice = brep.edges.filter(edge => edge.curve.controlPoints.every(point => point[2] === 10));
  assert.equal(slice.length, 4);
  for (const edge of slice) {
    assert.equal(edge.curve.degree, 1);
    const [a, b] = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(a.twin, b.id);
    assert.equal(b.twin, a.id);
  }
  const names = new Set(brep.faces.map(face => face.name));
  assert.ok(names.has('loft.bottom') && names.has('loft.top'));
  assert.equal(names.size, 10);
  for (const [x, middle] of [[0, 0], [10, 14]]) {
    for (const upper of [false, true]) {
      const rail = brep.edges.find(edge => edge.curve.controlPoints.every(point => point[1] === 0) &&
        edge.curve.degree === 2 &&
        JSON.stringify(edge.curve.controlPoints[0]) === JSON.stringify(upper ? [middle, 0, 10] : [x, 0, 0]));
      assert.ok(rail);
      for (const span of [0.25, 0.5, 0.75]) {
        const t = (span + (upper ? 1 : 0)) / 2;
        const measured = evaluateCurve(rail.curve, span);
        close(measured[0], x === 0 ? 0 : 10 + 16 * t * (1 - t));
        close(measured[1], 0);
        close(measured[2], 20 * t);
      }
    }
  }
  for (const props of [mass(1), brepMassProperties(brep, 1)]) {
    close(props.volume, 16808 / 7);
    close(props.centroid[0], 95490 / 14707);
    close(props.centroid[1], 12603474 / 2573725);
    close(props.centroid[2], 10);
  }
  const widerMiddle = build({ sections: [sections[0], rectangle(14, 14, 10), sections[2]] });
  close(widerMiddle.mass(1).volume, 2656);
});

test('three-section two-guide Loft refuses a nonmidpoint station, an off-rail rectangle, or smooth mode', () => {
  assert.throws(() => build({ sections: [sections[0], rectangle(14, 12, 9), sections[2]] }), /half|midpoint|middle/);
  assert.throws(() => build({ sections: [sections[0], rectangle(15, 12, 10), sections[2]] }), /middle|endpoints/);
  assert.throws(() => build({ smooth: true }), /ruled/);
});

test('three tilted sections retain the native topology, split guides and rigid mass', () => {
  const world = ([x, y, z]) => [20 + x, 0.6 * y + 0.8 * z - 10, -0.8 * y + 0.6 * z + 7];
  const framed = sections.map(({ profile, z }) => ({
    profile, frame: { origin: world([0, 0, z]), xAxis: [1, 0, 0], yAxis: [0, 0.6, -0.8] },
  }));
  const worldGuides = guides.map(guide => ({ ...guide, controlPoints: guide.controlPoints.map(world) }));
  const { brep, mass } = build({ sections: framed, guides: worldGuides });
  const local = build().brep;
  const report = checkBrep(brep, { strict: true, pcurveSamples: 13 });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 40, edges: 20, vertices: 12 });
  assert.equal(report.topology[0].genus, 0);
  close(report.maximumPcurveGap, 0);
  assert.deepEqual(brep.faces.map(({ id, name }) => [id, name]), local.faces.map(({ id, name }) => [id, name]));
  assert.deepEqual(brep.edges.map(({ id, name }) => [id, name]), local.edges.map(({ id, name }) => [id, name]));
  assert.ok(brep.coedges.every(use => use.pcurve));
  assert.deepEqual(brep.coedges.map(use => use.pcurve), local.coedges.map(use => use.pcurve));
  for (const controls of [
    [[0, 0, 0], [0, 0, 5], [0, 0, 10]], [[0, 0, 10], [0, 0, 15], [0, 0, 20]],
    [[10, 0, 0], [14, 0, 5], [14, 0, 10]], [[14, 0, 10], [14, 0, 15], [10, 0, 20]],
  ]) {
    const poles = JSON.stringify(controls.map(world));
    assert.ok(brep.edges.some(edge => edge.curve.degree === 2 && JSON.stringify(edge.curve.controlPoints) === poles), poles);
  }
  for (const props of [mass(1), brepMassProperties(brep, 1)]) {
    close(props.volume, 16808 / 7);
    const center = world([95490 / 14707, 12603474 / 2573725, 10]);
    props.centroid.forEach((value, i) => close(value, center[i]));
  }
  for (const [index, origin] of [[1, world([1, 0, 10])], [2, world([1, 0, 20])], [1, world([0, 0, 9])]]) {
    const invalid = framed.map((section, i) => i === index ? { ...section, frame: { ...section.frame, origin } } : section);
    assert.throws(() => build({ sections: invalid, guides: worldGuides }), /exact pure-normal middle and upper offsets/);
  }
  assert.throws(() => build({ sections: [framed[0], sections[1], framed[2]], guides: worldGuides }), /finite frames/);
});

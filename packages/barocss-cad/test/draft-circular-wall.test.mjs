import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCadPart, reevaluate, checkBrep, massPropertiesOf, brepMassProperties, evaluateCurve, evaluateSurface, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { draftCircularWallIfAdmitted, circularWallOffsetFrame } from '../dist/features/bored-cap-offset.js';

const halves = ['e.side0#1', 'e.side0#2'];
const doc = (angle = 10, pull = 'z', neutral = 11) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'circle', center: [12, -7], radius: 10 },
  { id: 'e', kind: 'extrude', sketch: 's', from: 3, height: 20 },
  { id: 'd', kind: 'draft', target: 'e', faces: halves, angle, pull, ...(neutral === undefined ? {} : { neutral }) },
] });
const close = (a, b, label, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const reference = (angle, pull, neutral) => {
  const k = (pull === 'z' ? 1 : -1) * Math.tan(angle * Math.PI / 180), a = 10 - k * (3 - neutral), b = 10 - k * (23 - neutral), D = a * a + a * b + b * b;
  return { k, a, b, volume: Math.PI * 20 * D / 3, centroid: [12, -7, 3 + 20 * (a * a + 2 * a * b + 3 * b * b) / (4 * D)] };
};
function ownership(brep) {
  return { source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops, coedges: brep.coedges,
    faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: { ...surface, controlPoints: undefined } })),
    edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: { ...curve, controlPoints: undefined } })),
    vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex) };
}
function watertight(brep) {
  const m = tessellateBrep(brep, { segmentsPerQuarter: 24 }), P = m.positions, I = m.indices, edges = new Map();
  const key = i => `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
  for (let i = 0; i < I.length; i += 3) for (let j = 0; j < 3; j++) {
    const e = `${key(I[i + j])}>${key(I[i + (j + 1) % 3])}`; edges.set(e, (edges.get(e) ?? 0) + 1);
  }
  for (const [e, n] of edges) { const [a, b] = e.split('>'); assert.equal(edges.get(`${b}>${a}`), n, e); }
}
function supports(brep, ref, neutral) {
  const curves = new Map(brep.edges.map(e => [e.id, e.curve])), loops = new Map(brep.loops.map(l => [l.id, l]));
  for (const face of brep.faces) {
    for (const use of brep.coedges.filter(c => loops.get(c.loop).face === face.id)) for (const t of [0, .15, .4, .75, 1]) {
      const p = evaluateCurve(curves.get(use.edge), t), uv = evaluateCurve(use.pcurve, t);
      evaluateSurface(face.surface, uv[0], uv[1]).forEach((v, i) => close(v, p[i], 'unchanged native pcurve binds mapped world edge'));
    }
    if (!halves.includes(face.name)) continue;
    for (const u of [0, .1, .3, .5, .8, 1]) for (const v of [0, .2, (neutral - 3) / 20, .7, 1]) {
      const p = evaluateSurface(face.surface, u, v); close(Math.hypot(p[0] - 12, p[1] + 7), 10 - ref.k * (p[2] - neutral), 'remeasured native conical support');
    }
  }
}

for (const pull of ['z', '-z']) for (const angle of [10, -10]) test(`both original circular halves Draft ${angle}° with ${pull} retain native ownership and exact neutral geometry`, () => {
  const source = evaluateCadPart({ ...doc(), features: doc().features.slice(0, 2) }), original = source.outputs[0].brep;
  for (const neutral of [3, 11, 23]) {
    const input = doc(angle, pull, neutral), before = structuredClone(input), snapshot = evaluateCadPart(input), output = snapshot.outputs[0], brep = output.brep, ref = reference(angle, pull, neutral);
    assert.deepEqual(input, before); assert.deepEqual(ownership(brep), ownership(original));
    const report = checkBrep(brep, { strict: true, pcurveSamples: 9 }); assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 }); assert.equal(report.topology[0].genus, 0);
    assert.ok(brep.coedges.every(c => c.pcurve)); supports(brep, ref, neutral); watertight(brep);
    for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
      close(mass.volume, ref.volume, 'independent frustum volume', 1e-7); mass.centroid.forEach((v, i) => close(v, ref.centroid[i], 'independent frustum centroid', 1e-7));
    }
    if (neutral !== 11) {
      const cap = original.faces.find(f => f.name === (neutral === 3 ? 'e.bottom' : 'e.top'));
      assert.deepEqual(brep.faces.find(f => f.id === cap.id), cap, 'neutral cap record is exact');
      for (const edge of original.edges.filter(e => e.curve.controlPoints.every(p => p[2] === neutral))) assert.deepEqual(brep.edges.find(e => e.id === edge.id), edge);
      for (const vertex of original.vertices.filter(v => v.point[2] === neutral)) assert.deepEqual(brep.vertices.find(v => v.id === vertex.id), vertex);
    } else {
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
      assert.deepEqual(reevaluate(source, { document: input }).outputs[0].brep, brep);
      const reversed = structuredClone(input); reversed.features.at(-1).faces.reverse(); assert.deepEqual(evaluateCadPart(reversed).outputs[0].brep, brep);
    }
  }
});

test('default signed neutral caps, tagged original circle and parameter re-evaluation keep the original recipe', () => {
  for (const pull of ['z', '-z']) {
    const input = doc(10, pull); delete input.features.at(-1).neutral;
    const explicit = structuredClone(input); explicit.features.at(-1).neutral = pull === 'z' ? 3 : 23;
    assert.deepEqual(evaluateCadPart(input).outputs[0].brep, evaluateCadPart(explicit).outputs[0].brep);
  }
  const input = doc(); input.parameters.N = 11; input.features.at(-1).neutral = { parameter: 'N' };
  input.features[0].sideTags = { outer: ['round'] }; input.features.at(-1).faces = ['e.side[round]#1', 'e.side[round]#2'];
  const first = evaluateCadPart(input), second = reevaluate(first, { parameters: { N: 3 } });
  close(massPropertiesOf(second.outputs[0]).volume, reference(10, 'z', 3).volume, 'changed neutral parameter', 1e-7);
  assert.deepEqual(ownership(first.outputs[0].brep), ownership(second.outputs[0].brep));
  const changed = structuredClone(input); changed.features.at(-1).angle = -10;
  close(massPropertiesOf(reevaluate(first, { document: changed }).outputs[0]).volume, reference(-10, 'z', 11).volume, 'changed angle sign', 1e-7);
});

test('circular Draft refuses partial selections, wrong pull/neutral, collapse, nonmoving edits and native range overflow', () => {
  for (const faces of [[halves[0]], ['e.side0'], [halves[0], halves[0]], [halves[0], 'e.top']]) {
    const input = doc(); input.features.at(-1).faces = faces;
    assert.throws(() => evaluateCadPart(input), e => e.code === 'CAPABILITY' && /both distinct original native halves/.test(e.message));
  }
  for (const neutral of [2, 24]) assert.throws(() => evaluateCadPart(doc(10, 'z', neutral)), e => e.code === 'SELECTION' && /within the original caps/.test(e.message));
  assert.throws(() => evaluateCadPart(doc(10, 'x')), e => e.code === 'SELECTION' && /world Z/.test(e.message));
  for (const angle of [Math.atan(10 / 12) * 180 / Math.PI, 44]) assert.throws(() => evaluateCadPart(doc(angle)), e => e.code === 'GEOMETRY' && /cylinder axis/.test(e.message));
  assert.doesNotThrow(() => evaluateCadPart(doc(-44)), 'outward lower radius remains positive at this interior neutral');
  assert.throws(() => evaluateCadPart(doc(1e-15)), e => e.code === 'GEOMETRY' && /too small to move/.test(e.message));
  const range = doc(-10, 'z', 3); range.features[0].center = [9990, 0]; range.features[0].radius = 9;
  assert.throws(() => evaluateCadPart(range), e => e.code === 'GEOMETRY' && /modeling range/.test(e.message));
  for (const angle of [0, 45, NaN]) assert.throws(() => evaluateCadPart(doc(angle)), e => e.code === 'INPUT');
});

test('the native cylindrical Draft producer does not admit annular, conical or box stock, and cone Offset stays refused', () => {
  const input = doc(), source = evaluateCadPart({ ...input, features: input.features.slice(0, 2) }).outputs[0].brep;
  const cone = evaluateCadPart(input).outputs[0].brep;
  assert.equal(draftCircularWallIfAdmitted(cone, halves, .1, 'z', 11), undefined);
  assert.equal(circularWallOffsetFrame(cone, halves[0]), undefined, 'no nonzero cone Offset admission');
  assert.equal(draftCircularWallIfAdmitted(source, [halves[0]], .1, 'z', 11), undefined);
  const annular = structuredClone(input); annular.features.pop(); annular.features[0].holes = [[{ kind: 'arc', start: [15, -7], center: [12, -7], direction: 'ccw' }]];
  assert.equal(draftCircularWallIfAdmitted(evaluateCadPart(annular).outputs[0].brep, halves, .1, 'z', 11), undefined);
  const box = { ...input, features: [{ id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }, { id: 'e', kind: 'extrude', sketch: 's', height: 20 }] };
  assert.equal(draftCircularWallIfAdmitted(evaluateCadPart(box).outputs[0].brep, ['e.side0', 'e.side1'], .1, 'z', 0), undefined);
  for (const feature of [{ id: 'm', kind: 'translate', target: 'e', offset: [1, 2, 3] }, { id: 'm', kind: 'rotate', target: 'e', axis: 'z', angle: 10 }]) {
    const moved = doc(); moved.features.splice(2, 0, feature); moved.features.at(-1).target = 'm';
    delete moved.features.at(-1).neutral; // Exercise the legacy stock refusal rather than its prior interior-neutral refusal.
    assert.throws(() => evaluateCadPart(moved), e => e.code === 'CAPABILITY' && /meet along an edge/.test(e.message));
  }
});

test('legacy planar and four-side Draft native bytes remain unchanged', () => {
  const stock = [{ id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }, { id: 'e', kind: 'extrude', sketch: 's', height: 20 }];
  for (const [feature, hash] of [
    [{ id: 'd', kind: 'draft', target: 'e', faces: ['e.side1'], angle: 10 }, 'a94a879a8d27766a1b347a4a97438db3a7ca5aba6e68f2496f64930c34d42f11'],
    [{ id: 'd', kind: 'draft', target: 'e', faces: ['e.side0', 'e.side1', 'e.side2', 'e.side3'], angle: 10, neutral: 11 }, 'f34ecc77d15959f2b180cde09139c20ce952a301bcd4381fb3bb5bfc4d9024c6'],
  ]) {
    const output = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [...stock, feature] }).outputs[0];
    assert.equal(createHash('sha256').update(JSON.stringify(output.brep)).digest('hex'), hash);
  }
});

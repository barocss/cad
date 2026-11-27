import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, evaluateCadPart, massPropertiesOf, tessellateBrep } from '../dist/index.js';
import { documentOf } from '../scripts/rb/fuzz-gen.mjs';
import { openEdgesByBody } from '../scripts/rb/stages.mjs';

const cutCylinder = {
  op: 'difference',
  a: { leaf: { kind: 'cyl', r: 4, h: 1, rot: [{ axis: 'x', deg: 180 }], move: [3, 1, -1] } },
  b: { leaf: { kind: 'sphere', r: 4, rot: [{ axis: 'z', deg: 90 }], move: [0, 3, 0] } },
};
const addedSphere = { leaf: { kind: 'sphere', r: 3, rot: [], move: [-1, -3, -2] } };

test('a sphere with a trimmed hole tessellates in both RB 20261024:125@r.b Union orders', () => {
  const measured = [];
  for (const [a, b] of [[cutCylinder, addedSphere], [addedSphere, cutCylinder]]) {
    const { document, root } = documentOf({ op: 'union', a, b });
    const output = evaluateCadPart(document).outputs.find(body => body.id === root);
    const report = checkBrep(output.brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.equal(report.counts.bodies, 1);
    assert.equal(report.counts.shells, 1);
    assert.equal(report.counts.faces, 6);
    assert.equal(report.counts.loops, 7);
    for (const segmentsPerQuarter of [4, 8, 16]) {
      const mesh = tessellateBrep(output.brep, { segmentsPerQuarter });
      assert.equal(openEdgesByBody(output.brep, mesh), 0, `edge use at quality ${segmentsPerQuarter}`);
    }
    const mass = massPropertiesOf(output);
    assert.equal(mass.method, 'quadrature');
    // Independent integration of the cylinder outside both sphere sections, plus 36π.
    assert.ok(Math.abs(mass.volume - 140.7123325734261) < 1e-6, String(mass.volume));
    measured.push(mass);
  }
  assert.ok(Math.abs(measured[0].volume - measured[1].volume) < 1e-8);
  measured[0].centroid.forEach((value, axis) => assert.ok(Math.abs(value - measured[1].centroid[axis]) < 1e-8));
});

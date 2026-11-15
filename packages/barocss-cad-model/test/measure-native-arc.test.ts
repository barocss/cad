import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode, cylinderPart, rectanglePart } from '../src/engine/doc';
import { partBreps } from '../src/engine/evaluate';
import { bodyMesh } from '../src/engine/mesh';
import { ellipseShape } from '../src/sketch/ellipse';
import { profileOf } from '../src/sketch/loops';
import { measureItem } from '../src/app/measure';

test('native ellipse-outline arcs retain type and radius even with only one display chord', () => {
  const shape = ellipseShape({ center: [0,0], rx: 12, ry: 6, angle: 0 });
  const profile = profileOf([{ ...shape, ids: shape.points.map((_, i) => `e${i}`) }]); assert.ok('node' in profile);
  const doc = withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 6 });
  const [{ brep }] = partBreps(doc), before = JSON.stringify(doc);
  let single = 0;
  for (const quality of [1, 8, 16]) {
    const mesh = bodyMesh(brep, quality, quality);
    const arcs = mesh.edges.filter(e => e.nativeCircle); assert.ok(arcs.length);
    for (const edge of arcs) {
      const item = measureItem(mesh, { body: 0, edge: edge.index });
      assert.equal(item.label, 'Arc'); assert.equal(item.radius, edge.nativeCircle!.radius);
      const count = Array.from(mesh.edgeOfSegment).filter(i => i === edge.index).length / 2;
      if (count === 1) { single++; assert.equal(item.length, undefined); }
    }
  }
  assert.ok(single > 0); assert.equal(JSON.stringify(doc), before);
});
test('full circular rims and legacy sample fitting keep their lengths; ambiguous chords omit length', () => {
  const [{ brep }] = partBreps(cylinderPart(5, 10)), mesh = bodyMesh(brep, 1, 8);
  const edge = mesh.edges.find(e => e.nativeCircle)!; assert.ok(edge);
  const pick = { body: 0, edge: edge.index }, item = measureItem(mesh, pick);
  assert.equal(item.label, 'Arc'); assert.ok(Math.abs(item.length! - 10 * Math.PI) < 1e-8);
  const legacy = { ...mesh, edges: mesh.edges.map(e => ({ ...e, nativeCircle: undefined })) };
  assert.equal(measureItem(legacy, pick).label, 'Arc');
  assert.ok(Math.abs(measureItem(legacy, pick).length! - item.length!) < 1e-7);
  const chord = { ...mesh, edgeLines: new Float64Array([...edge.a, ...edge.b]), edgeOfSegment: new Float32Array([edge.index, edge.index]) };
  assert.deepEqual(measureItem(chord, pick), { label: 'Arc', radius: edge.nativeCircle!.radius });
  const [{ brep: box }] = partBreps(rectanglePart(10, 10, 10));
  const straight = bodyMesh(box, 1, 8); assert.equal(measureItem(straight, { body: 0, edge: 0 }).label, 'Line');
});

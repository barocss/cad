import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglePart, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, evaluatePreview } from '@barocss/cad-model/engine/evaluate';
import { nextSerial } from '@barocss/cad-model/engine/ids';
import { sectionSketch } from '../src/app/sectionSketch';
import { axisSection, exactBodies, sectionSplits } from '../src/viewport/sectionView';

function cut(doc: StudioDoc) {
  const source = evaluateDoc(doc, 1);
  assert.ok(source.ok);
  const split = sectionSplits(doc, source.bodies, axisSection({ axis: 'z', at: 5, keep: 'positive' }));
  const preview = evaluatePreview(split.doc, 2, 8, 'section');
  assert.ok(preview.ok);
  const exact = exactBodies(preview.bodies, split.kept, split.from);
  return { ...exact, sourceBodies: source.bodies };
}

test('All still copies a three-hole cap outside the selective range', () => {
  let doc = rectanglePart(40, 30, 10);
  for (const x of [8, 18, 28]) {
    doc = withNode(doc, { kind: 'hole', parent: { node: doc.nodes.length - 1, side: 'solid' }, axis: 'z', center: [x, 10], radius: 2 });
  }
  const section = cut(doc);
  const result = sectionSketch(section, nextSerial(doc), 'all');
  assert.ok('shapes' in result);
  assert.equal(result.shapes.length, 4);
  assert.equal(result.shapes.filter(shape => shape.kind === 'circle').length, 3);
  assert.ok('error' in sectionSketch(section, nextSerial(doc), 'inner'));
});

test('multi-body All copies both caps or refuses the whole draft', () => {
  let doc = rectanglePart(20, 20, 10);
  const sketch = doc.nodes.length;
  doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [30, 0], max: [40, 10] });
  doc = withNode(doc, { kind: 'extrude', sketch, height: 10 });
  const section = cut(doc);
  assert.equal(section.bodies.length, 2);
  const from = nextSerial(doc);
  const result = sectionSketch(section, from, 'all');
  assert.ok('shapes' in result);
  assert.equal(result.shapes.length, 2);
  assert.ok('error' in sectionSketch(section, from, 'outer'));

  const [first, second] = section.bodies;
  const unreadable = { ...second, mesh: { ...second.mesh, indices: new Uint32Array() } };
  assert.ok('error' in sectionSketch({ ...section, bodies: [first, unreadable] }, from, 'all'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';
import { sketchMarks } from '../src/ui/SketchMarks';
import type { Polygon } from '@barocss/cad-model/sketch/rules';

// Renderer-only fixtures: these test display ownership, not solver admission.
const shape: Polygon = { kind: 'polygon', closed: true,
  points: [[0, 0], [20, 0], [20, 20], [0, 20]],
  rules: [{ kind: 'parallel', a: 0, b: 2 }, { kind: 'perpendicular', a: 0, b: 1 },
    { kind: 'equal', a: 1, b: 3 }, { kind: 'fix', point: 1, at: [20, 0] },
    { kind: 'coincident', point: 2, arc: 0 }] };
function elements(nodes: ReactNode) {
  return Children.toArray(nodes).filter(isValidElement<Record<string, unknown>>);
}
function render(input: Polygon, scale = 5) {
  const project = (x: number, y: number): [number, number] => [180 + scale * x, 180 + scale * y];
  const marks = sketchMarks({ shape: input, project,
    outlinePath: i => [project(...input.points[i]), project(...input.points[(i + 1) % input.points.length])],
    view: { width: 900, height: 700 }, outlineLabels: [], referenceAnchors: new Map(),
    picked: [], hover: null, editDim: null,
    onDimClick: () => assert.fail('display invoked onDimClick'),
    onDimEdit: () => assert.fail('display invoked onDimEdit'),
    onDimCommit: () => assert.fail('display invoked onDimCommit') });
  const glyphs = elements(marks.svg).filter(e => e.props.className === 'cons-glyph').map(e => {
    const children = elements(e.props.children as ReactNode);
    return { title: children.find(c => c.type === 'title')!.props.children,
      text: children.find(c => c.type === 'text')!.props.children,
      rect: children.find(c => c.type === 'rect')!.props };
  });
  const leaders = elements(marks.under).filter(e => e.props.className === 'cons-leader').map(e => e.props);
  return { glyphs, leaders };
}

test('all five supported glyph families preserve each relation and both participating edges', () => {
  const before = structuredClone(shape), result = render(shape);
  assert.deepEqual(result.glyphs.map(g => [g.title, g.text]), [
    ['Parallel edges 1 and 3', '∥'], ['Parallel edges 1 and 3', '∥'],
    ['Perpendicular edges 1 and 2', '⊥'], ['Perpendicular edges 1 and 2', '⊥'],
    ['Equal edges 2 and 4', '='], ['Equal edges 2 and 4', '='],
    ['Point 2 fixed', '⚓'], ['Point 3 on the centre of arc 1', '◎'],
  ]);
  assert.deepEqual(render(shape), result, 'same projection is deterministic');
  assert.deepEqual(shape, before, 'display must not rewrite source geometry or relations');
});

test('zoom recomputes glyphs while moved leaders retain their original point or edge targets', () => {
  const before = structuredClone(shape), result = render(shape, 0.2);
  assert.equal(result.glyphs.length, 8);
  assert.ok(result.leaders.length > 0, 'dense fixture exercises displaced glyphs');
  const targets = [[182, 180], [182, 184], [184, 182], [180, 182], [184, 180], [184, 184]];
  for (const leader of result.leaders) assert.ok(targets.some(([x, y]) => leader.x1 === x && leader.y1 === y));
  assert.notDeepEqual(result.glyphs.map(g => g.rect), render(shape).glyphs.map(g => g.rect));
  assert.deepEqual(shape, before);
});

test('same rule index in a different sketch does not retain old title, glyph or leader ownership', () => {
  const first = render(shape, 0.2);
  const replacement: Polygon = { ...shape, rules: [{ kind: 'fix', point: 3, at: [0, 20] }] };
  const next = render(replacement);
  assert.deepEqual(next.glyphs.map(g => [g.title, g.text]), [['Point 4 fixed', '⚓']]);
  assert.deepEqual(next.leaders, []);
  assert.deepEqual(render({ ...shape, rules: [] }), { glyphs: [], leaders: [] });
  assert.deepEqual(render(shape, 0.2), first, 'returning to the first sketch recalculates its own marks');
});

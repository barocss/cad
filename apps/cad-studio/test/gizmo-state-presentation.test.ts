import test from 'node:test';
import assert from 'node:assert/strict';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { gizmoMarks } from '../src/viewport/GizmoMarks';
import { layout, hitTest, type Axis3, type FeatureHandle, type GizmoHit, type Projector, type TransformGizmo } from '../src/viewport/gizmo';

type Element = ReactElement<Record<string, unknown>>;
type Drag = NonNullable<Parameters<typeof gizmoMarks>[5]>;
const P: Projector = { project: p => [300 + (p[0] - p[1]) * 7, 300 + (p[0] + p[1]) * 4 - p[2] * 8], forward: [-.6, -.6, -.5], size: 10 };
const g: TransformGizmo = { origin: [0, 0, 0], move: [0, 1, 2], turn: [0, 1, 2], scale: true };
function elements(nodes: ReactNode): Element[] {
  return Children.toArray(nodes).flatMap(n => isValidElement<Record<string, unknown>>(n) ? [n] : []);
}
function descendants(node: Element): Element[] {
  return elements(node.props.children as ReactNode).flatMap(n => [n, ...descendants(n)]);
}
function marks(hot: GizmoHit | null = null, drag: Drag | null = null, model = g, projector = P) {
  return elements(gizmoMarks(model, [], projector, hot, null, drag));
}
function named(nodes: Element[], id: string): Element {
  const found = nodes.filter(n => n.props['data-gizmo'] === id); assert.equal(found.length, 1, id); return found[0];
}
function polygons(node: Element) { return descendants(node).filter(n => n.type === 'polygon'); }
function html(nodes: ReactNode) { return renderToStaticMarkup(createElement('svg', null, nodes)); }
function points(node: Element): number[][] {
  assert.equal(typeof node.props.points, 'string');
  return (node.props.points as string).split(' ').map(p => p.split(',').map(Number));
}
function outline(node: Element): Element {
  return node.type === 'g' ? descendants(node).find(n => n.type === 'line' || n.type === 'polyline')! : node;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('real transform elements distinguish idle, hover and drag while preserving geometry', () => {
  const cases: [string, GizmoHit][] = [
    ['moveX', { kind: 'move', axis: 0 }], ['planeXY', { kind: 'plane', axes: [0, 1] }],
    ['scaleX', { kind: 'scale', axis: 0 }], ['scale', { kind: 'scale', axis: null }],
    ['turnX', { kind: 'turn', axis: 0 }],
  ];
  for (const [id, hit] of cases) {
    const idle = named(marks(), id), hover = named(marks(hit), id), active = named(marks(null, { hit, degrees: 0 }), id);
    assert.equal(idle.props['data-active'], false); assert.equal(idle.props['data-dragging'], false);
    assert.equal(hover.props['data-active'], true); assert.equal(hover.props['data-dragging'], false);
    assert.equal(active.props['data-active'], true); assert.equal(active.props['data-dragging'], true);
    assert.ok(Number(outline(active).props.strokeWidth) > Number(outline(hover).props.strokeWidth), id);
    assert.equal(outline(active).props.stroke, '#ffffff');
    const geometry = (n: Element) => [n, ...descendants(n)].map(e => Object.fromEntries(['points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height'].filter(k => k in e.props).map(k => [k, e.props[k]])));
    assert.deepEqual(geometry(active), geometry(hover)); assert.deepEqual(geometry(hover), geometry(idle));
    assert.doesNotMatch(html([idle, hover, active]), /NaN|Infinity/);
  }
});

test('turn arrow requires the matching active transform and finite nonzero signed degrees', () => {
  for (const axis of [0, 1, 2] as const) {
    const id = 'turn' + 'XYZ'[axis], hit: GizmoHit = { kind: 'turn', axis };
    assert.equal(polygons(named(marks(), id)).length, 0);
    assert.equal(polygons(named(marks(hit), id)).length, 0, 'hover is not a drag');
    for (const degrees of [undefined, 0, -0, NaN, Infinity, -Infinity])
      assert.equal(polygons(named(marks(hit, { hit, degrees }), id)).length, 0);
    for (const degrees of [15, -15]) {
      const rendered = marks(null, { hit, degrees });
      assert.equal(rendered.filter(n => n.props.className === 'gizmo-arc').flatMap(polygons).length, 1);
      assert.equal(polygons(named(rendered, id)).length, 1);
    }
    const other: Axis3 = ((axis + 1) % 3) as Axis3;
    assert.equal(polygons(named(marks(hit, { hit: { kind: 'turn', axis: other }, degrees: 15 }), id)).length, 0);
    for (const wrong of [{ kind: 'move', axis }, { kind: 'scale', axis }, { kind: 'handle', index: 0 }] as GizmoHit[])
      assert.equal(marks(hit, { hit: wrong, degrees: 15 }).filter(n => n.props.className === 'gizmo-arc').flatMap(polygons).length, 0);
  }
  const onlyX: TransformGizmo = { origin: [0, 0, 0], turn: [0] };
  assert.equal(marks(null, { hit: { kind: 'turn', axis: 2 }, degrees: 30 }, onlyX).flatMap(polygons).length, 0, 'stale absent axis cannot draw a turn arrow');
});

// Orthographic projectors derived from forward vectors, not a fixed screen-clockwise assumption.
function camera(signs: [number, number, number]): Projector {
  const f = signs.map(x => x / Math.sqrt(3));
  const right = [f[1], -f[0], 0].map(x => x / Math.hypot(f[0], f[1]));
  const up = [right[1] * f[2], -right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
  return { forward: [f[0], f[1], f[2]], size: 10, project: p => [300 + p.reduce((s, x, k) => s + x * right[k], 0) * 8, 300 - p.reduce((s, x, k) => s + x * up[k], 0) * 8] };
}
test('signed turn tips follow cyclic native axes across all eight camera octants', () => {
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const projector = camera([x, y, z]);
    for (const axis of [0, 1, 2] as const) for (const degrees of [-30, 30]) {
      const arc = layout(g, projector).arcs.find(a => a.axis === axis)!;
      // Increasing parameter has right-handed sign su*sv for the cyclic plane basis.
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const increasing = degrees * (projector.forward[u] > 0 ? -1 : 1) * (projector.forward[v] > 0 ? -1 : 1) > 0;
      const end = arc.points[increasing ? arc.points.length - 1 : 0], previous = arc.points[increasing ? arc.points.length - 3 : 2];
      const rendered = named(marks(null, { hit: { kind: 'turn', axis }, degrees }, g, projector), 'turn' + 'XYZ'[axis]);
      const arrows = polygons(rendered); assert.equal(arrows.length, 1);
      const polygon = points(arrows[0]), tip = polygon[0], base = polygon[2];
      assert.ok(Math.abs(tip[0] - end[0]) <= .051 && Math.abs(tip[1] - end[1]) <= .051, 'serialized tip matches correct end');
      assert.ok((tip[0] - base[0]) * (end[0] - previous[0]) + (tip[1] - base[1]) * (end[1] - previous[1]) > 0, 'arrow points along the signed arc tangent');
    }
  }
});

test('collapsed and edge-on projections suppress rotation direction rather than inventing one', () => {
  const projectors: Projector[] = [
    { ...P, size: 0 }, { ...P, project: () => [300, 300] },
    { ...P, forward: [0, 0, -1], project: p => [300 + p[0] * 8, 300 - p[1] * 8] },
  ];
  for (const projector of projectors) {
    const model: TransformGizmo = { origin: [0, 0, 0], move: [0, 1, 2], turn: [0] };
    const rendered = marks(null, { hit: { kind: 'turn', axis: 0 }, degrees: 15 }, model, projector);
    assert.equal(polygons(named(rendered, 'turnX')).length, 0);
    assert.doesNotMatch(html(rendered), /NaN|Infinity/);
  }
  for (const bad of [NaN, Infinity, -Infinity]) {
    const projector: Projector = { ...P, forward: [bad, -.6, -.5] };
    assert.equal(marks(null, { hit: { kind: 'turn', axis: 0 }, degrees: 15 }, g, projector).filter(n => n.props.className === 'gizmo-arc').flatMap(polygons).length, 0);
  }
});

test('feature linear, angular and plane handles and readout ignore transform drag presentation', () => {
  const base: FeatureHandle = { id: 'linear', at: [0, 0, 0], dir: [1, 0, 0], label: 'Synthetic length', value: 12, toValue: (start, mm) => start + mm, format: String, onDrag: () => undefined };
  const handles: FeatureHandle[] = [base, { ...base, id: 'angular', value: 30, arc: { centre: [0, 0, 0], axis: [0, 0, 1], from: [10, 0, 0] } }, { ...base, id: 'plane', plane: { dir2: [0, 1, 0], value2: 3, toValue2: (start, mm) => start + mm } }];
  freeze(handles); freeze(g); freeze(P);
  const before = JSON.stringify(handles), readout: { at: [number, number]; text: string } = { at: [20, 30], text: '15°' };
  for (const hot of [null, { kind: 'handle', index: 0 }, { kind: 'handle', index: 1 }, { kind: 'handle', index: 2 }] as (GizmoHit | null)[]) {
    const select = (drag: Drag | null) => elements(gizmoMarks(g, handles, P, hot, readout, drag)).filter(n => n.props['data-handle'] || n.props.className === 'gizmo-readout');
    const idle = select(null); assert.equal(idle.length, 4);
    assert.equal(html(select({ hit: { kind: 'turn', axis: 0 }, degrees: -15 })), html(idle));
    assert.equal(html(select({ hit: { kind: 'handle', index: 1 }, degrees: 15 })), html(idle));
    assert.equal(polygons(idle.find(n => n.props['data-handle'] === 'angular')!).length, 1, 'feature angular arrow remains visible');
  }
  assert.equal(JSON.stringify(handles), before);
});

test('presentation state does not move move-axis hit locations or make origin selectable', () => {
  const model: TransformGizmo = { origin: [0, 0, 0], move: [0, 1, 2], turn: [0, 1, 2] };
  for (const arrow of layout(model, P).arrows) {
    const hit: GizmoHit = { kind: 'move', axis: arrow.axis };
    assert.deepEqual(hitTest(arrow.to, model, [], P), hit);
    const id = 'move' + 'XYZ'[arrow.axis];
    const idle = polygons(named(marks(null, null, model), id))[0].props.points;
    assert.equal(polygons(named(marks(hit, { hit }, model), id))[0].props.points, idle);
  }
  assert.equal(hitTest(P.project(model.origin), model, [], P), null);
});

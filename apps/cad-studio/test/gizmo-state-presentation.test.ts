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

// Opacity is a presentation attribute, separate from per-stroke opacity and hit geometry.
const effectiveOpacity = (node: Element) => node.props.opacity === undefined ? 1 : Number(node.props.opacity);
function scaleConnector(nodes: Element[], axis: Axis3): Element {
  const at = layout(g, P).cubes.find(c => c.axis === axis)!.at;
  const found = nodes.filter(n => n.type === 'line' && n.props.strokeDasharray === '3 3' && n.props.x2 === at[0] && n.props.y2 === at[1]);
  assert.equal(found.length, 1); return found[0];
}
test('only a represented transform drag dims inactive arrows, planes, arcs, cubes and connectors', () => {
  const cases: [string, GizmoHit][] = [
    ...([0, 1, 2] as const).flatMap(axis => [
      ['move' + 'XYZ'[axis], { kind: 'move', axis }],
      ['turn' + 'XYZ'[axis], { kind: 'turn', axis }],
      ['scale' + 'XYZ'[axis], { kind: 'scale', axis }],
    ] as [string, GizmoHit][]),
    ['scale', { kind: 'scale', axis: null }],
    ['planeXY', { kind: 'plane', axes: [0, 1] }],
    ['planeYZ', { kind: 'plane', axes: [1, 2] }],
    ['planeXZ', { kind: 'plane', axes: [0, 2] }],
  ];
  const idle = marks(); assert.equal(idle.filter(n => n.props['data-gizmo']).length, cases.length);
  for (const [activeId, hit] of cases) {
    const hovered = marks(hit), dragging = marks(null, { hit, degrees: 0 });
    for (const [id] of cases) {
      const base = named(idle, id), hover = named(hovered, id), active = named(dragging, id);
      assert.equal(effectiveOpacity(base), 1, id + ' idle');
      assert.equal(effectiveOpacity(hover), 1, id + ' hover alone does not dim');
      assert.equal(effectiveOpacity(active), id === activeId ? 1 : .65, id + ' while dragging ' + activeId);
      if (id !== activeId) {
        assert.equal(outline(active).props.strokeWidth, outline(base).props.strokeWidth, 'dimming does not change inactive width');
        assert.equal(active.props['data-dragging'], false);
      } else {
        assert.ok(Number(outline(active).props.strokeWidth) > Number(outline(hover).props.strokeWidth), 'active outline remains stronger than hover');
      }
    }
    for (const axis of [0, 1, 2] as const) {
      const base = scaleConnector(idle, axis), hover = scaleConnector(hovered, axis), line = scaleConnector(dragging, axis);
      const selected = hit.kind === 'scale' && hit.axis === axis;
      assert.equal(effectiveOpacity(base), 1); assert.equal(effectiveOpacity(hover), 1);
      assert.equal(effectiveOpacity(line), selected ? 1 : .65);
      assert.equal(line.props.strokeWidth, selected ? 3 : base.props.strokeWidth);
      assert.deepEqual([line.props.x1, line.props.y1, line.props.x2, line.props.y2], [base.props.x1, base.props.y1, base.props.x2, base.props.y2]);
    }
    assert.equal(html(marks()), html(idle), 'ending/cancelling the presentation restores exact idle markup');
  }
});

test('absent or feature drag targets never dim all transforms; origin is not dimmed', () => {
  const model: TransformGizmo = { origin: [0, 0, 0], move: [0], turn: [0] };
  const idle = marks(null, null, model);
  for (const hit of [
    { kind: 'move', axis: 1 }, { kind: 'turn', axis: 2 },
    { kind: 'scale', axis: null }, { kind: 'plane', axes: [0, 1] }, { kind: 'handle', index: 0 },
  ] as GizmoHit[]) assert.equal(html(marks(null, { hit, degrees: 15 }, model)), html(idle), 'unrepresented target does not activate dimming');
  const collapsed: Projector = { ...P, project: () => [300, 300] };
  const projectedOut = marks(null, { hit: { kind: 'move', axis: 0 } }, model, collapsed);
  assert.equal(html(projectedOut), html(marks(null, null, model, collapsed)), 'projected-out move is not represented');
  const origin = (nodes: Element[]) => nodes.filter(n => n.props['aria-hidden'] === 'true');
  assert.equal(origin(idle).length, 1);
  assert.equal(html(origin(marks(null, { hit: { kind: 'move', axis: 0 } }, model))), html(origin(idle)));
  assert.equal(effectiveOpacity(origin(idle)[0]), 1);
  // Feature subtrees and readout are covered by the earlier exact-markup invariance test.
});

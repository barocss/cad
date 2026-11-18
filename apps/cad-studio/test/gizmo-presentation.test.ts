import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { gizmoMarks } from '../src/viewport/GizmoMarks';
import { hitTest, layout, type GizmoHit, type Projector, type TransformGizmo } from '../src/viewport/gizmo';
const P: Projector = { project: p => [300 + (p[0] - p[1]) * 7, 300 + (p[0] + p[1]) * 4 - p[2] * 8], forward: [-0.6,-0.6,-0.5], size: 10 };
const g: TransformGizmo = { origin: [0,0,0], move: [0,1,2], turn: [0,1,2] };
const markup = (hot: GizmoHit | null) => renderToStaticMarkup(createElement('svg', null, gizmoMarks(g, [], P, hot, null)));
test('gizmo presentation labels all visible axes without relying on color', () => {
 const html=markup(null);
 for (const axis of 'XYZ') assert.match(html,new RegExp(`class="gizmo-axis-label"[^>]*>${axis}</text>`));
 assert.equal((html.match(/class="gizmo-axis-label"/g)||[]).length,3);
 assert.doesNotMatch(html,/NaN|Infinity|tabindex|role="button"/);
});
test('gizmo presentation hover changes emphasis but not arrow geometry or hit locations', () => {
 const idle=markup(null), hot=markup({kind:'move',axis:0});
 assert.deepEqual([...idle.matchAll(/points="([^"]+)"/g)].map(m=>m[1]),[...hot.matchAll(/points="([^"]+)"/g)].map(m=>m[1]));
 assert.match(hot,/data-active="true" data-gizmo="moveX"/);
 for (const arrow of layout(g,P).arrows) assert.deepEqual(hitTest(arrow.to,g,[],P),{kind:'move',axis:arrow.axis});
 assert.equal(hitTest(P.project(g.origin),g,[],P),null,'origin stays a non-interactive reference');
});

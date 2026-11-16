import test from 'node:test';
import assert from 'node:assert/strict';
import type { RenderLight } from '@barocss/cad-model/engine/render';
import { pointShadowConflict, shadowRadiusHint } from '../src/ui/renderShadowHint';
const point = (castShadow = false): RenderLight => ({ kind: 'point', position: [0,0,80], color: '#ffffff', intensity: 1, range: 0, castShadow });
test('Point conflict uses actual list labels and only the first eight Point lights', () => {
 const sun: RenderLight = { kind: 'directional', direction: [0,0,-1], color: '#ffffff', intensity: 1, castShadow: true };
 assert.equal(pointShadowConflict([sun, sun, point(true), point()], 3), 'Point 3 already casts shadows. Turn off Shadow on Point 3, then enable Shadow on Point 4.');
 assert.equal(pointShadowConflict([point(true), point()], 0), null);
 assert.equal(pointShadowConflict([point(), point()], 1), null);
 assert.equal(pointShadowConflict([point(true), ...Array.from({ length: 8 }, () => point())], 8), null);
});
test('Radius help distinguishes default, saved zero and saved positive radius', () => {
 const p = point(); assert.ok(p.kind === 'point');
 assert.match(shadowRadiusHint(p), /default radius \(0 mm\)/);
 assert.match(shadowRadiusHint({ ...p, shadowRadius: 0 }), /Saved radius 0 mm/);
 assert.match(shadowRadiusHint({ ...p, shadowRadius: 2 }), /Saved radius 2 mm/);
 assert.match(shadowRadiusHint({ ...p, castShadow: true }), /larger radius softens/);
});

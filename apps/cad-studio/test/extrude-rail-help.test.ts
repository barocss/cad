import test from 'node:test';
import assert from 'node:assert/strict';
import { cylinderPart, emptyDoc, rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { Ctx, Selection } from '@barocss/cad-model/app/commands';
import { extrudeRailHelp } from '../src/app/extrudeRailHelp';
const selection: Selection = { faces: [], edges: [], bodies: [] };
const sketch = rectanglePart(10, 10, 5).nodes[0];
const doc = withNode(withNode(emptyDoc(), sketch), sketch);
const context = (pick: Selection = selection): Ctx => ({ doc, selection: pick, bodies: [] });
test('default latest unused and explicit older sketch identify the actual target without editing selection', () => {
  const ctx = context(), before = structuredClone(ctx);
  assert.match(extrudeRailHelp(ctx, true).description, /Default target: Sketch 2 .*latest unused sketch/);
  assert.match(extrudeRailHelp(context({ ...selection, sketches: [0] }), true).description, /Target: Sketch 1 .*selected/);
  assert.match(extrudeRailHelp(ctx, true).description, /Browser/);
  assert.deepEqual(ctx, before);
});
test('multiple selection, no profiles and stale model expose reasons instead of an invented target', () => {
  for (const ctx of [context({ ...selection, sketches: [0, 1] }), { ...context(), doc: emptyDoc() }]) {
    const help = extrudeRailHelp(ctx, true); assert.equal(help.ok, false); assert.ok(help.reason); assert.doesNotMatch(help.description, /Default target/);
  }
  assert.equal(extrudeRailHelp(context(), false).ok, false);
  assert.match(extrudeRailHelp(context(), false).reason, /current Model/);
});
test('native selected planar face uses the face path, while curved face refusal is retained', () => {
  const solid = rectanglePart(10, 10, 5), result = evaluateDoc(solid, 0); assert.ok(result.ok);
  const body = result.bodies[0], face = body.mesh.faces.findIndex(f => f.kind === 'plane'); assert.ok(face >= 0);
  const ctx = { doc: solid, bodies: result.bodies, selection: { ...selection, faces: [{ body: 0, face }] } };
  assert.equal(extrudeRailHelp(ctx, true).ok, true);
  assert.match(extrudeRailHelp(ctx, true).description, /selected planar face/);
  const cylinder = cylinderPart(5, 10), curved = evaluateDoc(cylinder, 0); assert.ok(curved.ok);
  const side = curved.bodies[0].mesh.faces.findIndex(f => f.kind !== 'plane'); assert.ok(side >= 0);
  const refused = extrudeRailHelp({ doc: cylinder, bodies: curved.bodies,
    selection: { ...selection, faces: [{ body: 0, face: side }] } }, true);
  assert.equal(refused.ok, false); assert.match(refused.reason, /curved/);
  assert.doesNotMatch(refused.description, /Target:/);
});

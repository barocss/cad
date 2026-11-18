import test from 'node:test';
import assert from 'node:assert/strict';
import { captureInspectionSignature, currentInspectionSignature, captureNamedInspection, copyInspectionCamera, sameInspectionCamera, type InspectionBody } from '../src/app/namedInspection';
const camera = () => ({ target: [1, 2, 3], distance: 10, yaw: 0.2, pitch: -0.4, fovY: 1, ortho: true });
function fixture() {
  const doc = {}, session = {}, m1 = {}, m2 = {};
  const bodies: InspectionBody[] = [{ key: 'b1', mesh: m1, hidden: false }, { key: 'b2', mesh: m2, hidden: true }];
  const signature = captureInspectionSignature(doc, session, bodies)!;
  return { doc, session, bodies, signature };
}
test('camera copies every field and exact equality does not tolerate drift', () => {
  const input = camera(), copy = copyInspectionCamera(input)!;
  assert.deepEqual(copy, input); assert.notEqual(copy.target, input.target);
  assert.equal(sameInspectionCamera(copy, input), true);
  for (const patch of [{ distance: 10.0000000001 }, { yaw: 0.3 }, { pitch: 0.1 }, { fovY: 1.1 }, { ortho: false }, { target: [1, 2, 3.0000000001] }]) assert.equal(sameInspectionCamera(copy, { ...input, ...patch }), false);
  input.target[0] = 100; assert.equal(copy.target[0], 1);
});
test('invalid camera fields fail closed without defaults or coercion', () => {
  for (const patch of [{ target: [1, 2] }, { target: [1, 2, 3, 4] }, { target: [1, NaN, 3] }, { target: Array(3) }, { distance: 0 }, { distance: -1 }, { distance: Infinity }, { yaw: NaN }, { pitch: Infinity }, { fovY: 0 }, { fovY: Math.PI }, { fovY: NaN }, { ortho: 1 }, { distance: '10' }]) assert.equal(copyInspectionCamera({ ...camera(), ...patch }), null);
  for (const bad of [null, undefined, {}, []]) { assert.equal(copyInspectionCamera(bad), null); assert.equal(sameInspectionCamera(bad, bad), false); }
});
test('signature owns copied records but exact document/session and mesh identities', () => {
  const { doc, session, bodies, signature } = fixture();
  assert.notEqual(signature.bodies, bodies); assert.notEqual(signature.bodies[0], bodies[0]);
  assert.equal(currentInspectionSignature(signature, doc, session, [...bodies].reverse()), true);
  assert.equal(currentInspectionSignature(signature, {}, session, bodies), false);
  assert.equal(currentInspectionSignature(signature, doc, {}, bodies), false);
  for (const changed of [[bodies[0]], [...bodies, { key: 'extra', mesh: {}, hidden: false }], [{ ...bodies[0], mesh: {} }, bodies[1]], [{ ...bodies[0], hidden: true }, bodies[1]], [{ ...bodies[0], key: 'renamed' }, bodies[1]], [{ ...bodies[0], mesh: bodies[1].mesh }, { ...bodies[1], mesh: bodies[0].mesh }]]) assert.equal(currentInspectionSignature(signature, doc, session, changed), false);
  bodies[0] = { ...bodies[0], hidden: true }; assert.equal(signature.bodies[0].hidden, false);
});
test('duplicate or invalid body keys cannot establish authority', () => {
  const { doc, session, bodies } = fixture();
  for (const changed of [[bodies[0], bodies[0]], [{ ...bodies[0], key: '' }], [{ ...bodies[0], key: '  ' }], [{ ...bodies[0], mesh: null as unknown as object }]]) assert.equal(captureInspectionSignature(doc, session, changed), null);
});
test('snapshot trims label and owns camera/visibility copies without editing input', () => {
  const f = fixture(), input = { id: 'view-1', name: '  Front inspection  ', camera: camera(), visibleKeys: ['b1'] };
  const before = JSON.stringify(input), result = captureNamedInspection(input, f.signature, f.doc, f.session, f.bodies)!;
  assert.deepEqual(result, { ...input, name: 'Front inspection' }); assert.equal(JSON.stringify(input), before);
  assert.notEqual(result.visibleKeys, input.visibleKeys); assert.notEqual(result.camera.target, input.camera.target);
  input.visibleKeys[0] = 'b2'; input.camera.target[0] = 99; assert.deepEqual(result.visibleKeys, ['b1']); assert.equal(result.camera.target[0], 1);
});
test('snapshot refuses empty/unknown/duplicate/hidden visibility and stale owner', () => {
  const f = fixture(), input = { id: 'v', name: 'Valid', camera: camera(), visibleKeys: ['b1'] };
  for (const patch of [{ id: '' }, { name: '  ' }, { name: 'x'.repeat(81) }, { visibleKeys: [] }, { visibleKeys: ['b2'] }, { visibleKeys: ['missing'] }, { visibleKeys: ['b1', 'b1'] }, { camera: { ...camera(), distance: 0 } }]) assert.equal(captureNamedInspection({ ...input, ...patch }, f.signature, f.doc, f.session, f.bodies), null);
  assert.ok(captureNamedInspection({ ...input, name: 'x'.repeat(80) }, f.signature, f.doc, f.session, f.bodies));
  assert.equal(captureNamedInspection(input, f.signature, {}, f.session, f.bodies), null);
  assert.equal(captureNamedInspection(input, f.signature, f.doc, {}, f.bodies), null);
  assert.equal(captureNamedInspection(input, f.signature, f.doc, f.session, [{ ...f.bodies[0], mesh: {} }, f.bodies[1]]), null);
});

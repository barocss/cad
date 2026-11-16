import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { deferMasses, evaluateDoc, forgetSnapshots, massOfRef } from '@barocss/cad-model/engine/evaluate';
import { nativeMassEnvelope, receiveNativeMass, receiveNativeMassPatch } from '@barocss/cad-model/engine/nativeMassWire';
import { type MassFields } from '../src/app/bodyResults';
import { createEvaluationEvidence } from '../src/state/evaluationEvidence';
let sequence = 1;
function fixture() {
  const doc = rectanglePart(17, 23, 5), source = { epoch: 1, requestId: sequence++, revision: 3, slot: 'evaluate' as const };
  forgetSnapshots(); deferMasses(true);
  try {
    const evaluated = evaluateDoc(doc, source.revision); assert.ok(evaluated.ok);
    const body = structuredClone(evaluated.bodies[0]); assert.ok(body.massRef !== undefined);
    assert.ok(receiveNativeMass(body, structuredClone(nativeMassEnvelope(source, body)), source));
    const fields: MassFields = { ...massOfRef(body.massRef)! };
    assert.ok(receiveNativeMassPatch(fields, body.massRef, structuredClone(nativeMassEnvelope(source, fields, body.massRef)), source));
    return { doc, result: { ...evaluated, bodies: [body] }, patches: new Map([[body.massRef, fields]]) };
  } finally { deferMasses(false); }
}
test('result handoff is single-use and preserves exact installed target and result identities', () => {
  const f = fixture(), evidence = createEvaluationEvidence(), target = { ...f.doc };
  evidence.stage(1, f.result); evidence.accept(1, target, 'candidate-key', f.result);
  const handoff = evidence.takeHandoff(); assert.equal(handoff?.target, target);
  assert.equal(handoff?.result, f.result); assert.equal(handoff?.key, 'candidate-key');
  assert.equal(evidence.takeHandoff(), null);
});
test('display-only cancellation restores accepted evidence with latest bodies, not a candidate result', () => {
  const f = fixture(), evidence = createEvaluationEvidence(), latest = [...f.result.bodies], target = { ...f.doc };
  evidence.remember('accepted', f.result); evidence.restoreAccepted(target, latest);
  const handoff = evidence.takeHandoff(); assert.equal(handoff?.target, target);
  assert.equal(handoff?.key, 'accepted'); assert.equal(handoff?.result.bodies, latest);
  assert.equal(evidence.accepted()?.result, f.result); assert.notEqual(handoff?.result, f.result);
});
for (const phase of ['before', 'after'] as const) {
  test(`authenticated deferred mass survives ${phase} document acceptance`, () => {
    const f = fixture(), evidence = createEvaluationEvidence(), target = { ...f.doc }, view = { ...target };
    evidence.stage(1, f.result);
    if (phase === 'before') evidence.patchMasses(f.patches);
    evidence.accept(1, target, 'next', f.result);
    const handoff = evidence.takeHandoff(); assert.ok(handoff);
    evidence.markInstalled(handoff.result, target, view);
    if (phase === 'after') {
      evidence.settle(target, view, view, f.result.bodies); // Pending mass must keep the bridge alive.
      evidence.patchMasses(f.patches);
    }
    assert.equal(handoff.result.bodies[0].massRef, undefined);
    assert.ok(Math.abs(handoff.result.bodies[0].volume! - 17 * 23 * 5) < 1e-9);
    evidence.settle(target, view, view, handoff.result.bodies);
  });
}
test('canceling an old request cannot discard newer candidate mass, while canceling its owner does', () => {
  const f = fixture(), evidence = createEvaluationEvidence(); evidence.stage(2, f.result);
  evidence.discardUninstalled(1); evidence.patchMasses(f.patches); assert.equal(f.result.bodies[0].massRef, undefined);
  const g = fixture(); evidence.stage(3, g.result); evidence.discardUninstalled(3); evidence.patchMasses(g.patches);
  assert.notEqual(g.result.bodies[0].massRef, undefined);
});
test('worker reset retires accepted cache, handoff and pending mass together', () => {
  const f = fixture(), evidence = createEvaluationEvidence();
  evidence.remember('same-content', f.result); evidence.stage(1, f.result); evidence.accept(1, f.doc, 'same-content', f.result);
  evidence.reset(); evidence.patchMasses(f.patches);
  assert.equal(evidence.accepted(), null); assert.equal(evidence.takeHandoff(), null);
  assert.notEqual(f.result.bodies[0].massRef, undefined);
});
test('a different installed document retires the mass bridge even when content matches', () => {
  const f = fixture(), evidence = createEvaluationEvidence(); evidence.stage(1, f.result); evidence.accept(1, f.doc, 'same-content', f.result);
  evidence.settle({ ...f.doc }, f.doc, f.doc, f.result.bodies); evidence.patchMasses(f.patches);
  assert.notEqual(f.result.bodies[0].massRef, undefined);
});

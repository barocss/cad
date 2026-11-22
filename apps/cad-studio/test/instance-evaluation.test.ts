import test from 'node:test';
import assert from 'node:assert/strict';
import { cylinderPart, starterDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Op } from '@barocss/cad-model/engine/schema/proposals';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { instanceEvaluationSources, placedProposalPreview } from '../src/viewport/instanceEvaluation';

function fixture() {
  const part = cylinderPart(4, 20);
  const before: StudioDoc = {
    ...starterDoc(),
    instances: [{ id: 'pin', name: 'Pin', position: [32, 16, 8], rotation: [0, 0, 0], doc: part }],
    mates: [{ id: 'm2', kind: 'distance', a: { part: 'base', face: 'n1.top' }, b: { part: 'pin', face: 'n1.bottom' }, distance: 0 }],
  };
  const [pin] = before.instances!, [mate] = before.mates!;
  const after: StudioDoc = { ...before, instances: [{ ...pin, position: [32, 16, 11] }], mates: [{ ...mate, distance: 3 }] };
  const ops = [{ tool: 'edit_mate', args: { id: 'm2', distance: 3 } }];
  return { before, after, pin, mate, ops };
}

test('one Distance mate produces candidate bodies at the solved translation only', async () => {
  const { before, after, pin, ops } = fixture();
  const source = instanceEvaluationSources(before).get(pin.id);
  assert.ok(source?.ok);
  const bodies = [{ volume: 320 * Math.PI }] as BodyResult[];
  const accepted = new Map([[pin.id, { inst: pin, sourceKey: source.key, bodies }]]);
  const candidate = await placedProposalPreview(before, after, accepted, async (instance, _part, parent) => {
    assert.equal(instance, after.instances![0]);
    assert.equal(parent, after);
    assert.deepEqual(instance.position, [32, 16, 11]);
    return { ok: true, bodies: [...bodies] } as EvalResult;
  }, ops);
  assert.equal(candidate?.kind, 'ready');
  assert.equal(candidate.volumeChange, 0);
  assert.deepEqual(candidate.distanceMate, { occurrence: 'pin', before: 0, after: 3 });
  assert.notEqual(candidate.bodies.get('pin'), bodies);
  assert.equal(accepted.get('pin')?.bodies, bodies);
  assert.deepEqual(pin.position, [32, 16, 8]);
});

test('unqualified placement and mate edits stay outside the preview', async () => {
  const { before, after, mate, ops } = fixture();
  const [translated] = after.instances!;
  const notEvaluated = async () => assert.fail('Unqualified placements should not request candidate meshes');
  for (const [candidate, operation] of [
    [after, []],
    [after, [{ tool: 'place_part', args: { part: 'pin', position: translated.position } }]],
    [after, [{ ...ops[0], args: { ...ops[0].args, flip: true } }]],
    [{ ...after, mates: [{ ...mate, b: { ...mate.b, face: 'n1.top' }, distance: 3 }] }, ops],
    [{ ...after, instances: [{ ...translated, rotation: [0, 0, 20] }] }, ops],
  ] satisfies [StudioDoc, Op[]][]) {
    assert.deepEqual(await placedProposalPreview(before, candidate, new Map(), notEvaluated, operation),
      { kind: 'unavailable', reason: 'Placement changes are outside this preview.' });
  }
});

test('a geometry edit at the same placement still reports its volume change', async () => {
  const { before, pin } = fixture();
  const after: StudioDoc = { ...before, instances: [{ ...pin, doc: cylinderPart(4, 18) }] };
  const candidate = await placedProposalPreview(before, after, new Map(), async (instance, _part, parent) => {
    assert.deepEqual(instance.position, pin.position);
    const height = parent === after ? 18 : 20;
    return { ok: true, bodies: [{ volume: 16 * Math.PI * height }] } as EvalResult;
  });
  assert.equal(candidate?.kind, 'ready');
  assert.ok(Math.abs(candidate.volumeChange! + 32 * Math.PI) < 1e-9);
  assert.equal(candidate.distanceMate, undefined);
});

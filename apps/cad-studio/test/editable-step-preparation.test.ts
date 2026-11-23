import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDoc, rectanglePart } from '@barocss/cad-model/engine/doc';
import type { EditableStepCopy } from '@barocss/cad-model/engine/editableStepCopy';
import { createEditableStepPreparation, type EditableStepPreview } from '../src/files/editableStepPreparation';

function setup() {
  const source = emptyDoc(), doc = rectanglePart(40, 30, 10);
  const named = { ...doc, parameters: { plateThickness: 10 } };
  let owner = { doc: source, shown: source, evaluated: source, fresh: true, hasBody: true, name: 'source' };
  const jobs: { resolve(copy: EditableStepCopy): void; reject(error: Error): void }[] = [];
  const writes: { doc: typeof doc; name: string }[] = [];
  let preview: EditableStepPreview | null = null;
  const review = createEditableStepPreparation({
    current: () => owner,
    prepare: () => new Promise((resolve, reject) => jobs.push({ resolve, reject })),
    changed: value => { preview = value; },
    write: (doc, name) => { writes.push({ doc, name }); },
  });
  return { source, doc, named, review, writes, jobs, get owner() { return owner; },
    set owner(value) { owner = value; }, get preview() { return preview; } };
}

test('offers review without writing, then saves only the explicit chosen graph once', async () => {
  const s = setup(), wait = s.review.prepare();
  assert.equal(s.preview?.stage, 'checking');
  s.review.save(true);
  s.jobs[0].resolve({ doc: s.doc, named: s.named });
  await wait;
  assert.deepEqual(s.preview, { stage: 'ready', name: 'source-editable.bcad', parameterNames: ['plateThickness'] });
  assert.equal(s.writes.length, 0);
  s.review.save(true);
  s.review.save(false);
  assert.deepEqual(s.writes, [{ doc: s.named, name: 'source-editable.bcad' }]);
  assert.equal(s.preview, null);
});

test('switching owners blocks stale work both before and after review, without an effect flush', async () => {
  for (const field of ['doc', 'shown', 'evaluated', 'name', 'fresh', 'hasBody'] as const) {
    for (const ready of [false, true]) {
      const s = setup(), wait = s.review.prepare();
      if (ready) { s.jobs[0].resolve({ doc: s.doc }); await wait; }
      s.owner = { ...s.owner, [field]: field === 'name' ? 'new' : field === 'fresh' || field === 'hasBody' ? false : emptyDoc() };
      if (!ready) { s.jobs[0].resolve({ doc: s.doc }); await wait; }
      s.review.save(false);
      assert.equal(s.preview, null, field);
      assert.equal(s.writes.length, 0, field);
    }
  }
});

test('cancel and supersession discard stale results even if the source still matches', async () => {
  const s = setup(), cancelled = s.review.prepare();
  s.review.cancel();
  const old = s.review.prepare(), latest = s.review.prepare();
  s.jobs[0].resolve({ doc: s.doc }); s.jobs[1].reject(new Error('retired'));
  s.jobs[2].resolve({ doc: s.doc });
  await Promise.all([cancelled, old, latest]);
  assert.deepEqual(s.preview, { stage: 'ready', name: 'source-editable.bcad', parameterNames: [] });
  s.review.save(true);
  assert.equal(s.writes.length, 0);
  s.review.save(false);
  assert.equal(s.writes[0]?.doc, s.doc);
});

test('an unsupported result remains in review and cannot write a copy', async () => {
  const s = setup(), wait = s.review.prepare();
  s.jobs[0].resolve({ error: 'Unsupported profile.' });
  await wait;
  assert.deepEqual(s.preview, { stage: 'error', name: 'source-editable.bcad', error: 'Unsupported profile.' });
  s.review.save(false);
  assert.equal(s.writes.length, 0);
  s.review.cancel();
  assert.equal(s.preview, null);
});

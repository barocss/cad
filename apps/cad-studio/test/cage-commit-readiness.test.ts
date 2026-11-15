import test from 'node:test';
import assert from 'node:assert/strict';
import { cageDoneReadiness, type CageBuildReceipt } from '../src/subd/cageCommitReadiness';

const checking = 'Checking this cage before applying. Wait for evaluation to finish.';
const session = Object.freeze({ node: 0, undo: 0 });
const doc = Object.freeze({ revision: 1 });
const receipt = (status: 'pending' | 'success' | 'error', reason?: string): CageBuildReceipt<typeof session, typeof doc> =>
  Object.freeze({ session, doc, status, ...(reason === undefined ? {} : { reason }) });

test('only a matching successful session/document receipt permits Done, including a zero-step session', () => {
  assert.equal(cageDoneReadiness(session, doc, false, receipt('success')).ok, true);
  for (const evidence of [null, receipt('pending')]) {
    assert.deepEqual(cageDoneReadiness(session, doc, false, evidence), { ok: false, reason: checking });
  }
});

test('equal fields, revision and undo length do not authorize a different immutable session or document', () => {
  const success = receipt('success');
  assert.deepEqual(cageDoneReadiness({ ...session }, doc, false, success), { ok: false, reason: checking });
  assert.deepEqual(cageDoneReadiness(session, { ...doc }, false, success), { ok: false, reason: checking });
  assert.deepEqual(cageDoneReadiness(session, { revision: 2 }, false, success), { ok: false, reason: checking });
  // A rejected reply from an older pair must not misreport an error for the current pair either.
  assert.deepEqual(cageDoneReadiness({ ...session }, doc, false, receipt('error', 'Old error')), { ok: false, reason: checking });
});

test('current evaluation refusal is retained, with a usable fallback for rejected requests without a reason', () => {
  const reason = 'The surface has no normal at a point.';
  assert.deepEqual(cageDoneReadiness(session, doc, false, receipt('error', reason)), { ok: false, reason });
  for (const failure of [receipt('error'), receipt('error', '')]) {
    const result = cageDoneReadiness(session, doc, false, failure);
    assert.equal(result.ok, false);
    assert.match(result.reason, /could not be evaluated/);
  }
});

test('dragging and a cancelled session cannot use even a successful receipt', () => {
  const success = receipt('success');
  assert.deepEqual(cageDoneReadiness(session, doc, true, success), { ok: false, reason: 'Finish moving the gizmo before applying.' });
  assert.deepEqual(cageDoneReadiness(null, doc, false, success), { ok: false, reason: 'Start editing a cage before applying.' });
  assert.equal(cageDoneReadiness(null, doc, true, success).ok, false);
  assert.equal(cageDoneReadiness(session, doc, false, success).ok, true);
  assert.deepEqual(success, { session, doc, status: 'success' });
  assert.deepEqual(session, { node: 0, undo: 0 });
  assert.deepEqual(doc, { revision: 1 });
});

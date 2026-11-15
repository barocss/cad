import test from 'node:test';
import assert from 'node:assert/strict';
import { unappliedSaveNotice } from '../src/files/unappliedSaveNotice';
import { currentDocumentSave } from '../src/state/saveOwnership';

const hint = 'The cage draft is not included. Use Done, then save to include it.';
const input = { hint, currentHint: hint, order: 1, latest: 1, current: true };
test('a current successful save receipt reports only the exclusion hint captured at dispatch', () => {
  const snapshot = { ...input };
  assert.equal(unappliedSaveNotice(input), hint);
  assert.equal(unappliedSaveNotice({ ...input, hint: null }), null);
  assert.equal(unappliedSaveNotice({ ...input, hint: '' }), null);
  assert.equal(unappliedSaveNotice({ ...input, currentHint: null }), null);
  assert.equal(unappliedSaveNotice({ ...input, currentHint: 'Different draft notice' }), null);
  assert.deepEqual(input, snapshot);
});
test('older completion cannot replace a later save request result, including a later failure', () => {
  assert.equal(unappliedSaveNotice({ ...input, latest: 2 }), null);
  assert.equal(unappliedSaveNotice({ ...input, order: 2, latest: 2 }), hint);
  // The caller invokes this only on successful write/receipt, never on failure.
});
test('save dispatch, source document and filename changes suppress completion notices', () => {
  const token = {}, doc = {}, name = 'Part';
  const owner = { token, doc, name };
  for (const [nextToken, nextDoc, nextName] of [[{}, doc, name], [token, {}, name], [token, doc, 'Other']] as const) {
    assert.equal(unappliedSaveNotice({ ...input, current: currentDocumentSave(owner, nextToken, nextDoc, nextName) }), null);
  }
  assert.equal(unappliedSaveNotice({ ...input, current: currentDocumentSave(owner, token, doc, name) }), hint);
});

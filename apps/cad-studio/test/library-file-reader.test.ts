import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibraryFileReader } from '../src/state/libraryFileReader';
function pending() {
  let resolve!: (text: string) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { file: { text: () => promise }, resolve, reject };
}
function observer() {
  const values: unknown[] = [], errors: unknown[] = [];
  return { values, errors, value: (value: unknown) => { values.push(value); }, error: (cause: unknown) => { errors.push(cause); } };
}
test('latest file wins; older success and malformed JSON cannot register or report', async () => {
  for (const stale of ['{"id":"A"}', 'not JSON']) {
    const reader = createLibraryFileReader(), a = pending(), b = pending(), o = observer();
    const first = reader.read(a.file, o.value, o.error), second = reader.read(b.file, o.value, o.error);
    b.resolve('{"id":"B"}'); await second; a.resolve(stale); await first;
    assert.deepEqual(o.values, [{ id: 'B' }]); assert.deepEqual(o.errors, []);
  }
});
test('superseded rejection is silent; current file remains admitted', async () => {
  const reader = createLibraryFileReader(), a = pending(), b = pending(), o = observer();
  const first = reader.read(a.file, o.value, o.error), second = reader.read(b.file, o.value, o.error);
  a.reject(Error('old read failed')); await first; b.resolve('{"id":"B"}'); await second;
  assert.deepEqual(o.values, [{ id: 'B' }]); assert.deepEqual(o.errors, []);
});
test('cancel retires pending success/rejection; a new read after cleanup succeeds', async () => {
  for (const reject of [false, true]) {
    const reader = createLibraryFileReader(), old = pending(), o = observer();
    const work = reader.read(old.file, o.value, o.error); reader.cancel();
    if (reject) old.reject(Error('closed')); else old.resolve('{"id":"old"}'); await work;
    assert.deepEqual(o.values, []); assert.deepEqual(o.errors, []);
    await reader.read({ text: async () => '{"id":"new"}' }, o.value, o.error);
    assert.deepEqual(o.values, [{ id: 'new' }]);
  }
});
test('cancel old document reader cannot affect a new session reader', async () => {
  const oldReader = createLibraryFileReader(), nextReader = createLibraryFileReader(), old = pending(), next = pending(), o = observer();
  const first = oldReader.read(old.file, o.value, o.error); oldReader.cancel();
  const second = nextReader.read(next.file, o.value, o.error);
  old.resolve('{"id":"old"}'); next.resolve('{"id":"new"}'); await Promise.all([first, second]);
  assert.deepEqual(o.values, [{ id: 'new' }]); assert.deepEqual(o.errors, []);
});
test('current parse, read and synchronous registration failures are reported unchanged', async () => {
  const reader = createLibraryFileReader(), o = observer();
  await reader.read({ text: async () => '{bad' }, o.value, o.error);
  assert.equal(o.errors.length, 1); assert.ok(o.errors[0] instanceof SyntaxError); assert.deepEqual(o.values, []);
  const readError = Error('read denied'), registrationError = Error('built-in ID');
  await reader.read({ text: () => { throw readError; } }, o.value, o.error);
  await reader.read({ text: async () => '{}' }, () => { throw registrationError; }, o.error);
  assert.equal(o.errors[1], readError); assert.equal(o.errors[2], registrationError);
});
test('newest failed file still retires an older valid read', async () => {
  const reader = createLibraryFileReader(), old = pending(), o = observer();
  const first = reader.read(old.file, o.value, o.error);
  await reader.read({ text: async () => 'bad' }, o.value, o.error);
  old.resolve('{"id":"old"}'); await first;
  assert.deepEqual(o.values, []); assert.equal(o.errors.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { memoryStore } from '../src/storage/memoryStore';
import { autosavePath, autosaveSaveBoundaryPath, readAutosave, rememberSavedCheckpoint, writeAutosave, writePart } from '../src/storage/project';

const doc = (height: number) => withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 10] }), { kind: 'extrude', sketch: 0, height });
const path = 'part.bcad';
test('a completed own checkpoint predating Save is hidden, never deleted', async () => {
  const store = memoryStore('test');
  await writePart(store, path, doc(10));
  const checkpoint = await writeAutosave(store, path, doc(11));
  const saved = await writePart(store, path, doc(14));
  await rememberSavedCheckpoint(store, path, saved, checkpoint);
  assert.equal(await readAutosave(store, path), null);
  assert.deepEqual((await store.read(autosavePath(path)))?.bytes, checkpoint.bytes);
  const newer = await writeAutosave(store, path, doc(15));
  assert.ok(await readAutosave(store, path));
  assert.deepEqual((await store.read(autosavePath(path)))?.bytes, newer.bytes);
});
test('newer autosave finishing before the boundary write remains recoverable', async () => {
  const store = memoryStore('test');
  const checkpoint = await writeAutosave(store, path, doc(11));
  const saved = await writePart(store, path, doc(14));
  await writeAutosave(store, path, doc(15));
  await rememberSavedCheckpoint(store, path, saved, checkpoint);
  assert.ok(await readAutosave(store, path));
});
test('new write with identical checkpoint bytes is not retired by old provenance', async () => {
  const store = memoryStore('test');
  const checkpoint = await writeAutosave(store, path, doc(11));
  const saved = await writePart(store, path, doc(14));
  await rememberSavedCheckpoint(store, path, saved, checkpoint);
  await writeAutosave(store, path, doc(11));
  assert.ok(await readAutosave(store, path));
});
test('another save, path, malformed marker, or missing marker does not suppress recovery', async () => {
  const store = memoryStore('test');
  const checkpoint = await writeAutosave(store, path, doc(11));
  const saved = await writePart(store, path, doc(14));
  assert.ok(await readAutosave(store, path));
  await rememberSavedCheckpoint(store, path, saved, checkpoint);
  await writePart(store, path, doc(16));
  assert.ok(await readAutosave(store, path));
  await writeAutosave(store, 'other.bcad', doc(11));
  await writePart(store, 'other.bcad', doc(14));
  assert.ok(await readAutosave(store, 'other.bcad'));
  await store.write(autosaveSaveBoundaryPath(path), new TextEncoder().encode('{'));
  assert.ok(await readAutosave(store, path));
});
test('failed Save never retires a valid checkpoint', async () => {
  const store = memoryStore('test');
  await writePart(store, path, doc(10));
  await writeAutosave(store, path, doc(11));
  await assert.rejects(writePart(store, path, doc(14), { expect: 'stale' }));
  assert.ok(await readAutosave(store, path));
  assert.equal(await store.read(autosaveSaveBoundaryPath(path)), null);
});
test('matching tags with different bytes cannot suppress a checkpoint', async () => {
  const store = memoryStore('test');
  const checkpoint = await writeAutosave(store, path, doc(11));
  const saved = await writePart(store, path, doc(14));
  await rememberSavedCheckpoint(store, path, saved, { ...checkpoint, bytes: saved.bytes });
  assert.ok(await readAutosave(store, path));
});

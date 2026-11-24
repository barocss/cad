import assert from 'node:assert/strict';
import { isAbsolute, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const output = process.argv[2], repo = resolve(import.meta.dirname, '../../..');
assert.ok(output && isAbsolute(output) && relative(repo, output).startsWith('../'));
const mode = process.argv[3] ?? '--interruption-only';
const cases = {
  '--interruption-only': { decision: 'D596', qualification: 'Interrupted first native autosave close' },
  '--with-write-denial': { decision: 'D768', qualification: 'B08-05 native autosave interruption, denial and later Restore' },
  '--with-read-recovery': { decision: 'D769', qualification: 'B08-06 malformed and unreadable recovery followed by a successful write' },
  '--with-transient-abort': { decision: 'D1965', qualification: 'Retry an interrupted current browser-project recovery once' },
};
assert.ok(Object.hasOwn(cases, mode));
const { decision, qualification } = cases[mode];
const writeDenial = mode === '--with-write-denial', readRecovery = mode === '--with-read-recovery';
const transientAbort = mode === '--with-transient-abort', baseline = process.argv.includes('--baseline');
const project = decision + ' autosave recovery';
const file = 'D596-plate.bcad';
const original = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { H: 10 },
  nodes: [
    { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 10], id: 'n0' },
    { kind: 'extrude', sketch: 0, height: { parameter: 'H' }, id: 'n1' },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const pins = ['apps/cad-studio/test/project-autosave-interruption-browser.mjs', 'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/projectOpenFit.ts', 'apps/cad-studio/src/storage/useProject.ts',
  'apps/cad-studio/src/storage/project.ts', 'apps/cad-studio/src/storage/handleStore.ts'];
const f = await createFlow({
  name: 'project-autosave-interruption', envFrozen: decision + '_SOURCE_FROZEN', output, qualification,
  initialFiles: pins, requiredFrozen: pins,
  limits: ['Desktop Chrome OPFS, one project, one part. Hold the real writable close until reload.',
    'Optional NotAllowedError injection affects one native autosave read or write.'],
  snapshotExtra: () => ({
    autosaveOffer: !!document.querySelector('[aria-label="Autosaved work"]'),
    interruptedClose: window.__d596.held,
    openReady: window.__d596.openReady,
    rejectedWrites: window.__d596.rejected,
    abortedWrites: window.__d596.aborted,
    recoveryAttempts: window.__d596.attempts,
    transientAborts: window.__d596.transientAborts,
    rejectedReads: window.__d596.rejectedReads,
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
  }),
});

function installScheduler({ project, file }) {
  const directories = new WeakMap(), files = new WeakMap(), streams = new WeakMap();
  const storage = Object.getPrototypeOf(navigator.storage), nativeRoot = storage.getDirectory;
  const directory = FileSystemDirectoryHandle.prototype, nativeDirectory = directory.getDirectoryHandle, nativeFile = directory.getFileHandle;
  storage.getDirectory = async function (...args) {
    const root = await nativeRoot.apply(this, args);
    directories.set(root, '');
    return root;
  };
  directory.getDirectoryHandle = async function (name, ...args) {
    const dir = await nativeDirectory.call(this, name, ...args);
    const parent = directories.get(this);
    if (parent !== undefined) directories.set(dir, parent ? parent + '/' + name : name);
    return dir;
  };
  directory.getFileHandle = async function (name, ...args) {
    const handle = await nativeFile.call(this, name, ...args);
    const parent = directories.get(this);
    if (parent !== undefined) files.set(handle, parent + '/' + name);
    return handle;
  };
  const target = 'projects/' + project + '/.barocss/autosave/' + file;
  const state = { armed: false, held: 0, committed: 0, openReady: 0, denyWrite: false, rejected: 0, aborted: 0,
    denyRead: false, rejectedReads: 0, attempts: 0, transientRemaining: 0, transientAborts: 0,
    holdTransient: false, releaseTransient: null, holdRetryAfter: null, releaseRetryWrite: null, cancelledRetryWrites: 0 };
  const nativeGetFile = FileSystemFileHandle.prototype.getFile;
  FileSystemFileHandle.prototype.getFile = async function (...args) {
    if (files.get(this) === target && state.denyRead) {
      state.denyRead = false;
      state.rejectedReads++;
      throw new DOMException('Injected autosave read denial', 'NotAllowedError');
    }
    return nativeGetFile.apply(this, args);
  };
  const nativeWritable = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = async function (...args) {
    const stream = await nativeWritable.apply(this, args);
    streams.set(stream, files.get(this));
    return stream;
  };
  const stream = FileSystemWritableFileStream.prototype;
  const nativeWrite = stream.write, nativeClose = stream.close, nativeAbort = stream.abort;
  const rejected = new WeakSet(), stagedRetry = new WeakSet();
  stream.write = async function (...args) {
    if (streams.get(this) === target && state.holdRetryAfter === state.transientAborts) {
      state.holdRetryAfter = null;
      stagedRetry.add(this);
      await new Promise(resolve => { state.releaseRetryWrite = resolve; });
      state.releaseRetryWrite = null;
    }
    if (streams.get(this) === target && state.denyWrite) {
      state.denyWrite = false;
      state.rejected++;
      rejected.add(this);
      throw new DOMException('Injected autosave write denial', 'NotAllowedError');
    }
    return nativeWrite.apply(this, args);
  };
  stream.abort = async function (...args) {
    const result = await nativeAbort.apply(this, args);
    if (rejected.has(this)) state.aborted++;
    if (stagedRetry.has(this)) state.cancelledRetryWrites++;
    return result;
  };
  stream.close = async function (...args) {
    if (streams.get(this) !== target) return nativeClose.apply(this, args);
    state.attempts++;
    if (state.transientRemaining > 0) {
      state.transientRemaining--;
      if (state.holdTransient) {
        state.holdTransient = false;
        await new Promise(resolve => { state.releaseTransient = resolve; });
        state.releaseTransient = null;
      }
      state.transientAborts++;
      throw new DOMException('Injected transient autosave close interruption', 'AbortError');
    }
    if (state.armed) {
      state.armed = false;
      state.held++;
      // The public edit wrote its swap data. Reload drops this page before the first native commit.
      return new Promise(() => {});
    }
    await nativeClose.apply(this, args);
    state.committed++;
  };
  const nativeTimeout = window.setTimeout;
  window.setTimeout = function (callback, delay, ...args) {
    if (typeof callback !== 'function' || delay !== 300 || !new Error().stack?.includes('scheduleProjectOpenFit'))
      return nativeTimeout.call(this, callback, delay, ...args);
    return nativeTimeout.call(this, function (...timerArgs) {
      callback.apply(this, timerArgs);
      state.openReady++;
    }, delay, ...args);
  };
  window.__d596 = state;
}
const button = name => f.page.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const offer = () => panel().getByRole('status', { name: 'Autosaved work', exact: true });

async function projectFiles(replacement) {
  return f.page.evaluate(async ({ project, file, replacement }) => {
    const root = await navigator.storage.getDirectory();
    const dir = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(project);
    const saved = await (await (await dir.getFileHandle(file)).getFile()).text();
    try {
      const autosave = await (await dir.getDirectoryHandle('.barocss')).getDirectoryHandle('autosave');
      const handle = await autosave.getFileHandle(file);
      if (replacement !== undefined) {
        const stream = await handle.createWritable();
        await stream.write(replacement);
        await stream.close();
      }
      const native = await handle.getFile();
      return { saved, recovery: await native.text(), size: native.size };
    } catch (error) {
      if (error.name === 'NotFoundError') return { saved, recovery: null, size: null };
      throw error;
    }
  }, { project, file, replacement });
}

async function selectProject() {
  await button('Project and versions').click();
  await panel().getByLabel('Browser project name', { exact: true }).fill(project);
  await panel().getByRole('button', { name: 'Project in this browser', exact: true }).click();
  await panel().getByLabel('Project', { exact: true }).waitFor();
}
async function reopen(expected, { denyRead = false } = {}) {
  await f.page.reload();
  await f.ready();
  await selectProject();
  if (denyRead) await f.page.evaluate(() => { window.__d596.denyRead = true; });
  await panel().getByRole('button', { name: 'Open ' + file, exact: true }).click();
  await f.page.waitForFunction(() => window.__d596.openReady === 1);
  await f.same(expected);
}
async function requireNoOffer(label) {
  const state = await f.snapshot(label);
  assert.equal(state.autosaveOffer, false);
  assert.ok(!state.notices.some(notice => /recovery copy could not be read/i.test(notice)), JSON.stringify(state.notices));
}

async function verifyTransientAbort(initial) {
  f.phase = 'One native close abort after an accepted checkpoint';
  const first = await f.setParameter('H', 11, '10-first-recovery-checkpoint');
  await f.page.waitForFunction(() => window.__d596.committed === 1);
  const firstFiles = await projectFiles();
  assert.deepEqual(JSON.parse(firstFiles.recovery), first.doc);
  assert.equal(firstFiles.saved, initial.saved);
  await f.page.evaluate(() => { window.__d596.transientRemaining = 1; });
  const latest = await f.setParameter('H', 14, '11-edit-before-transient-abort');
  await f.page.waitForFunction(() => window.__d596.transientAborts === 1);
  if (baseline) {
    await f.waitToast(/automatic recovery is unavailable/i);
    assert.deepEqual(await projectFiles(), firstFiles);
    const state = await f.snapshot('12-prior-no-retry');
    assert.equal(state.recoveryAttempts, 2);
    assert.equal(state.doc.parameters.H, 14);
    return;
  }
  await f.page.waitForFunction(() => window.__d596.committed === 2);
  const recovered = await projectFiles();
  assert.deepEqual(JSON.parse(recovered.recovery), latest.doc);
  assert.equal(recovered.saved, initial.saved);
  const retried = await f.snapshot('12-current-recovery-retried');
  assert.equal(retried.recoveryAttempts, 3);
  assert.ok(!retried.notices.some(notice => /automatic recovery is unavailable/i.test(notice)));
  assert.equal(retried.dirty, true);
  assert.ok(Math.abs(retried.bodies.bodies[0].volume - 2800) < 1e-7);

  f.phase = 'A newer edit revokes the older retry';
  const holdNext = () => f.page.evaluate(() => {
    window.__d596.transientRemaining = 1;
    window.__d596.holdTransient = true;
  });
  const release = () => f.page.evaluate(() => window.__d596.releaseTransient());
  await holdNext();
  await f.setParameter('H', 15, '13-older-edit-in-flight');
  await f.page.waitForFunction(() => window.__d596.releaseTransient !== null);
  const next = await f.setParameter('H', 16, '14-newer-edit-supersedes');
  await release();
  await f.page.waitForFunction(() => window.__d596.committed === 3);
  const latestFiles = await projectFiles();
  assert.deepEqual(JSON.parse(latestFiles.recovery), next.doc);
  assert.equal(latestFiles.saved, initial.saved);
  const nextState = await f.snapshot('15-newer-recovery-wins');
  assert.equal(nextState.recoveryAttempts, 5);
  assert.equal(nextState.transientAborts, 2);

  f.phase = 'A primary Save revokes the older retry';
  await holdNext();
  const final = await f.setParameter('H', 17, '16-edit-before-explicit-save');
  await f.page.waitForFunction(() => window.__d596.releaseTransient !== null);
  await button('Save').click();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  await release();
  await f.page.waitForFunction(() => window.__d596.transientAborts === 3);
  await f.page.waitForTimeout(900);
  const finalFiles = await projectFiles();
  assert.deepEqual(JSON.parse(finalFiles.saved), final.doc);
  assert.equal(finalFiles.recovery, latestFiles.recovery);
  const finalState = await f.snapshot('17-save-revoked-retry');
  assert.equal(finalState.recoveryAttempts, 6);
  assert.ok(!finalState.notices.some(notice => /automatic recovery is unavailable/i.test(notice)));

  f.phase = 'A second transient abort warns without a third attempt';
  await f.page.evaluate(() => { window.__d596.transientRemaining = 2; });
  await f.setParameter('H', 18, '18-edit-before-two-aborts');
  await f.waitToast(/automatic recovery is unavailable/i);
  const exhausted = await f.snapshot('19-retry-exhausted');
  assert.equal(exhausted.recoveryAttempts, 8);
  assert.equal(exhausted.transientAborts, 5);
  assert.deepEqual(await projectFiles(), finalFiles);

  f.phase = 'A Save before native close cancels a retry that already reached the stream';
  await f.dismissToasts();
  await f.page.evaluate(() => {
    window.__d596.transientRemaining = 1;
    window.__d596.holdRetryAfter = window.__d596.transientAborts + 1;
  });
  const newest = await f.setParameter('H', 19, '20-edit-before-queued-retry');
  await f.page.waitForFunction(() => window.__d596.releaseRetryWrite !== null);
  await button('Save').click();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.evaluate(() => window.__d596.releaseRetryWrite());
  await f.page.waitForFunction(() => window.__d596.cancelledRetryWrites === 1);
  const savedLatest = await projectFiles();
  assert.deepEqual(JSON.parse(savedLatest.saved), newest.doc);
  assert.equal(savedLatest.recovery, latestFiles.recovery);
  const state = await f.snapshot('21-save-cancelled-staged-retry');
  assert.equal(state.recoveryAttempts, 9);
  assert.ok(!state.notices.some(notice => /automatic recovery is unavailable/i.test(notice)));

  f.phase = 'Reopen the primary and restore the retried recovery';
  await f.page.evaluate(() => { window.__d596.transientRemaining = 1; });
  const recoverable = await f.setParameter('H', 20, '22-last-edit-before-reopen');
  await f.page.waitForFunction(() => window.__d596.committed === 4);
  const ready = await projectFiles();
  assert.deepEqual(JSON.parse(ready.recovery), recoverable.doc);
  assert.equal(ready.saved, savedLatest.saved);
  await reopen(newest.doc);
  await offer().waitFor();
  assert.deepEqual(await projectFiles(), ready);
  await f.snapshot('23-retried-recovery-offered');
  await offer().getByRole('button', { name: 'Restore autosaved work', exact: true }).click();
  await f.same(recoverable.doc);
  const restored = await f.snapshot('24-retried-recovery-restored');
  assert.ok(Math.abs(restored.bodies.bodies[0].volume - 4000) < 1e-7);
  assert.equal((await projectFiles()).saved, savedLatest.saved);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    await context.addInitScript(installScheduler, { project, file });
    return context;
  };
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original)) });
  await f.same(original);
  await selectProject();
  await button('Save').click();
  await panel().getByRole('list', { name: 'Project documents' }).getByText(file, { exact: true }).waitFor();
  const initial = await projectFiles();
  assert.deepEqual(JSON.parse(initial.saved), original);
  assert.equal(initial.recovery, null);
  f.report.firstSavedSHA256 = sha256(initial.saved);
  if (transientAbort) return verifyTransientAbort(initial);

  await f.page.evaluate(() => { window.__d596.armed = true; });
  await f.setParameter('H', 11, '01-first-unsaved-edit');
  await f.page.waitForFunction(() => window.__d596.held === 1);
  f.phase = 'reload with a zero-byte first autosave before native close';
  const uncommitted = await projectFiles();
  assert.deepEqual(uncommitted, { saved: initial.saved, recovery: '', size: 0 });
  await reopen(original);
  assert.deepEqual(await projectFiles(), uncommitted);
  await requireNoOffer('02-reopen-interrupted-first-write');

  const newer = await f.setParameter('H', 11, '03-completed-retry');
  await f.page.waitForFunction(() => window.__d596.committed === 1);
  const completed = await projectFiles();
  assert.deepEqual(JSON.parse(completed.recovery), newer.doc);
  assert.equal(completed.saved, initial.saved);
  if (writeDenial) {
    await f.page.evaluate(() => { window.__d596.denyWrite = true; });
    await f.setParameter('H', 12, '04-edit-with-denied-overwrite');
    f.phase = 'verify current write-denial feedback and prior committed bytes';
    await f.page.waitForFunction(() => window.__d596.aborted === 1);
    const warning = await f.waitToast(/automatic recovery is unavailable/i);
    assert.match(warning, /browser does not allow/i);
    const state = await f.snapshot('04b-write-denial-feedback');
    assert.equal(state.rejectedWrites, 1);
    assert.equal(state.abortedWrites, 1);
    assert.equal(state.dirty, true);
    assert.equal(state.doc.parameters.H, 12);
  } else {
    await f.page.evaluate(() => { window.__d596.armed = true; });
    await f.setParameter('H', 12, '04-interrupted-overwrite');
    await f.page.waitForFunction(() => window.__d596.held === 1);
  }
  f.phase = 'reopen with a previous committed autosave';
  assert.deepEqual(await projectFiles(), completed);
  await reopen(original);
  await offer().waitFor();
  assert.deepEqual(await projectFiles(), completed);
  await f.snapshot('05-previous-autosave-offered');
  await offer().getByRole('button', { name: 'Restore autosaved work', exact: true }).click();
  await f.same(newer.doc);
  if (writeDenial) {
    const restored = await f.snapshot('05b-restored-prior-recovery');
    assert.equal(restored.dirty, true);
    assert.equal(restored.autosaveOffer, false);
    assert.deepEqual(await projectFiles(), completed);
  }
  await button('Save').click();
  await f.page.locator('[aria-label="Unsaved changes"]').waitFor({ state: 'hidden' });
  f.phase = 'reopen a saved-equal recovery and retain true corruption feedback';
  await reopen(newer.doc);
  await requireNoOffer('06-saved-equal-no-offer');

  const malformed = await projectFiles('{"damaged":');
  assert.ok(malformed.size > 0);
  await reopen(newer.doc);
  await f.waitToast(/the recovery copy could not be read/i);
  const corrupt = await f.snapshot('07-corrupt-nonempty-warning');
  assert.equal(corrupt.autosaveOffer, false);
  assert.deepEqual(await projectFiles(), malformed);
  if (readRecovery) {
    assert.equal(corrupt.dirty, false);
    assert.ok(corrupt.notices.some(text => /not JSON.*project file is open/i.test(text)));
    f.phase = 'replace malformed recovery through a successful native autosave';
    const h13 = await f.setParameter('H', 13, '08-edit-after-malformed-recovery');
    await f.page.waitForFunction(() => window.__d596.committed === 1);
    const valid = await projectFiles();
    assert.equal(valid.saved, malformed.saved);
    assert.deepEqual(JSON.parse(valid.recovery), h13.doc);

    await reopen(newer.doc);
    await offer().waitFor();
    const offered = await f.snapshot('09-valid-recovery-after-malformed-data');
    assert.equal(offered.dirty, false);
    assert.deepEqual(await projectFiles(), valid);

    f.phase = 'open the saved part while the native recovery read is denied';
    await reopen(newer.doc, { denyRead: true });
    const readNotice = await f.waitToast(/the recovery copy could not be read/i);
    assert.match(readNotice, /browser does not allow reading.*project file is open/i);
    const denied = await f.snapshot('10-unreadable-recovery-warning');
    assert.equal(denied.rejectedReads, 1);
    assert.equal(denied.autosaveOffer, false);
    assert.equal(denied.dirty, false);
    assert.deepEqual(await projectFiles(), valid);

    f.phase = 'write and restore a new valid copy after the read denial';
    const h14 = await f.setParameter('H', 14, '11-edit-after-denied-read');
    await f.page.waitForFunction(() => window.__d596.committed === 1);
    const updated = await projectFiles();
    assert.equal(updated.saved, malformed.saved);
    assert.deepEqual(JSON.parse(updated.recovery), h14.doc);
    await reopen(newer.doc);
    await offer().waitFor();
    await offer().getByRole('button', { name: 'Restore autosaved work', exact: true }).click();
    await f.same(h14.doc);
    const restored = await f.snapshot('12-restored-recovery-after-denied-read');
    assert.equal(restored.dirty, true);
    assert.equal(restored.autosaveOffer, false);
    assert.deepEqual(await projectFiles(), updated);
    f.report.files.push({ retainedAfterDenial: sha256(valid.recovery), restored: sha256(updated.recovery), saved: sha256(updated.saved) });
  }
  f.report.finalSavedSHA256 = sha256(malformed.saved);
  f.report.corruptSidecarSHA256 = sha256(malformed.recovery);
  f.report.previousCommittedSHA256 = sha256(completed.recovery);
  assert.deepEqual(f.report.downloads, []);
});

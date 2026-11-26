import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

assert.ok(process.env.PW_DIR && process.env.CHROME, 'PW_DIR and CHROME are required');
const { chromium } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright');

async function openNativeProject(f, directory, file) {
  // Replace the macOS chooser only. CDP supplies real OS drag data and Chromium
  // creates the native directory handle. Never substitute an OPFS or mocked handle.
  await f.page.evaluate(() => {
    const target = document.createElement('div');
    target.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    document.body.append(target);
    const swallow = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    for (const type of ['dragenter', 'dragover']) target.addEventListener(type, swallow);
    target.addEventListener('drop', event => {
      swallow(event);
      window.__testDroppedFolder = event.dataTransfer.items[0].getAsFileSystemHandle();
      target.remove();
    }, { once: true });
  });
  const cdp = await f.context.newCDPSession(f.page);
  try {
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await cdp.send('Input.dispatchDragEvent', { type, x: 100, y: 100, data: { items: [], files: [directory], dragOperationsMask: 1 } });
    }
    await f.page.waitForFunction(() => !!window.__testDroppedFolder);
    const handle = await f.page.evaluate(async () => {
      const dir = await window.__testDroppedFolder;
      window.showDirectoryPicker = async () => dir;
      return { kind: dir?.kind, write: await dir?.queryPermission({ mode: 'readwrite' }) };
    });
    assert.deepEqual(handle, { kind: 'directory', write: 'granted' });
  } finally { await cdp.detach(); }
  const panel = f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
  if (!(await panel.isVisible())) await f.page.getByRole('button', { name: 'Project and versions', exact: true }).click();
  await panel.getByRole('button', { name: 'Open folder', exact: true }).click();
  await panel.getByRole('button', { name: 'Open ' + file, exact: true }).click();
  await f.page.waitForFunction(() => typeof window.__studioDoc?.parameters?.H === 'number');
  await f.ready();
}

async function installWritableControl(page) {
  await page.evaluate(() => {
    const paths = new WeakMap();
    const directory = FileSystemDirectoryHandle.prototype;
    const getDir = directory.getDirectoryHandle;
    const getFile = directory.getFileHandle;
    const create = FileSystemFileHandle.prototype.createWritable;
    const control = window.__testWritable = { hold: false, fail: false, held: false, refused: false };
    directory.getDirectoryHandle = async function (name, ...args) {
      const result = await getDir.call(this, name, ...args);
      const parent = paths.get(this) ?? '';
      paths.set(result, parent + name + '/');
      return result;
    };
    directory.getFileHandle = async function (name, ...args) {
      const result = await getFile.call(this, name, ...args);
      paths.set(result, (paths.get(this) ?? '') + name);
      return result;
    };
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const path = paths.get(this);
      if (path === 'part.bcad' && control.fail) {
        control.refused = true;
        throw new DOMException('Test refusal before primary writable creation', 'NotAllowedError');
      }
      const w = await create.apply(this, args);
      if (path === '.barocss/autosave/part.bcad' && control.hold) {
        control.hold = false;
        const close = w.close.bind(w);
        w.close = async () => {
          control.held = true;
          await new Promise(resolve => { control.release = resolve; });
          return close();
        };
      }
      return w;
    };
  });
}

const scratch = await mkdtemp(join(tmpdir(), 'cad-folder-recovery-'));
try {
  const project = join(scratch, 'native-project');
  const profile = join(scratch, 'profile');
  await mkdir(project);
  await mkdir(join(profile, 'Default'), { recursive: true });
  // The disposable test profile auto-grants the folder write setting. No user
  // profile, user files or permission prompts are used.
  await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({
    profile: { default_content_setting_values: { file_system_write_guard: 1 } },
  }));
  const seed = JSON.parse(await readFile(new URL('./fixtures/bracket.bcad', import.meta.url), 'utf8'));
  seed.nodes[1].height = { parameter: 'H' };
  for (const [file, height] of [['part.bcad', 10], ['other.bcad', 20]]) {
    await writeFile(join(project, file), JSON.stringify({ ...seed, parameters: { ...seed.parameters, H: height } }));
  }
  const f = await createFlow({
    name: 'folder-autosave-save-boundary', envFrozen: 'FOLDER_AUTOSAVE_FROZEN', output: process.argv[2],
    qualification: 'Native folder Save suppresses only the earlier owned autosave; newer and failed-Save checkpoints survive.',
    limits: [
      'One headless desktop Chrome, actual native temporary folder and writes; OS chooser and write-permission prompts not exercised.',
      'One explicit permission-style Save failure injected before writable creation; no OS quota, external writers or aliases tested.',
    ],
    requiredFrozen: ['apps/cad-studio/src/storage/project.ts', 'apps/cad-studio/src/storage/useProject.ts', 'apps/cad-studio/src/storage/handleStore.ts'],
    createContext: options => chromium.launchPersistentContext(profile, {
      ...options, executablePath: process.env.CHROME, headless: true, args: ['--enable-unsafe-webgpu'],
    }),
  });
  const files = { primary: 'part.bcad', checkpoint: '.barocss/autosave/part.bcad', receipt: '.barocss/autosave-saved/part.bcad.json', other: 'other.bcad' };
  async function read(which) { return readFile(join(project, files[which])); }
  async function readJson(which) {
    const bytes = await read(which);
    // create:true may have exposed the empty destination before close commits.
    return bytes.length === 0 ? null : JSON.parse(bytes);
  }
  async function current(which) { return (await readJson(which))?.parameters.H; }
  async function poll(fn) {
    for (let attempt = 0; attempt < 120; attempt++) {
      try { if (await fn()) return; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail('Expected native file or UI state did not arrive');
  }
  const notice = () => f.page.getByRole('status', { name: 'Autosaved work', exact: true });
  const dirty = () => f.page.locator('[aria-label="Unsaved changes"]');
  const open = file => openNativeProject(f, project, file);
  async function editAndSave(height, succeeds) {
    const panel = await f.openParameters();
    const field = panel.getByLabel('Value of H', { exact: true });
    if ((await f.doc()).parameters.H !== height) {
      await field.fill(String(height));
      await field.press('Enter');
      await f.page.waitForFunction(h => window.__studioDoc?.parameters?.H === h, height);
    }
    await f.page.getByRole('button', { name: 'Save', exact: true }).click();
    if (succeeds) await dirty().waitFor({ state: 'hidden' });
    else {
      await f.page.waitForFunction(() => window.__testWritable.refused);
      await dirty().waitFor({ state: 'visible' });
    }
    await f.closeParameters(panel);
  }
  await f.run(async () => {
    await f.newPage();
    const otherBytes = await read('other');
    const record = async label => {
      f.report.observations.push({ label, primary: await current('primary'), checkpoint: await current('checkpoint'),
        primarySha256: sha256(await read('primary')), checkpointSha256: sha256(await read('checkpoint')),
        otherSha256: sha256(await read('other')) });
      await f.snapshot(label);
    };

    for (const [pending, initial, height, saved] of [[false, 10, 11, 14], [true, 14, 15, 18]]) {
      f.phase = pending ? 'in-flight native checkpoint' : 'already-committed native checkpoint';
      await open('part.bcad');
      assert.equal((await f.doc()).parameters.H, initial);
      await installWritableControl(f.page);
      if (pending) await f.page.evaluate(() => { window.__testWritable.hold = true; });
      await f.setParameter('H', height, pending ? '03-edit-pending' : '01-edit-committed');
      if (pending) await f.page.waitForFunction(() => window.__testWritable.held);
      else await poll(async () => await current('checkpoint') === height);
      await editAndSave(saved, true);
      if (pending) await f.page.evaluate(() => window.__testWritable.release());
      await poll(async () => await current('checkpoint') === height && (await readJson('receipt'))?.checkpointSHA256 === sha256(await read('checkpoint')) && (await readJson('receipt'))?.savedSHA256 === sha256(await read('primary')));
      assert.equal(await current('primary'), saved);
      const kept = await read('checkpoint');
      await f.page.reload();
      await f.ready();
      await open('part.bcad');
      assert.equal((await f.doc()).parameters.H, saved);
      assert.equal(await notice().count(), 0);
      assert.deepEqual(await read('checkpoint'), kept);
      await record(pending ? '04-pending-suppressed' : '02-committed-suppressed');
      if (!pending) { await f.page.reload(); await f.ready(); }
    }

    f.phase = 'failed native Save, independent file and newer recovery';
    // A Save that fails before touching the primary must not claim the new checkpoint.
    await installWritableControl(f.page);
    await f.setParameter('H', 19, '05-newer-edit');
    await poll(async () => await current('checkpoint') === 19);
    const newerBytes = await read('checkpoint');
    await f.page.evaluate(() => { window.__testWritable.fail = true; });
    await editAndSave(19, false);
    assert.equal(await current('primary'), 18);
    assert.deepEqual(await read('checkpoint'), newerBytes);

    await f.page.reload();
    await f.ready();
    await open('other.bcad');
    assert.equal((await f.doc()).parameters.H, 20);
    assert.equal(await notice().count(), 0);
    assert.deepEqual(await read('other'), otherBytes);
    assert.deepEqual(await read('checkpoint'), newerBytes);
    await record('06-other-document-isolated');
    await f.page.getByRole('button', { name: 'Open part.bcad', exact: true }).click();
    await notice().waitFor();
    assert.equal((await f.doc()).parameters.H, 18);
    await notice().getByRole('button', { name: 'Restore autosaved work', exact: true }).click();
    await f.ready();
    await dirty().waitFor({ state: 'visible' });
    assert.equal((await f.doc()).parameters.H, 19);
    assert.equal(await current('primary'), 18);
    assert.deepEqual(await read('other'), otherBytes);
    await record('07-newer-checkpoint-restored');
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}

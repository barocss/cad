// D708 / #2426. Studio and external stdio MCP use the same disposable local native file.
import assert from 'node:assert/strict';
import { lstat, mkdir, readdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const output = process.argv[2];
const visual = process.argv.includes('--visual-review');
const baseline = process.argv.includes('--baseline');
assert.ok(!baseline || visual);
const file = 'Guarded plate.bcad', folder = 'D708 owned folder';
const root = join(output, 'project'), target = join(root, file);
const pins = ['apps/cad-studio/test/mcp-stale-save-browser.mjs', 'apps/cad-studio/server/cadDoc.ts',
  'apps/cad-studio/server/cadMcp.ts', 'apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/src/storage/handleStore.ts',
  'apps/cad-studio/src/storage/useProject.ts', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'packages/barocss-cad-model/src/engine/container.ts'];
const f = await createFlow({
  name: visual ? 'mcp-stale-visual-review' : 'mcp-stale-save', envFrozen: visual ? 'D2065_SOURCE_FROZEN' : 'D708_SOURCE_FROZEN',
  output, initialFiles: pins, requiredFrozen: pins,
  qualification: visual ? 'A Studio save invalidates accepted and pending visual reviews in an old file-backed MCP session.'
    : 'D708 protects a newer Studio save from an external MCP session',
  limits: ['Only the native folder-picker boundary is replaced with a test directory handle. It reads and writes the same local disk file as the real MCP child. The Studio project store, controls, edits and Save/Open are real.'],
  inspectorSource: `
import { emptyDoc, rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { profileOf } from '@barocss/cad-model/sketch/loops';
if (${visual}) {
  const profile = profileOf([{ kind: 'polygon', closed: true, points: [[0,0],[80,0],[80,40],[0,40]],
    ids: ['e1','e2','e3','e4'], hv: { h: [0,2], v: [1,3] } }]);
  if (!('node' in profile)) throw new Error(profile.error);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind:'extrude', sketch:0, height:8 })));
} else console.log(JSON.stringify(rectanglePart(80, 40, 8)));
`,
  oracleSource: String.raw`
import hashlib, json, math, sys
from pathlib import Path
d = json.load(sys.stdin)
for name, height, volume in [('initial', 8, 25600), ('newer', 9, 28800), ('fresh', 10, 32000)]:
    witness = d[name]
    raw = Path(witness['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == witness['sha256']
    model = json.loads(raw)
    sketch, extrusion = model['nodes']
    assert sketch['id'] == 'n0' and sketch['kind'] == 'sketch'
    if d.get('visual'):
        assert sketch['outline']['points'] == [[0,0],[80,0],[80,40],[0,40]]
        assert sketch['sideTags']['outer'] == ['e1','e2','e3','e4']
    else:
        assert sketch['profile'] == 'rectangle'
        assert sketch['min'] == [0, 0] and sketch['max'] == [80, 40]
    assert extrusion['id'] == 'n1' and extrusion['kind'] == 'extrude' and extrusion['height'] == height
    assert model['outputs'] == {'b1': {'node': 1, 'side': 'solid'}}
    assert 80 * 40 * extrusion['height'] == volume
    assert math.isclose(witness['volume'], volume, rel_tol=0, abs_tol=1e-7)
print(json.dumps({'status': 'PASS', 'nativeVolumesMm3': [25600, 28800, 32000]}))
`,
});

// Supply the existing Studio folder adapter with a handle backed by a disposable real directory.
function installPicker(name) {
  async function request(op, path, fields = {}) {
    const response = await fetch('/d708-folder', { method: 'POST', body: JSON.stringify({ op, path, ...fields }) });
    const reply = await response.json();
    if (reply.error) throw new DOMException(reply.error, reply.name);
    return reply;
  }
  function file(path) {
    return {
      kind: 'file', name: path.at(-1),
      async getFile() {
        const { bytes, lastModified } = await request('read', path);
        return new File([new Uint8Array(bytes)], path.at(-1), { lastModified });
      },
      async createWritable() {
        let bytes;
        return {
          async write(data) { bytes = [...data]; },
          async close() { await request('write', path, { bytes }); },
          async abort() { bytes = undefined; },
        };
      },
    };
  }
  function directory(path) {
    return {
      kind: 'directory', name: path.at(-1) ?? name,
      async getDirectoryHandle(name, { create = false } = {}) {
        const child = [...path, name];
        await request('directory', child, { create });
        return directory(child);
      },
      async getFileHandle(name, { create = false } = {}) {
        const child = [...path, name];
        await request('file', child, { create });
        return file(child);
      },
      async removeEntry(name) { await request('remove', [...path, name]); },
      async *entries() {
        for (const { name, kind } of await request('list', path)) {
          const child = [...path, name];
          yield [name, kind === 'directory' ? directory(child) : file(child)];
        }
      },
    };
  }
  window.showDirectoryPicker = async () => directory([]);
}

async function folderRequest({ op, path, create, bytes }) {
  assert.ok(Array.isArray(path) && path.every(part => part !== '.' && part !== '..' && /^[\w. -]+$/.test(part)), 'fixture-only relative path');
  const name = join(root, ...path);
  if (op === 'list') return (await readdir(name, { withFileTypes: true }))
    .filter(entry => entry.isFile() || entry.isDirectory())
    .map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }));
  if (op === 'directory' && create) {
    try { await mkdir(name); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  if (op === 'file' && create) {
    try { await writeFile(name, '', { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const info = await lstat(name);
  if (op === 'directory' || op === 'file') {
    if (op === 'directory' ? !info.isDirectory() : !info.isFile()) return { error: 'Wrong fixture entry type', name: 'TypeMismatchError' };
    return {};
  }
  if (op === 'remove') { await (info.isDirectory() ? rmdir(name) : unlink(name)); return {}; }
  assert.ok(info.isFile());
  if (op === 'read') return { bytes: [...await readFile(name)], lastModified: info.mtimeMs };
  assert.equal(op, 'write');
  assert.ok(Array.isArray(bytes));
  await writeFile(name + '.crswap', Buffer.from(bytes), { flag: 'wx' });
  await rename(name + '.crswap', name);
  return {};
}

const session = { app: f.app, output: f.output, clientName: visual ? 'D2065' : 'D708', autonomy: visual ? 1 : 2 };
const withMcp = (label, run) => withMcpSession(session, target, label, (_, request) =>
  run((name, args) => request('tools/call', { name, arguments: args })));

const contentOf = reply => JSON.parse(reply.content[0].text);
const summary = async call => contentOf(await call('query', { action: 'summary' })).facts.volume;
const revisionOf = async call => contentOf(await call('query', { action: 'rebuild' })).revision;
async function imageOf(reply, label) {
  assert.equal(reply.isError, false, JSON.stringify(reply.content[0]));
  const [image] = reply.content.filter(item => item.type === 'image');
  const bytes = Buffer.from(image.data, 'base64'), meta = contentOf(reply);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(meta.imageSha256, sha256(bytes));
  assert.equal(Object.keys(meta.views).length, 4);
  await writeFile(join(output, label + '.png'), bytes, { flag: 'wx' });
  return meta;
}

function staleReview(reply) {
  assert.equal(reply.isError, true);
  assert.equal(contentOf(reply).code, 'STORAGE_CHANGED');
  assert.match(contentOf(reply).error, /Reopen.*new cad-mcp session/);
  assert.deepEqual(reply.content.map(item => item.type), ['text']);
  assert.equal(reply.structuredContent, undefined);
}

async function stageReview() {
  await withMcp('stage-visual-proposal', async call => {
    const fields = contentOf(await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true }));
    const corners = fields.sketchCorners.filter(({ point }) => (point[0] === 80 && point[1] === 0) ||
      (point[0] === 0 && point[1] === 40)).map(item => item.sides);
    assert.deepEqual(corners, [['e1', 'e2'], ['e3', 'e4']]);
    const op = { action: 'edit', index: 0, expectedRevision: fields.revision,
      sketchRound: { sketch: fields.id, corners, radius: 4 } };
    const proposed = await call('proposals', { action: 'propose', title: 'Round two plate corners', ops: [{ tool: 'features', args: op }] });
    assert.equal(proposed.isError, false, JSON.stringify(proposed));
    assert.equal(contentOf(proposed).proposal, 'P1');
    assert.equal(contentOf(proposed).applied, false);
  });
  return JSON.parse(await readFile(target, 'utf8'));
}

async function compareVisualReview(call, saveNewer) {
  const baseRevision = await revisionOf(call);
  const list = contentOf(await call('proposals', { action: 'list' })).proposals;
  const { id, modelReviewRevision } = list[0];
  assert.equal(id, 'P1');
  assert.match(modelReviewRevision, /^[a-f0-9]{64}$/);
  const base = { action: 'render', expectedRevision: baseRevision };
  const candidate = { ...base, proposal: id, expectedProposalRevision: modelReviewRevision };
  const accepted = await imageOf(await call('query', base), 'mcp-current-accepted');
  const pending = await imageOf(await call('query', candidate), 'mcp-current-pending');
  assert.notEqual(accepted.imageSha256, pending.imageSha256);
  assert.equal(accepted.revision, baseRevision);
  assert.equal(pending.candidate.baseRevision, baseRevision);
  assert.notEqual(pending.revision, accepted.revision);
  const faces = pending.cornerBatch.faces.map(face => face.name);
  const inspect = { ...candidate, action: 'inspect', faces, expectedReviewRevision: pending.candidate.reviewRevision };
  const prior = await call('query', inspect);
  assert.equal(prior.isError, false);
  assert.equal(contentOf(prior).imageSha256, pending.imageSha256);
  assert.deepEqual(contentOf(prior).candidate, pending.candidate);
  for (const { geometry } of contentOf(prior).faces) assert.ok(Math.abs(geometry.radius - 4) < 1e-8);
  const newer = await saveNewer();
  f.phase = 'Request accepted and pending review after a same-path Studio Save';
  const replies = [];
  for (const args of [base, candidate, inspect, { action: 'render' }]) replies.push(await call('query', args));
  if (baseline) {
    const oldAccepted = await imageOf(replies[0], 'mcp-stale-accepted');
    const oldPending = await imageOf(replies[1], 'mcp-stale-pending');
    assert.deepEqual(oldAccepted, accepted);
    assert.deepEqual(oldPending, pending);
    assert.equal(replies[2].isError, false);
    assert.deepEqual(contentOf(replies[2]), contentOf(prior));
    assert.equal(contentOf(replies[3]).imageSha256, accepted.imageSha256);
  } else for (const reply of replies) staleReview(reply);
  assert.deepEqual(await readFile(target), newer.bytes);
  f.report.observations.push({ label: 'external-review', baseline, accepted, pending,
    afterStudioSave: replies.map(reply => ({ error: reply.isError, contentKinds: reply.content.map(item => item.type), result: contentOf(reply) })) });
  return { base, candidate, accepted, pending };
}


await f.run(async () => {
  await mkdir(root);
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, acceptDownloads: false, serviceWorkers: 'block' });
    await context.addInitScript(installPicker, folder);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.origin !== origin) return route.abort();
      if (url.pathname !== '/d708-folder') return route.continue();
      try { return await route.fulfill({ json: await folderRequest(route.request().postDataJSON()) }); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return route.fulfill({ json: { error: 'Fixture entry is absent', name: 'NotFoundError' } });
      }
    });
    return context;
  };
  const initialDoc = await f.inspect('plate', {});
  await f.newPage();
  const page = f.page, button = name => page.getByRole('button', { name, exact: true });
  const versions = page.getByRole('complementary', { name: 'Versions panel', exact: true });
  const openFolder = async () => {
    if (!(await versions.isVisible())) await button('Project and versions').click();
    await versions.getByRole('button', { name: 'Open folder', exact: true }).click();
    await versions.getByLabel('Project', { exact: true }).waitFor();
  };
  const reopenProjectDocument = async doc => {
    await versions.getByRole('button', { name: 'Close project', exact: true }).click();
    await page.reload();
    await page.waitForSelector('.viewport[data-renderer="webgpu"]');
    await f.ready();
    await openFolder();
    await versions.getByRole('button', { name: 'Open ' + file, exact: true }).click();
    await f.same(doc);
  };
  const save = async label => {
    await button('Save').click();
    await versions.getByRole('list', { name: 'Project documents', exact: true }).getByText(file, { exact: true }).waitFor();
    await page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'detached' });
    const bytes = await readFile(target), copy = join(output, label + '.bcad');
    assert.deepEqual(JSON.parse(bytes.toString()), await f.doc());
    await writeFile(copy, bytes, { flag: 'wx' });
    return { bytes, file: copy, sha256: sha256(bytes) };
  };
  const edit = async (height, label) => {
    const previous = await f.doc();
    await f.openFeatureEditor(1, 'extrusion');
    await f.editor().getByRole('spinbutton', { name: 'Distance', exact: true }).fill(String(height));
    const state = await f.applyEditor(previous, label);
    assert.equal(state.doc.nodes[1].height, height);
    return state.doc;
  };

  f.phase = 'Save the initial Studio model through the folder project';
  await page.locator('input[aria-label="Model file"]').setInputFiles({
    name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(initialDoc)),
  });
  await f.same(initialDoc);
  await openFolder();
  const initial = await save('initial');
  const protocol = {};
  let newer, newerDoc, visualResult;
  const card = page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  if (visual) {
    const staged = await stageReview();
    await reopenProjectDocument(staged);
    if (!(await card.isVisible())) await page.getByRole('button', { name: 'Chat', exact: true }).first().click();
    await card.getByRole('button', { name: 'Preview', exact: true }).click();
    await card.getByRole('button', { name: 'Hide', exact: true }).waitFor();
    await f.same(staged);
    await f.snapshot('Studio-current-pending-preview');
    await card.getByRole('button', { name: 'Hide', exact: true }).click();
  }
  const saveNewer = async () => {
    newerDoc = await edit(9, 'Studio-edit-9');
    newer = await save('newer');
    assert.notEqual(newer.sha256, initial.sha256);
    if (visual) {
      await card.getByRole('button', { name: 'Rebase & preview', exact: true }).waitFor();
      assert.equal(await card.getByRole('button', { name: 'Preview', exact: true }).isDisabled(), true);
      await f.snapshot('Studio-stale-pending-after-save');
    }
    return newer;
  };
  await withMcp('original-session', async call => {
    initial.volume = await summary(call);
    assert.equal(initial.volume, 25600);
    if (visual) { visualResult = await compareVisualReview(call, saveNewer); return; }
    await saveNewer();
    f.phase = 'Refuse the stale external MCP edit after Studio has saved';
    const rejected = await call('features', { action: 'edit', index: 1, values: { h: 7 } });
    protocol.rejected = rejected;
    assert.equal(rejected.isError, true, JSON.stringify(rejected));
    assert.match(rejected.content.at(-1).text, /^Not saved: \[STORAGE_CHANGED\]/);
    assert.equal(rejected.structuredContent, undefined);
    protocol.unsaved = await call('query', { action: 'summary' });
    assert.match(protocol.unsaved.content.at(-1).text, /^Unsaved session model:/);
    assert.deepEqual(await readFile(target), newer.bytes);
  });
  newer.volume = await withMcp('newer-session', async call => {
    if (visual) {
      const revision = await revisionOf(call), { accepted, base, candidate } = visualResult;
      assert.notEqual(revision, base.expectedRevision);
      const current = await imageOf(await call('query', { ...base, expectedRevision: revision }), 'mcp-reopened-accepted');
      assert.equal(current.revision, revision);
      assert.notEqual(current.imageSha256, accepted.imageSha256);
      const staleBase = await call('query', candidate);
      const staleProposal = await call('query', { ...candidate, expectedRevision: revision });
      for (const [reply, code] of [[staleBase, 'MODEL_REVIEW_BASE_STALE'], [staleProposal, 'MODEL_REVIEW_PROPOSAL_STALE']]) {
        assert.equal(reply.isError, true);
        assert.equal(contentOf(reply).code, code);
        assert.deepEqual(reply.content.map(item => item.type), ['text']);
      }
      assert.deepEqual(await readFile(target), newer.bytes);
      f.report.observations.push({ label: 'fresh-file-review', current, staleBase: contentOf(staleBase), staleProposal: contentOf(staleProposal) });
    }
    return summary(call);
  });
  assert.equal(newer.volume, 28800);
  await writeFile(join(output, 'mcp-replies.json'), JSON.stringify(protocol));
  await f.same(newerDoc);
  await f.snapshot('Studio-newer-file-protected');

  f.phase = 'Reopen the protected file and make a normal Studio edit';
  await reopenProjectDocument(newerDoc);
  await f.snapshot('Studio-reopens-9');
  await edit(10, 'Studio-edit-10');
  const fresh = await save('fresh');
  fresh.volume = await withMcp('fresh-session', summary);
  assert.equal(fresh.volume, 32000);
  await f.runOracle({ initial, newer, fresh, visual }, 'native-file-and-volume');
  assert.deepEqual(f.report.downloads, []);
  assert.equal((await readdir(root)).some(name => name.endsWith('.tmp') || name.endsWith('.lock') || name.endsWith('.crswap')), false);
});

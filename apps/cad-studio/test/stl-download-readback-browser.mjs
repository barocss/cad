import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const output = process.argv[2];
const repo = resolve(import.meta.dirname, '../../..');
assert.ok(output && isAbsolute(output) && relative(repo, output).startsWith('../'));
const thin = 1 / 4096;
const box = (index, height, from) => [
  { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [2, 2], id: `n${index}` },
  { kind: 'extrude', sketch: index, height, from, id: `n${index + 1}` },
];
const documentOf = from => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [...box(0, 1, -4), ...box(2, thin, from)],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } }, nextId: 4,
});
const ordinary = documentOf(0), witness = documentOf(9999);
const oracleSource = String.raw`
import hashlib, json, math, pathlib, struct, sys
request = json.load(sys.stdin)
rows = []
def cross(u, v):
    return tuple(u[(i+1)%3]*v[(i+2)%3] - u[(i+2)%3]*v[(i+1)%3] for i in range(3))
for mesh in request['meshes']:
    data = pathlib.Path(mesh['file']).read_bytes()
    count, = struct.unpack_from('<I', data, 80)
    assert count == 12 and len(data) == 84 + count * 50
    vertices, volume = set(), 0
    for i in range(count):
        entry = struct.unpack_from('<12fH', data, 84 + i*50)
        normal, a, b, c = entry[:3], entry[3:6], entry[6:9], entry[9:12]
        assert all(map(math.isfinite, entry)) and entry[12] == 0
        cp = cross(tuple(x-y for x,y in zip(b,a)), tuple(x-y for x,y in zip(c,a)))
        area2 = math.hypot(*cp)
        assert area2 > 0
        assert math.isclose(math.hypot(*normal), 1, abs_tol=1e-7)
        assert all(math.isclose(n, p/area2, abs_tol=1e-7) for n,p in zip(normal,cp))
        vertices.update((a,b,c))
        volume += sum(x*y for x,y in zip(a,cross(b,c)))/6
    expected = {(x,y,z) for x in [0,2] for y in [0,2] for z in mesh['z']}
    assert vertices == expected, vertices
    assert math.isclose(volume, 4*(mesh['z'][1]-mesh['z'][0]), abs_tol=1e-12)
    rows.append(dict(name=pathlib.Path(mesh['file']).name, bytes=len(data), triangles=count,
                     vertices=len(vertices), volume=volume, sha256=hashlib.sha256(data).hexdigest()))
sidecar = json.loads(pathlib.Path(request['sidecar']).read_text())
assert sidecar['files'] == [row['name'] for row in rows]
print(json.dumps(dict(status='PASS', meshes=rows, sidecarFiles=sidecar['files'])))
`;
const f = await createFlow({
  name: 'stl-download-readback', envFrozen: 'STL_DOWNLOAD_FROZEN', output, oracleSource,
  qualification: '#279 actual Chrome STL download files, independent disk readback',
  initialFiles: ['apps/cad-studio/test/stl-download-readback-browser.mjs', 'packages/barocss-cad/src/io/stl.ts',
    'packages/barocss-cad-model/src/engine/stl.ts', 'apps/cad-studio/src/files/useModelExports.ts'],
  limits: ['Synthetic native two-box fixtures, not a manufacturing certificate.',
    'Real browser download events and saveAs files. No Blob/anchor interception or Worker substitution.',
    'Refusal checks cover completed operation plus 1000 ms; genuine unavailable Worker fallback is not tested.'],
});
const button = name => f.page.getByRole('button', { name, exact: true });
const history = () => f.page.locator('.history .hs').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
const downloads = [];
const savedHashes = new Map();
let destination;
async function open(name, doc) {
  f.phase = `open ${name}`;
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: `${name}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
  const bodies = (await f.bodies()).bodies;
  assert.deepEqual(bodies.map(b => b.key), ['b1', 'b3']);
  assert.ok(Math.abs(bodies[0].volume - 4) < 1e-10);
  assert.ok(Math.abs(bodies[1].volume - 4 * thin) < 1e-10);
}
async function exportStl(label, name, doc, quality, refused) {
  f.phase = label;
  destination = join(output, label);
  await mkdir(destination);
  const before = downloads.length, oldHistory = await history();
  await button('Export STL').click();
  const dialog = f.page.getByRole('dialog', { name: 'STL export', exact: true });
  await dialog.getByLabel('STL export quality', { exact: true }).selectOption(quality);
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  const toast = await f.waitToast(/STL written|Could not write STL/);
  if (refused) {
    assert.match(toast, /Could not write STL/);
    const notice = f.page.locator('.toast[role="alert"]').filter({ hasText: 'Could not write STL' });
    await notice.getByText('Details', { exact: true }).click();
    assert.match(await notice.locator('details[open] code').innerText(), /STL_FLOAT32_COLLAPSE/);
    await f.page.waitForTimeout(1000);
    assert.equal(downloads.length, before);
    assert.deepEqual(await readdir(destination), []);
  } else {
    assert.match(toast, /STL written: 2 files/);
    for (let i = 0; i < 100 && downloads.length < before + 3; i++) await f.page.waitForTimeout(100);
    assert.equal(downloads.length, before + 3);
    const files = await Promise.all(downloads.slice(before));
    assert.deepEqual(files.map(file => file.name).sort(), [`${name}-b1.stl`, `${name}-b3.stl`, `${name}.source.json`].sort());
    const result = await f.runOracle({
      meshes: [{ file: join(destination, `${name}-b1.stl`), z: [-4,-3] },
        { file: join(destination, `${name}-b3.stl`), z: [0,thin] }],
      sidecar: join(destination, `${name}.source.json`),
    }, label);
    for (const file of files) savedHashes.set(file.path, file.sha256);
    f.report.observations.push({ label, readback: result });
  }
  for (const [file, hash] of savedHashes) assert.equal(sha256(await readFile(file)), hash);
  await f.same(doc);
  assert.deepEqual(await history(), oldHistory);
  await f.snapshot(label);
  f.report.observations.push({ label, quality, toast, newDownloadEvents: downloads.length - before,
    preservedFiles: savedHashes.size, documentAndHistoryUnchanged: true });
  await f.dismissToasts();
}
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const createContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await createContext({ ...options, serviceWorkers: 'block', acceptDownloads: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  f.page.on('download', download => {
    const folder = destination;
    downloads.push((async () => {
      const name = download.suggestedFilename();
      assert.equal(name, name.split('/').pop());
      const path = join(folder, name);
      await download.saveAs(path);
      assert.equal(await download.failure(), null);
      const bytes = await readFile(path);
      const record = { name, path, bytes: bytes.length, sha256: sha256(bytes) };
      f.report.files.push(record);
      return record;
    })());
  });
  f.report.fixtureHashes = { ordinary: sha256(JSON.stringify(ordinary)), witness: sha256(JSON.stringify(witness)) };
  await open('stl-readback-ordinary', ordinary);
  await exportStl('01-ordinary-automatic', 'stl-readback-ordinary', ordinary, 'automatic', false);
  await open('stl-readback-thin', witness);
  await exportStl('02-refused-automatic', 'stl-readback-thin', witness, 'automatic', true);
  await exportStl('03-refused-fine', 'stl-readback-thin', witness, '32', true);
  await open('stl-readback-ordinary', ordinary);
  await exportStl('04-recovery-fine', 'stl-readback-ordinary', ordinary, '32', false);
  assert.equal(f.report.downloads.length, 6);
  f.phase = 'complete';
});

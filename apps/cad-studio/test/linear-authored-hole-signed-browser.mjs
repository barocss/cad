import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/linear-authored-hole-signed-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/Hud.tsx',
  'apps/cad-studio/src/app/patternHoleSpacing.ts',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'linear-authored-hole-signed', output: process.argv[2], envFrozen: 'LINEAR_AUTHORED_HOLE_SIGNED_SOURCE_FROZEN',
  qualification: 'Author a terminal through Hole by picking its copy, reverse Linear pattern spacing, then Save and freshly Open.',
  limits: ['One-body X Linear pattern with three separate rectangular pieces and a terminal simple through Hole created by desktop Studio.'],
  snapshotExtra: () => ({
    undoRedo: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`)?.disabled),
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    shown: window.__studioSection(),
  }),
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkBrep, checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [body] = evaluateCadPart(toPartDocument(doc)).outputs;
const walls = body.brep.faces.filter(face => face.name?.startsWith('n3.')).map(faceGeometry);
const tops = body.brep.faces.filter(face => /^n1\\.top(?:@\\d+)?$/.test(face.name ?? ''))
  .map(face => [face.name, face.loops.length]).sort(([a], [b]) => a.localeCompare(b));
console.log(JSON.stringify({ valid: checkOutput(body).valid, strict: checkBrep(body.brep, { strict: true }).valid, vertices: body.brep.vertices.map(vertex => vertex.point), volume: massPropertiesOf(body).volume, walls, tops }));
`,
});
const ref = node => ({ node, side: 'solid' });
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [50, 10], max: [54, 16] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { kind: 'linear-pattern', parent: ref(1), axis: 'x', spacing: 16, count: 3, id: 'n2' },
  ],
  outputs: { b2: ref(2) }, nextId: 3,
};
const button = name => f.page.getByRole('button', { name, exact: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} versus ${expected}`);

async function open(name, model) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model)) });
  await f.same(model);
}

async function verify(label, model, spacing, holeX) {
  const native = await f.inspect(label, model);
  f.report.observations.push({ label, native });
  await f.persist();
  assert.equal(native.valid, true);
  assert.equal(native.strict, true);
  assert.deepEqual(native.tops, [['n1.top', 1], ['n1.top@1', 1], ['n1.top@2', 2]]);
  for (const index of [0, 1, 2]) {
    for (const x of [50, 54]) {
      for (const y of [10, 16]) {
        for (const z of [0, 8]) {
          const corner = [x + index * spacing, y, z];
          const matches = native.vertices.filter(vertex => corner.every((value, axis) => Math.abs(value - vertex[axis]) < 1e-7));
          assert.equal(matches.length, 1, 'Expected exactly one stock corner at ' + corner.join(', '));
        }
      }
    }
  }
  assert.equal(native.walls.length, 2);
  for (const wall of native.walls) {
    assert.equal(wall.kind, 'cylinder');
    near(wall.c[0], holeX);
    near(wall.c[1], 13);
    near(wall.r, 1);
  }
  near(native.volume, 576 - 8 * Math.PI);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  await open('linear-signed-authored-hole', stock);
  const views = f.page.locator('.views');
  await views.getByRole('button', { name: 'Top', exact: true }).click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'TOP');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const filter = button('Selection filter');
  for (let attempt = 0; attempt < 6 && !(await filter.innerText()).includes('Faces'); attempt++) await filter.click();
  assert.ok((await filter.innerText()).includes('Faces'));
  const point = [84, 13, 8];
  const coords = await f.page.evaluate(point => window.__studioScreenOf(point), point);
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), coords));
  await f.page.mouse.click(...coords);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.faces.length === 1);
  await f.page.keyboard.press('h');
  const hole = f.page.getByRole('dialog', { name: 'Hole', exact: true });
  await hole.waitFor();
  const spin = name => hole.getByRole('spinbutton', { name, exact: true });
  assert.ok(Math.abs(Number(await spin('Centre X').inputValue()) - 84) <= 0.15);
  assert.ok(Math.abs(Number(await spin('Centre Y').inputValue()) - 13) <= 0.15);
  await spin('Centre X').fill('84');
  await spin('Centre Y').fill('13');
  await spin('Diameter').fill('2');

  f.phase = 'check that the real pick produces a through Hole preview on copy 3';
  assert.equal(await hole.getByLabel('Type', { exact: true }).inputValue(), 'through');
  assert.match(await hole.innerText(), /Entry face\s+n1\.top@2/);
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent.trim() === 'preview'
    && window.__studioSection()?.shownKeys.includes('b3'));
  const preview = await f.snapshot('hole-preview');
  assert.deepEqual(preview.doc, stock);
  assert.deepEqual(preview.shown.shownKeys, ['b3']);

  f.phase = 'apply the Hole and verify copy 3 before editing';
  await hole.getByRole('button', { name: 'Apply', exact: true }).click();
  await f.changed(stock);
  const created = await f.snapshot('hole-applied');
  assert.equal(created.doc.nodes[3].kind, 'hole');
  assert.equal(created.doc.nodes[3].depth, undefined);
  assert.deepEqual(created.doc.nodes[3].parent, ref(2));
  assert.equal(created.doc.nodes[3].face, 'n1.top@2');
  assert.deepEqual(created.doc.nodes[3].center, [84, 13]);
  await verify('positive-native', created.doc, 16, 84);

  f.phase = 'refuse zero and recover in the same History editor';
  await f.openFeatureEditor(2, 'Linear pattern');
  const spacing = f.editor().getByRole('spinbutton', { name: 'Spacing', exact: true });
  const apply = f.editor().getByRole('button', { name: 'Apply', exact: true });
  const before = await f.snapshot('before-spacing');
  await spacing.fill('0');
  await apply.click();
  await f.editor().getByText('Keep a gap between pattern copies', { exact: false }).waitFor();
  const refused = await f.snapshot('zero-refused');
  for (const key of ['doc', 'history', 'undoRedo', 'dirty']) assert.deepEqual(refused[key], before[key], key);

  await spacing.fill('-16');
  const reversed = await f.applyEditor(created.doc, 'negative-spacing-applied');
  const expected = {
    ...created.doc,
    nodes: created.doc.nodes.map((node, index) => {
      if (index === 2) return { ...node, spacing: -16 };
      if (index === 3) return { ...node, center: [20, 13] };
      return node;
    }),
  };
  assert.deepEqual(reversed.doc, expected);
  await verify('negative-native', reversed.doc, -16, 20);
  await f.undo();
  await f.same(created.doc);
  await verify('undo-native', await f.doc(), 16, 84);
  await f.redo();
  await f.same(reversed.doc);

  f.phase = 'save and reopen the negative-spacing part from the browser project';
  const projectName = 'Linear signed authored Hole', file = 'linear-signed-authored-hole.bcad';
  const project = f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
  async function connectProject() {
    await button('Project and versions').click();
    await project.getByRole('textbox', { name: 'Browser project name', exact: true }).fill(projectName);
    await project.getByRole('button', { name: 'Project in this browser', exact: true }).click();
    await project.getByLabel('Project', { exact: true }).waitFor();
  }
  await connectProject();
  await button('Save').click();
  await project.getByRole('list', { name: 'Project documents', exact: true }).getByText(file, { exact: true }).waitFor();
  const saved = await f.page.evaluate(async ([name, file]) => {
    const root = await navigator.storage.getDirectory();
    const folder = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(name);
    return JSON.parse(await (await (await folder.getFileHandle(file)).getFile()).text());
  }, [projectName, file]);
  assert.deepEqual(saved, reversed.doc);
  await project.getByRole('button', { name: 'Close project', exact: true }).click();
  await project.getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await connectProject();
  await project.getByRole('button', { name: 'Open ' + file, exact: true }).click();
  await f.same(reversed.doc);
  const reopened = await f.snapshot('negative-reopened');
  assert.equal(reopened.dirty, false);
  await verify('reopened-native', reopened.doc, -16, 20);
  await f.openFeatureEditor(2, 'Linear pattern');
  await f.editor().getByLabel('Spacing', { exact: true }).fill('16');
  const restored = await f.applyEditor(reopened.doc, 'original-spacing-restored');
  assert.deepEqual(restored.doc, created.doc);
  await verify('restored-native', restored.doc, 16, 84);
  assert.deepEqual(f.report.downloads, []);
});

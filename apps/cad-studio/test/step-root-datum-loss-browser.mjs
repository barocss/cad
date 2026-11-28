import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const fixture = 'datum-stock.bcad';
const project = 'D2171 native datum retention';
const datumLoss = 'Named reference datums and their coordinate systems are not included.';
const pins = ['apps/cad-studio/test/step-root-datum-loss-browser.mjs', 'apps/cad-studio/src/files/StepExportPanel.tsx',
  'apps/cad-studio/src/files/stepExportPreparation.ts', 'apps/cad-studio/src/engine/engine.worker.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts'];
const f = await createFlow({
  name: 'step-root-datum-loss', output: process.argv[2], envFrozen: 'STEP_ROOT_DATUM_LOSS_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Actual in-memory STEP preparation with named root datum loss, independent vertex readback and native project Open.',
  limits: ['One 80 × 50 × 10 mm native box, exact root datums, no browser download or independent commercial reader.'],
  inspectorSource: "export { exportStudioStep } from '@barocss/cad-model/engine/evaluate';",
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 2, parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [80, 50] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const datums = [
  { id: 'D1', name: 'F_SETUP', kind: 'plane', origin: [10, 20, 30], normal: [1, 0, 0], xAxis: [0, 1, 0] },
  { id: 'D2', name: 'F_SETUP', kind: 'plane', origin: [-5, 12, 40], normal: [0, 0.6, 0.8], xAxis: [1, 0, 0] },
  { id: 'D3', name: '검사 기준', kind: 'plane', origin: [7, 8, 15], normal: [0, 0, 1], xAxis: [1, 0, 0] },
];
const authored = { ...stock, references: { version: 1, references: [], keepouts: [], datums } };
const button = (name, parent = f.page) => parent.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('region', { name: 'STEP export', exact: true });
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });

function observeStepReplies() {
  const RealWorker = window.Worker;
  window.__stepDatumReplies = [];
  window.Worker = class extends RealWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        const result = event.data?.step;
        if (result?.text?.startsWith('ISO-10303-21;')) window.__stepDatumReplies.push(result);
      });
    }
  };
}

function readBox(text) {
  const data = text.split('\nDATA;\n')[1];
  assert.ok(data, 'actual STEP DATA section');
  const lines = data.split('\n');
  const points = new Map();
  for (const line of lines) {
    const match = /^(#\d+)=CARTESIAN_POINT\('(?:[^']|'')*',\(([^()]*)\)\);$/.exec(line);
    if (match) points.set(match[1], match[2].split(',').map(Number));
  }
  const vertices = lines.flatMap(line => {
    const match = /^#\d+=VERTEX_POINT\('(?:[^']|'')*',(#\d+)\);$/.exec(line);
    return match ? [points.get(match[1])] : [];
  });
  assert.equal(vertices.length, 8, 'eight referenced native box vertices');
  assert.ok(vertices.every(point => point?.length === 3 && point.every(Number.isFinite)));
  assert.equal(new Set(vertices.map(point => point.join(','))).size, 8);
  assert.equal(lines.filter(line => /=MANIFOLD_SOLID_BREP\(/.test(line)).length, 1);
  const min = [0, 1, 2].map(axis => Math.min(...vertices.map(point => point[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...vertices.map(point => point[axis])));
  assert.deepEqual(min, [0, 0, 0]);
  assert.deepEqual(max, [80, 50, 10]);
  for (const vertex of vertices) assert.ok(vertex.every((value, axis) => value === min[axis] || value === max[axis]));
  return { data, min, max, volume: max.reduce((volume, upper, axis) => volume * (upper - min[axis]), 1) };
}

async function prepare() {
  const count = await f.page.evaluate(() => window.__stepDatumReplies.length);
  await button('Export STEP').click();
  await panel().waitFor();
  await f.page.waitForFunction(count => window.__stepDatumReplies.length > count
    && document.querySelector('[aria-label="STEP export"] button.primary')?.disabled === false, count);
  return f.page.evaluate(() => window.__stepDatumReplies.at(-1));
}

async function openProject() {
  if (!(await versions().isVisible())) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, acceptDownloads: false });
    await context.addInitScript(observeStepReplies);
    return context;
  };
  const inputs = await Promise.all(['plain', 'authored'].map(async label => {
    const dir = join(f.output, label);
    await mkdir(dir);
    return join(dir, fixture);
  }));
  await writeFile(inputs[0], JSON.stringify(stock));
  await writeFile(inputs[1], JSON.stringify(authored));
  await f.freshOpen(inputs[0], stock, 'plain-root-model');
  const plain = await prepare();
  const nativeBox = readBox(plain.text);
  assert.equal(plain.omitted?.includes(datumLoss), false);
  assert.equal(plain.omittedRootDatums, undefined);
  await button('Cancel', panel()).click();

  await f.openFile(inputs[1], authored.nodes.length);
  await f.same(authored);
  const omitted = await prepare();
  assert.equal(omitted.omitted.includes(datumLoss), true);
  assert.notEqual(omitted.source, plain.source);
  assert.equal(readBox(omitted.text).data, nativeBox.data);
  assert.equal(nativeBox.volume, 40_000);
  assert.doesNotMatch(omitted.text, /F_SETUP|검사 기준/);
  assert.match(omitted.text, /AXIS2_PLACEMENT_3D/);
  await panel().getByText(datumLoss, { exact: true }).waitFor();
  const datumList = panel().getByRole('list', { name: 'Omitted root reference datums', exact: true });
  if (baseline) {
    assert.equal(omitted.omittedRootDatums, undefined);
    assert.equal(await datumList.count(), 0);
    await f.same(authored);
    await f.snapshot('baseline-reports-only-generic-datum-loss');
    return;
  }
  const expected = datums.map(({ id, name, kind }) => ({ id, name, kind }));
  assert.deepEqual(omitted.omittedRootDatums, expected);
  await panel().getByText('Show omitted root reference datums', { exact: true }).click();
  await datumList.waitFor();
  assert.deepEqual(await datumList.getByRole('listitem').allTextContents(), expected.map(datum => `${datum.name} · ${datum.id} · ${datum.kind}`));
  await f.same(authored);
  await f.snapshot('prepared-step-root-datums-listed');
  await button('Cancel', panel()).click();
  await f.same(authored);

  await openProject();
  await button('Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(fixture, { exact: true }).waitFor();
  const saved = await f.page.evaluate(async ({ project, fixture }) => {
    const root = await navigator.storage.getDirectory();
    const projects = await root.getDirectoryHandle('projects');
    const directory = await projects.getDirectoryHandle(project);
    return (await (await directory.getFileHandle(fixture)).getFile()).text();
  }, { project, fixture });
  assert.deepEqual(JSON.parse(saved), authored);
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await openProject();
  await button('Open ' + fixture, versions()).click();
  await f.same(authored);
  const reopened = await prepare();
  assert.equal(reopened.source, omitted.source);
  assert.deepEqual(reopened.omittedRootDatums, expected);
  assert.equal(readBox(reopened.text).data, nativeBox.data);
  await f.snapshot('fresh-open-keeps-native-datums');
  await button('Cancel', panel()).click();
  await f.same(authored);
  assert.deepEqual(f.report.downloads, []);
  f.report.observations.push({ dataSha256: sha256(nativeBox.data), volume: nativeBox.volume, bounds: [nativeBox.min, nativeBox.max],
    originalRevision: plain.source, datumRevision: omitted.source, omittedRootDatums: expected, savedSha256: sha256(saved) });
});

// #618. Run under the heavy gate from apps/cad-studio.
// EXPLICIT_MATERIAL_SOURCE_FROZEN=1 node test/explicit-body-material-browser.mjs EXTERNAL_OUTPUT --expect=repro|fixed
import assert from 'node:assert/strict';
import { isAbsolute, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const [output, mode] = process.argv.slice(2);
const repo = resolve(import.meta.dirname, '../../..');
assert.ok(output && isAbsolute(output) && relative(repo, output).startsWith('../'));
assert.ok(['--expect=repro', '--expect=fixed'].includes(mode));
const repro = mode === '--expect=repro';
const unresolved = 'unresolved-fixture-material';
const cube = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10], id: 'n0' },
    { kind: 'extrude', sketch: 0, height: 10, id: 'n1' },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
  requirements: [
    { id: 'M', source: 'Mass at most 3 g', hard: true, check: { op: '<=', query: { fn: 'mass' }, value: 3, unit: 'g' } },
    { id: 'V', source: 'Volume at least 900 mm³', hard: false, check: { op: '>=', query: { fn: 'volume' }, value: 900, unit: 'mm³' } },
  ],
};
const withMaterial = material => ({ ...cube, bodies: { b1: { material, color: '#2878a0' } } });
const unknown = withMaterial(unresolved), steel = withMaterial('steel'), aluminium = withMaterial('al6061');
const oracleSource = String.raw`
import json, math, sys
data = json.load(sys.stdin)
doc = data['doc']
width, depth = doc['nodes'][0]['max']
height = doc['nodes'][1]['height']
volume = width * depth * height
body, = data['bodies']
assert math.isclose(body['volume'], volume, abs_tol=1e-9, rel_tol=0), body
assert all(math.isclose(a,b,abs_tol=1e-9,rel_tol=0) for a,b in zip(body['centroid'],[width/2,depth/2,height/2],strict=True)), body
material = doc['bodies']['b1']['material']
rho = {'al6061': 2.7, 'steel': 7.85}.get(material)
mass = volume * rho / 1000 if rho is not None else None
expected = 'unknown' if mass is None else 'pass' if mass <= 3 else 'fail'
assert data['observed'] == data['expected'], data
assert (expected != data['observed']) == data['reproduced'], data
print(json.dumps({'status':'PASS','expected':expected,'observed':data['observed'],'volume':volume,'mass':mass,'material':material}))
`;
const pins = ['apps/cad-studio/test/explicit-body-material-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/SelectionInspector.tsx', 'apps/cad-studio/src/state/useModelChecks.ts',
  'apps/cad-studio/src/ui/RequirementsBrowser.tsx',
  ...['analysis/analysis', 'app/bodies', 'chat/observe', 'chat/spec', 'chat/part/query', 'engine/migrate', 'library/materials'].map(p => 'packages/barocss-cad-model/src/' + p + '.ts')];
const f = await createFlow({
  name: 'explicit-body-material', envFrozen: 'EXPLICIT_MATERIAL_SOURCE_FROZEN', output, qualification: '#618 explicit material desktop',
  initialFiles: pins, requiredFrozen: pins, oracleSource,
  limits: ['Actual native box, independent density arithmetic, existing Studio requirements and body material controls. Saves use local browser OPFS.'],
  snapshotExtra: () => ({
    material: document.querySelector('select[aria-label="Material"]')?.value ?? null,
    summary: document.querySelector('.req-head .muted')?.textContent,
    massCheck: document.querySelector('[aria-label="Requirement M"]')?.classList[1],
    partSummary: document.querySelector('.part-summary')?.textContent,
    inspector: document.querySelector('[aria-label="Selection"]')?.textContent,
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    historyControls: ['Undo', 'Redo'].map(name => {
      const button = document.querySelector(`button[aria-label="${name}"]`);
      return { disabled: button.disabled, tip: button.getAttribute('data-tip') };
    }),
  }),
});
// Object member order is not part of a saved document's semantic identity.
f.same = async expected => {
  await f.page.waitForFunction(expected => {
    const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
    return JSON.stringify(sorted(window.__studioDoc)) === JSON.stringify(sorted(expected));
  }, expected, { timeout: 15000 });
  await f.ready(); assert.deepEqual(await f.doc(), expected);
};
const button = name => f.page.getByRole('button', { name, exact: true });
const materialPicker = () => f.page.getByRole('combobox', { name: 'Material', exact: true });
const requirement = id => f.page.getByRole('listitem', { name: 'Requirement ' + id, exact: true });

async function open(name, doc, bytes = Buffer.from(JSON.stringify(doc))) {
  f.phase = 'public Open ' + name;
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: name + '.bcad', mimeType: 'application/octet-stream', buffer: bytes });
  await f.same(doc);
}

async function check(label, doc, expected, { selected = false } = {}) {
  f.phase = label;
  await f.same(doc);
  const counts = { fail: '1 ✓ · 1 ✗ · 0 ?', pass: '2 ✓ · 0 ✗ · 0 ?', unknown: '1 ✓ · 0 ✗ · 1 ?' };
  await f.page.waitForFunction(({ expected, summary }) => {
    return document.querySelector('.req-head .muted')?.textContent === summary
      && document.querySelector('[aria-label="Requirement M"]')?.classList.contains(expected)
      && document.querySelector('[aria-label="Requirement V"]')?.classList.contains('pass');
  }, { expected, summary: counts[expected] });
  const state = await f.snapshot(label);
  if (expected === 'unknown') {
    assert.match(await requirement('M').innerText(), /b1/);
    assert.match(await requirement('M').innerText(), new RegExp(unresolved));
    if (selected) {
      assert.equal(state.material, unresolved);
      assert.match(state.inspector, /unresolved|unknown/i);
    } else assert.match(state.partSummary, /unknown/i);
  }
  if (selected && doc.bodies.b1.material === unresolved && repro) {
    assert.equal(state.material, 'al6061');
    assert.match(state.inspector, /2\.7 g/);
  }
  await f.runOracle({ doc: state.doc, bodies: state.bodies.bodies, observed: state.massCheck,
    expected, reproduced: repro && doc.bodies.b1.material === unresolved }, label);
  return state;
}

async function selectBody() {
  await f.page.getByRole('complementary', { name: 'Browser', exact: true })
    .locator('.ol-row > button.ol[title="Double-click to rename"]').click();
  await materialPicker().waitFor();
}

async function saveToProject(doc, fileName) {
  const project = 'D580 material provenance', file = fileName + '.bcad';
  f.phase = 'local project Save ' + file;
  await f.page.locator('.doc-tab input').fill(fileName);
  const panel = f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
  if (!await panel.isVisible()) await button('Project and versions').click();
  if (!await panel.getByLabel('Project', { exact: true }).isVisible()) {
    await panel.getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
    await panel.getByRole('button', { name: 'Project in this browser', exact: true }).click();
    await panel.getByLabel('Project', { exact: true }).waitFor();
  }
  await button('Save').click();
  await panel.getByRole('list', { name: 'Project documents', exact: true }).getByText(file, { exact: true }).waitFor();
  const saved = await f.page.evaluate(async ({ project, file }) => {
    const root = await navigator.storage.getDirectory();
    const projects = await root.getDirectoryHandle('projects');
    const folder = await projects.getDirectoryHandle(project);
    return (await (await folder.getFileHandle(file)).getFile()).text();
  }, { project, file });
  assert.deepEqual(JSON.parse(saved), doc);
  f.report.files.push({ file, sha256: sha256(saved), semanticEquality: true, destination: 'OPFS' });
  return Buffer.from(saved);
}

await f.run(async () => {
  for (const width of [1024, 1440]) {
    await f.newPage(); await f.page.setViewportSize({ width, height: 1000 });
    await open('explicit-steel', steel); await selectBody();
    await check(`${width}-steel`, steel, 'fail', { selected: true });
    await materialPicker().selectOption('al6061');
    await check(`${width}-explicit-default`, aluminium, 'pass', { selected: true });
    await f.undo(); await check(`${width}-undo-steel`, steel, 'fail');
    await f.redo(); await check(`${width}-redo-aluminium`, aluminium, 'pass');
    if (!await materialPicker().isVisible()) await selectBody();
    await materialPicker().selectOption('al6061');
    await check(`${width}-same-explicit-default`, aluminium, 'pass');
    const saved = await saveToProject(aluminium, `explicit-material-${width}`);
    await f.newPage(); await f.page.setViewportSize({ width, height: 1000 });
    await open('saved-explicit-default', aluminium, saved);
    await check(`${width}-saved-open`, aluminium, 'pass');
    await open('unresolved', unknown); await selectBody();
    await check(`${width}-unresolved`, unknown, 'unknown', { selected: true });
    await materialPicker().selectOption('al6061');
    await check(`${width}-unresolved-repaired`, aluminium, 'pass', { selected: true });
    const assumed = { ...cube, bodies: { b1: { color: '#2878a0' } } };
    await open('assumed', assumed);
    await f.page.waitForFunction(() => document.querySelector('[aria-label="Requirement M"]')?.classList.contains('unknown'));
    await f.same(assumed); await f.snapshot(`${width}-unassigned-still-unknown`);
    const inherited = { ...assumed, brief: { version: 1, material: { value: 'steel', basis: 'stated', source: 'steel' } } };
    await open('inherited', inherited); await selectBody();
    await f.page.waitForFunction(() => document.querySelector('[aria-label="Requirement M"]')?.classList.contains('fail'));
    await f.same(inherited);
    await materialPicker().selectOption('al6061');
    const explicit = { ...inherited, bodies: aluminium.bodies };
    await check(`${width}-override-brief`, explicit, 'pass', { selected: true });
    await materialPicker().selectOption('steel');
    const explicitBrief = { ...inherited, bodies: steel.bodies };
    await check(`${width}-explicit-same-as-brief`, explicitBrief, 'fail', { selected: true });
    f.report.observations.push({ width, explicitDefaultPreserved: true, sameOptionPreserved: true, undoRedo: true, saveFreshOpen: true, unresolvedRecovery: true, unassignedUnknown: true, briefInheritancePreserved: true, explicitBriefPreserved: true });
  }
});

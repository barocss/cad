import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const pins = ['apps/cad-studio/test/circular-x-history-browser.mjs', 'apps/cad-studio/test/model-rail-helper.mjs',
  'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx', 'apps/cad-studio/src/state/useCommandPreview.ts',
  'packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/circularPatternSpan.ts'];
const f = await createFlow({
  name: 'circular-x-history', output: process.argv[2], envFrozen: 'CIRCULAR_X_HISTORY_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Circular Pattern Count uses the same limits in desktop preview and history.',
  limits: ['One disjoint rectangular seed, X-axis One body at 1024×800 and 1440×900; no native folder or downloads.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partBreps, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const evaluated = evaluateDoc(doc, 1);
assert.ok(evaluated.ok, JSON.stringify(evaluated));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, brep, volume: evaluated.bodies.find(body => body.key === key)?.volume,
}))));
`,
  oracleSource: String.raw`
import itertools, json, math, sys
d = json.load(sys.stdin)
original = set(itertools.product([10,14], [20,26], [0,8]))
def rotate(v):
    x,y,z = v
    return (x,-z,y) if d['axis']=='x' else (z,y,-x)
expected = [original]
for k in range(1,d['count']):
    expected.append({rotate(v) for v in expected[-1]})
assert len(set.union(*expected)) == 8*d['count']
def points(vertices):
    result = set()
    for vertex in vertices:
        point = vertex['point']
        nearest = tuple(round(x) for x in point)
        assert all(math.isclose(a,b,abs_tol=1e-9,rel_tol=0) for a,b in zip(point,nearest)),point
        result.add(nearest)
    return result
def pieces(brep):
    for body in brep['bodies']:
        assert body['kind']=='solid',body
        shells = [s for s in brep['shells'] if s['body']==body['id']]
        assert len(shells)==1 and shells[0]['closed']
        face_ids = set(shells[0]['faces'])
        loops = {i for f in brep['faces'] if f['id'] in face_ids for i in f['loops']}
        coedges = {i for l in brep['loops'] if l['id'] in loops for i in l['coedges']}
        edges = {c['edge'] for c in brep['coedges'] if c['id'] in coedges}
        vertices = {v for e in brep['edges'] if e['id'] in edges for v in e['vertices']}
        corners = points(v for v in brep['vertices'] if v['id'] in vertices)
        assert len(corners)==8,corners
        yield frozenset(corners)
bodies = d['outputs']
if d['mode']=='one':
    body, = bodies
    assert len(body['brep']['bodies'])==d['count'],body
    assert math.isclose(body['volume'],192*d['count'],abs_tol=1e-7,rel_tol=0),body
else:
    assert len(bodies)==d['count'] and len({b['key'] for b in bodies})==d['count'],bodies
    assert all(len(b['brep']['bodies'])==1 and math.isclose(b['volume'],192,abs_tol=1e-7,rel_tol=0) for b in bodies),bodies
assert {p for b in bodies for p in pieces(b['brep'])}=={frozenset(p) for p in expected},bodies
print(json.dumps({'status':'PASS','count':d['count'],'volume':192*d['count'],'corners':8*d['count']}))
`,

});
const source = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [10, 20], max: [14, 26] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 }], outputs: { b1: { node: 1, side: 'solid' } } };
let viewport;
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Circular pattern', exact: true });
const count = scope => scope.getByLabel('Count', { exact: true });
const state = value => f.page.waitForFunction(value => document.querySelector('.hud .status')?.textContent === value, value);
async function open(doc = source) {
  await f.newPage();
  await f.page.setViewportSize(viewport);
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button(f.page, 'Open').click()]);
  await chooser.setFiles({ name: 'D1141-circular-count.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}
async function begin(axis) {
  await f.page.locator('.outliner .ol-row > button.ol').click();
  await clickModelCommand(f.page, 'Pattern', 'Circular pattern');
  await hud().getByLabel('Axis', { exact: true }).selectOption(axis);
  await state('preview');
}
async function refuse(scope, value, doc, label, creation = false) {
  const field = count(scope);
  await field.fill(value);
  if (creation) await state('refused');
  assert.equal(await field.inputValue(), value);
  assert.equal(await field.getAttribute('aria-invalid'), 'true');
  assert.equal(await button(scope, 'Apply').isDisabled(), true);
  await field.press('Enter');
  await f.same(doc);
  if (label) await f.snapshot(label);
}

async function physical(label, doc, axis, count) {
  const outputs = await f.inspect(label, doc);
  return f.runOracle({ outputs, axis, mode: 'one', count }, label);
}
  const saveReopen = async (doc, label) => {
    const project = 'X History ' + label, name = 'x-history-' + label + '.bcad';
    await f.page.locator('.doc-tab input').fill(name.slice(0, -5));
    const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
    const attach = async () => {
      if (!(await versions().isVisible())) await button(f.page, 'Project and versions').click();
      await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
      await versions().getByRole('button', { name: 'Project in this browser', exact: true }).click();
      await versions().getByLabel('Project', { exact: true }).waitFor();
    };
    await attach();
    await button(f.page, 'Save').click();
    await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
    await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
    const saved = await f.page.evaluate(async ([project, name]) => {
      const root = await navigator.storage.getDirectory();
      const dir = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(project);
      return (await (await dir.getFileHandle(name)).getFile()).text();
    }, [project, name]);
    assert.deepEqual(JSON.parse(saved), doc);
    await versions().getByRole('button', { name: 'Close project', exact: true }).click();
    await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
    await f.page.reload();
    await f.ready();
    await attach();
    await versions().getByRole('button', { name: 'Open ' + name, exact: true }).click();
    await f.same(doc);
    await f.snapshot('reopened-' + label);
    await physical('reopened-' + label, doc, 'x', 4);
    f.report.files.push({ name, sha256: sha256(saved) });
  };

await f.run(async () => {
  for (viewport of [{ width: 1024, height: 800 }, { width: 1440, height: 900 }]) {
    const axis = 'x', maximum = 4;
    const label = String(viewport.width);
    f.phase = 'verify shared Count rules on axis ' + axis;
    await open();
    await begin(axis);
    const currentHud = hud();
    const range = new RegExp(`whole number from 2 to ${maximum}\\b`, 'i');
    assert.equal(await count(currentHud).getAttribute('max'), String(maximum));
    await currentHud.getByText(range).waitFor();
    for (const value of ['', '0', '1', '2.5', String(maximum + 1)]) {
      await refuse(currentHud, value, source, value === String(maximum + 1) ? label + '-create-refusal' : undefined, true);
    }
    await count(currentHud).fill('3');
    await state('preview');
    await button(currentHud, 'Apply').click();
    await currentHud.waitFor({ state: 'hidden' });
    await f.changed(source);
    const first = await f.doc();
    assert.equal(first.nodes[2].count, 3);
    await physical(label + '-created-three', first, axis, 3);
    const firstBodies = await f.bodies();
    assert.ok(Math.abs(firstBodies.bodies[0].volume - 576) < 1e-7);

    await f.openFeatureEditor(2);
    const editor = f.editor();
    assert.equal(await count(editor).getAttribute('max'), String(maximum));
    await editor.getByText(range).waitFor();
    for (const value of ['', '0', '1', '2.5', String(maximum + 1)]) {
      await refuse(editor, value, first, value === String(maximum + 1) ? label + '-history-refusal' : undefined);
    }
    await count(editor).fill('4');
    const { doc, bodies } = await f.applyEditor(first, label + '-count-four');
    await physical(label + '-history-four', doc, axis, 4);
    assert.equal(doc.nodes[2].angle, 90);
    assert.equal(doc.nodes[2].count, 4);
    assert.ok(Math.abs(bodies.bodies[0].volume - 768) < 1e-7);
    await f.undo();
    await f.same(first);
    await physical(label + '-undo-three', first, axis, 3);
    await f.redo();
    await f.same(doc);
    await physical(label + '-redo-four', doc, axis, 4);
    await saveReopen(doc, label);
    f.report.observations.push({ label, axis, maximum, count: 4, stepDegrees: 90, volumeMM3: bodies.bodies[0].volume });
  }
  assert.deepEqual(f.report.downloads, []);
});

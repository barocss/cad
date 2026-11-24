import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const id = 'manual-bore-spacing';
const f = await createFlow({
  name: 'drawing-extension-lifecycle', output: process.argv[2], envFrozen: 'D1923_SOURCE_FROZEN',
  qualification: 'Retain a native manual dimension’s witness role through source changes, Auto, sheet ownership and native Open.',
  limits: ['One ordinary Top view of a base plate with three native through-holes. Actual desktop Studio and original SVG only.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { brepsFor, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { snapPoints } from '@barocss/cad-model/drawing/dimensions';
import { readDrawing } from '@barocss/cad-model/drawing/types';
const doc = { format:'barocss-cad-model', schema:3, units:'mm', parameters:{}, nextId:5,
  nodes:[
    {kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[80,40]},
    {kind:'extrude',id:'n1',sketch:0,height:8},
    ...[22,58,40].map((x,i)=>({kind:'hole',id:'n'+(i+2),parent:{node:i+1,side:'solid'},
      face:'n1.top',center:[x,20],radius:i===2?4:5})),
  ],
  outputs:{b4:{node:4,side:'solid'}},
};
const input = brepsFor(doc);
assert.ok('breps' in input);
const projected = projectViews(input.breps,input.prefixes);
assert.ok(projected.ok);
const point = x => {
  const p = snapPoints(projected.views.top).find(p=>p.ref.at==='center'&&Math.hypot(p.at[0]-x,p.at[1]-20)<1e-8);
  assert.ok(p,x); return p.ref;
};
const dim = {id:'manual-bore-spacing',kind:'linear',view:'top',orient:'horizontal',a:point(40),b:point(22),place:[31,-12]};
const display = evaluateDoc(doc,0);
assert.ok(display.ok);
const authored = {...doc,drawing:readDrawing({sheet:'A4',scope:{kind:'part'},scale:1,projection:'third',
  views:['front','top'],hidden:false,centers:false,dimensions:[dim]})};
console.log(JSON.stringify(captureSignatures(authored,display.bodies)));
`,
  oracleSource: String.raw`
import json,sys,math,xml.etree.ElementTree as ET
case=json.load(sys.stdin)
ns='{http://www.w3.org/2000/svg}'
svg=ET.parse(case['file']).getroot()
def groups(kind,field,value):
    return [g for g in svg.iter(ns+'g') if g.get('class')==kind and g.get(field)==value]
items=groups('dimension','data-dim',case['id'])
if case['absent']:
    assert not items
    print(json.dumps(dict(status='PASS',absent=True)))
    sys.exit()
group,=items
top,=groups('view','data-view','top')
axes=[tuple(float(line.get(k)) for k in ('x1','y1','x2','y2')) for line in top.findall(ns+'line')]
left=min(min(x,u) for x,y,u,v in axes)
right=max(max(x,u) for x,y,u,v in axes)
scale=(right-left)/80
assert abs(scale-case['scale'])<1e-6
def close(a,b): return math.isclose(a,b,abs_tol=1e-4)
witnesses=[]
for line in group.findall(ns+'line'):
    x,y,u,v=[float(line.get(k)) for k in ('x1','y1','x2','y2')]
    if close(x,u) and not close(y,v):
        witness=min(case['points'],key=lambda key:abs(left+case['points'][key]*scale-x))
        assert close(left+case['points'][witness]*scale,x)
        witnesses.append(witness)
assert sorted(witnesses)==case['roles'], (case, witnesses)
texts=[t.text for t in group.findall(ns+'text')]
assert texts==[case['text']],(case,texts)
print(json.dumps(dict(status='PASS',roles=witnesses,scale=scale,text=texts[0],ink=ET.tostring(group,encoding='unicode'))))
`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const row = () => f.page.locator('.dw-dim .dw-annotation-select').filter({ hasText: 'horizontal · top' });
const group = dimension => f.page.locator(`g.dimension[data-dim="${dimension}"]`);
const controls = () => f.page.getByRole('group', { name: `Extension lines ${id}`, exact: true });
const dim = doc => doc.drawing.dimensions.find(item => item.id === id);

async function drawing() {
  if (!await f.page.locator('.dw[aria-label="Drawing"]').count()) await button('Drawing').click();
  await f.page.getByLabel('Drawing sheet', { exact: true }).waitFor();
}

async function sheet(index) {
  await f.page.getByRole('tab', { name: `Sheet ${index}`, exact: true }).click();
}

async function selected() {
  if (await row().getAttribute('aria-pressed') !== 'true') await row().click();
  await controls().waitFor();
}

async function waitDimension(value) {
  await f.page.waitForFunction(({ id, value }) => {
    const r = window.__studioDrawing?.()?.dimensions.find(dimension => dimension.id === id);
    return value === null ? !!r?.lost : value === 'absent' ? !r : r && Math.abs(r.value - value) < 1e-7;
  }, { id, value });
}

async function annotation() {
  return f.page.evaluate(id => window.__studioAnnotations().items.find(item => item.id === id), id);
}

async function capture(label, { value, a = 40, b = 22, roles = ['b'], scale = 1, text = String(value) }) {
  f.phase = label;
  await waitDimension(value);
  const pending = f.page.waitForEvent('download');
  await button('Export SVG').click();
  const download = await pending, file = join(f.output, label + '.svg');
  await download.saveAs(file);
  assert.equal(await download.failure(), null);
  const bytes = await readFile(file);
  const proof = await f.runOracle({ file, id, absent: value === null || value === 'absent', points: { a, b }, roles, scale, text }, label);
  f.report.files.push({ label, file, bytes: bytes.length, sha256: sha256(bytes), name: download.suggestedFilename() });
  await f.snapshot(label);
  return proof;
}

async function toggleSource(name, previous) {
  await button('Model').click();
  await f.page.locator('.history .hs[data-node-index="4"]').click({ button: 'right' });
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.changed(previous);
  await drawing();
  return f.doc();
}

await f.run(async () => {
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await f.page.setViewportSize({ width: 1440, height: 1000 });
  await f.openFile({ name: 'extension-lifecycle.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 5);
  await drawing();
  await waitDimension(18);
  const both3d = await annotation();
  assert.deepEqual(both3d.targets.map(t => t.at[0]), [40, 22]);
  await selected();
  await button('Hide extension A', controls()).click();
  await f.changed(seed);
  const initial = await f.doc(), savedDimension = { ...dim(seed), hideExtension: 'a' };
  assert.deepEqual(dim(initial), savedDimension);
  const hidden3d = await annotation();
  const ext = both3d.lines.filter(line => line.role === 'extension');
  assert.deepEqual(ext.map(line => line.a[0]), [40, 22]);
  assert.deepEqual(hidden3d, { ...both3d, lines: both3d.lines.filter(line => line !== ext[0]) });
  await capture('01-source40-hide-a', { value: 18 });

  f.phase = 'show the same annotation in the Model viewport';
  await button('Model').click();
  await f.page.getByLabel('3D annotations', { exact: true }).check();
  await f.page.waitForFunction(id => window.__studioPmi?.()?.items?.some(item => item.id === id && item.text.includes('18')), id);
  const live = await f.page.evaluate(id => window.__studioPmi().items.find(item => item.id === id), id);
  assert.deepEqual(live.targets, hidden3d.targets);
  await f.page.waitForFunction(id => {
    const renderer = document.querySelector('.viewport')?.dataset.renderer;
    if (renderer === 'webgpu') return window.__studioOverlayTexts?.()['pmi:text']?.includes('18');
    return document.querySelector(`svg.pmi text[data-pmi-id="${id}"]`)?.textContent === '18';
  }, id);
  await f.snapshot('01b-model-annotation');
  await f.page.getByLabel('3D annotations', { exact: true }).uncheck();

  await f.openFeatureEditor(4, 'edit original bore centre');
  await f.editor().getByLabel('Centre X', { exact: true }).fill('44');
  const edited = (await f.applyEditor(initial, '02-centre44-history')).doc;
  assert.deepEqual(edited.nodes[4].center, [44, 20]);
  assert.deepEqual(dim(edited), savedDimension);
  await drawing();
  await capture('03-source44-same-role', { value: 22, a: 44 });

  const lost = await toggleSource('Suppress', edited);
  assert.deepEqual(dim(lost), savedDimension);
  await waitDimension(null);
  await selected();
  assert.equal(await button('Hide extension B', controls()).isDisabled(), true);
  assert.equal(await button('Show both extension lines', controls()).isDisabled(), true);
  await capture('04-lost-disabled', { value: null });
  await f.undo(); await f.same(edited);
  await capture('05-undo-restores-source', { value: 22, a: 44 });
  await f.redo(); await f.same(lost);
  await waitDimension(null);
  const lostFile = await f.save('extension-lost');
  await f.freshOpen(lostFile.file, lost, '06-reopened-lost-source');
  await drawing();
  await capture('07-reopened-lost-drawing', { value: null });
  const rescued = await toggleSource('Unsuppress', lost);
  await f.same(edited);
  await capture('08-unsuppress-same-role', { value: 22, a: 44 });

  f.phase = 'auto regenerates without inheriting manual suppression';
  await button('Auto-dimension').click();
  await f.changed(rescued);
  const auto = await f.doc();
  assert.deepEqual(dim(auto), savedDimension);
  const generated = auto.drawing.dimensions.filter(item => item.auto);
  assert.ok(generated.length > 0);
  assert.ok(generated.every(item => !Object.hasOwn(item, 'hideExtension')));
  const autoLinear = generated.find(item => item.view === 'top' && item.kind === 'linear');
  assert.ok(autoLinear);
  await group(autoLinear.id).locator('text').first().click();
  assert.equal(await f.page.getByRole('button', { name: 'Hide extension A', exact: true }).count(), 0);
  await f.snapshot('09-auto-dimensions');
  await f.undo(); await f.same(rescued);

  await button('Add sheet').click();
  const sheets = f.page.locator('details[aria-label="Sheets"]');
  if (!await sheets.evaluate(element => element.open)) await sheets.locator('summary').click();
  await sheets.getByLabel('Move Top view to sheet', { exact: true }).selectOption('2');
  await f.page.waitForFunction(() => window.__studioDoc.drawing.sheets[0].views.includes('top'));
  const moved = await f.doc();
  assert.deepEqual(dim(moved), savedDimension);
  await sheet(1);
  assert.equal(await controls().count(), 0);
  await capture('10-sheet-one-no-top-dimension', { value: 'absent' });
  await sheet(2);
  await capture('11-sheet-two-owns-dimension', { value: 22, a: 44, scale: 2 });

  await f.page.getByLabel('Scale', { exact: true }).selectOption('0.5');
  await f.page.getByLabel('Drawing units', { exact: true }).selectOption('inch');
  await f.page.getByLabel('Dual units', { exact: true }).setChecked(true);
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.scale === .5 && window.__studioDoc.drawing.dual === true);
  const scaled = await f.doc();
  assert.deepEqual(dim(scaled), savedDimension);
  const half = { value: 22, a: 44, scale: .5, text: '.866 [22]' };
  await capture('12-half-inch-dual', half);
  await f.page.getByLabel('Front view side', { exact: true }).selectOption('y+');
  await f.page.waitForFunction(() => window.__studioDoc.drawing.orientation === 'y+');
  const rotated = await f.doc();
  assert.deepEqual(dim(rotated), { ...savedDimension, place: [-31, 12] });
  const mirror = { ...half, a: 36, b: 58 };
  const rotatedInk = await capture('13-view-reversed-role-unchanged', mirror);
  const revised = await f.save('extension-mirrored');
  await f.freshOpen(revised.file, rotated, '14-new-native-open');
  await drawing(); await sheet(2);
  const reopenedInk = await capture('15-reopened-same-sheet-role', mirror);
  assert.deepEqual(reopenedInk, rotatedInk);
  await selected();
  await button('Hide extension B', controls()).hover();
  const markers = f.page.locator('[aria-label="Dimension endpoint roles"]');
  const circles = markers.locator('circle');
  await f.page.waitForFunction(() => document.querySelector('[aria-label="Extension endpoint B"] circle')?.getAttribute('r') === '1.8');
  const positions = await circles.evaluateAll(items => items.map(item => ({
    x: Number(item.getAttribute('cx')), r: Number(item.getAttribute('r')),
  })));
  assert.equal(positions.length, 2);
  assert.deepEqual(positions.map(point => point.r), [1.1, 1.8]);
  assert.ok(Math.abs(positions[1].x - positions[0].x - 11) < 1e-6);
  await button('Show both extension lines', controls()).click();
  await f.changed(rotated);
  await capture('16-restore-both-after-open', { ...mirror, roles: ['a', 'b'] });

  const other = { ...seed, drawing: { ...seed.drawing, dimensions: [dim(seed)] } };
  await f.openFile({ name: 'same-id-new-document.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(other)) }, 5);
  await f.same(other);
  await drawing();
  await capture('17-same-id-new-document-both', { value: 18, roles: ['a', 'b'] });
});

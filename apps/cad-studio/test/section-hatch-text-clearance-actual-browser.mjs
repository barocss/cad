import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { holdFitDrawingReply } from './hold-fit-drawing-reply.mjs';

const lifecycle = process.argv.includes('--lifecycle');
const isoVertical = process.argv.includes('--iso-vertical');
const compareScreen = lifecycle || isoVertical;
const nominal = isoVertical ? 40 : 60;

const f = await createFlow({
  name: 'section-hatch-text-clearance-actual', envFrozen: 'SECTION_HATCH_TEXT_CLEARANCE_FROZEN', output: process.argv[2],
  qualification: lifecycle
    ? '#247 actual dual units, deviations, scale, source changes and remaining material geometry in SVG and section DXF.'
    : isoVertical
      ? '#247 actual rotated ISO vertical dimension and stacked deviations on a native full section.'
      : '#247 bounded screen/SVG hatch clearance, real label drag, Undo/Redo and native Save/fresh Open.',
  initialFiles: ['apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs', 'apps/cad-studio/test/hold-fit-drawing-reply.mjs', 'packages/barocss-cad-model/src/drawing/sheet.ts', 'packages/barocss-cad-model/src/drawing/text.ts', 'packages/barocss-cad-model/src/io/svg.ts', 'apps/cad-studio/src/ui/DrawingWorkspace.tsx', 'apps/cad-studio/src/ui/useDrawingSheet.ts', 'apps/cad-studio/src/ui/drawing/ExportActions.tsx', 'packages/barocss-cad-model/src/drawing/hatchClearance.ts', 'packages/barocss-cad-model/src/drawing/sectionTextClearanceScope.ts', 'packages/barocss-cad-model/src/engine/bodyTopology.ts', 'packages/barocss-cad-model/src/chat/drawing.ts'],
  limits: [
    'One made base solid, one full section and one manual linear dimension.',
    'The synthetic fixture uses actual projected endpoint references. This flow does not author the witnesses using the pointer.',
    'Product textCorners supplies conservative typographic bounds. Independent Python clips actual downloaded SVG line segments against those bounds without recreating CAD geometry.',
    lifecycle
      ? 'Material-ring DXF only. PDF, other DXF paths, 3D section previews and multi-body, broken, half, detail and assembly sections are outside this flow.'
      : 'Screen and SVG only. Source edits and section DXF use the separate lifecycle mode.',
  ],
  inspectorSource: `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rectanglePart} from '@barocss/cad-model/engine/doc';
import {drawingInputs} from '@barocss/cad-model/chat/drawing';
import {issueContext} from '@barocss/cad-model/drawing/issues';
import {defaultDrawing,readDrawing} from '@barocss/cad-model/drawing/types';
import {snapPoints} from '@barocss/cad-model/drawing/dimensions';
import {textCorners} from '@barocss/cad-model/drawing/text';
const supplied=JSON.parse(readFileSync(process.argv[2],'utf8'));
const vertical=${isoVertical};
const doc=supplied.nodes?supplied:rectanglePart(60,40,${compareScreen ? 40 : 20});
let settings=readDrawing({...defaultDrawing(),scope:{kind:'part'},scale:1,sections:[{id:'A',view:'top',at:-10}],dimensions:[],...(vertical?{standard:'iso'}:{})});
const inputs=()=>{const i=drawingInputs(doc,settings);assert.ok(typeof i!=='string',String(i));return i;};
const first=issueContext(inputs()), section=first.sheet.sections?.find(s=>s.id==='A');assert.ok(section);
const points=snapPoints(section.projection), xs=points.map(p=>p.at[0]),ys=points.map(p=>p.at[1]);
const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
const endpoint=(x,y)=>{const p=points.find(p=>Math.abs(p.at[0]-x)<1e-8&&Math.abs(p.at[1]-y)<1e-8);assert.ok(p);return p.ref;};
settings=readDrawing({...settings,dimensions:[{id:'hatch-width',kind:'linear',view:'section:A',orient:vertical?'vertical':'horizontal',a:endpoint(xmin,ymin),b:vertical?endpoint(xmin,ymax):endpoint(xmax,ymin),place:[(xmin+xmax)/2,(ymin+ymax)/2]}]});
if(supplied.nodes) settings=readDrawing(supplied.drawing);
const current=issueContext(inputs()), sheet=current.sheet, r=sheet.dimensions.find(r=>r.dim.id==='hatch-width');
const group=sheet.groups.find(g=>g.role==='dimension'&&g.id==='hatch-width');
const texts=(group?.marks??[]).filter(m=>m.kind==='text');
assert.ok(texts.every(text=>vertical ? Math.abs(text.angle)===90 : !text.angle), 'fixture text uses its intended orientation');
const quads=texts.map(text=>textCorners(text.at,text.text,text.size,text.anchor,text.angle??0,text.bold??false));
const hatches=sheet.groups.find(g=>g.role==='section'&&g.id==='A')?.marks.filter(m=>m.kind==='hatch');
assert.equal(hatches?.length,1);
assert.equal(!!hatches[0].svgTextExclusions?.length,!!r?.ok,'production mark clearance follows the resolved owner');
console.log(JSON.stringify({doc:{...doc,drawing:settings},value:r?.ok?r.value:null,texts,quads,materialRings:hatches[0].rings,section:'A',dimension:'hatch-width'}));
`,
  oracleSource: String.raw`
import json,sys,xml.etree.ElementTree as ET,math,re
x=json.load(sys.stdin); root=ET.fromstring(x['svg']); ns={'s':'http://www.w3.org/2000/svg'}
def group(cls,id,required=True):
    a=[g for g in root.findall('.//s:g',ns) if cls in g.get('class','').split() and g.get('data-dim')==id and (cls!='section' or g.get('data-view') is None)]
    assert len(a)==1 if required else len(a)<=1,(cls,id,len(a))
    return a[0] if a else None
dim=group('dimension',x['dimension'],bool(x['texts']));sec=group('section',x['section'])
texts=[] if dim is None else dim.findall('s:text',ns)
assert len(texts)==len(x['texts']),(len(texts),len(x['texts']))
for t,m in zip(texts,x['texts']):
    assert ''.join(t.itertext())==m['text']
    for key,v in [('x',m['at'][0]),('y',m['at'][1]),('font-size',m['size'])]:assert abs(float(t.get(key))-v)<0.00011
    assert t.get('text-anchor','start')==m['anchor'],'actual text anchor matches bound authority'
    assert t.get('font-weight','normal')==('bold' if m.get('bold',False) else 'normal'),'actual weight matches bound authority'
    angle=m.get('angle',0);transform=t.get('transform')
    if angle:
        match=re.fullmatch(r'rotate\(([^ ]+) ([^ ]+) ([^ ]+)\)',transform or '')
        assert match and all(abs(float(v)-expected)<.00011 for v,expected in zip(match.groups(),[-angle,*m['at']]))
    else:
        assert not transform,'expected horizontal text'
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def sub(a,b):return [a[0]-b[0],a[1]-b[1]]
# Parametric convex half-plane clipping. No product hatch generator or CAD evaluator.
def inside_length(a,b,q,margin=0):
    area=sum(cross(q[i],q[(i+1)%len(q)]) for i in range(len(q)));sign=1 if area>0 else -1
    lo,hi=0.,1.; d=sub(b,a)
    for i,p in enumerate(q):
        edge=sub(q[(i+1)%len(q)],p);c=sign*cross(edge,sub(a,p))+margin*math.hypot(*edge);v=sign*cross(edge,d)
        if abs(v)<1e-12:
            if c<0:return 0.
        elif v>0:lo=max(lo,-c/v)
        else:hi=min(hi,-c/v)
    return max(0.,hi-lo)*math.hypot(*d)
def hatch_segments(section):
    return [([float(e.get('x1')),float(e.get('y1'))],[float(e.get('x2')),float(e.get('y2'))])
      for e in section.findall('s:line',ns) if abs(float(e.get('stroke-width','0'))-.25)<1e-9 and not e.get('stroke-dasharray')]
segments=hatch_segments(sec)
assert segments,'actual SVG hatch segments missing'
if 'screen' in x:
    screen=ET.fromstring(x['screen'])
    active=[g for g in screen.findall('.//s:g',ns) if 'section' in g.get('class','').split() and g.get('data-dim')==x['section'] and g.get('data-view') is None]
    assert len(active)==1 and hatch_segments(active[0])==segments,'screen hatch matches actual export'
def inside(p,poly):
    hit=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit
overlaps_material=False
for quad in x['quads']:
    assert all(inside_length(a,b,quad)<1e-5 for a,b in segments),'hatch enters original final text bounds'
    # Centerlines remain outside text bounds plus the 0.6 mm margin and 0.125 mm round cap.
    assert all(inside_length(a,b,quad,.7248)<1e-5 for a,b in segments),'round-cap clearance violated'
    lo=[min(p[i] for p in quad)-.7248 for i in (0,1)];hi=[max(p[i] for p in quad)+.7248 for i in (0,1)]
    if 'screen' not in x:
        assert all(sum(inside((u,v),ring) for ring in x['materialRings'])%2==1 for u in (lo[0],hi[0]) for v in (lo[1],hi[1]))
    else:
        assert len(x['materialRings'])==1
        material=x['materialRings'][0]
        overlaps_material |= all(min(max(p[i] for p in material),hi[i]) > max(min(p[i] for p in material),lo[i]) for i in (0,1))
if 'screen' in x and x['quads']:
    assert overlaps_material,'at least one protected text mark overlaps the rectangular material'
print(json.dumps({'status':'PASS','mode':'ACTUAL_SVG','actualSVGSegments':len(segments),'textMarks':len(texts),
  'angles':[m.get('angle',0) for m in x['texts']],'hatch':segments,'value':x['value'],'productGeometryRecreated':False}))
`,
});
const sheet = () => f.page.locator('svg[aria-label="Drawing sheet"]');
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
async function drawing(value = nominal) {
  if (!(await sheet().count())) await button('Drawing').click();
  await sheet().locator('g.section[data-dim="A"]:not([data-view])').waitFor();
  if (value !== null) {
    await f.page.waitForFunction(expected => window.__studioDrawing?.()?.dimensions?.some(d => d.id === 'hatch-width' && d.value === expected), value);
    await sheet().locator('g.dimension[data-dim="hatch-width"]').waitFor();
  } else {
    await sheet().locator('g.dimension[data-dim="hatch-width"] text').first().waitFor({ state: 'hidden' });
  }
}
async function download(label, action, suffix) {
  const pending = f.page.waitForEvent('download');
  await button(action).click();
  const file = join(f.output, label + suffix), item = await pending;
  await item.saveAs(file);
  assert.equal(await item.failure(), null);
  const bytes = await readFile(file);
  f.report.files.push({ label, kind: suffix.slice(1), file, sha256: sha256(bytes), bytes: bytes.length, originalDownload: true });
  return bytes;
}
async function openDrawingSource(name, doc) {
  await button('Model').click();
  await field('Model file').setInputFiles({
    name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
  await f.same(doc);
}
async function check(label, value = nominal) {
  await drawing(value);
  const before = await f.doc(), seed = await f.inspect(label, before);
  assert.equal(seed.value, value);
  if (value !== null) await f.page.getByText('Screen/SVG', { exact: false }).first().waitFor();
  await f.snapshot(label);
  const screen = compareScreen ? await sheet().evaluate(root => new XMLSerializer().serializeToString(root)) : undefined;
  const bytes = await download(label, 'Export SVG', '.svg');
  delete seed.doc;
  const checked = await f.runOracle({ ...seed, ...(screen !== undefined ? { screen } : {}), svg: bytes.toString('utf8') }, label);
  await f.same(before);
  return checked;
}

function sectionRings(bytes) {
  const lines = bytes.toString('utf8').replaceAll('\r', '').trimEnd().split('\n');
  assert.equal(lines.length % 2, 0);
  const pairs = Array.from({ length: lines.length / 2 }, (_, i) => [Number(lines[i * 2].trim()), lines[i * 2 + 1].trim()]);
  const insunits = pairs.findIndex(([code, value]) => code === 9 && value === '$INSUNITS');
  assert.ok(insunits >= 0);
  assert.deepEqual(pairs[insunits + 1], [70, '4']);
  const start = pairs.findIndex(([code, value]) => code === 0 && value === 'HATCH');
  assert.ok(start >= 0, 'actual section DXF has HATCH');
  const end = pairs.findIndex(([code], index) => index > start && code === 0);
  const hatch = pairs.slice(start + 1, end);
  assert.deepEqual(hatch.find(([code]) => code === 91), [91, '1'], 'one material loop');
  const vertices = hatch.findIndex(([code]) => code === 93);
  assert.ok(vertices >= 0);
  assert.equal(Number(hatch[vertices][1]), 5, 'four material corners and the closing point');
  const points = [];
  for (let i = vertices + 1; i < hatch.length && points.length < 5; i++) if (hatch[i][0] === 10) {
    assert.equal(hatch[i + 1][0], 20);
    points.push([Number(hatch[i][1]), Number(hatch[i + 1][1])]);
  }
  assert.equal(points.length, 5, 'every material corner and the closing point are present');
  assert.deepEqual(points.pop(), points[0], 'the HATCH material path closes on its first point');
  assert.equal(new Set(points.map(point => point.join(','))).size, 4);
  return points;
}
const range = values => Math.max(...values) - Math.min(...values);

async function lifecycleFlow(original) {
  f.phase = 'control section DXF carries full-size material';
  const baseDxf = sectionRings(await download('01-material-baseline', 'Export section DXF', '.dxf'));
  assert.deepEqual([range(baseDxf.map(point => point[0])), range(baseDxf.map(point => point[1]))], [60, 40]);

  f.phase = 'author dual units, deviations and 1:2 scale in Drawing';
  await field('Scale').selectOption('0.5');
  await field('Drawing standard').selectOption('asme');
  await field('Dual units').setChecked(true);
  await f.page.locator('.dw-dims .dw-dim').filter({ hasText: '60' }).first().click();
  await field('Tolerance').selectOption('deviation');
  await field('Tolerance Upper').fill('0.4');
  await field('Tolerance Upper').press('Enter');
  await field('Tolerance Lower').fill('-0.2');
  await field('Tolerance Lower').press('Enter');
  await f.page.waitForFunction(() => {
    const d = window.__studioDoc?.drawing;
    return d?.scale === .5 && d.standard === 'asme' && d.dual === true && d.dimensions[0]?.tol?.upper === .4 && d.dimensions[0]?.tol?.lower === -.2;
  });
  const applied = await f.doc();
  assert.deepEqual(applied.drawing.dimensions.map(d => [d.a, d.b]), original.drawing.dimensions.map(d => [d.a, d.b]));
  const protectedSvg = await check('02-dual-deviation-half-scale');
  assert.equal(protectedSvg.textMarks, 1, 'dual deviations keep the two units on one line');
  const reducedDxf = sectionRings(await download('02-material-half-scale', 'Export section DXF', '.dxf'));
  assert.deepEqual(reducedDxf, baseDxf);
  await f.undo();
  await f.page.waitForFunction(() => window.__studioDoc?.drawing?.dimensions[0]?.tol?.lower !== -.2);
  await f.redo(); await f.same(applied);
  await field('Dual units').setChecked(false);
  await f.changed(applied);
  const stacked = await check('02a-stacked-deviations-half-scale');
  assert.equal(stacked.textMarks, 3, 'non-dual deviations stack beside the value');
  await f.undo(); await f.same(applied);

  f.phase = 'source width edit recomputes the full section and the accepted text';
  await button('Model').click();
  await f.openFeatureEditor(1, 'source rectangle');
  await f.editor().getByLabel('Width', { exact: true }).fill('64');
  const source = (await f.applyEditor(applied, '03-source-width-edited')).doc;
  const reviewed = structuredClone(source.drawing.dimensions);
  for (const endpoint of [reviewed[0].a, reviewed[0].b]) {
    assert.deepEqual(endpoint.sig, { k: 'line', p: [30, 0, 0], d: [1, 0, 0], s: 60 });
    delete endpoint.sig;
  }
  assert.deepEqual(reviewed, applied.drawing.dimensions);
  await check('04-dual-dim-after-source-edit', 64);
  const editedDxf = sectionRings(await download('04-material-64', 'Export section DXF', '.dxf'));
  assert.deepEqual([range(editedDxf.map(point => point[0])), range(editedDxf.map(point => point[1]))], [64, 40]);

  f.phase = 'native save, fresh Open and edit the reopened tolerance';
  const saved = await f.save('section-clearance-lifecycle');
  await f.freshOpen(saved.file, source, '05-native-reopen');
  await check('06-reopened-dual-deviation', 64);
  await f.page.locator('.dw-dims .dw-dim').filter({ hasText: '64' }).first().click();
  await field('Tolerance Upper').fill('0.6');
  await field('Tolerance Upper').press('Enter');
  await f.changed(source);
  const updated = await f.doc();
  assert.equal(updated.drawing.dimensions[0].tol.upper, .6);
  await check('07-reopened-tolerance-edited', 64);

  f.phase = 'move between the first sheet and a new continuation sheet';
  await button('Add sheet').click();
  await f.changed(updated);
  const first = f.page.getByRole('tab', { name: 'Sheet 1', exact: true });
  const second = f.page.getByRole('tab', { name: 'Sheet 2', exact: true, selected: true });
  await second.waitFor();
  await sheet().locator('g.section[data-dim="A"], g.dimension[data-dim="hatch-width"]').first().waitFor({ state: 'hidden' });
  await f.snapshot('07a-continuation-sheet');
  await first.click();
  await check('07b-first-sheet-restored', 64);
  await f.undo(); await f.same(updated);

  f.phase = 'hold the original reply from a different document with the same section and dimension IDs';
  const previous = structuredClone(updated);
  previous.drawing.sections[0].at = -12;
  await openDrawingSource('previous-section', previous);
  await f.page.evaluate(() => window.__fitDrawingReply.arm());
  await button('Drawing').click();
  await f.page.waitForFunction(() => window.__fitDrawingReply.read()?.doc.drawing.sections[0].at === -12);
  const held = await f.page.evaluate(() => window.__fitDrawingReply.read());
  assert.equal(held.ok, true);
  assert.deepEqual(held.doc, previous);
  await f.snapshot('07c-previous-section-reply-held');

  f.phase = 'a replacement document cannot reuse clearance for an unresolved owner';
  const lost = structuredClone(updated);
  lost.drawing.dimensions[0].a = { edge: 'missing-section-edge', at: 'end', near: [999, 999, 999] };
  await openDrawingSource('lost-section-dimension', lost);
  await drawing(null);
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions?.some(d => d.id === 'hatch-width' && d.lost));
  const lostSvg = await check('08-lost-dim-hatch-restored', null);
  const samples = await f.page.evaluate(() => window.__fitDrawingReply.release());
  for (const sample of samples) assert.deepEqual(sample, samples[0], 'an original old Worker reply cannot alter the accepted sheet or document');
  const afterLate = await check('08a-after-previous-section-reply', null);
  assert.deepEqual(afterLate.hatch, lostSvg.hatch);
  f.phase = 'cancel and then confirm removal of the unresolved toleranced dimension';
  const confirmation = f.page.getByRole('group', { name: 'Confirm drawing control removal' });
  await button('Remove dimension hatch-width').click();
  await confirmation.getByText(/tolerance upper 0\.6 \/ lower -0\.2 mm/).waitFor();
  await confirmation.getByRole('button', { name: 'Cancel removal', exact: true }).click();
  await f.same(lost);
  await button('Remove dimension hatch-width').click();
  await confirmation.getByRole('button', { name: 'Remove annotation and controls', exact: true }).click();
  await f.changed(lost);
  const deleted = await f.doc();
  assert.deepEqual(deleted.drawing.dimensions, []);
  const deletedSvg = await check('09-deleted-dim-hatch-stays-whole', null);
  assert.deepEqual(lostSvg.hatch, deletedSvg.hatch);
  assert.deepEqual(sectionRings(await download('09-material-after-delete', 'Export section DXF', '.dxf')), editedDxf);
  await f.undo(); await f.same(lost);
  await f.redo(); await f.same(deleted);
  f.report.observations.push({ paperScale: .5, sourceWidth: 64, dxfBefore: baseDxf, dxfAfter: editedDxf,
    lostAndDeletedHatchMatch: true, lateReply: { id: held.id, unchangedFrames: samples.length }, actualDualTextMarks: protectedSvg.textMarks });
}
await f.run(async()=>{
  if (lifecycle) {
    const newContext = f.browser.newContext.bind(f.browser);
    f.browser.newContext = async options => {
      const context = await newContext(options);
      await context.addInitScript(holdFitDrawingReply);
      return context;
    };
  }
  f.phase='Prepare real projected reference fixture';const seed=await f.inspect('prepare',{});await f.newPage();
  await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'section-text-clearance.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed.doc))});
  await f.same(seed.doc);let original=await f.doc();await drawing();
  if (lifecycle) { await lifecycleFlow(original); return; }
  const initial = await check('01-protected');
  if (isoVertical) {
    f.phase = 'edit the vertically aligned ISO deviation in the actual Drawing';
    assert.deepEqual(initial.angles, [90]);
    await f.page.locator('.dw-dims .dw-dim').filter({ hasText: String(nominal) }).first().click();
    await field('Tolerance').selectOption('deviation');
    await field('Tolerance Upper').fill('0.4');
    await field('Tolerance Upper').press('Enter');
    await field('Tolerance Lower').fill('-0.2');
    await field('Tolerance Lower').press('Enter');
    await f.page.waitForFunction(() => {
      const tolerance = window.__studioDoc?.drawing?.dimensions[0]?.tol;
      return tolerance?.kind === 'deviation' && tolerance.upper === .4 && tolerance.lower === -.2;
    });
    original = await f.doc();
    const stacked = await check('01a-iso-stacked-deviations');
    assert.deepEqual(stacked.angles, [90, 90, 90]);
  }
  f.phase='Move the real dimension label';
  const points=await sheet().locator('g.dimension[data-dim="hatch-width"] text').first().evaluate(n=>{
    const b=n.getBBox(),m=n.getScreenCTM(),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m),q=new DOMPoint(b.x+b.width/2,b.y+b.height/2+8).matrixTransform(m);return [[p.x,p.y],[q.x,q.y]];
  });
  await f.page.mouse.move(...points[0]);await f.page.mouse.down();await f.page.mouse.move(...points[1],{steps:8});await f.page.mouse.up();await f.changed(original);
  const moved=await f.doc();assert.notDeepEqual(moved.drawing.dimensions[0].place,original.drawing.dimensions[0].place);
  const restored=structuredClone(moved);restored.drawing.dimensions[0].place=original.drawing.dimensions[0].place;assert.deepEqual(restored,original,'only label placement changes');
  await check('02-moved');await f.undo();await f.same(original);await check('03-undo');await f.redo();await f.same(moved);await check('04-redo');
  const saved=await f.save('protected-native');assert.deepEqual(saved.doc,moved);await f.freshOpen(saved.file,saved.doc,'05-native-open');await drawing();await check('06-reopened');
  f.report.observations.push({actualDownload:true,nativeSaveFreshOpen:true,oneUndoRedo:true,onlyLabelPlaceChanged:true,
    referenceValue:nominal,orientation:isoVertical?'vertical':'horizontal',initialAngles:initial.angles});
});

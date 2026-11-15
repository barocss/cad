import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = ['apps/cad-studio/test/tolerance-label-partial-browser.mjs',
  'packages/barocss-cad-model/src/drawing/tolerance.ts', 'packages/barocss-cad-model/src/drawing/layout.ts',
  'packages/barocss-cad-model/src/drawing/issues.ts', 'packages/barocss-cad-model/src/drawing/sheet.ts',
  'packages/barocss-cad-model/test/tolerance-label-placement-fixture.ts',
  'packages/barocss-cad-model/test/tolerance-label-placement.test.ts',
  'packages/barocss-cad-model/samples/rows/fastener-sizes.json', 'apps/cad-studio/src/ui/DrawingWorkspace.tsx'];
const f = await createFlow({ name: 'tolerance-label-partial', output: process.argv[2], envFrozen: 'D1402_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Partial #613 improvement only: an independently reconstructed legacy accepted sheet has five collisions; actual UI acceptance retains four unresolved basic labels and clears counted d5.',
  limits: ['Issue #613 remains OPEN. No claim that all dimensions are clear or that the remaining four cannot be solved by a different algorithm.',
    'Pinned +X front, A4, scale0.5; no sheet/orientation/scale changes. Existing cross/row drivers untouched.',
    'Independent oracle checks the counted basic frame against its own strokes, all view areas, SVG payload/frame and DXF TEXT/polyline correspondence. Other annotation clearance is additionally checked by unchanged product diagnostics and focused unit invariants.'],
  snapshotExtra: () => ({ drawing: window.__studioDrawing?.() ?? null, issueText: [...document.querySelectorAll('.dw-issue')].map(n => n.textContent) }),
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toleranceLabelFixture, toleranceLegacyMoves } from '../../packages/barocss-cad-model/test/tolerance-label-placement-fixture';
import { acceptAll } from '@barocss/cad-model/drawing/tolerance';
import { drawingInputs } from '@barocss/cad-model/chat/drawing';
import { drawingIssues, issueContext } from '@barocss/cad-model/drawing/issues';
import { readDrawing } from '@barocss/cad-model/drawing/types';
const extra=JSON.parse(process.argv[3]);
function describe(doc){const input=drawingInputs(doc);assert.ok(typeof input!=='string');const ctx=issueContext(input);return {issues:drawingIssues(ctx),layout:ctx.layout,sheet:ctx.sheet,target:ctx.sheet.groups.find(g=>g.role==='dimension'&&g.id==='d5')};}
if(extra.prepare){const {initial,inputs}=await toleranceLabelFixture(readFileSync(extra.rows,'utf8'));const start=performance.now(),result=acceptAll(inputs),elapsed=performance.now()-start;const legacy=toleranceLegacyMoves(inputs,result.accepted);const baselineDoc={...initial,drawing:readDrawing(legacy)},expectedDoc={...initial,drawing:readDrawing(result.settings)};console.log(JSON.stringify({initial,baselineDoc,expectedDoc,baseline:describe(baselineDoc),expected:describe(expectedDoc),elapsed}));}
else{const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify({doc,...describe(doc)}));}
`,
  oracleSource: `
import json,math,re,sys,xml.etree.ElementTree as ET
q=json.load(sys.stdin);target=q['target'];layout=q['layout'];own=target['marks'];frames=[m for m in own if m['kind']=='polyline' and m.get('role')=='frame'];assert len(frames)==1
frame=frames[0]['points'];x0=min(p[0] for p in frame);x1=max(p[0] for p in frame);y0=min(p[1] for p in frame);y1=max(p[1] for p in frame)
assert [m['text'] for m in own if m['kind']=='text']==['3× 20']
def hit(a,b):
 # Closed segment vs open rectangle: Liang-Barsky, with a small numeric inset.
 lo,hi=0.,1.;dx=b[0]-a[0];dy=b[1]-a[1]
 for p,v in [(-dx,a[0]-x0-1e-7),(dx,x1-a[0]-1e-7),(-dy,a[1]-y0-1e-7),(dy,y1-a[1]-1e-7)]:
  if abs(p)<1e-12:
   if v<0:return False
  elif p<0:lo=max(lo,v/p)
  else:hi=min(hi,v/p)
 return lo<=hi
for mark in own:
 if mark['kind']=='line':assert not hit(mark['a'],mark['b'])
 elif mark['kind']=='fill':
  points=mark['points']+[mark['points'][0]]
  assert all(not hit(a,b) for a,b in zip(points,points[1:]))
for view in layout['views'].values():
 if view.get('hidden'):continue
 a,b,c,d=view['box'];assert min(x1,c)<=max(x0,a) or min(y1,d)<=max(y0,b)
ns={'s':'http://www.w3.org/2000/svg'};root=ET.fromstring(q['svg']);assert root.attrib['width']=='297mm' and root.attrib['height']=='210mm'
g=root.find(".//s:g[@data-dim='d5']",ns);assert g is not None;assert [t.text for t in g.findall('s:text',ns)]==['3× 20']
svgframes=[p for p in g.findall('s:polyline',ns) if len(p.attrib['points'].split())==5];assert len(svgframes)==1
actual=[[float(x) for x in v.split(',')] for v in svgframes[0].attrib['points'].split()];assert all(abs(a-b)<=.000050001 for p,r in zip(actual,frame) for a,b in zip(p,r))
# Independent DXF group-code reader. No imports from the product or its DXF library.
lines=q['dxf'].splitlines();assert len(lines)%2==0;pairs=[(int(lines[i]),lines[i+1]) for i in range(0,len(lines),2)];entities=[];current=[]
for code,value in pairs:
 if code==0:
  if current:entities.append(current)
  current=[(code,value)]
 else:current.append((code,value))
def val(e,c):return next((v for k,v in e if k==c),None)
def decode(s):return re.sub(re.escape(chr(92)+'U+')+r'([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)),s)
texts=[e for e in entities if val(e,0)=='TEXT' and decode(val(e,1) or '')=='3× 20'];assert len(texts)==1
text=next(m for m in own if m['kind']=='text');assert abs(float(val(texts[0],10))-text['at'][0])<1e-7;assert abs(float(val(texts[0],20))-(210-text['at'][1]))<1e-7
wanted=sorted((round(p[0],7),round(210-p[1],7)) for p in frame)
matched=[]
for e in entities:
 if val(e,0)!='LWPOLYLINE':continue
 xs=[float(v) for k,v in e if k==10];ys=[float(v) for k,v in e if k==20]
 points=list(zip(xs,ys))
 # DXF stores a closed polyline without its repeated terminal vertex.
 if len(points)==4:points.append(points[0])
 if sorted((round(x,7),round(y,7)) for x,y in points)==wanted:matched.append(e)
assert len(matched)==1
print(json.dumps({'status':'PASS','partial':True,'remaining':['d1','d2','d3','d4'],'countedBasicFrame':[x0,y0,x1,y1],'svgAndDxfPayload':'3× 20'}))
` });
const button = name => f.page.getByRole('button', { name, exact: true });
const canonical = x => JSON.parse(JSON.stringify(x));
async function openDoc(doc) {
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'tolerance-partial.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}
async function drawAndWait(count) {
  if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
  await f.page.waitForFunction(n => window.__studioDrawing?.()?.issues.filter(i => i.code === 'TEXT_OVER_LINES').length === n, count, { timeout: 60000 });
}
async function snapshot(label) {
  const state = await f.snapshot(label); assert.equal(state.drawing.issues.filter(x => x.code === 'TEXT_OVER_LINES').length, 4);
  assert.equal(state.issueText.filter(x => x.includes('The text of dimension 12 lies over lines')).length, 4);
  assert.ok(!state.issueText.some(x => x.includes('dimension 3× 20 lies over lines'))); return state;
}
async function exported(name, extension) {
  const [download] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const file = join(f.output, `accepted.${extension}`); await download.saveAs(file); const bytes = await readFile(file);
  f.report.files.push({ file, bytes: bytes.length, sha256: sha256(bytes), actualExport: name });
  return bytes.toString(extension === 'dxf' ? 'latin1' : 'utf8');
}
await f.run(async () => {
  const prepared = await f.inspect('prepare', {}, { prepare: true, rows: join(f.repo, 'packages/barocss-cad-model/samples/rows/fastener-sizes.json') });
  assert.deepEqual(prepared.baseline.issues.filter(x => x.code === 'TEXT_OVER_LINES').map(x => x.dims), [['d1'], ['d2'], ['d3'], ['d4'], ['d5']]);
  assert.deepEqual(prepared.expected.issues.filter(x => x.code === 'TEXT_OVER_LINES').map(x => x.dims), [['d1'], ['d2'], ['d3'], ['d4']]);
  f.report.observations.push({ label: 'legacy-counterfactual-vs-partial', baseline: 5, expected: 4, issueRemainsOpen: true, modelAcceptanceMs: prepared.elapsed });
  for (const width of [1024, 1440]) {
    await f.newPage(); await f.page.setViewportSize({ width, height: width === 1024 ? 800 : 900 });
    f.phase = 'Open already-accepted legacy baseline separately'; await openDoc(prepared.baselineDoc); await drawAndWait(5); await f.snapshot(`${width}-legacy-five`);
    f.phase = 'Open pre-tolerance seed with pending suggestions'; await openDoc(prepared.initial);
    if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
    await button('Accept all suggestions').waitFor(); await f.snapshot(`${width}-pre-suggestions`);
    f.phase = 'Actual UI Accept all suggestions, partial only'; await button('Accept all suggestions').click(); await f.changed(prepared.initial); await drawAndWait(4);
    const current = await snapshot(`${width}-accepted-four`), actual = await f.inspect(`${width}-actual`, current.doc, { prepare: false });
    assert.deepEqual(actual.doc.drawing, prepared.expectedDoc.drawing);
    assert.deepEqual(current.doc.nodes, prepared.initial.nodes);
    assert.deepEqual(actual.sheet.dimensions.map(r => r.ok ? [r.dim.id, r.value, r.text] : r), prepared.expected.sheet.dimensions.map(r => r.ok ? [r.dim.id, r.value, r.text] : r));
    assert.deepEqual(current.doc.drawing.frames, prepared.expectedDoc.drawing.frames); assert.deepEqual(current.doc.drawing.datums, prepared.expectedDoc.drawing.datums);
    assert.deepEqual(current.doc.drawing.dimensions, prepared.expectedDoc.drawing.dimensions);
    const svg = await exported('Export SVG', 'svg'), dxf = await exported('Export DXF', 'dxf');
    await f.runOracle({ target: actual.target, layout: actual.layout, svg, dxf }, `${width}-counted-label-clearance`);
    await f.undo(); await f.same(prepared.initial); await button('Accept all suggestions').waitFor(); await f.snapshot(`${width}-undo-pre-suggestions`);
    await f.redo(); await f.same(current.doc); await drawAndWait(4); await snapshot(`${width}-redo-four`);
    const saved = await f.save(`${width}-partial`); await f.freshOpen(saved.file, canonical(current.doc), `${width}-fresh-open`); await drawAndWait(4); await snapshot(`${width}-fresh-open-four`);
  }
});

import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createFlow,sha256} from './flow-helper.mjs';
const f=await createFlow({name:'drawing-note-target',output:process.argv[2],envFrozen:'DRAWING_NOTE_TARGET_FROZEN',initialFiles:['apps/cad-studio/test/drawing-note-target-browser.mjs','apps/cad-studio/test/drawing-note-target-reader.py'],qualification:'#245 explicit Note endpoint attachment, changed source refusal and explicit repair.',limits:['Base part front unbroken view only. Initial two free-coordinate Notes are fixture-authored; attachment and Width edit use public UI.','Endpoint pixel conversion uses the existing drawing test hook; SVG oracle is independent XML/arithmetic, not product resolution.','No PDF, assembly, scoped part, arbitrary topology tracking or stale Worker coverage.'],snapshotExtra:()=>({drawing:window.__studioDrawing?.()}),inspectorSource:`
import assert from 'node:assert/strict';
import {starterDoc} from '@barocss/cad-model/engine/doc';
import {brepsFor} from '@barocss/cad-model/engine/evaluate';
import {projectViews} from '@barocss/cad-model/drawing/project';
import {defaultDrawing,readDrawing} from '@barocss/cad-model/drawing/types';
const doc=starterDoc(),source=brepsFor(doc);assert.ok('breps' in source);const pr=projectViews(source.breps,source.prefixes);assert.ok(pr.ok);
const edge=pr.views.front.edges.find(e=>e.kind==='line'&&e.ends?.length===2&&e.ends.every(p=>Math.abs(p[1])<1e-8&&Math.abs(p[2])<1e-8)&&Math.abs(e.ends[0][0]-e.ends[1][0])===64);assert.ok(edge);
console.log(JSON.stringify({edge:edge.name,doc:{...doc,drawing:readDrawing({...defaultDrawing(),scope:{kind:'part'},scale:1,notes:[{id:'bound',text:'CONNECTED NOTE',at:[30,30],leader:{view:'front',at:[64,0]}},{id:'free',text:'FREE CONTROL',at:[30,50],leader:{view:'front',at:[64,0]}}]})}}));
`,oracleSource:String.raw`
import json,sys,re,xml.etree.ElementTree as E
q=json.load(sys.stdin);r=E.fromstring(q['svg']);ns={'s':'http://www.w3.org/2000/svg'}
def group(id):
 a=[g for g in r.findall('.//s:g',ns) if g.get('data-dim')==id and 'note' in g.get('class','').split()];assert len(a)==1;return a[0]
def tip(id,expected):
 g=group(id);assert len(g.findall('s:text',ns))==1
 paths=g.findall('s:path',ns)
 if expected is None:
  assert len(paths)==0 and len(g.findall('s:line',ns))==0;return
 assert len(paths)==1
 xy=[float(x) for x in re.match(r'M([\d.eE+\-]+) ([\d.eE+\-]+)',paths[0].get('d')).groups()]
 assert max(abs(x-y) for x,y in zip(xy,expected))<.002,(xy,expected)
b=q['box'];s=q['scale']
# Front of starter: native x in [0,width], z in [0,8]. Origin is left,bottom of actual layout box.
tip('bound',None if q['lost'] else [b[0]+q['width']*s,b[3]])
tip('free',[b[0]+64*s,b[3]])
print(json.dumps({'status':'PASS','lost':q['lost'],'width':q['width'],'freeTipUnchangedInView':True}))
`});
const dxfReads=[];
const b=name=>f.page.getByRole('button',{name,exact:true});
async function drawing(){if(!await f.page.locator('.dw[aria-label="Drawing"]').count())await b('Drawing').click();await f.page.waitForFunction(()=>!!window.__studioDrawing?.()?.boxes?.front);await f.page.locator('.dw-note-text').filter({hasText:'CONNECTED NOTE'}).click();}
async function attach(edge,width,reselect=false){await b(reselect?'Reselect endpoint':'Attach to endpoint').click();const q=await f.page.evaluate(w=>window.__studioDrawingAt('front',w,0),width);assert.ok(q);assert.ok(Number.isFinite(q.x)&&Number.isFinite(q.y));await f.page.mouse.click(q.x,q.y);const choices=f.page.getByRole('group',{name:'Note endpoint selection',exact:true});if(await choices.count()){const exact=choices.getByRole('button').filter({hasText:edge+' · max ·'});assert.equal(await exact.count(),1);await exact.click();}await f.page.waitForFunction(()=>!!window.__studioDoc.drawing.notes.find(n=>n.id==='bound').leader.target);}
async function capture(label,width,lost){
 const before=await f.doc();
 const wait=f.page.waitForEvent('download');await b('Export SVG').click();const download=await wait;
 const file=join(f.output,label+'.svg');await download.saveAs(file);assert.equal(await download.failure(),null);
 const bytes=await readFile(file);const state=await f.page.evaluate(()=>window.__studioDrawing());
 await f.runOracle({svg:bytes.toString('utf8'),width,lost,box:state.boxes.front,scale:state.scale},label);
 await writeFile(join(f.output,label+'-document.json'),JSON.stringify(before,null,2));
 f.report.files.push({label,file,sha256:sha256(bytes),bytes:bytes.length});
 for(const [version,suffix] of [['AC1009','R12'],['AC1015','R2000']]){
  await f.page.getByLabel('DXF version',{exact:true}).selectOption(version);
  const pending=f.page.waitForEvent('download');await b('Export DXF').click();const d=await pending;
  const path=join(f.output,label+'-'+suffix+'.dxf');await d.saveAs(path);assert.equal(await d.failure(),null);
  const raw=await readFile(path);assert.ok(raw.length>0);
  f.report.files.push({label,version,file:path,sha256:sha256(raw),bytes:raw.length,name:d.suggestedFilename(),boundary:'actual public Export DXF download; original bytes'});
  dxfReads.push({file:path,svg:file,version,width,lost,box:state.boxes.front,scale:state.scale});
 }
 await f.same(before);await f.snapshot(label);
}
async function readDxf(){
 const input={files:dxfReads};const inputBytes=JSON.stringify(input,null,2);
 await writeFile(join(f.output,'note-target-reader-input.json'),inputBytes);
 const reader=join(import.meta.dirname,'drawing-note-target-reader.py');
 const run=spawnSync('/Users/user/.cache/barocss-ezdxf/bin/python',['-I',reader],{input:inputBytes,encoding:'utf8',maxBuffer:16*1024*1024});
 await writeFile(join(f.output,'note-target-reader.json'),run.stdout??'');
 await writeFile(join(f.output,'note-target-reader.stderr.txt'),run.stderr??'');
 const receipt={exit:run.status,signal:run.signal,error:run.error?String(run.error):null,inputSHA256:sha256(inputBytes),readerSHA256:sha256(await readFile(reader)),stdoutSHA256:sha256(run.stdout??''),stderrSHA256:sha256(run.stderr??'')};
 await writeFile(join(f.output,'note-target-reader-exit.json'),JSON.stringify(receipt,null,2));
 f.report.observations.push({label:'independent DXF primitive reader',...receipt});await f.persist();
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout);assert.equal(result.status,'PASS');
 f.report.observations.push(result);
}

await f.run(async()=>{
 const fixture=await f.inspect('prepare',{});await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'note-target.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.doc))});await f.same(fixture.doc);await drawing();
 const before=await f.doc();await b('Attach to endpoint').click();await f.page.keyboard.press('Escape');await f.same(before);
 await attach(fixture.edge,64);const attached=await f.doc();assert.deepEqual(attached.nodes,before.nodes);assert.deepEqual(attached.drawing.notes[1],before.drawing.notes[1]);await capture('01-connected',64,false);
 await f.undo();await f.same(before);await f.redo();await f.same(attached);
 await b('Model').click();await f.openFeatureEditor(1);await f.editor().getByLabel('Width',{exact:true}).fill('80');const grown=(await f.applyEditor(attached,'02-width80')).doc;await drawing();assert.deepEqual(grown.drawing.notes,attached.drawing.notes);await f.page.getByText(/Needs confirmation:/).first().waitFor();await capture('03-unresolved',80,true);
 await attach(fixture.edge,80,true);await f.page.waitForFunction(()=>window.__studioDoc.drawing.notes.find(n=>n.id==='bound').leader.target.sig.s===80);const repaired=await f.doc();assert.equal(repaired.drawing.notes[0].text,before.drawing.notes[0].text);assert.deepEqual(repaired.drawing.notes[0].at,before.drawing.notes[0].at);assert.deepEqual(repaired.drawing.notes[1],before.drawing.notes[1]);await capture('04-reselected',80,false);
 await f.undo();await f.same(grown);await f.redo();await f.same(repaired);const saved=await f.save('connected-note');await f.freshOpen(saved.file,repaired,'05-fresh-open');await drawing();await capture('06-persisted',80,false);
 await b('Remove leader').click();await f.page.waitForFunction(()=>!window.__studioDoc.drawing.notes.find(n=>n.id==='bound').leader);await f.undo();await f.same(repaired);
 await readDxf();
 f.report.observations.push({legacyFreeControlPreserved:true,changedSignatureNoArrow:true,explicitReselect:true,undoRedoAndNativeFreshOpen:true});
});

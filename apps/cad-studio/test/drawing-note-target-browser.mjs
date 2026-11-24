import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createFlow,sha256} from './flow-helper.mjs';
import { holdFitDrawingReply } from './hold-fit-drawing-reply.mjs';

const lifecycle = process.argv.includes('--lifecycle');
const f=await createFlow({name:'drawing-note-target',output:process.argv[2],envFrozen:'DRAWING_NOTE_TARGET_FROZEN',initialFiles:['apps/cad-studio/test/drawing-note-target-browser.mjs','apps/cad-studio/test/drawing-note-target-reader.py','apps/cad-studio/test/hold-fit-drawing-reply.mjs'],qualification:'#245 explicit Note attachment and repair through current drawing ownership.',limits:['Ordinary base part and original straight native endpoint. Attachment and source Width edit use public UI.','SVG parsing uses layout coordinates from the existing test hook and independently checks the original file.','PDF, 3D annotation, assembly, scoped part and arbitrary topology tracking are outside this run.'],snapshotExtra:()=>({drawing:window.__studioDrawing?.()}),inspectorSource:`
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
 a=[g for g in r.findall('.//s:g',ns) if g.get('data-dim')==id and 'note' in g.get('class','').split()]
 assert len(a)==int(q['owned']),(id,len(a),q['owned'])
 return a[0] if a else None
def tip(id,expected):
 g=group(id)
 if g is None:return None
 text=g.findall('s:text',ns)
 assert len(text)==1 and text[0].text==q['texts'][id]
 paths=g.findall('s:path',ns)
 if expected is None:
  assert len(paths)==0 and len(g.findall('s:line',ns))==0;return None
 assert len(paths)==1
 xy=[float(x) for x in re.match(r'M([\d.eE+\-]+) ([\d.eE+\-]+)',paths[0].get('d')).groups()]
 assert max(abs(x-y) for x,y in zip(xy,expected))<.002,(xy,expected)
 return xy
b=q['box'];s=q['scale'];owned=q['owned']
# The expected authored positions come from the model in mm; the live sheet supplies its layout origin and scale.
bound=tip('bound',None if q['lost'] or not owned else [b[0]+q['boundX']*s,b[3]])
free=tip('free',[b[0]+q['freeX']*s,b[3]] if owned else None)
print(json.dumps({'status':'PASS','lost':q['lost'],'width':q['width'],'owned':owned,'boundTip':bound,'freeTip':free}))
`});
const dxfReads=[];
const b=name=>f.page.getByRole('button',{name,exact:true});
async function drawing(){if(!await f.page.locator('.dw[aria-label="Drawing"]').count())await b('Drawing').click();await f.page.waitForFunction(()=>!!window.__studioDrawing?.()?.boxes?.front);await f.page.locator('.dw-note-text').filter({hasText:'CONNECTED NOTE'}).click();}
async function attach(edge,width,reselect=false){await b(reselect?'Reselect endpoint':'Attach to endpoint').click();const q=await f.page.evaluate(w=>window.__studioDrawingAt('front',w,0),width);assert.ok(q);assert.ok(Number.isFinite(q.x)&&Number.isFinite(q.y));await f.page.mouse.click(q.x,q.y);const choices=f.page.getByRole('group',{name:'Note endpoint selection',exact:true});if(await choices.count()){const exact=choices.getByRole('button').filter({hasText:edge+' · max ·'});assert.equal(await exact.count(),1);await exact.click();}await f.page.waitForFunction(()=>!!window.__studioDoc.drawing.notes.find(n=>n.id==='bound').leader.target);}
async function capture(label,width,lost,{ owned=true, dxf=true, view='front', boundX=width, freeX=64 }={}){
 const before=await f.doc();
 const wait=f.page.waitForEvent('download');await b('Export SVG').click();const download=await wait;
 const file=join(f.output,label+'.svg');await download.saveAs(file);assert.equal(await download.failure(),null);
 const bytes=await readFile(file);const state=await f.page.evaluate(()=>window.__studioDrawing());
 const texts = Object.fromEntries(before.drawing.notes.map(note => [note.id,note.text]));
 const projection = { svg: bytes.toString('utf8'), width, lost, owned, box: state.boxes[view] ?? null, scale: state.scale, boundX, freeX, texts };
 const result = await f.runOracle(projection,label);
 await writeFile(join(f.output,label+'-document.json'),JSON.stringify(before,null,2));
 f.report.files.push({label,file,sha256:sha256(bytes),bytes:bytes.length});
 for(const [version,suffix] of dxf ? [['AC1009','R12'],['AC1015','R2000']] : []){
  await f.page.getByLabel('DXF version',{exact:true}).selectOption(version);
  const pending=f.page.waitForEvent('download');await b('Export DXF').click();const d=await pending;
  const path=join(f.output,label+'-'+suffix+'.dxf');await d.saveAs(path);assert.equal(await d.failure(),null);
  const raw=await readFile(path);assert.ok(raw.length>0);
  f.report.files.push({label,version,file:path,sha256:sha256(raw),bytes:raw.length,name:d.suggestedFilename(),boundary:'actual public Export DXF download; original bytes'});
  dxfReads.push({file:path,svg:file,version,width,lost,box:state.boxes.front,scale:state.scale});
 }
 await f.same(before);await f.snapshot(label);
 return result;
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

const sheetTab = index => f.page.getByRole('tablist', { name: 'Sheets', exact: true })
  .getByRole('tab', { name: `Sheet ${index}`, exact: true });
const drawingSheet = () => f.page.getByLabel('Drawing sheet', { exact: true });
const boundTarget = doc => doc.drawing.notes.find(note => note.id === 'bound').leader.target;
const svgOnly = { dxf: false };

async function openModel(name, doc) {
 await b('Model').click();
 await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
   name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
 });
 await f.same(doc);
}

async function selectSheet(index) {
 await sheetTab(index).click();
 await drawingSheet().getByText(`${index} OF 2 A4`, { exact: true }).waitFor();
}

async function lifecycleFlow(edge, attached, repaired) {
 f.phase = 'move the source view to the second sheet';
 await b('Add sheet').click();
 await f.changed(repaired);
 const twoSheets = await f.doc();
 const menu = f.page.locator('details[aria-label="Sheets"]');
 if (!await menu.evaluate(node => node.open)) await menu.locator('summary').click();
 await menu.getByLabel('Move Front view to sheet', { exact: true }).selectOption('2');
 await f.changed(twoSheets);
 const moved = await f.doc();
 assert.deepEqual(moved.drawing.notes, repaired.drawing.notes);
 await selectSheet(1);
 await capture('07-first-sheet-no-leaders',80,false,{...svgOnly, owned:false});
 await selectSheet(2);
 await drawing();
 await f.page.getByText(/· Connected endpoint$/).waitFor();
 const movedNote = await capture('08-second-sheet-leaders',80,false,svgOnly);

 f.phase = 'cancel pending reselection when the active sheet changes';
 await b('Reselect endpoint').click();
 await selectSheet(1);
 await f.page.getByText('Endpoint selection cancelled because the drawing or selection changed.', { exact: true }).waitFor();
 await f.same(moved);
 await selectSheet(2);
 const afterChange = await capture('09-reselection-cancelled',80,false,svgOnly);
 assert.deepEqual(afterChange,movedNote);

 f.phase = 'change paper scale and units on the owned sheet';
 await f.page.getByLabel('Scale',{exact:true}).selectOption('0.5');
 await f.page.getByLabel('Drawing units',{exact:true}).selectOption('inch');
 await f.page.getByLabel('Dual units',{exact:true}).setChecked(true);
 await f.page.waitForFunction(() => window.__studioDrawing?.()?.scale === .5
   && window.__studioDoc?.drawing?.units === 'inch' && window.__studioDoc?.drawing?.dual === true);
 const scaled = await f.doc();
 assert.deepEqual(scaled.nodes,moved.nodes);
 assert.deepEqual(scaled.drawing.notes,moved.drawing.notes);
 const half = await capture('10-second-sheet-inch-dual-half',80,false,svgOnly);
 assert.ok(Math.abs(half.boundTip[0]-half.freeTip[0]-8)<.002);

 f.phase = 'turn the same native front view to its back side';
 await f.page.getByLabel('Front view side',{exact:true}).selectOption('y+');
 await f.page.waitForFunction(() => window.__studioDoc?.drawing?.orientation === 'y+');
 const reversed = await f.doc();
 assert.deepEqual(boundTarget(reversed),boundTarget(scaled));
 assert.deepEqual(reversed.drawing.notes[1].leader.at,[-64,0]);
 await drawing();
 await f.page.getByText(/Needs confirmation:/).first().waitFor();
 await capture('11-reversed-source-held',80,true,{...svgOnly, freeX:16});
 await f.undo(); await f.same(scaled);
 await selectSheet(2);
 assert.deepEqual(await capture('12-orientation-restored',80,false,svgOnly),half);

 f.phase = 'hold a successful original projection for the 64 mm source';
 await openModel('previous-source-64',attached);
 await f.page.evaluate(() => window.__fitDrawingReply.arm());
 await b('Drawing').click();
 await f.page.waitForFunction(() => !!window.__fitDrawingReply.read());
 const held = await f.page.evaluate(() => window.__fitDrawingReply.read());
 assert.ok(held.ok);
 assert.deepEqual(held.doc,attached);
 await f.snapshot('13-previous-drawing-reply-held');

 f.phase = 'open the repaired 80 mm document before the old reply arrives';
 await openModel('current-source-80',repaired);
 await drawing();
 await f.page.getByText(/· Connected endpoint$/).waitFor();
 const current = await capture('14-current-note-before-reply',80,false,svgOnly);
 const samples = await f.page.evaluate(() => window.__fitDrawingReply.release());
 for (const state of samples) assert.deepEqual(state,samples[0]);
 assert.deepEqual(await capture('15-old-reply-ignored',80,false,svgOnly),current);
 assert.deepEqual(boundTarget(await f.doc()),boundTarget(repaired));

 f.phase = 'edit the source again and explicitly restore the same endpoint';
 await b('Model').click();
 await f.openFeatureEditor(1, 'source width after Open');
 await f.editor().getByLabel('Width',{exact:true}).fill('88');
 const edited = (await f.applyEditor(repaired,'16-source-width88')).doc;
 await drawing();
 assert.deepEqual(boundTarget(edited),boundTarget(repaired));
 await f.page.getByText(/Needs confirmation:/).first().waitFor();
 await capture('17-post-open-unresolved',88,true,svgOnly);
 await attach(edge,88,true);
 await f.page.waitForFunction(() => window.__studioDoc?.drawing?.notes?.find(note => note.id === 'bound')?.leader?.target?.sig?.s === 88);
 const final = await f.doc();
 assert.deepEqual(final.drawing.notes[1],repaired.drawing.notes[1]);
 const reconnected = await capture('18-post-open-reconnected',88,false,svgOnly);

 f.phase = 'edit the Note text without changing its reference';
 const text = f.page.getByRole('textbox',{name:'Note text',exact:true});
 await text.fill('CONNECTED NOTE REVISED');
 await text.press('Tab');
 await f.changed(final);
 const renamed = await f.doc();
 const expected = structuredClone(final);
 expected.drawing.notes[0].text = 'CONNECTED NOTE REVISED';
 assert.deepEqual(renamed,expected);
 assert.deepEqual(await capture('19-note-text-edited',88,false,svgOnly),reconnected);
 await f.undo(); await f.same(final);
 await f.redo(); await f.same(renamed);
 const saved = await f.save('connected-note-revised');
 await f.freshOpen(saved.file,renamed,'20-revised-native-open');
 await drawing();
 await capture('21-revised-native-svg',88,false,svgOnly);
 f.report.observations.push({ ownerSheet:2, halfScaleGap:8, unchangedReplySamples:samples.length, finalSourceWidth:88 });
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
 if(lifecycle) await lifecycleFlow(fixture.edge,attached,repaired);
});

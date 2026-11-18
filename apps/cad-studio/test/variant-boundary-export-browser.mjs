// #256 real downloaded export evidence only; no Worker/Blob interception.
import assert from 'node:assert/strict';
import {readFile,statfs} from 'node:fs/promises';
import {resolve,isAbsolute,relative,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createFlow,sha256} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'));
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),process.env.VARIANT_BOUNDARY_EXPORT_HEAD??'0c586b19acb3809d943da4a126c91ceab7aaef6d');
function box(parameter,height){return {format:'barocss-cad-model',schema:3,units:'mm',parameters:{[parameter]:height},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[10,5]},{id:'n1',kind:'extrude',sketch:0,height:{parameter}}],outputs:{b1:{node:1,side:'solid'}},nextId:2,variability:{version:1,inputs:[{name:'size',type:'number',unit:'mm',min:1,max:100,default:height,bindings:[{to:'parameter',part:'base',parameter}]}]}};}
const a=box('HeightA',20),b=box('HeightB',10);b.variability.variants=[{name:'Tall',values:{size:22}}];b.variability.active='Tall';
const master=structuredClone(b);delete master.variability.active;
const graphReader='apps/cad-studio/test/part21-prism-check.py';
const pins=['apps/cad-studio/test/variant-boundary-export-browser.mjs',graphReader,'apps/cad-studio/src/state/useVariants.ts','apps/cad-studio/src/ui/VariantsPanel.tsx','apps/cad-studio/src/App.tsx','apps/cad-studio/src/files/useModelExports.ts','apps/cad-studio/src/files/stepExportPreparation.ts','apps/cad-studio/src/files/StepExportPanel.tsx','packages/barocss-cad-model/src/print/export3mf.ts','packages/barocss-cad-model/src/print/threemf.ts'];
const oracleSource=String.raw`
import json,sys,math,zipfile,xml.etree.ElementTree as ET,subprocess
from collections import Counter
from pathlib import Path
r=json.load(sys.stdin); h=r['height']; volume=10*5*h
if r['format']=='step':
    bounds={'min':[0,0,0],'max':[10,5,h]}
    expected={'productCount':1,'solidCount':1,'solidBounds':[bounds],'bounds':bounds}
    ep=Path(r['file']+'.expected.json'); ep.write_text(json.dumps(expected))
    p=subprocess.run([sys.executable,'-I',r['reader'],r['file'],str(ep)],text=True,capture_output=True)
    assert p.returncode==0,(p.stdout,p.stderr)
    result=json.loads(p.stdout); assert result['status']=='PASS'; assert result['vertexCount']==8
    control=subprocess.run([sys.executable,'-I',r['reader'],r['file'],str(ep),'--selftest'],text=True,capture_output=True)
    assert control.returncode==0,(control.stdout,control.stderr)
    controls=json.loads(control.stdout); assert controls['status']=='PASS' and controls['negativeControlsDetected']==5 and controls['positiveControls']==2
    print(json.dumps({'status':'PASS','graph':result,'controls':controls,'analyticPrismVolume':volume,'solidVolumeComputed':False}));sys.exit(0)
with zipfile.ZipFile(r['file']) as z:
    assert z.testzip() is None
    assert sorted(z.namelist())==['3D/3dmodel.model','[Content_Types].xml','_rels/.rels']
    root=ET.fromstring(z.read('3D/3dmodel.model'))
ns={'m':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
assert root.tag=='{'+ns['m']+'}model' and root.get('unit')=='millimeter'
objects=root.findall('m:resources/m:object',ns); items=root.findall('m:build/m:item',ns)
assert len(objects)==len(items)==1
obj,item=objects[0],items[0];assert item.get('objectid')==obj.get('id')
assert obj.find('m:components',ns) is None
transform=item.get('transform')
if transform is not None: assert list(map(float,transform.split()))==[1,0,0,0,1,0,0,0,1,0,0,0]
verts=[tuple(float(v.get(k)) for k in ('x','y','z')) for v in obj.findall('m:mesh/m:vertices/m:vertex',ns)]
tris=[tuple(int(t.get(k)) for k in ('v1','v2','v3')) for t in obj.findall('m:mesh/m:triangles/m:triangle',ns)]
assert verts and len(tris)==12 and all(math.isfinite(x) for v in verts for x in v)
assert all(len(set(t))==3 and all(0<=i<len(verts) for i in t) for t in tris)
lo=[min(v[i] for v in verts) for i in range(3)];hi=[max(v[i] for v in verts) for i in range(3)]
assert all(math.isclose(x,y,abs_tol=1e-6) for x,y in zip(lo+hi,[0,0,0,10,5,h]))
# Mesh may duplicate vertex indices at face normals. Check edge closure geometrically.
edges=Counter(); signed=0
for t in tris:
    a,b,c=[verts[i] for i in t]
    for u,v in ((a,b),(b,c),(c,a)): edges[(u,v)]+=1
    signed+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
assert all(count==1 and edges[(v,u)]==1 for (u,v),count in edges.items())
assert math.isclose(abs(signed),volume,rel_tol=0,abs_tol=1e-5),(signed,volume)
print(json.dumps({'status':'PASS','unit':root.get('unit'),'buildItems':1,'bounds':{'min':lo,'max':hi},'triangles':len(tris),'signedVolume':signed,'expectedVolume':volume}))
`;
const f=await createFlow({name:'variant-boundary-export',output,envFrozen:'VARIANT_BOUNDARY_EXPORT_FROZEN',initialFiles:pins,requiredFrozen:pins,oracleSource,
qualification:'#256 same-filename A numeric draft to independent saved-active B: actual STEP/3MF downloads then explicit B Master recovery.',
limits:['Synthetic 10 by 5 mm prismatic base parts; no delayed Worker replies, other entry routes, assemblies or external viewer/slicer.','STEP independent graph reader validates connected BREP/prism vertices and units, not surface evaluation or independently integrated solid volume. 3MF XML checks build identity, bounds and signed triangle volume.','Four real public downloads, no backend import substitute or Blob interception.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Variants panel',exact:true});
const value=()=>panel().getByLabel('Value of size',{exact:true});
async function reserve(label){const s=await statfs(output),available=s.bavail*s.bsize;f.report.observations.push({label,availableBytes:available});await f.persist();assert.ok(available>=2*1024**3,'2 GiB reserve reached');}
async function open(doc){const bytes=Buffer.from(JSON.stringify(doc));f.report.observations.push({source:'same-name.bcad',sha256:sha256(bytes)});const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:'same-name.bcad',mimeType:'application/json',buffer:bytes});await f.same(doc);}
async function geometry(height){await f.page.waitForFunction(h=>{const s=window.__studioBodies?.();return window.__studioFresh&&s?.fresh&&s.massReady&&s.bodies.length===1&&Math.abs(s.bodies[0].volume-50*h)<1e-8;},height);const actual=(await f.bodies()).bodies[0];assert.ok(actual.centroid.every((v,i)=>Math.abs(v-[5,2.5,height/2][i])<1e-8));}
async function state(){return f.page.evaluate(()=>({doc:JSON.parse(JSON.stringify(window.__studioDoc)),selection:JSON.parse(JSON.stringify(window.__studioSelection)),dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),history:[...document.querySelectorAll('.history .hs')].map(x=>x.getAttribute('aria-label')),undo:['Undo','Redo'].map(n=>{const b=document.querySelector('button[aria-label="'+n+'"]');return {disabled:b?.disabled,tip:b?.getAttribute('data-tip')};})}));}
async function exportFile(format,label,height){
 await reserve(label+'-'+format);const before=await state();assert.equal(await value().inputValue(),String(height));
 let download;
 if(format==='step'){
  await button('Export STEP').click();const p=f.page.getByLabel('STEP export',{exact:true});await p.waitFor();await f.page.waitForFunction(()=>{const p=document.querySelector('[aria-label="STEP export"]');return [...(p?.querySelectorAll('button')??[])].some(b=>b.textContent?.trim()==='Export'&&!b.disabled);});
  const pending=f.page.waitForEvent('download');await button('Export',p).click();download=await pending;await p.waitFor({state:'detached'});
 }else{const pending=f.page.waitForEvent('download');await button('Export 3MF').click();download=await pending;await f.waitToast(/3MF written/);}
 assert.equal(download.suggestedFilename(),'same-name.'+format);const file=join(output,label+'.'+format);await download.saveAs(file);assert.equal(await download.failure(),null);const bytes=await readFile(file);assert.ok(bytes.length>0);
 f.report.files.push({file,bytes:bytes.length,sha256:sha256(bytes),suggestedFilename:download.suggestedFilename(),boundary:'actual browser download.saveAs'});
 await f.runOracle({file,format,height,reader:resolve(repo,graphReader)},label+'-'+format);assert.deepEqual(await readFile(file),bytes);assert.deepEqual(await state(),before,'export preserves B document/history/dirty');assert.equal(await value().inputValue(),String(height));await geometry(height);await f.snapshot(label+'-'+format);await f.dismissToasts();
}
await f.run(async()=>{
 f.phase='A public Open then numeric draft40';await reserve('before-browser');await f.newPage();await open(a);await clickModelCommand(f.page,'Inspect','Variants');await panel().waitFor();await value().fill('40');await geometry(40);await f.same(a);assert.equal((await state()).dirty,false);await f.snapshot('01-A-draft40');
 f.phase='Independent same-filename B saved active Tall22';await open(b);await geometry(22);assert.equal(await value().inputValue(),'22');assert.equal(await panel().getByRole('alert').count(),0);assert.match(await panel().getByLabel('Variant shown').innerText(),/Tall/);assert.equal((await state()).dirty,false);
 await exportFile('step','02-B-tall22',22);await exportFile('3mf','02-B-tall22',22);await f.same(b);
 f.phase='Explicit B Show Master10 and exports';await button('Show the master',panel()).click();await f.same(master);await geometry(10);assert.equal(await value().inputValue(),'10');assert.equal(await panel().getByLabel('Variant shown').count(),0);
 await exportFile('step','03-B-master10',10);await exportFile('3mf','03-B-master10',10);await f.same(master);assert.equal(f.report.downloads.length,4);await reserve('finished');
});

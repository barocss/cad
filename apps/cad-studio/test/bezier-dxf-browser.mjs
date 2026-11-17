// #253: actual authoring / History DXF download, independent installed ezdxf reader.
// No product functions mutate browser state; only public UI and owned native-file Open.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createFlow,sha256} from './flow-helper.mjs';
const Q=[[0,40],[10,60],[20,40]],C=[[30,40],[35,55],[45,55],[50,40]];
const oracle=String.raw`import json,sys,hashlib,math,ezdxf
from pathlib import Path
p=Path(sys.argv[1]); expected=json.loads(sys.argv[2]); doc=ezdxf.readfile(p)
assert doc.dxfversion=='AC1015'
assert doc.units==4
splines=list(doc.modelspace().query('SPLINE'))
assert len(splines)==len(expected)
reads=[]
for s,poles in zip(splines,expected):
 degree=len(poles)-1
 assert s.dxf.degree==degree
 assert s.dxf.layer=='CONSTRUCTION'
 assert list(s.knots)==[0.]*(degree+1)+[1.]*(degree+1)
 assert [list(p) for p in s.control_points]==[p+[0] for p in poles]
 weights=list(s.weights); assert not weights or weights==[1.]*(degree+1)
 bs=s.construction_tool(); samples=[]
 for t in [0,.25,.5,.75,1]:
  literal=[sum(math.comb(degree,i)*t**i*(1-t)**(degree-i)*poles[i][axis] for i in range(degree+1)) for axis in [0,1]]+[0]
  actual=list(bs.point(t)); assert max(abs(a-b) for a,b in zip(actual,literal))<=1e-12
  samples.append({'t':t,'bernstein':literal,'reader':actual})
 tangents=[]
 for t,a,b in [(0,poles[0],poles[1]),(1,poles[-2],poles[-1])]:
  expected_d=[degree*(b[i]-a[i]) for i in [0,1]]+[0]
  actual_d=list(bs.derivative(t,n=1)[1]); assert max(abs(a-b) for a,b in zip(actual_d,expected_d))<=1e-12
  tangents.append({'t':t,'literal':expected_d,'reader':actual_d})
 reads.append({'degree':degree,'poles':poles,'samples':samples,'endTangents':tangents})
assert len(list(doc.modelspace().query('LWPOLYLINE')))==1
print(json.dumps({'status':'PASS','reader':'ezdxf','version':ezdxf.__version__,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'splines':reads}))
`;
const pins=['apps/cad-studio/test/bezier-dxf-browser.mjs','packages/barocss-cad-model/src/sketch/dxf.ts','packages/barocss-cad/src/io/dxf-writer.ts'];
const f=await createFlow({name:'bezier-dxf',envFrozen:'BEZIER_DXF_FROZEN',output:process.argv[2],qualification:'Owned quadratic/cubic sketch DXF via actual History export',initialFiles:pins,requiredFrozen:pins,extraFrozen:pins,snapshotExtra:()=>({dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}),limits:['One XY rectangle with two authored polynomial curves; tilted/local coordinate matrix covered by Model tests, not this browser run. The tested reopen → Select → curve-endpoint route did not expose Bézier controls; other selection routes were not qualified. Control-point edit is qualified only during new authoring.','Malformed pole-count/nonfinite cases and R12 are Model tests; actual refusal case is an owned finite all-coincident curve loaded through native Open.','Installed independent ezdxf reader; no external download, kernel native execution, manufacturing or general spline widening.']});
const button=n=>f.page.getByRole('button',{name:n,exact:true});
const historySketch=()=>f.page.getByRole('group',{name:'History',exact:true}).getByRole('button',{name:'Sketch · rectangle',exact:true});
async function reopen(){await historySketch().click();await f.editor().waitFor();await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click();await f.sketchPanel().waitFor();}
async function menu(){await historySketch().click({button:'right'});await f.page.getByRole('menuitem',{name:'Export sketch DXF',exact:true}).waitFor();}
async function exportDxf(label,poles){
 f.phase='DXF '+label;const before=await f.snapshot(label+'-before');await menu();
 const [d]=await Promise.all([f.page.waitForEvent('download'),f.page.getByRole('menuitem',{name:'Export sketch DXF',exact:true}).click()]);
 const path=join(f.output,label+'.dxf');await d.saveAs(path);const bytes=await readFile(path);
 const run=spawnSync('/Users/user/.cache/barocss-ezdxf/bin/python',['-I',join(f.output,'independent-dxf.py'),path,JSON.stringify(poles)],{encoding:'utf8'});
 await writeFile(join(f.output,label+'-reader.json'),run.stdout??'');await writeFile(join(f.output,label+'-reader.stderr'),run.stderr??'');
 f.report.oracles.push({label,exit:run.status,signal:run.signal,stdout:run.stdout,stderr:run.stderr});await f.persist();assert.equal(run.status,0,run.stderr);
 const after=await f.snapshot(label+'-exported');for(const k of ['doc','history','dirty'])assert.deepEqual(after[k],before[k]);
 f.report.files.push({path,sha256:sha256(bytes),bytes:bytes.length,docHistoryDirtyUnchanged:true});return {path,bytes};
}
await f.run(async()=>{
 const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
 f.browser.newContext=async options=>{const c=await newContext({...options,serviceWorkers:'block'});await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return u.origin===origin?route.continue():route.abort();});return c;};
 await writeFile(join(f.output,'independent-dxf.py'),oracle);f.report.oracleSource={sha256:sha256(oracle),productImports:0};
 let saved,initial;
 if(process.argv[3]){
  const dir=process.argv[3];saved={file:join(dir,'two-beziers.bcad'),doc:JSON.parse(await readFile(join(dir,'two-beziers.bcad'),'utf8'))};initial={path:join(dir,'05-authored.dxf'),bytes:await readFile(join(dir,'05-authored.dxf'))};
  const prior=JSON.parse(await readFile(join(dir,'receipt.json'),'utf8'));assert.equal(prior.status,'FAIL');assert.equal(prior.oracles.length,2);assert.ok(prior.oracles.every(o=>o.exit===0));
  f.report.retainedAntecedent={path:join(dir,'receipt.json'),sha256:sha256(await readFile(join(dir,'receipt.json'))),overall:'FAIL: tested reopen/Select/endpoint route did not expose Bézier controls',acceptedSteps:['actual authored quadratic/cubic export and independent reader','native Save/fresh Open and identical reexport bytes'],notRerun:true};
 }else{
  await f.newPage();await button('New part').click();await f.ready();
  await f.page.getByRole('navigation',{name:'Tools',exact:true}).getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.sketchPanel().getByLabel('Sketch plane',{exact:true}).selectOption('xy');
  await f.frame([[0,0],[40,30],...Q,...C]);await f.tool('Rectangle','r');await f.worldClick([0,0]);await f.worldClick([40,30]);
  await f.tool('Bézier','b');for(const p of Q)await f.worldClick(p);await f.page.mouse.move(5,5);await f.snapshot('01-authored-quadratic');await f.finishSketch('02-quadratic-finished');
  await reopen();await f.frame([...Q,...C]);await f.tool('Bézier','b');for(const p of C)await f.worldClick(p);await f.page.mouse.move(5,5);await f.snapshot('03-authored-two-curves');await f.finishSketch('04-two-curves-finished');
  const doc=await f.doc();assert.deepEqual(doc.nodes[0].construction.map(s=>s.poles),[Q,C]);initial=await exportDxf('05-authored',[Q,C]);
  saved=await f.save('two-beziers');await f.freshOpen(saved.file,saved.doc,'06-fresh-open');const reopened=await exportDxf('07-reopened',[Q,C]);assert.deepEqual(reopened.bytes,initial.bytes);
 }
 // Supported existing editing contract: edit the active Bézier during authoring.
 // The tested reopen/Select/endpoint route did not expose controls; other routes remain unqualified.
 await f.newPage();await button('New part').click();await f.ready();await f.page.getByRole('navigation',{name:'Tools',exact:true}).getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[40,30],...C]);await f.tool('Rectangle','r');await f.worldClick([0,0]);await f.worldClick([40,30]);await f.tool('Bézier','b');for(const p of C)await f.worldClick(p);
 const y=f.sketchPanel().getByLabel('Control point 2 Y',{exact:true});await y.waitFor();await y.fill('60');await y.press('Enter');await f.page.mouse.move(5,5);await f.snapshot('08-authoring-control-point-edited');await f.finishSketch('09-edited-finished');
 const curves=(await f.doc()).nodes[0].construction.map(s=>s.poles);assert.deepEqual(curves,[[[30,40],[35,60],[45,55],[50,40]]]);await exportDxf('10-edited',curves);assert.deepEqual(await readFile(initial.path),initial.bytes);assert.deepEqual(JSON.parse(await readFile(saved.file,'utf8')),saved.doc);
 f.phase='invalid finite curve Open';const bad=structuredClone(saved.doc);bad.nodes[0].construction[0].poles=[[0,40],[0,40],[0,40]];await f.newPage();await f.openFile({name:'owned-degenerate.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))},bad.nodes.length);await f.same(bad);const before=await f.snapshot('11-refusal-before'),count=f.report.downloads.length;await menu();await f.page.getByRole('menuitem',{name:'Export sketch DXF',exact:true}).click();await f.waitToast(/Could not write the DXF/);await f.waitToast(/coincide|point, not a curve/);const after=await f.snapshot('12-export-refused');for(const k of ['doc','history','dirty'])assert.deepEqual(after[k],before[k]);assert.equal(f.report.downloads.length,count);f.report.observations.push({refusalNoDownload:true,priorFilesUnchanged:true});
});

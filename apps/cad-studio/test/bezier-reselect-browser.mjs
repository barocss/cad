// #253 explicit saved Bézier picker: owned native fixture, UI only mutations.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createFlow,sha256} from './flow-helper.mjs';
const fixture={
  "format": "barocss-cad-model",
  "schema": 3,
  "units": "mm",
  "parameters": {},
  "nodes": [
    {
      "kind": "sketch",
      "profile": "rectangle",
      "min": [
        0,
        0
      ],
      "max": [
        40,
        30
      ],
      "sideTags": {
        "outer": [
          "e1",
          "e2",
          "e3",
          "e4"
        ]
      },
      "construction": [
        {
          "kind": "bezier",
          "poles": [
            [
              0,
              40
            ],
            [
              10,
              60
            ],
            [
              20,
              40
            ]
          ],
          "ids": [
            "e5"
          ]
        },
        {
          "kind": "bezier",
          "poles": [
            [
              30,
              40
            ],
            [
              35,
              55
            ],
            [
              45,
              55
            ],
            [
              50,
              40
            ]
          ],
          "ids": [
            "e6"
          ]
        }
      ],
      "id": "n0"
    }
  ],
  "outputs": {},
  "nextId": 1
};
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

const pins=['apps/cad-studio/test/bezier-reselect-browser.mjs','apps/cad-studio/src/ui/SavedBezierPicker.tsx','apps/cad-studio/src/app/sketchControls.ts','apps/cad-studio/src/sketch/draftHistory.ts','packages/barocss-cad-model/src/sketch/dxf.ts','packages/barocss-cad/src/io/dxf-writer.ts'];
const f=await createFlow({name:'bezier-reselect',envFrozen:'BEZIER_RESELECT_FROZEN',output:process.argv[2],qualification:'Explicit saved Bézier selection, owned draft history and exact DXF after native Save/Open',initialFiles:pins,requiredFrozen:pins,extraFrozen:pins,snapshotExtra:()=>({dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}),limits:['One rectangle, one quadratic and one cubic, distinct source identities. No viewport picking or closed-outline policy expansion.','Native and DXF bytes verified independently using installed ezdxf1.4.5, not general spline/curve certification.']});
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

const Q=fixture.nodes[0].construction[0].poles,C=fixture.nodes[0].construction[1].poles;
const Qedit=[[0,40],[10,65],[20,40]],Cedit=[[30,40],[35,62],[45,55],[50,40]];
async function leaveField(){await f.page.getByText('EDIT SAVED BÉZIER',{exact:true}).click();}
async function choose(n){await leaveField();await button('Edit Bézier '+n).click();await f.sketchPanel().getByLabel('Control point 2 Y',{exact:true}).waitFor();}
async function polesEqual(poles){const got=await f.sketchPanel().locator('input[aria-label^="Control point "]').evaluateAll(xs=>xs.map(x=>Number(x.value)));assert.deepEqual(got,poles.flat());}
async function editY(value){const field=f.sketchPanel().getByLabel('Control point 2 Y',{exact:true});await field.fill(String(value));await field.press('Enter');await leaveField();}
async function main(){await leaveField();await button('Return to main profile').click();assert.equal(await f.sketchPanel().getByLabel('Control point 2 Y',{exact:true}).count(),0);}
await f.run(async()=>{
 const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
 f.browser.newContext=async options=>{const c=await newContext({...options,serviceWorkers:'block'});await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return u.origin===origin?route.continue():route.abort();});return c;};
 await writeFile(join(f.output,'independent-dxf.py'),oracle);f.report.oracleSource={sha256:sha256(oracle),productImports:0};f.report.fixtureSHA256=sha256(JSON.stringify(fixture));
 await f.newPage();await f.openFile({name:'owned-saved-beziers.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))},1);await f.same(fixture);let original;
 if(process.argv[3]){
  const dir=process.argv[3],receiptBytes=await readFile(join(dir,'receipt.json')),prior=JSON.parse(receiptBytes),opened=prior.states.find(s=>s.label==='01-opened'),canceled=prior.states.find(s=>s.label==='failure');
  assert.equal(prior.status,'FAIL');assert.equal(prior.phase,'cancel exact draft');assert.ok(prior.states.some(s=>s.label==='03-parked-draft-history'));assert.equal(canceled.sketchPanel,null);for(const k of ['doc','history','dirty'])assert.deepEqual(canceled[k],opened[k]);assert.deepEqual(prior.errors,[]);assert.deepEqual(prior.consoleErrors,[]);assert.deepEqual(prior.changes,[]);
  original={path:join(dir,'02-original.dxf'),bytes:await readFile(join(dir,'02-original.dxf'))};assert.equal(sha256(original.bytes),prior.files.find(x=>x.path===original.path).sha256);
  f.report.retainedAntecedent={path:join(dir,'receipt.json'),sha256:sha256(receiptBytes),overall:'FAIL: driver expected navigation confirmation after direct Escape Cancel',acceptedSteps:['explicit Q/C picker and pending field refusal','parked draft Undo/Redo from other curve and main profile','actual Escape removed draft; failure snapshot doc/history/dirty equals original'],notRerun:true};await f.snapshot('04-resumed-after-cancel-proof');await reopen();await choose(1);await editY(65);await leaveField();await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});await f.same(fixture);const directCancel=await f.snapshot('04a-direct-cancel-verified');for(const k of ['doc','history','dirty'])assert.deepEqual(directCancel[k],opened[k]);
 }else{
const before=await f.snapshot('01-opened');original=await exportDxf('02-original',[Q,C]);
 await reopen();await choose(1);await polesEqual(Q);
 f.phase='pending input does not select another curve';const pending=f.sketchPanel().getByLabel('Control point 2 Y',{exact:true});await pending.fill('70');await button('Edit Bézier 2').click();assert.equal(await pending.inputValue(),'70');assert.equal(await button('Edit Bézier 1').getAttribute('aria-pressed'),'true');assert.equal(await button('Edit Bézier 2').getAttribute('aria-pressed'),'false');await f.page.getByText('Press Tab or click outside the current field before selecting a curve. Its draft has been kept.',{exact:true}).waitFor();assert.deepEqual(await f.doc(),fixture);await f.snapshot('01a-pending-selection-refused');await pending.fill('60');await pending.press('Enter');await leaveField();
 await choose(2);await polesEqual(C);await choose(1);await editY(65);await polesEqual(Qedit);await choose(2);await polesEqual(C);
 f.phase='draft Undo with edited curve parked';await button('Undo').click();await choose(1);await polesEqual(Q);await choose(2);await button('Redo').click();await choose(1);await polesEqual(Qedit);await main();await button('Undo').click();await choose(1);await polesEqual(Q);await main();await button('Redo').click();await choose(1);await polesEqual(Qedit);await f.snapshot('03-parked-draft-history');assert.deepEqual(await f.doc(),fixture);
 f.phase='cancel exact draft';await leaveField();await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});await f.same(fixture);const canceled=await f.snapshot('04-canceled');for(const k of ['doc','history','dirty'])assert.deepEqual(canceled[k],before[k]);

 }
 await reopen();await choose(2);await editY(62);await polesEqual(Cedit);await choose(1);await polesEqual(Q);await main();await choose(2);await polesEqual(Cedit);await f.snapshot('05-explicit-cubic-edited');await f.finishSketch('06-finished');
 const accepted=await f.doc(),expected=structuredClone(fixture);expected.nodes[0].construction[1].poles=Cedit;assert.deepEqual(accepted,expected,'only exact selected poles change; profile/order/side IDs remain');await button('Undo').click();await f.same(fixture);await button('Redo').click();await f.same(accepted);await f.snapshot('07-committed-redo');const edited=await exportDxf('08-edited',[Q,Cedit]);assert.notDeepEqual(edited.bytes,original.bytes);assert.deepEqual(await readFile(original.path),original.bytes);
 const saved=await f.save('edited-saved-beziers');await f.freshOpen(saved.file,saved.doc,'09-fresh-open');const fresh=await exportDxf('10-reopened',[Q,Cedit]);assert.deepEqual(fresh.bytes,edited.bytes);assert.deepEqual(await readFile(original.path),original.bytes);f.report.observations.push({draftUndoRedoWhileOtherCurveAndProfileActive:true,cancelNoCommit:true,committedFirstUndoRedo:true,onlySelectedPolesChanged:true,nativeSaveFreshOpen:true,previousDxfBytesUnchanged:true});
});

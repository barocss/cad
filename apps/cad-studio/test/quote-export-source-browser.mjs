import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const mode=process.argv[3]??'variant';
assert.ok(['ordinary','variant','rollback'].includes(mode));
const oracleSource=String.raw`import json,sys,zipfile,re
x=json.load(sys.stdin)
with zipfile.ZipFile(x['file']) as z:
 q=json.loads(z.read('quote.json'));s=z.read('part.step').decode()
 p=[tuple(map(float,m)) for m in re.findall(r"CARTESIAN_POINT\([^\n]*?\(([-+\d.Ee]+),([-+\d.Ee]+),([-+\d.Ee]+)\)\)",s)]
 assert p
 height=max(v[2] for v in p)-min(v[2] for v in p)
 result={'status':'PASS' if abs(height-x['height'])<1e-6 and abs(max(v[0] for v in p)-min(v[0] for v in p)-60)<1e-6 and abs(q['part']['volume']-60*40*x['height'])<1e-6 else 'FAIL','stepHeight':height,'request':q['part']}
 print(json.dumps(result))
`;
const f=await createFlow({name:'quote-export-source',output:process.argv[2],envFrozen:'QUOTE_EXPORT_SOURCE_FROZEN',initialFiles:['apps/cad-studio/test/quote-export-source-browser.mjs','apps/cad-studio/src/files/useModelExports.ts'],qualification:'Actual Quote package STEP and request match the shown variant.',limits:['Existing single-part injection quote package; no manufacturing certification or new export scope.'],oracleSource,inspectorSource:`import {emptyDoc,withNode} from '@barocss/cad-model/engine/doc';let doc={...withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[60,40]}),{kind:'extrude',sketch:0,height:{parameter:'Height'}}),parameters:{Height:10},process:'injection',mould:{version:1,pull:[0,0,1],finish:'pm-t1'},variability:{version:1,inputs:[{name:'height',type:'number',default:10,min:1,max:50,bindings:[{to:'parameter',part:'base',parameter:'Height'}]}],variants:[{name:'Tall',values:{height:20}}]}};if('${mode}'==='rollback')doc=withNode(withNode(doc,{kind:'sketch',profile:'rectangle',min:[80,0],max:[90,10]}),{kind:'extrude',sketch:2,height:5});console.log(JSON.stringify({doc}));`});
await f.run(async()=>{const {doc}=await f.inspect('fixture',{});await f.newPage();await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'quote-part.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);if(mode==='variant'){await clickModelCommand(f.page,'Inspect','Variants');const panel=f.page.getByRole('complementary',{name:'Variants panel',exact:true});await panel.getByRole('button',{name:'Show Tall',exact:true}).click();await panel.getByLabel('Variant shown',{exact:true}).getByText('Tall',{exact:true}).waitFor();await panel.getByRole('button',{name:'Close Variants',exact:true}).click();}if(mode==='rollback')await f.page.locator('.history .hs[data-node-index="1"]').dblclick();await f.ready();await f.page.waitForFunction(()=>window.__studioBodies?.().massReady===true);await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.page.getByRole('button',{name:'Library',exact:true}).click();const before=await f.doc();const [download]=await Promise.all([f.page.waitForEvent('download'),f.page.getByRole('button',{name:'Quote package',exact:true}).click()]);const file=join(f.output,`${mode}-quote.zip`);await download.saveAs(file);assert.deepEqual(await f.doc(),before);await f.snapshot(`${mode}-quote`);await f.runOracle({file,height:mode==='variant'?20:10},mode);});

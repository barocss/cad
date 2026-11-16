import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const diagnostic=process.argv.includes('--before-fix');
const f=await createFlow({name:'rectangle-constant-fillet-resize',output:process.argv[2],envFrozen:'RECTANGLE_CONSTANT_FILLET_FROZEN',initialFiles:['apps/cad-studio/test/rectangle-constant-fillet-resize-browser.mjs'],qualification:diagnostic?'Reproduce stale constant circular Fillet signature after accepted rectangle resize.':'Preserve proven rectangle constant circular Fillet reference across resize and reopen.',limits:['Single terminal numeric constant circular Fillet on one original rectangular prism edge.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep,evaluateSurface} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), [{key,brep}]=partBreps(doc);
const midpoints=brep.faces.filter(f=>f.name?.startsWith('n2.face')).map(f=>{const s=f.surface;if(s.kind!=='surface')throw Error('Expected native surface');return evaluateSurface(s,(s.knotsU[s.degreeU]+s.knotsU[s.controlPoints.length])/2,(s.knotsV[s.degreeV]+s.knotsV[s.controlPoints[0].length])/2);});
console.log(JSON.stringify({key,midpoints,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point)}));
`,oracleSource:`
import json,sys,math
d=json.load(sys.stdin);n=d['native'];w=d['width'];h=10;depth=d['depth'];c=2
expected=w*depth*h-w*c*c*(1-math.pi/4)
assert n['check']['valid'],n['check']['issues']
assert abs(n['volume']-expected)<1e-7,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<1e-7
for x in [0,w]:
 for p in [(x,0,h-c),(x,c,h)]:
  assert any(math.dist(p,q)<1e-9 for q in n['vertices']),p
 assert not any(math.dist((x,0,h),q)<1e-9 for q in n['vertices'])
q=c*(1-1/math.sqrt(2))
assert any(math.dist((w/2,q,h-q),p)<1e-7 for p in n['midpoints']),n['midpoints']
print(json.dumps({'status':'PASS','expectedVolume':expected,'nativeVolume':n['volume'],'workerVolume':d['workerVolume']}))
`});
const edge='n1.side0|n1.top';
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10},{id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:[edge],radius:2,sigs:{[edge]:{k:'line',p:[20,0,10],d:[1,0,0],s:40}}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=(name)=>f.page.getByRole('button',{name,exact:true});
async function open(doc,held=false){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'rectangle-constant-fillet.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(({d,held})=>held?window.__studioDoc?.nodes?.[2]?.kind==='fillet'&&!!window.__studioDoc.nodes[2].held:JSON.stringify(window.__studioDoc)===JSON.stringify(d),{d:doc,held},{timeout:30000});await f.ready();}
async function verify(doc,label,width,depth){const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;assert.equal(native.key,body.key);await f.runOracle({native,width,depth,workerVolume:body.volume},label);}
await f.run(async()=>{
 await f.newPage();await open(source);await verify(source,'01-original',40,30);await f.openFeatureEditor(1);await f.editor().getByLabel('Width',{exact:true}).fill('60');const wide=(await f.applyEditor(source,'02-wide')).doc;await verify(wide,'02-wide',60,30);
 if(diagnostic){assert.deepEqual(wide.nodes[2].sigs,source.nodes[2].sigs);await button('New part').click();await f.ready();await open(wide,true);await f.page.getByRole('region',{name:'References',exact:true}).waitFor();await f.snapshot('03-reproduced-stale-signature-hold');return;}
 assert.deepEqual(wide.nodes[2],{...source.nodes[2],sigs:{[edge]:{k:'line',p:[30,0,10],d:[1,0,0],s:60}}});await f.undo();await f.same(source);await f.redo();await f.same(wide);await button('New part').click();await f.ready();await open(wide);assert.equal(await f.page.getByRole('region',{name:'References',exact:true}).count(),0);
 await f.openFeatureEditor(1);await f.editor().getByLabel('Depth',{exact:true}).fill('36');const deep=(await f.applyEditor(wide,'03-deep')).doc;assert.deepEqual(deep.nodes[2],wide.nodes[2]);await verify(deep,'03-deep',60,36);await button('New part').click();await f.ready();await open(deep);await f.snapshot('04-reopened');await f.openFeatureEditor(1);await f.editor().getByLabel('Width',{exact:true}).fill('20');const narrow=(await f.applyEditor(deep,'05-narrow')).doc;assert.deepEqual(narrow.nodes[2].sigs[edge],{k:'line',p:[10,0,10],d:[1,0,0],s:20});await verify(narrow,'05-narrow',20,36);await button('New part').click();await f.ready();await open(narrow);await f.openFeatureEditor(1);await f.editor().getByLabel('Depth',{exact:true}).fill('1');await f.editor().getByRole('button',{name:'Apply',exact:true}).click();await f.editor().getByRole('status').filter({hasText:/could|cannot|outside|leaves|radius|fit/i}).first().waitFor();await f.same(narrow);await f.snapshot('06-invalid-depth-retained');await f.closeEditor();assert.deepEqual(f.report.downloads,[]);
});

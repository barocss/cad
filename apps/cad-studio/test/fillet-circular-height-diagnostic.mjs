// Diagnostic, not a passing feature acceptance test. Reports each native evaluation.
import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const code=`import {partBreps} from '@barocss/cad-model/engine/evaluate'; import {checkBrep,brepMassProperties} from '@barocss/cad'; import {readFileSync} from 'node:fs'; const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));try {const [{brep}]=partBreps(doc);console.log(JSON.stringify({ok:true,check:checkBrep(brep,{strict:true}),mass:brepMassProperties(brep,1)}));}catch(e){console.log(JSON.stringify({ok:false,error:e.message}));}`;
const native=resolve(import.meta.dirname,'../../../packages/barocss-cad');
const exports=JSON.parse(await readFile(join(native,'package.json'),'utf8')).exports;
const alias=Object.fromEntries(Object.entries(exports).map(([k,v])=>[k==='.'?'@barocss/cad':'@barocss/cad/'+k.slice(2),resolve(native,v.import)]));
const built=await build({alias,stdin:{contents:code,resolveDir:process.cwd(),sourcefile:'fillet-height-inspector.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',target:'node22',write:false,metafile:true});
const inspector=join(output,'inspector.mjs');await writeFile(inspector,built.outputFiles[0].contents);await writeFile(join(output,'metafile.json'),JSON.stringify(built.metafile,null,2));
const rows=[];
for(const [label,height,z] of [['control-h10',10,10],['history-h12',12,10],['direct-h12',12,12]]){
 const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'loop',segments:[{kind:'line',start:[0,0]},{kind:'arc',start:[8,0],center:[0,0],direction:'ccw'},{kind:'line',start:[0,8]}]},{id:'n1',kind:'extrude',sketch:0,height},{id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side1|n1.top'],radius:1.2,radii:[{at:[8,0,z],radius:1.2,atEnd:true},{at:[4.898587196589413e-16,8,z],radius:.6,atEnd:true}]}],outputs:{b1:{node:2,side:'solid'}},nextId:3};
 const file=join(output,label+'.bcad');await writeFile(file,JSON.stringify(doc));const run=spawnSync(process.execPath,[inspector,file],{encoding:'utf8'});if(run.status!==0)throw new Error(run.stderr);rows.push({label,...JSON.parse(run.stdout)});
}
await writeFile(join(output,'results.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));

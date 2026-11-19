import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emptyDoc,withNode} from '../../../packages/barocss-cad-model/src/engine/doc';
import {exportStudioStep,evaluateDoc} from '../../../packages/barocss-cad-model/src/engine/evaluate';
import {partSnapshot} from '../../../packages/barocss-cad-model/src/engine/part';
import {importStep,checkBrep,faceGeometry,massPropertiesOf} from '../../../packages/barocss-cad/src/index';
const text=readFileSync('apps/cad-studio/handover/notes/import-open-stage-ownership-2026-10-29/normal-first/two-boxes.step','utf8');
assert.equal(createHash('sha256').update(text).digest('hex'),'b425a5a94604bd94d4f0b55192368480c217792862552f8cd3a38eedd33c28b7');
const imported=withNode(emptyDoc(),{kind:'import',name:'two-boxes',step:text,solids:importStep(text).bodies.length});
const source=withNode(imported,{kind:'shell',parent:{node:0,side:'part0'},thickness:3,open:['n0.a.top']});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function inspect(doc:any){const outputs=partSnapshot(doc).outputs;assert.equal(outputs.length,2);const rows=outputs.map(o=>{const check=checkBrep(o.brep,{strict:true});assert.ok(check.valid);assert.equal(o.bodyCount,1);const volume=massPropertiesOf(o).volume;return {o,volume,check};}).sort((a,b)=>a.volume-b.volume);near(rows[0].volume,144);near(rows[1].volume,468);near(rows.reduce((s,r)=>s+r.volume,0),612);const shell=rows[1].o.brep;for(const x of [3,7])for(const y of [3,7])for(const z of [3,5])assert.ok(shell.vertices.some(v=>v.point.every((n,i)=>Math.abs(n-[x,y,z][i])<1e-7)));const top=shell.faces.find(f=>{const g=faceGeometry(f);return g.kind==='plane'&&Math.abs(g.o[2]-5)<1e-8&&g.n[2]>.99});assert.ok(top);assert.deepEqual(top.loops.map(id=>shell.loops.find(l=>l.id===id)!.kind).sort(),['inner','outer']);return rows.map(r=>({volume:r.volume,check:r.check}));}
const before=inspect(source);const step=exportStudioStep(source,{name:'synthetic-shell-wall3'});const reread=withNode(emptyDoc(),{kind:'import',name:'reread',step:step.text,solids:importStep(step.text).bodies.length});const after=inspect(reread);const bad=withNode(imported,{kind:'shell',parent:{node:0,side:'part0'},thickness:5,open:['n0.a.top']});const refused=evaluateDoc(bad,1);assert.equal(refused.ok,false);console.log(JSON.stringify({status:'PASS',base:'1d857f2fcb288461cb905e682200edfc76418231',before,after,stepBytes:Buffer.byteLength(step.text),stepSHA256:createHash('sha256').update(step.text).digest('hex'),omitted:step.omitted??[],wall5:refused,limits:['in-process only','no browser/download/external CAD']},null,2));

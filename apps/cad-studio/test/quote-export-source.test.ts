import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server.edge';
import {emptyDoc,withNode,type StudioDoc} from '@barocss/cad-model/engine/doc';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import type {EngineClient} from '../src/engine/client';
import {useModelExports,type ModelExportController} from '../src/files/useModelExports';
const block=(height:number):StudioDoc=>({...withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[60,40]}),{kind:'extrude',sketch:0,height}),process:'injection',mould:{version:1,pull:[0,0,1],finish:'pm-t1'}});
function unzip(bytes:Uint8Array){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=new Map<string,string>();let at=view.getUint32(bytes.length-22+16,true);const count=view.getUint16(bytes.length-22+10,true);for(let k=0;k<count;k++){assert.equal(view.getUint32(at,true),0x02014b50);const method=view.getUint16(at+10,true),size=view.getUint32(at+20,true),n=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true),name=new TextDecoder().decode(bytes.subarray(at+46,at+46+n)),start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),raw=bytes.subarray(start,start+size);files.set(name,new TextDecoder().decode(method===8?inflateRawSync(raw):raw));at+=46+n+extra+comment;}return files;}
for(const mode of ['ordinary','variant','rollback'] as const)test(`quote STEP and request agree for ${mode}`,async()=>{
 const original=block(10),doc=mode==='rollback'?withNode(withNode(original,{kind:'sketch',profile:'rectangle',min:[80,0],max:[90,10]}),{kind:'extrude',sketch:2,height:5}):original;
 const shown=mode==='variant'?block(20):doc,evaluated=mode==='rollback'?original:shown,height=mode==='variant'?20:10,result=evaluateDoc(evaluated,1);assert.ok(result.ok);const before=JSON.stringify(doc);let api!:ModelExportController;const blobs:Blob[]=[],notices:unknown[]=[];
 const old=Object.getOwnPropertyDescriptor(globalThis,'document'),create=URL.createObjectURL;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){return {href:'',download:'',click(){}};}}});URL.createObjectURL=blob=>{assert.ok(blob instanceof Blob);blobs.push(blob);return 'blob:quote-fixture';};
 function Probe(){api=useModelExports({model:{doc,evaluated,shown,bodies:result.ok?result.bodies:[],fresh:true,busy:false,massReady:true,instancesFresh:true,instanceBodies:new Map()},engine:{} as EngineClient,fileName:'shown',current:{doc:{current:doc},evaluated:{current:evaluated},shown:{current:shown},name:{current:'shown'}},onNotice:n=>notices.push(n)});return null;}
 try{renderToString(createElement(Probe));await api.exportQuote();assert.equal(blobs.length,1,JSON.stringify(notices));const files=unzip(new Uint8Array(await blobs[0].arrayBuffer())),request=JSON.parse(files.get('quote.json')!);assert.equal(request.part.volume,60*40*height);assert.deepEqual(request.part.size,[60,40,height]);const points=[...files.get('part.step')!.matchAll(/CARTESIAN_POINT\([^\n]*?\(([-+\d.Ee]+),([-+\d.Ee]+),([-+\d.Ee]+)\)\)/g)].map(m=>m.slice(1).map(Number));assert.ok(points.length);assert.equal(Math.max(...points.map(p=>p[2])),height,'STEP height must match quote.json');assert.equal(Math.max(...points.map(p=>p[0])),60,'STEP must exclude rolled-back geometry');assert.equal(JSON.stringify(doc),before);}finally{URL.createObjectURL=create;if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document');}
});

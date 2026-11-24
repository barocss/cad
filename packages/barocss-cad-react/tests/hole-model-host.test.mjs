/** Existing Model reader plus controlled engine/sink. No native/GPU execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './compile.mjs';
const model=depth=>({kind:'part',units:'mm',children:[{kind:'hole',key:'bore',center:[30,20],radius:4,depth,children:[{kind:'extrude',distance:20,children:[{kind:'rectangle',min:[0,0],max:[60,40]}]}]}]});
function client(){const requests=[];return{requests,evaluate(doc,revision){return new Promise(resolve=>requests.push({doc,revision,resolve}));},restart(){return true;},dispose(){},onFailure(){return()=>{};},onMasses(){return()=>{};}};}
const reply=revision=>({ok:true,revision,wallTime:0,bodies:[{key:'b1',volume:1,mass:1,mesh:{positions:new Float64Array([0,0,0]),normals:new Float32Array([0,0,1]),indices:new Uint32Array(),bounds:{min:[0,0,0],max:[1,1,1]}}}]});
async function settled(predicate){for(let i=0;i<30;i++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('controlled Hole host did not settle');}
test('invalid Hole retires an in-flight owner and recovery submits a current declaration to the sink',async t=>{
 const {ModelHost,CompositionCompiler}=await loadSource(t,'tests/model-host-entry.ts'),engine=client(),shown=[];
 const host=new ModelHost({engine,ownership:'borrowed',sink:{show:async(bodies,owner,current)=>{assert.equal(current(),true);shown.push(owner);},snapshot:()=>({}),dispose(){}},ownsSink:false,massPolicy:{merge:b=>b}});
 t.after(()=>host.dispose());host.connect();const compiler=new CompositionCompiler(),first=compiler.compile(model(6));assert.equal(first.ok,true);
 host.dirty();host.complete(first.value);assert.equal(engine.requests.length,1);assert.equal(engine.requests[0].doc.nodes.at(-1).kind,'hole');
 host.dirty();const invalid=model(6);invalid.children[0].depth=NaN;const rejected=compiler.compile(invalid);assert.equal(rejected.ok,false);assert.equal(rejected.previous,first.value);host.invalid(rejected.error);
 assert.equal(host.read().status,'failed');assert.equal(host.read().native,null);engine.requests[0].resolve(reply(engine.requests[0].revision));await settled(()=>host.read().ignored>0);assert.equal(shown.length,0);
 const recovered=compiler.compile(model(10));assert.equal(recovered.ok,true);host.dirty();host.complete(recovered.value);assert.equal(engine.requests.length,2);assert.equal(engine.requests[1].doc.nodes.at(-1).depth,10);
 engine.requests[1].resolve(reply(engine.requests[1].revision));await settled(()=>host.read().status==='ready');assert.equal(shown.length,1);assert.equal(host.read().nativeOwner,host.read().renderedOwner);assert.equal(host.read().currentDocument.nodes.at(-1).depth,10);
 host.dirty();host.complete(recovered.value);assert.equal(engine.requests.length,2);
 host.dirty();host.complete(compiler.compile(model(6)).value);assert.equal(engine.requests.length,3);engine.requests[2].resolve(reply(engine.requests[2].revision));await settled(()=>host.read().status==='ready');assert.deepEqual(host.read().currentDocument.nodes,engine.requests[0].doc.nodes);
});

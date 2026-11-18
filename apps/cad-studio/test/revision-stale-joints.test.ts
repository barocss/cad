import test from 'node:test';
import assert from 'node:assert/strict';
import {revisionJointFixture} from './fixtures/revision-stale-joints';
import {offerRevision,acceptRevision} from '@barocss/cad-model/assembly/definitions';
import {jointsOfInstance,setInstanceJoints} from '@barocss/cad-model/assembly/flexible';
test('normal revision retains stale pose explicitly resettable without changing new definition',()=>{
 const {doc,incoming}=revisionJointFixture(),before=structuredClone(doc),offered=offerRevision(doc,'door-def',incoming,'plate.bcad');
 assert.ok('doc' in offered);const accepted=acceptRevision(offered.doc,'door-def'),inst=accepted.instances![0];
 assert.deepEqual(doc,before);assert.deepEqual(inst.joints,doc.instances![0].joints);assert.equal(inst.doc.instances,undefined);
 assert.match(jointsOfInstance(inst).problem!,/not a sub-assembly/);
 const reset=setInstanceJoints(accepted,{part:'door',joints:{},replace:true}).doc;
 assert.equal(reset.instances![0].joints,undefined);assert.equal(reset.instances![0].doc,inst.doc);assert.deepEqual(reset.instances![0].position,inst.position);assert.deepEqual(reset.instances![0].rotation,inst.rotation);
 console.log(JSON.stringify({retained:inst.joints,problem:jointsOfInstance(inst).problem,reset:reset.instances![0].joints??null}));
});

import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server.edge';
import {InstanceInspector} from '../src/ui/InstanceInspector';
import type {StudioDoc} from '@barocss/cad-model/engine/doc';
const html=(doc:StudioDoc)=>renderToStaticMarkup(createElement(InstanceInspector,{
 model:{doc,selectedId:'door',entry:undefined},
 bearing:{selected:null,blocked:false,pending:false,close(){},async apply(){}},
 assembly:{ground:()=>null,without:()=>[]},
 changes:{commitInstances:()=>true,commitParts:()=>true,commitAssembly:()=>true,patternEdit:()=>undefined,startInPlace(){},clearSelection(){}},onNotice(){}
}));
test('actual Inspector composition retains stale-value Reset, without adding controls to ordinary parts',()=>{
 const {doc,incoming}=revisionJointFixture(),offered=offerRevision(doc,'door-def',incoming,'plate.bcad');assert.ok('doc' in offered);
 const accepted=acceptRevision(offered.doc,'door-def'),shown=html(accepted);
 assert.match(shown,/aria-label="Instance joints"/);assert.match(shown,/not a sub-assembly/);assert.match(shown,/>Reset</);
 const reset=setInstanceJoints(accepted,{part:'door',joints:{},replace:true}).doc;
 assert.doesNotMatch(html(reset),/aria-label="Instance joints"/);assert.match(html(doc),/Joint base~lid/);
 const pattern={...accepted,instances:accepted.instances!.map(i=>({...i,pattern:{id:'pat1',k:1}}))};
 assert.doesNotMatch(html(pattern),/aria-label="Instance joints"/);
});

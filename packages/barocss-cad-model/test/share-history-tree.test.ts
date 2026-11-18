import test from 'node:test';
import assert from 'node:assert/strict';
import {rectanglePart,type StudioDoc} from '../src/engine/doc';
import {stripHistory} from '../src/chat/proposals';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
const marked=(label:string):StudioDoc=>({...rectanglePart(10,10,5),history:[{id:'h1',at:'2026-11-18',kind:'prompt',by:{agent:'test'},prompt:`SYNTHETIC_PRIVATE_${label}`}],proposals:[{id:'P1',title:'Keep this design proposal',status:'rejected',by:{agent:'test'},at:'2026-11-18',prompt:`SYNTHETIC_PRIVATE_${label}_prompt`,plan:`SYNTHETIC_PRIVATE_${label}_plan`,base:'0',ops:[],summary:'Keep public summary',risk:{level:'low',features_touched:0,references_broken:0,hard_requirements_changed:[],approval:[]}}]});
const placed=(id:string,doc:StudioDoc)=>({id,name:id,doc,position:[20,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number]});
test('shared assembly strips histories and proposal input from nested and pending documents',async()=>{
 const leaf=marked('leaf'),sub={...marked('sub'),instances:[placed('leaf',leaf)]},doc={...marked('root'),instances:[placed('sub',sub),placed('shared-leaf',leaf)],pendingParts:{incoming:{name:'Incoming',rev:'B',doc:marked('pending')}}};
 const before=structuredClone(doc),shared=stripHistory(doc),opened=await readStudioFile(encodeStudioFile(shared));assert.ok('doc'in opened);assert.deepEqual(doc,before);
 assert.ok(!JSON.stringify(opened.doc).includes('SYNTHETIC_PRIVATE'),'share copy must not retain nested history/prompts/plans');
 assert.equal(opened.doc.instances!.length,2);assert.deepEqual(opened.doc.nodes,doc.nodes);assert.equal(opened.doc.pendingParts!.incoming.rev,'B');assert.equal(opened.doc.instances![0].doc.proposals![0].summary,'Keep public summary');
});

test('cleaning preserves shared definitions and is defensive against document cycles',()=>{
 const leaf=marked('shared'),root:StudioDoc={...marked('root'),instances:[placed('one',leaf),placed('two',leaf)]};
 root.pendingParts={root:{name:'Self',rev:'B',doc:root},leaf:{name:'Same leaf',rev:'C',doc:leaf}};
 const shared=stripHistory(root);assert.notEqual(shared,root);assert.equal(shared.pendingParts!.root.doc,shared);
 assert.equal(shared.instances![0].doc,shared.instances![1].doc);assert.equal(shared.pendingParts!.leaf.doc,shared.instances![0].doc);
 assert.equal(shared.history,undefined);assert.equal(shared.instances![0].doc.history,undefined);
 assert.equal(root.pendingParts.root.doc,root);assert.ok(root.history&&leaf.history);assert.notEqual(shared.instances,root.instances);
});

test('sharing changes only the explicit history and proposal input fields',()=>{
 const source=marked('only'),before=structuredClone(source),shared=stripHistory(source);
 const expected=structuredClone(source);delete expected.history;delete expected.proposals![0].prompt;delete expected.proposals![0].plan;
 assert.deepEqual(shared,expected);assert.deepEqual(source,before);
 const plain=rectanglePart(2,3,4);assert.deepEqual(stripHistory(plain),plain);assert.equal(stripHistory(plain).instances,undefined);
 const empty={...plain,instances:[],pendingParts:{},proposals:[]};assert.deepEqual(stripHistory(empty),empty);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,withNode,type FrameSectionRow,type StudioDoc} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {resolveShopTree} from '../src/engine/shopRows';
import {editSections,sectionUses} from '../src/frames/sections';
const row:FrameSectionRow={id:'R40',section:{kind:'rect-tube',width:40,height:40,wall:3,outerRadius:0},source:'Supplied test row'};
const child=()=>withNode(emptyDoc(),{kind:'frame-member',section:{kind:'library',id:'R40'},start:[0,0,0],end:[0,0,300],up:[0,1,0]});
const fixture=():StudioDoc=>({...emptyDoc(),frames:{version:1,sections:[row]},instances:[{id:'p1',name:'RHS member',doc:child(),position:[0,0,0],rotation:[0,0,0]}]});
test('inherited section deletion cannot invalidate a placed frame member',()=>{
 const doc=fixture(),before=JSON.stringify(doc),evaluated=evaluateDoc(resolveShopTree(doc).instances![0].doc,1);assert.ok(evaluated.ok);assert.ok(Math.abs(evaluated.bodies[0].volume!-133200)<1e-6);assert.equal(sectionUses(doc).size,0,'local UI use enumeration remains local');
 const removed=editSections(doc,[],['R40']);
 assert.equal(JSON.stringify(doc),before);assert.ok('error' in removed);
});
test('same-ID local override survives parent removal; normal replacement reevaluates geometry',()=>{
 const root=fixture(),leaf=root.instances![0],local={...leaf.doc,frames:{version:1 as const,sections:[row]}};const independent={...root,instances:[{...leaf,doc:local}]};
 const removed=editSections(independent,[],['R40']);assert.ok('doc' in removed);if('doc' in removed){const r=evaluateDoc(resolveShopTree(removed.doc).instances![0].doc,1);assert.ok(r.ok);assert.ok(Math.abs(r.bodies[0].volume!-133200)<1e-6);}
 const changed=editSections(root,[{...row,section:{kind:'rect-tube',width:50,height:30,wall:4,outerRadius:0}}]);assert.ok('doc' in changed);if('doc' in changed){const r=evaluateDoc(resolveShopTree(changed.doc).instances![0].doc,1);assert.ok(r.ok);assert.ok(Math.abs(r.bodies[0].volume!-172800)<1e-6);}
});
test('nested, unrelated local rows, hidden and suppressed members remain protected',()=>{
 const root=fixture(),leaf=root.instances![0],nested={...emptyDoc(),instances:[leaf]};
 assert.ok('error' in editSections({...root,instances:[{...leaf,doc:nested}]},[],['R40']));
 assert.ok('error' in editSections({...root,instances:[{...leaf,hidden:true}]},[],['R40']));
 const suppressed={...leaf.doc,nodes:leaf.doc.nodes.map(n=>({...n,suppressed:true as const}))};assert.ok('error' in editSections({...root,instances:[{...leaf,doc:suppressed}]},[],['R40']));
 const unrelated={...leaf.doc,frames:{version:1 as const,sections:[{...row,id:'other'}]}};assert.ok('error' in editSections({...root,instances:[{...leaf,doc:unrelated}]},[],['R40']));
 const local={...leaf.doc,frames:{version:1 as const,sections:[row]}};assert.ok('error' in editSections({...root,instances:[{...leaf,id:'local',doc:local},leaf,{...leaf,id:'copy'}]},[],['R40']));
});
test('unused deletion, replacement and sectionUses local labels stay compatible',()=>{
 const root=fixture(),extra={...root,frames:{version:1 as const,sections:[row,{...row,id:'unused'}]}},before=JSON.stringify(extra);
 const removed=editSections(extra,[],['unused']);assert.ok('doc' in removed);if('doc' in removed)assert.deepEqual(removed.removed,['unused']);assert.equal(JSON.stringify(extra),before);
 const replaced=editSections(root,[row]);assert.ok('doc' in replaced);if('doc' in replaced){assert.deepEqual(replaced.replaced,['R40']);assert.deepEqual(replaced.removed,[]);assert.ok(evaluateDoc(resolveShopTree(replaced.doc).instances![0].doc,1).ok);}
 const local={...child(),frames:{version:1 as const,sections:[row]}};assert.match(sectionUses(local).get('R40')![0],/^feature 0 /);assert.ok('error' in editSections(local,[],['R40']));
});
test('inherited frame default and per-segment override sections remain protected',()=>{
 const root=fixture(),leaf=root.instances![0],frame=withNode(emptyDoc(),{kind:'frame',points:[[0,0,0],[300,0,0]],segments:[[0,1]],section:{kind:'library',id:'R40'}});
 assert.ok('error' in editSections({...root,instances:[{...leaf,doc:frame}]},[],['R40']));
 const override=withNode(emptyDoc(),{kind:'frame',points:[[0,0,0],[300,0,0]],segments:[[0,1]],section:row.section,overrides:[{member:0,section:{kind:'library',id:'R40'}}]});
 const doc={...root,instances:[{...leaf,doc:override}]};assert.ok(evaluateDoc(resolveShopTree(doc).instances![0].doc,1).ok);assert.ok('error' in editSections(doc,[],['R40']));
});

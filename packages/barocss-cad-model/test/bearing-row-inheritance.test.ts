import test from 'node:test';
import assert from 'node:assert/strict';
import {commands,type Ctx} from '../src/app/commands';
import {emptyDoc,withNode,type StudioDoc,type PartInstance} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {resolveShopTree} from '../src/engine/shopRows';
import {editBearingRows} from '../src/engine/bearings';
const row={id:'6204',bore:20,outside:47,width:14,chamfer:1,daMin:25,daMax:26.5,raMax:1,source:'Supplied test row'};
const instance=(id:string,doc:StudioDoc):PartInstance=>({id,name:id,doc,position:[0,0,0],rotation:[0,0,0]});
const child=()=>{const c=commands.find(c=>c.id==='shaft')!,ctx:Ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};return withNode(c.build!(ctx,{...c.defaults!(ctx),ks:0,gs:0,r:0}),{kind:'bearing',row:'6204',shaft:0,step:1,against:'end'});};
const fixture=():StudioDoc=>({...emptyDoc(),bearings:{version:1,rows:[row]},instances:[instance('p1',child())]});
test('root bearing rows used by inherited child bearings cannot be removed',()=>{const doc=fixture(),before=JSON.stringify(doc);assert.ok(evaluateDoc(resolveShopTree(doc).instances![0].doc,1).ok);const removed=editBearingRows(doc,[],['6204']);assert.equal(JSON.stringify(doc),before);assert.ok('error' in removed);});
test('a nested descendant inherits the nearest ancestor row; local override cuts the dependency',()=>{
 const root=fixture(),leaf=root.instances![0];const branch:StudioDoc={...emptyDoc(),instances:[leaf]};const nested={...root,instances:[instance('sub',branch)]};
 assert.ok('error' in editBearingRows(nested,[],['6204']));
 const local={...branch,bearings:{version:1 as const,rows:[{...row,source:'Local supplied row'}]}};
 const independent={...root,instances:[instance('sub',local)]};const removed=editBearingRows(independent,[],['6204']);assert.ok('doc' in removed);
 if('doc' in removed){const effective=resolveShopTree(removed.doc).instances![0].doc.instances![0].doc;assert.ok(evaluateDoc(effective,1).ok);assert.equal(effective.bearings!.rows[0].source,'Local supplied row');}
 assert.ok('error' in editBearingRows(local,[],['6204']),'the local row itself remains used by its descendant');
});
test('unrelated local rows do not mask inheritance; hidden and suppressed authored uses remain protected',()=>{
 const root=fixture(),leaf=root.instances![0];const own={...leaf.doc,bearings:{version:1 as const,rows:[{...row,id:'other'}]}};
 assert.ok('error' in editBearingRows({...root,instances:[{...leaf,doc:own}]},[],['6204']));
 assert.ok('error' in editBearingRows({...root,instances:[{...leaf,hidden:true}]},[],['6204']));
 const suppressed={...leaf.doc,nodes:leaf.doc.nodes.map(n=>n.kind==='bearing'?{...n,suppressed:true as const}:n)};
 assert.ok('error' in editBearingRows({...root,instances:[{...leaf,doc:suppressed}]},[],['6204']));
});
test('unused deletion and compatible row replacement retain their existing behavior and input data',()=>{
 const root=fixture(),extra={...root,bearings:{version:1 as const,rows:[row,{...row,id:'unused'}]}},before=JSON.stringify(extra);
 const removed=editBearingRows(extra,[],['unused']);assert.ok('doc' in removed);if('doc' in removed)assert.deepEqual(removed.doc.bearings!.rows,[row]);
 const replaced=editBearingRows(root,[{...row,source:'New supplied source'}]);assert.ok('doc' in replaced);if('doc' in replaced)assert.ok(evaluateDoc(resolveShopTree(replaced.doc).instances![0].doc,1).ok);
 assert.equal(JSON.stringify(extra),before);
 const plain={...emptyDoc(),bearings:{version:1 as const,rows:[row]}};assert.ok('doc' in editBearingRows(plain,[],['6204']));
});
test('shared definitions and a locally overridden sibling do not hide a dependent branch',()=>{
 const root=fixture(),leaf=root.instances![0],local={...leaf.doc,bearings:{version:1 as const,rows:[row]}};
 const doc={...root,instances:[instance('local',local),leaf,instance('copy',leaf.doc)]};const before=JSON.stringify(doc);
 const result=editBearingRows(doc,[],['6204']);assert.ok('error' in result);assert.equal(JSON.stringify(doc),before);
});

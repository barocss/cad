import test from 'node:test';
import assert from 'node:assert/strict';
import {commands,type Ctx} from '../src/app/commands';
import {emptyDoc,type StudioDoc,type PartInstance} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {resolveShopTree} from '../src/engine/shopRows';
import {editORingRows} from '../src/engine/orings';
const row={id:'214',dash:'2-214',insideDiameter:24.99,crossSection:3.53,source:'Supplied test row'};
const instance=(id:string,doc:StudioDoc):PartInstance=>({id,name:id,doc,position:[0,0,0],rotation:[0,0,0]});
function child():StudioDoc {
 const blank:Ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}},c=commands.find(c=>c.id==='cylinder')!;
 const doc={...c.build!(blank,{...c.defaults!(blank),r:15.5,h:20,x:0,y:0,z:0}),orings:{version:1 as const,rows:[row]}};
 const r=evaluateDoc(doc,1);assert.ok(r.ok);const body=r.bodies.findIndex(b=>b.mesh.faces.some(f=>f.name==='n1.side0'));
 const ctx:Ctx={doc,bodies:r.bodies,selection:{faces:[{body,face:r.bodies[body].mesh.faces.findIndex(f=>f.name==='n1.side0')}],edges:[],bodies:[]}},g=commands.find(c=>c.id==='oring-gland')!;
 const made=g.build!(ctx,{...g.defaults!(ctx),seal:31.1,dg:25.5,w:4.7,at:6});return {...made,orings:undefined};
}
const fixture=():StudioDoc=>({...emptyDoc(),orings:{version:1,rows:[row]},instances:[instance('p1',child())]});
test('inherited O-ring row removal cannot invalidate a placed gland',()=>{
 const doc=fixture(),before=JSON.stringify(doc);assert.ok(evaluateDoc(resolveShopTree(doc).instances![0].doc,1).ok);
 const removed=editORingRows(doc,[],['214']);
 assert.equal(JSON.stringify(doc),before);assert.ok('error' in removed,'inherited row in use must stay');
});
test('nearest local override remains independent while unrelated rows do not hide inherited use',()=>{
 const root=fixture(),leaf=root.instances![0],branch:StudioDoc={...emptyDoc(),instances:[leaf]},local={...branch,orings:{version:1 as const,rows:[{...row,source:'Local supplied row'}]}};
 const independent={...root,instances:[instance('sub',local)]},before=JSON.stringify(independent),removed=editORingRows(independent,[],['214']);assert.ok('doc' in removed);assert.equal(JSON.stringify(independent),before);
 if('doc' in removed){const d=resolveShopTree(removed.doc).instances![0].doc.instances![0].doc;assert.equal(d.orings!.rows[0].source,'Local supplied row');assert.ok(evaluateDoc(d,1).ok);}
 const unrelated={...leaf.doc,orings:{version:1 as const,rows:[{...row,id:'other'}]}};
 assert.ok('error' in editORingRows({...root,instances:[instance('p1',unrelated)]},[],['214']));
 assert.ok('error' in editORingRows({...root,instances:[instance('sub',branch)]},[],['214']));
 assert.ok('error' in editORingRows(local,[],['214']));
});
test('unused deletion and valid replacement preserve data and evaluability',()=>{
 const root=fixture(),doc={...root,orings:{version:1 as const,rows:[row,{...row,id:'unused'}]}},before=JSON.stringify(doc);
 const removed=editORingRows(doc,[],['unused']);assert.ok('doc' in removed);if('doc' in removed)assert.deepEqual(removed.doc.orings!.rows,[row]);
 const replaced=editORingRows(root,[{...row,source:'Updated source'}]);assert.ok('doc' in replaced);if('doc' in replaced)assert.ok(evaluateDoc(resolveShopTree(replaced.doc).instances![0].doc,1).ok);
 assert.equal(JSON.stringify(doc),before);assert.ok('doc' in editORingRows({...emptyDoc(),orings:{version:1,rows:[row]}},[],['214']));
});
test('hidden, suppressed and shared child definitions retain authored row dependencies',()=>{
 const root=fixture(),leaf=root.instances![0],local={...leaf.doc,orings:{version:1 as const,rows:[row]}};
 assert.ok('error' in editORingRows({...root,instances:[{...leaf,hidden:true}]},[],['214']));
 const suppressed={...leaf.doc,nodes:leaf.doc.nodes.map(n=>n.kind==='oring-gland'?{...n,suppressed:true as const}:n)};
 assert.ok('error' in editORingRows({...root,instances:[instance('p1',suppressed)]},[],['214']));
 assert.ok('error' in editORingRows({...root,instances:[instance('local',local),leaf,instance('copy',leaf.doc)]},[],['214']));
});

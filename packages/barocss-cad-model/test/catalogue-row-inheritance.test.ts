import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueFixture,specs} from './fixtures/inherited-catalogue';
import {evaluateDoc} from '../src/engine/evaluate';
import {emptyDoc} from '../src/engine/doc';
import {resolveShopTree} from '../src/engine/shopRows';
for(const s of specs){
 test(`${s.kind}: inherited removal cannot invalidate the placed feature`,()=>{
  const doc=catalogueFixture(s.kind),before=JSON.stringify(doc);assert.ok(evaluateDoc(resolveShopTree(doc).instances![0].doc,1).ok);
  const removed=s.edit(doc,[],[s.id]);
  assert.equal(JSON.stringify(doc),before);assert.ok('error' in removed);
 });
 test(`${s.kind}: local row owns its branch and keeps effective geometry after parent removal`,()=>{
  const root=catalogueFixture(s.kind),leaf=root.instances![0],local={...leaf.doc,[s.kind]:{version:1,rows:[s.row]}};
  const independent={...root,instances:[{...leaf,doc:local}]},before=JSON.stringify(independent),removed=s.edit(independent,[],[s.id]);assert.ok('doc' in removed);assert.equal(JSON.stringify(independent),before);
  if('doc' in removed)assert.ok(evaluateDoc(resolveShopTree(removed.doc).instances![0].doc,1).ok);
 });
}

for(const s of specs){
 test(`${s.kind}: nested, hidden, suppressed and shared dependencies are protected`,()=>{
  const root=catalogueFixture(s.kind),leaf=root.instances![0],nested={...emptyDoc(),instances:[leaf]};
  assert.ok('error' in s.edit({...root,instances:[{...leaf,doc:nested}]},[],[s.id]));
  assert.ok('error' in s.edit({...root,instances:[{...leaf,hidden:true}]},[],[s.id]));
  const suppressed={...leaf.doc,nodes:leaf.doc.nodes.map(n=>({...n,suppressed:true as const}))};
  assert.ok('error' in s.edit({...root,instances:[{...leaf,doc:suppressed}]},[],[s.id]));
  const local={...leaf.doc,[s.kind]:{version:1,rows:[s.row]}};
  assert.ok('error' in s.edit({...root,instances:[{...leaf,id:'local',doc:local},leaf,{...leaf,id:'copy'}]},[],[s.id]));
  const unrelated={...leaf.doc,[s.kind]:{version:1,rows:[{...s.row,id:'other'}]}};
  assert.ok('error' in s.edit({...root,instances:[{...leaf,doc:unrelated}]},[],[s.id]));
 });
 test(`${s.kind}: nearest override protects only its own descendants; unused and valid replacement still work`,()=>{
  const root=catalogueFixture(s.kind),leaf=root.instances![0],branch={...emptyDoc(),[s.kind]:{version:1,rows:[s.row]},instances:[leaf]},independent={...root,instances:[{...leaf,doc:branch}]};
  const removed=s.edit(independent,[],[s.id]);assert.ok('doc' in removed);if('doc' in removed)assert.ok(evaluateDoc(resolveShopTree(removed.doc).instances![0].doc.instances![0].doc,1).ok);
  assert.ok('error' in s.edit(branch,[],[s.id]));
  const extra=s.edit(root,[{...s.row,id:'unused'}]);assert.ok('doc' in extra);if('doc' in extra){const before=JSON.stringify(extra.doc);assert.ok('doc' in s.edit(extra.doc,[],['unused']));assert.equal(JSON.stringify(extra.doc),before);}
  const replaced=s.edit(root,[s.row]);assert.ok('doc' in replaced);if('doc' in replaced)assert.ok(evaluateDoc(resolveShopTree(replaced.doc).instances![0].doc,1).ok);
  assert.ok('doc' in s.edit({...emptyDoc(),[s.kind]:{version:1,rows:[s.row]}},[],[s.id]));
 });
}

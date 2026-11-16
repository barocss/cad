import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,withNode} from '../src/engine/doc';
import {commands,type Ctx} from '../src/app/commands';
import {evaluateDoc} from '../src/engine/evaluate';
test('Keyway notes distinguish surviving floor from a cut through the outer wall',()=>{
 for(const radius of [20,12]) for(const angle of [0,90]){
  const c=commands.find(c=>c.id==='tube')!,ctx:Ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
  const d=c.build!(ctx,{...c.defaults!(ctx),r:radius,ri:10,h:22}),i=d.nodes.length;
  const doc=withNode(d,{kind:'keyway',parent:{node:i-1,side:'solid'},face:`n${i-1}.hole0.side0`,width:6,depth:3.4,angle});
  const r=evaluateDoc(doc,1);assert.ok(r.ok,r.ok?'':r.error.detail);
  const note=r.bodies[0].notes?.find(n=>n.text.startsWith('Keyway '))?.text;assert.ok(note);
  if(radius===12){assert.match(note,/open slot, no floor \(requested depth 3.4\)/);assert.doesNotMatch(note,/its floor/);}else assert.match(note,/its floor 13.4 from the axis/);
 }
});

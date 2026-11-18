import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {emptyDoc,withNode,type StudioDoc} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {weldList} from '../src/frames/welds';
import {addPart} from '../src/assembly/edit';
import {bomViewOf,deriveBom} from '../src/bom/core';
const evaluate=(d:StudioDoc)=>evaluateDoc(d,1);
function fixture(){
 const scene=JSON.parse(readFileSync(resolve(import.meta.dirname,'../../barocss-cad/conformance/frk/bead-tee-wide-post.json'),'utf8'));
 let doc=emptyDoc();for(const f of scene.input.partDocument.features)if(f.kind==='frame'){const {id:_id,...rest}=f;void _id;doc=withNode(doc,rest);}
 const initial=evaluate(doc);assert.ok(initial.ok);const joint=weldList(doc,initial.bodies).joints.find(j=>j.kind==='butt')!;assert.ok(joint);
 const welded=(size:number):StudioDoc=>({...doc,frames:{version:1,welds:[{joint:joint.id,size}]}});
 return [welded(2),welded(3)];
}
test('different modeled weld sizes do not group as identical placed parts',()=>{
 const [small,large]=fixture();assert.deepEqual(small.nodes,large.nodes);
 const a=evaluate(small),b=evaluate(large);assert.ok(a.ok&&b.ok);if(!a.ok||!b.ok)return;
 const va=a.bodies.find(x=>x.element?.kind==='weld-bead')!.volume!,vb=b.bodies.find(x=>x.element?.kind==='weld-bead')!.volume!;
 assert.notEqual(va,vb);assert.equal(vb,756);assert.deepEqual(a.bodies.map(x=>x.key),b.bodies.map(x=>x.key));
 const assembly=addPart(addPart(emptyDoc(),{name:'Small weld',doc:small}).doc,{name:'Large weld',doc:large,position:[200,0,0]}).doc,before=structuredClone(assembly);
 const view=bomViewOf(assembly,evaluate),bom=deriveBom(view);console.log('WELD_BOM',JSON.stringify({volumes:[va,vb],masses:view.parts.map(p=>p.mass),lines:bom.lines,shapeSame:view.parts[0].shape===view.parts[1].shape}));
 assert.deepEqual(assembly,before);assert.equal(bom.lines.length,2,'different modeled weld geometry needs separate part lines');
});

test('weld notes and symbol flags do not split identical modeled parts', () => {
 const [small] = fixture(), changed = structuredClone(small);
 changed.frames!.welds![0].notes = 'Inspect after welding';
 changed.frames!.welds![0].allRound = true;
 const doc = addPart(addPart(emptyDoc(), {name:'Original',doc:small}).doc, {name:'Annotated',doc:changed}).doc;
 const before = structuredClone(doc), bom = deriveBom(bomViewOf(doc,evaluate));
 assert.equal(bom.lines.length,1); assert.equal(bom.lines[0].qty,2); assert.deepEqual(doc,before);
});

test('nonmodeled, orphan and suppressed weld records do not split parts', () => {
 const [small, large] = fixture();
 for (const mode of ['no-size','butt','orphan','suppressed'] as const) {
  const a=structuredClone(small),b=structuredClone(large);
  for(const d of [a,b]) {
   const r=d.frames!.welds![0];
   if(mode==='no-size') delete r.size;
   if(mode==='butt') r.kind='butt';
   if(mode==='orphan') r.joint='missing.start';
   if(mode==='suppressed') d.nodes[0].suppressed=true;
  }
  const doc=addPart(addPart(emptyDoc(),{name:'A',doc:a}).doc,{name:'B',doc:b}).doc;
  const before=structuredClone(doc),bom=deriveBom(bomViewOf(doc,evaluate));
  assert.equal(bom.lines.length,1,mode);assert.equal(bom.lines[0].qty,2);assert.deepEqual(doc,before);
 }
});

test('weld geometry propagates through nested grouping while equal beads still merge', () => {
 const [small,large]=fixture();
 const sub=(doc:StudioDoc)=>addPart(emptyDoc(),{name:'Frame',doc}).doc;
 let doc=emptyDoc();
 for(const part of [sub(small),sub(large),sub(small)])doc=addPart(doc,{name:'Sub',doc:part}).doc;
 const before=structuredClone(doc),bom=deriveBom(bomViewOf(doc,evaluate));
 const top=bom.lines.filter(l=>l.assembly),nested=bom.lines.filter(l=>l.level===1);
 assert.deepEqual(top.map(l=>l.qty),[2,1]);assert.deepEqual(nested.map(l=>l.qty),[2,1]);
 assert.deepEqual(doc,before);
});

test('kernel-refused beads preserve grouping and incomplete accounting', () => {
 const scene=JSON.parse(readFileSync(resolve(import.meta.dirname,'../../barocss-cad/conformance/frk/refuse-bead-mitre.json'),'utf8'));
 let part=emptyDoc();
 for(const f of scene.input.partDocument.features)if(f.kind==='frame'){const {id:_id,...rest}=f;void _id;part=withNode(part,rest);}
 const initial=evaluate(part);assert.ok(initial.ok);
 const joint=weldList(part,initial.bodies).joints.find(j=>j.kind==='mitre')!;assert.ok(joint);
 let doc=emptyDoc();
 for(const size of [2,3])doc=addPart(doc,{name:`Refused ${size}`,doc:{...part,frames:{version:1,welds:[{joint:joint.id,kind:'fillet',size}]}}}).doc;
 const before=structuredClone(doc),view=bomViewOf(doc,evaluate),bom=deriveBom(view);
 assert.equal(bom.lines.length,1);assert.equal(bom.lines[0].qty,2);
 assert.equal(bom.beadAccounting?.complete,false);assert.deepEqual(doc,before);
});

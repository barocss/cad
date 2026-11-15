import { boxCage } from '../src/app/primitives';
import { emptyDoc, type StudioDoc, type PartInstance } from '../src/engine/doc';
import { evaluateDoc, exportStudioStep } from '../src/engine/evaluate';
import test from 'node:test';
import assert from 'node:assert/strict';
import { requireStepGeometry } from '../src/engine/stepOutputAdmission';
// Controlled output admission only: does not claim the evaluator creates these invalid outputs.
const shape = (bodies: number, faces: number) => ({ bodies: Array.from({length:bodies},()=>({kind:'solid'})), faces:Array.from({length:faces},()=>({surface:{kind:'plane'}})) });
test('STEP refuses empty-only and mixed included outputs before writer, without changing inputs', () => {
  for (const bad of [shape(0,0),shape(1,0),shape(0,1)]) for (const mixed of [false,true]) {
    const inputs=mixed?[shape(1,1),bad]:[bad], before=JSON.stringify(inputs); let writerCalled=false;
    assert.throws(()=>{ inputs.forEach((b,k)=>requireStepGeometry(b,`Placed / Body (${k})`)); writerCalled=true; }, /\[NO_BODY\].*Placed.*whole STEP export/);
    assert.equal(writerCalled,false); assert.equal(JSON.stringify(inputs),before);
  }
});
test('STEP recovery hint names Scale only when caller has resolved its origin', () => {
  assert.throws(()=>requireStepGeometry(shape(0,0),'Scaled (b7)',true), /History → Scale.*Factor/);
  assert.throws(()=>requireStepGeometry(shape(0,0),'Imported (custom)'), e=>e instanceof Error && !/History|Factor/.test(e.message));
});
test('nonempty solids and multipart outputs remain admissible without volume tests', () => {
  for(const b of [shape(1,1),shape(2,12)]) assert.doesNotThrow(()=>requireStepGeometry(b,'valid'));
});


test('exact sheets, including mixed solid/sheet BRep, refuse while facet route remains available', () => {
  const exact = shape(1,1); exact.bodies[0].kind='sheet';
  assert.throws(()=>requireStepGeometry(exact,'Open'), /exact surface.*does not support/);
  const mixed={...exact,bodies:[{kind:'solid'},{kind:'sheet'}]};
  assert.throws(()=>requireStepGeometry(mixed,'Mixed'), /no surface was silently omitted/);
  for (const faces of [[{surface:{kind:'facets'}}],[{surface:{kind:'plane'}},{surface:{kind:'facets'}}]])
    assert.doesNotThrow(()=>requireStepGeometry({...mixed,faces},'AP242'));
});


test('actual evaluated open SubD plus closed body cannot silently export a partial STEP', () => {
  const cage=boxCage(30,20,16,2,[0,0,0]);
  const open: StudioDoc={...emptyDoc(),nodes:[{id:'n0',kind:'subd',name:'Open cage',cage:{...cage,faces:cage.faces.slice(1)}}]};
  const closed: StudioDoc={...emptyDoc(),nodes:[{id:'n0',kind:'subd',name:'Closed cage',cage}]};
  const box: StudioDoc={...emptyDoc(),nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[50,0],max:[60,10]},{id:'n1',kind:'extrude',sketch:0,height:10}]};
  const placed=(doc:StudioDoc, hidden=false):PartInstance=>({id:'placed',name:'Placed cage',doc,hidden,position:[0,0,0],rotation:[0,0,0]});
  for(const hidden of [false,true]) {
    const root: StudioDoc={...box,nodes:[...box.nodes,{...open.nodes[0],id:'n2'}],bodies:{b2:{name:'Open root',hidden}}};
    const before=JSON.stringify(root), result=evaluateDoc(root,1); assert.ok(result.ok); assert.equal(result.bodies.length,2);
    assert.throws(()=>exportStudioStep(root,{name:'mixed'}), /Open root.*exact surface/); assert.equal(JSON.stringify(root),before);
  }
  const occurrence={...box,instances:[placed(open)]}; const result=evaluateDoc(open,2); assert.ok(result.ok);
  assert.throws(()=>exportStudioStep(occurrence,{name:'placed'}), /Placed cage.*exact surface/);
  const hidden=exportStudioStep({...box,instances:[placed(open,true)]},{name:'hidden'}); assert.equal(hidden.scope.nativeBodies,1);
  const repaired=exportStudioStep({...box,instances:[placed(closed)]},{name:'repaired'});
  assert.equal(repaired.scope.nativeBodies,2); assert.equal((repaired.text.match(/=MANIFOLD_SOLID_BREP\(/g)??[]).length,2);
});

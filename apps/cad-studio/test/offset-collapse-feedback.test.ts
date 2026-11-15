import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { offsetFaceCommand } from '@barocss/cad-model/app/profileCommands';
import { offsetCollapseFailure, offsetCollapseFeedback } from '../src/app/offsetCollapseFeedback';
import type { Active } from '../src/app/commandState';
function add(doc: StudioDoc, d: number) {
  const result = evaluateDoc(doc, 1); assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.find(f => f.name === 'n1.top')!;
  return offsetFaceCommand.build!({ doc, bodies: result.bodies, selection: { faces: [{ body: 0, face: face.index }], edges: [], bodies: [] } }, { d });
}
function seed(w: number, h: number, height: number, draft: number) {
  return withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0,0], max: [w,h] }), { kind: 'extrude', sketch: 0, height, draft });
}
function change(doc: StudioDoc, index: number, d: number) { return { ...doc, nodes: doc.nodes.map((n,i) => i === index && n.kind === 'offset-face' && !n.target ? {...n,distance:d} : n) }; }
test('real native cap refusal owns original basis and in-place recovery', () => {
  const accepted=add(seed(40,30,10,10),3), snapshot=structuredClone(accepted), candidate=change(accepted,2,-10);
  const result=evaluateDoc(candidate,1); assert.ok(!result.ok);
  const help=offsetCollapseFailure('offset-face-edit',accepted,candidate,result.error); assert.ok(help,JSON.stringify(result.error));
  assert.match(help.hint,/original face.*n1.*n1.top/); assert.match(help.hint,/saved value \(3 mm\)/);assert.equal(help.historyField,'d');
  assert.ok(evaluateDoc(change(accepted,2,-2),1).ok); assert.deepEqual(accepted,snapshot);
  for(const command of ['offset-face','edit','draft']) assert.equal(offsetCollapseFailure(command,accepted,candidate,result.error),undefined);
  for(const error of [{...result.error,code:'INPUT'},{...result.error,detail:'other collapse'},{...result.error,feature:'missing'}]) assert.equal(offsetCollapseFailure('offset-face-edit',accepted,candidate,error),undefined);
  assert.equal(offsetCollapseFailure('offset-face-edit',accepted,accepted,result.error),undefined);
  assert.equal(offsetCollapseFailure('offset-face-edit',accepted,{...candidate,units:'in'} as unknown as StudioDoc,result.error),undefined);
});
test('real dependent second Offset is identified without changing its recipe',()=>{
 const accepted=add(add(seed(20,10,12,15),2),2),candidate=change(accepted,2,5),result=evaluateDoc(candidate,1);assert.ok(!result.ok);
 const help=offsetCollapseFailure('offset-face-edit',accepted,candidate,result.error);assert.ok(help,JSON.stringify(result.error));assert.match(help.title,/later Offset/);assert.equal(result.error.feature,'n3');
 const recovered=change(accepted,2,3);assert.ok(evaluateDoc(recovered,1).ok);assert.deepEqual(recovered.nodes[3],accepted.nodes[3]);
 assert.equal(offsetCollapseFailure('offset-face-edit',accepted,change(candidate,3,3),result.error),undefined);
 const active={cmd:{id:'offset-face-edit'},ctx:{doc:accepted},values:{d:5},preview:'error',error:help} as unknown as Active;
 active.offsetCollapse={cmd:active.cmd,ctx:active.ctx,values:active.values,error:help};assert.equal(offsetCollapseFeedback(active),help);
 for(const altered of [{...active,values:{d:3}},{...active,ctx:{...active.ctx}},{...active,cmd:{...active.cmd}},{...active,error:{...help}},{...active,preview:'busy' as const}]) assert.equal(offsetCollapseFeedback(altered),undefined);
});

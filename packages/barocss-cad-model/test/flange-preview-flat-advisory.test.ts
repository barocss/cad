import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDoc, withNode, type ModelNode } from '../src/engine/doc';
import { evaluateDoc, evaluatePreview } from '../src/engine/evaluate';
import { MeshReceiver, MeshSender } from "../src/engine/meshWire";
function candidate(partial: boolean) {
  const profile:ModelNode = partial ? {kind:'sketch',profile:'loop',segments:[
    {kind:'line',start:[10,5]},{kind:'arc',start:[45,5],center:[45,15],direction:'ccw'},
    {kind:'line',start:[45,25]},{kind:'arc',start:[10,25],center:[10,15],direction:'ccw'}]}
    : {kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]};
  const base=withNode(withNode(emptyDoc(),profile),{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
  return withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side2|n1.top'],length:20,
    ...(partial ? {offsets:[5,5] as [number,number],relief:{kind:'rectangular' as const,width:1.5,depth:1.5}} : {})});
}
test('exact opted-in obround partial Flange returns native flat refusal, not constructive refusal',()=>{
  const d=candidate(true), reply=evaluatePreview(d,21,8,'preview',undefined,'n2');
  assert.ok(reply.ok);
  if(!reply.ok)throw Error('constructive refusal');
  assert.equal(reply.revision,21);assert.equal(reply.bodies.length,1);assert.equal(reply.bodies[0].key,'b2');
  const advisory=reply.bodies[0].flangePreviewFlat;
  assert.equal(advisory?.status,'refused');
  if(advisory?.status!=='refused')assert.fail('expected owned advisory');
  assert.match(advisory.reason,/^\[NON_NORMAL_CUT\]/);
  assert.equal(reply.bodies[0].flat,undefined); assert.equal(reply.bodies[0].flatRefused,undefined);
  const packet = new MeshSender().pack('preview',reply);
  const decoded = new MeshReceiver().unpack('preview',packet.result);
  assert.ok(decoded.ok); if(decoded.ok) assert.deepEqual(decoded.bodies[0].flangePreviewFlat,advisory);
  const actual=evaluateDoc(d,22);assert.ok(actual.ok);
  if(!actual.ok)throw Error('constructive refusal');
  assert.equal(actual.bodies[0].flatRefused,advisory.reason);
  assert.equal(actual.bodies[0].flangePreviewFlat,undefined);
  assert.ok(Math.abs(actual.bodies[0].volume!-2158.524838)<1e-5);
});
test('opted-in full-width rectangular Flange supplies positive advisory without sending flat',()=>{
  const d=candidate(false), reply=evaluatePreview(d,31,8,'preview',undefined,'n2');
  assert.ok(reply.ok);
  if(!reply.ok)throw Error('unexpected failure');
  assert.deepEqual(reply.bodies[0].flangePreviewFlat,{status:'available'});
  assert.equal(reply.bodies[0].flat,undefined);
  const accepted=evaluateDoc(d,32);assert.ok(accepted.ok);
  if(accepted.ok)assert.equal(accepted.bodies[0].flat?.bends.length,1);
});
test('no implicit sheet warning on ordinary, wrong-id, non-Flange, section or invalid output scope',()=>{
  const d=candidate(true);
  for(const packet of [evaluatePreview(d,40),evaluatePreview(d,41,8,'preview',undefined,'n1'),
    evaluatePreview(d,42,8,'section',undefined,'n2'),
    evaluatePreview({...d,outputs:{alias:{node:2,side:'solid'}}},44,8,'preview',undefined,'n2'),
    evaluatePreview({...d,nodes:d.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}}},43,8,'preview',undefined,'n1')]){
    assert.ok(packet.ok); if(packet.ok)assert.ok(packet.bodies.length && packet.bodies.every(x=>x.flangePreviewFlat===undefined));
  }
});

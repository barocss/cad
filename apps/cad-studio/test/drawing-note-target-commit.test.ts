import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDrawing, type DrawingSettings } from '@barocss/cad-model/drawing/types';
import { commitDrawingSettings } from '../src/ui/drawing/commitSettings';
const target={edge:'n1.bottom|n1.side0',at:'end' as const,near:[40,0,0] as [number,number,number],endpoint:'max' as const,sig:{k:'line',p:[20,0,0] as [number,number,number],d:[1,0,0] as [number,number,number],s:40}};
const settings:DrawingSettings={...defaultDrawing(),scope:{kind:'part'},notes:[{id:'n1',text:'KEEP TEXT',at:[25,25],leader:{view:'front',at:[40,0],target}}]};
test('connected note canonical commit preserves endpoint identity and original input',()=>{
 const before=structuredClone(settings);let accepted:DrawingSettings|undefined;
 assert.equal(commitDrawingSettings(settings,{kind:'part'},next=>{accepted=next;return true;},()=>assert.fail()),true);
 assert.deepEqual(accepted!.notes,settings.notes);assert.deepEqual(settings,before);
 assert.equal(commitDrawingSettings(settings,{kind:'part'},()=>false,()=>assert.fail()),false);
});
test('invalid authored targets cannot silently become free-coordinate leaders',()=>{
 for(const bad of [undefined,null,{}, {...target,endpoint:undefined},{...target,sig:undefined},{...target,near:[NaN,0,0]}]){
  const raw={...settings,notes:[{...settings.notes![0],leader:{...settings.notes![0].leader!,target:bad}}]} as unknown as DrawingSettings;
  const before=structuredClone(raw);let calls=0;
  assert.equal(commitDrawingSettings(raw,{kind:'part'},()=>{calls++;return true;},()=>{}),false);
  assert.equal(calls,0);assert.deepEqual(raw,before);
 }
});
test('legacy free leaders and explicit removal remain canonical',()=>{
 const free={...settings,notes:[{id:'n1',text:'KEEP TEXT',at:[25,25] as [number,number],leader:{view:'front' as const,at:[40,0] as [number,number]}}]};
 for(const input of [free,{...free,notes:[{id:'n1',text:'KEEP TEXT',at:[25,25] as [number,number]}]}]){
  let accepted:DrawingSettings|undefined;assert.equal(commitDrawingSettings(input,{kind:'part'},next=>{accepted=next;return true;},()=>assert.fail()),true);assert.deepEqual(accepted!.notes,input.notes);
 }
});

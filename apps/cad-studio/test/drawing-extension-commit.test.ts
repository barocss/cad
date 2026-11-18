import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDrawing, type DrawingSettings, type DrawingDimension } from '@barocss/cad-model/drawing/types';
import { commitDrawingSettings } from '../src/ui/drawing/commitSettings';
const dim: DrawingDimension={id:'d1',kind:'linear',view:'front',orient:'horizontal',a:{edge:'e1',at:'end',near:[0,0,0]},b:{edge:'e2',at:'end',near:[40,0,0]},place:[20,10],hideExtension:'a'};
test('extension canonical commit preserves references; unchanged source on refusal and malformed pcd cannot disappear',()=>{
 const settings:DrawingSettings={...defaultDrawing(),dimensions:[dim]}, before=structuredClone(settings);let accepted:DrawingSettings|undefined;
 assert.equal(commitDrawingSettings(settings,{kind:'part'},s=>{accepted=s;return true;},()=>assert.fail()),true);
 assert.deepEqual(accepted!.dimensions,[dim]);assert.deepEqual(settings,before);
 for(const patch of [{hideExtension:undefined},{hideExtension:false},{auto:false},{a:{at:'pcd'}},{view:'iso'}]){
  const raw={...settings,dimensions:[{...dim,...patch}]} as DrawingSettings;const held=structuredClone(raw);let calls=0;
  assert.equal(commitDrawingSettings(raw,{kind:'part'},()=>{calls++;return true;},()=>{}),false);
  assert.equal(calls,0);assert.deepEqual(raw,held);
 }
 assert.equal(commitDrawingSettings(settings,{kind:'part'},()=>false,()=>assert.fail()),false);
});

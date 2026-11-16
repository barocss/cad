import test from 'node:test';
import assert from 'node:assert/strict';
import {withDatumTargetAreaDraft} from '../src/ui/drawing/datumTargetAreaDraft';
import {DEFAULT_TARGET_DRAFT} from '../src/ui/drawing/DatumTargetsEditor';
import {checkDatumTargetOptions,type DrawingDatumTarget} from '@barocss/cad-model/drawing/datumTargets';
test('new area picks keep their centre and identity while taking the latest circle/rectangle draft',()=>{
 const target:DrawingDatumTarget={id:'target-1',letter:'A',number:1,view:'front',place:[-10,10],kind:'area',area:{shape:'circle',at:[15,3],d:4}};
 const draft={...DEFAULT_TARGET_DRAFT,kind:'area' as const,d:'8'};
 const changed=withDatumTargetAreaDraft(target,draft);assert.deepEqual(changed,{...target,area:{shape:'circle',at:[15,3],d:8}});assert.deepEqual(target.area,{shape:'circle',at:[15,3],d:4});
 const rect=withDatumTargetAreaDraft(target,{...draft,shape:'rect',w:'10',h:'6'});assert.deepEqual(rect,{...target,area:{shape:'rect',at:[15,3],w:10,h:6}});
 for(const d of ['', '0','-1','Infinity'])assert.ok(checkDatumTargetOptions({datumTargets:[withDatumTargetAreaDraft(target,{...draft,d})]}).length);
 assert.equal(withDatumTargetAreaDraft(target,DEFAULT_TARGET_DRAFT),target);
});

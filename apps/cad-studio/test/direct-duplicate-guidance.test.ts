import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { DirectPanel } from '../src/ui/DirectPanel';
import { directOps, type DirectGeometry } from '@barocss/cad-model/engine/direct';
const direct: DirectGeometry = {sources:{line:'@model test {version:0;length-unit:mm;@curve #line {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,0,0],[12,6,0]];weights:[1,1];}}'},objects:[{id:'line1',name:'Original curve',source:'line',geometry:'line'}]};
test('Duplicate visibly explains same-position independent copies and associates the action',()=>{
 const before=structuredClone(direct);
 const html=renderToStaticMarkup(createElement(DirectPanel,{direct,selected:['line1'],onChange(){},onError(){},onHide(){}}));
 assert.match(html,/aria-describedby="direct-duplicate-relationship"[^>]*>Duplicate/);
 assert.match(html,/id="direct-duplicate-relationship" role="note" aria-label="Duplicate relationship"/);
 assert.match(html,/Creates independent copies in the same position and selects them/);
 assert.match(html,/Moving a copy or editing its control points does not update the original/);
 assert.deepEqual(direct,before);
});
test('existing duplicate preserves original and creates a distinct object using the same geometry',()=>{
 const source=direct;
 const before=structuredClone(source),next=directOps.duplicate(source,['line1']);
 assert.deepEqual(source,before);assert.deepEqual(next.objects[0],source.objects[0]);assert.equal(next.objects.length,2);
 assert.notEqual(next.objects[1].id,'line1');
 assert.equal(next.objects[1].source,source.objects[0].source);assert.equal(next.objects[1].geometry,source.objects[0].geometry);
});

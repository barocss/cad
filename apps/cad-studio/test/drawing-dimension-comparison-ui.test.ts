import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { defaultDrawing, type DrawingDimension } from '@barocss/cad-model/drawing/types';
import { DrawingDimensionComparison } from '../src/storage/DrawingDimensionComparison';
const dimension:DrawingDimension={id:'D1',kind:'linear',view:'front',a:{edge:'n1.edge0',at:'end',near:[0,0,0]},b:{edge:'n1.edge1',at:'end',near:[20,0,0]},orient:'horizontal',place:[10,-5],tol:{kind:'symmetric',value:0.1}};
const before:StudioDoc={...rectanglePart(20,10,5),drawing:{...defaultDrawing(),dimensions:[dimension]}};
const html=(a:StudioDoc,b:StudioDoc)=>renderToStaticMarkup(createElement(DrawingDimensionComparison,{before:a,after:b}));
test('tolerance-only difference displays exact values and stored-unit scope without mutating input',()=>{
 const after={...before,drawing:{...before.drawing!,dimensions:[{...dimension,tol:{kind:'symmetric' as const,value:0.05}}]}},saved=JSON.stringify([before,after]);
 const result=html(before,after);assert.match(result,/D1 · edited/);assert.match(result,/tolerance: ± 0\.1 mm → ± 0\.05 mm/);assert.match(result,/Nominal measurements/);assert.match(result,/not historical identity/);assert.equal(JSON.stringify([before,after]),saved);
});
test('equal authored dimensions do not assert drawing or measured-value equality',()=>{
 const after={...before,nodes:before.nodes.map(n=>n.kind==='extrude'?{...n,height:12}:n)};
 assert.match(html(before,after),/This does not mean the whole drawing or measured values are unchanged/);
});
test('duplicate dimension identities display incomplete rather than a clean comparison',()=>{
 const bad={...before,drawing:{...before.drawing!,dimensions:[dimension,dimension]}};
 const result=html(bad,before);assert.match(result,/Incomplete comparison/);assert.doesNotMatch(result,/No authored dimension definition changes/);
});
test('angular tolerances use degrees while stored placement remains raw',()=>{
 const angle:DrawingDimension={id:'A1',view:'front',kind:'angle',a:{edge:'n1.edge0',near:[0,0,0]},b:{edge:'n1.edge1',near:[20,0,0]},place:[1,2],tol:{kind:'symmetric',value:0.125}};
 const a={...before,drawing:{...before.drawing!,dimensions:[angle]}},b={...before,drawing:{...before.drawing!,dimensions:[{...angle,tol:{kind:'symmetric' as const,value:0.126},place:[1,2.00001] as [number,number]}]}};
 const result=html(a,b);assert.match(result,/0\.125 ° → ± 0\.126 °/);assert.match(result,/2\.00001/);
});

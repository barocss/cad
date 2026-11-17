import test from 'node:test';
import { createElement } from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import { SavedBezierPicker } from '../src/ui/SavedBezierPicker';
const main:SketchShape={kind:'polygon',closed:true,points:[[0,0],[10,0],[10,6],[0,6]],ids:['a','b','c','d']};
const q:SketchShape={kind:'bezier',poles:[[0,0],[2,4],[4,0]]};
const draft:SketchState={tool:'select',shape:q,done:[main],activeOutlineIndex:1,editNode:0,mainIds:main.ids,plane:xyPlane()};
const html=(s:SketchState)=>renderToStaticMarkup(createElement(SavedBezierPicker,{sketch:s,onActivate:()=>{throw Error('render must not select');}}));
test('explicit saved Bézier controls offer single main-profile return and do not change selection on render',()=>{
 const before=structuredClone(draft),out=html(draft);assert.match(out,/aria-label="Edit Bézier 1" aria-pressed="true"/);assert.match(out,/aria-label="Return to main profile"/);assert.deepEqual(draft,before);
});
test('creation, geometry tools, malformed/hidden and duplicate source references expose no picker',()=>{
 for(const s of [{...draft,editNode:undefined},{...draft,tool:'trim' as const},{...draft,shape:null,done:[main,{...q,construction:true as const}]},{...draft,done:[main,q]},{...draft,shape:{kind:'bezier',poles:[]} as unknown as SketchShape}])assert.equal(html(s),'');
});
